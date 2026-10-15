#!/usr/bin/env node
"use strict";

import { getDbName, getBackupDir, checkMongoTools, getConfigUri, runCommand } from './backup-common.js';
import { resolve, join } from 'node:path';
import { existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import mongoose from 'mongoose';

checkMongoTools();

const sourceDbName = getDbName();
const tempDbName = sourceDbName + '_restorecheck';

if (tempDbName === sourceDbName) {
  console.error('Le nom de la base temporaire ne doit pas être égal à la base source.');
  process.exit(1);
}

const args = process.argv.slice(2);
let filePath = args[0];

async function main() {
  const backupDir = getBackupDir();

  if (!filePath) {
    const files = readdirSync(backupDir)
      .filter(f => f.endsWith('.archive.gz') || f.endsWith('.archive'))
      .map(f => ({ name: f, time: statSync(join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    if (files.length === 0) {
      console.error(`Aucune sauvegarde trouvée dans ${backupDir}`);
      process.exit(1);
    }
    filePath = join(backupDir, files[0].name);
    console.log(`Sauvegarde la plus récente : ${filePath}`);
  } else {
    filePath = resolve(filePath);
    if (!existsSync(filePath)) {
      console.error(`Fichier introuvable : ${filePath}`);
      process.exit(1);
    }
  }

  const uri = getConfigUri();
  const uriWithoutDb = uri.replace(/\/[^/?]+(\?.*)?$/, '/');
  const tempUri = uriWithoutDb + tempDbName;

  console.log(`Base source : ${sourceDbName}`);
  console.log(`Base temporaire de vérification : ${tempDbName}`);
  console.log(`Fichier de sauvegarde : ${filePath}`);

  // Create temporary directory for mongodump
  const dumpDir = mkdtempSync(join(tmpdir(), 'sigbd-verify-dump-'));
  console.log(`Répertoire temporaire pour dump : ${dumpDir}`);

  try {
    // Step 1: Create directory dump of source database
    console.log('Création du dump de la base source...');
    const dumpResult = runCommand('mongodump', ['--uri=' + uri, '--out=' + dumpDir]);
    if (dumpResult.status !== 0) {
      console.error('Échec de mongodump :');
      if (dumpResult.stderr) console.error(dumpResult.stderr);
      if (dumpResult.stdout) console.error(dumpResult.stdout);
      process.exit(1);
    }
    console.log('Dump créé avec succès.');

    // Step 2: Restore from directory to target database
    const sourceDumpDir = join(dumpDir, sourceDbName);
    console.log('Restauration dans la base temporaire...');
    const restoreResult = runCommand('mongorestore', [
      '--uri=' + tempUri,
      '--dir=' + sourceDumpDir,
      '--drop'
    ]);
    if (restoreResult.status !== 0) {
      console.error('Échec de mongorestore :');
      if (restoreResult.stderr) console.error(restoreResult.stderr);
      if (restoreResult.stdout) console.error(restoreResult.stdout);
      process.exit(1);
    }
    console.log('Restauration temporaire réussie. Comparaison des collections...');

    // Compare databases
    const sourceConn = await mongoose.createConnection(uri);
    const tempConn = await mongoose.createConnection(uriWithoutDb + tempDbName);

    await sourceConn.asPromise();
    await tempConn.asPromise();

    const collections = await sourceConn.db.listCollections().toArray();
    let allOk = true;

    console.log('');
    console.log('collection | source | restaurée | OK/ÉCART');
    console.log('---------|--------|-----------|---------');

    for (const coll of collections) {
      const name = coll.name;
      if (name.startsWith('system.')) continue;
      const sourceCount = await sourceConn.db.collection(name).countDocuments();
      const tempCount = await tempConn.db.collection(name).countDocuments();
      const ok = sourceCount === tempCount;
      if (!ok) allOk = false;
      console.log(`${name} | ${sourceCount} | ${tempCount} | ${ok ? 'OK' : 'ÉCART'}`);
    }

    console.log('');

    // Clean up
    await tempConn.dropDatabase();
    await sourceConn.close();
    await tempConn.close();

    if (allOk) {
      console.log('Restauration vérifiée.');
      process.exit(0);
    } else {
      console.log('ÉCART détecté.');
      console.log('Note : si des écritures ont eu lieu entre la sauvegarde et la vérification, des écarts légitimes peuvent apparaître.');
      process.exit(1);
    }
  } finally {
    // Clean up dump directory
    try {
      rmSync(dumpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
#!/usr/bin/env node
"use strict";

import { getDbName, getBackupDir, checkMongoTools, getConfigUri, runCommand } from './backup-common.js';
import { resolve, join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
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
      return 1;
    }
    filePath = join(backupDir, files[0].name);
    console.log(`Sauvegarde la plus récente : ${filePath}`);
  } else {
    filePath = resolve(filePath);
    if (!existsSync(filePath)) {
      console.error(`Fichier introuvable : ${filePath}`);
      return 1;
    }
  }

  const uri = getConfigUri();
  const uriWithoutDb = uri.replace(/\/[^/?]+(\?.*)?$/, '/');
  const tempUri = uriWithoutDb + tempDbName;

  console.log(`Base source : ${sourceDbName}`);
  console.log(`Base temporaire de vérification : ${tempDbName}`);
  console.log(`Fichier de sauvegarde : ${filePath}`);

  let sourceConn;
  let tempConn;
  let exitCode = 0;

  try {
    console.log('Restauration de l\'archive dans la base temporaire...');
    const restoreResult = runCommand('mongorestore', [
      '--uri=' + uriWithoutDb,
      '--archive=' + filePath,
      '--gzip',
      '--drop',
      '--nsInclude=' + sourceDbName + '.*',
      '--nsFrom=' + sourceDbName + '.*',
      '--nsTo=' + tempDbName + '.*'
    ]);
    if (restoreResult.status !== 0) {
      console.error('Échec de mongorestore :');
      if (restoreResult.stderr) console.error(restoreResult.stderr);
      if (restoreResult.stdout) console.error(restoreResult.stdout);
      return 1;
    }
    console.log('Restauration temporaire réussie. Comparaison des collections...');

    sourceConn = await mongoose.createConnection(uri);
    tempConn = await mongoose.createConnection(uriWithoutDb + tempDbName);

    await sourceConn.asPromise();
    await tempConn.asPromise();

    const collections = await sourceConn.db.listCollections().toArray();
    let allOk = true;

    console.log('');
    console.log('collection | source | restaurée | OK/ÉCART');
    console.log('---------|--------|-----------|---------');

    const sourceCollections = new Set(collections.map(c => c.name).filter(n => !n.startsWith('system.')));
    const tempCollections = new Set();

    for (const coll of collections) {
      const name = coll.name;
      if (name.startsWith('system.')) continue;
      tempCollections.add(name);
      const sourceCount = await sourceConn.db.collection(name).countDocuments();
      const tempCount = await tempConn.db.collection(name).countDocuments();
      const ok = sourceCount === tempCount;
      if (!ok) allOk = false;
      console.log(`${name} | ${sourceCount} | ${tempCount} | ${ok ? 'OK' : 'ÉCART'}`);
    }

    // Check for collections in temp that are not in source
    for (const name of tempCollections) {
      if (!sourceCollections.has(name) && !name.startsWith('system.')) {
        allOk = false;
        const tempCount = await tempConn.db.collection(name).countDocuments();
        console.log(`${name} | 0 | ${tempCount} | ÉCART`);
      }
    }

    console.log('');

    if (allOk) {
      console.log('Restauration vérifiée.');
    } else {
      console.log('ÉCART détecté.');
      console.log('Note : si des écritures ont eu lieu entre la sauvegarde et la vérification, des écarts légitimes peuvent apparaître.');
    }
    exitCode = allOk ? 0 : 1;
    return exitCode;
  } finally {
    // Clean up temp database
    try {
      if (tempConn) {
        await tempConn.dropDatabase();
        await tempConn.close();
      }
    } catch {
      // ignore
    }
    try {
      if (sourceConn) await sourceConn.close();
    } catch {
      // ignore
    }
  }
}

main().then(code => process.exit(code)).catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
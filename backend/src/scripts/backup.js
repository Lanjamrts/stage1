#!/usr/bin/env node
"use strict";

import { getDbName, getBackupDir, checkMongoTools, getConfigUri, formatSize, runCommand } from './backup-common.js';
import { resolve, join } from 'node:path';
import { existsSync, chmodSync, unlinkSync, statSync } from 'node:fs';

checkMongoTools();

const args = process.argv.slice(2);
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && i + 1 < args.length) {
    outputFile = args[i + 1];
    i++;
  }
}

const dbName = getDbName();
const backupDir = getBackupDir();
const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '-' + Date.now() % 1000 + 'Z';
const defaultName = `sigbd-${dbName}-${timestamp}.archive.gz`;
const filePath = outputFile ? resolve(outputFile) : join(backupDir, defaultName);

if (existsSync(filePath)) {
  console.error(`Le fichier de destination existe déjà : ${filePath}`);
  process.exit(1);
}

const uri = getConfigUri();
const result = runCommand('mongodump', ['--uri=' + uri, '--archive=' + filePath, '--gzip']);

if (result.status !== 0) {
  console.error('Échec de mongodump :');
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.error(result.stdout);
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch { /* ignore */ }
  }
  process.exit(1);
}

try {
  chmodSync(filePath, 0o600);
} catch {
  // ignore
}

const stat = statSync(filePath);
console.log(`Sauvegarde créée : ${filePath}`);
console.log(`Taille : ${formatSize(stat.size)}`);
console.log('');
console.log('Copiez cette sauvegarde en dehors du serveur. Elle contient des données sensibles (empreintes de mots de passe).');
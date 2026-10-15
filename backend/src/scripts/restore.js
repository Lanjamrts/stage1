#!/usr/bin/env node
"use strict";

import { getDbName, checkMongoTools, getConfigUri, runCommand } from './backup-common.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import readline from 'node:readline/promises';

checkMongoTools();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run restore -- <fichier> [--yes] [--source-db <nom>] [--allow-production]');
  process.exit(1);
}

const fileArg = args[0];
const filePath = resolve(fileArg);

const yes = args.includes('--yes');
const allowProduction = args.includes('--allow-production');

let sourceDb = null;
const sourceIdx = args.indexOf('--source-db');
if (sourceIdx !== -1 && sourceIdx + 1 < args.length) {
  sourceDb = args[sourceIdx + 1];
}

if (!existsSync(filePath)) {
  console.error(`Fichier introuvable : ${filePath}`);
  process.exit(1);
}

const currentConfig = loadConfig();

if (currentConfig.NODE_ENV === 'production' && !allowProduction) {
  console.error('La restauration est interdite en production sans --allow-production.');
  process.exit(1);
}

const targetDb = getDbName();
const sourceDbName = sourceDb || targetDb;

if (sourceDbName === targetDb && sourceDb) {
  console.log(`Base source (--source-db) identique à la cible : ${targetDb}. Restauration standard.`);
}

console.log(`Base cible : ${targetDb}`);
console.log(`Fichier de sauvegarde : ${filePath}`);
console.log(`Base source dans l'archive : ${sourceDbName}`);

if (!yes) {
  if (!process.stdin.isTTY) {
    console.error('Terminal non interactif : utilisez --yes pour confirmer sans saisie.');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Confirmez la restauration en tapant OUI : ');
  rl.close();
  if (answer.trim() !== 'OUI') {
    console.log('Restauration annulée.');
    process.exit(1);
  }
}

const uri = getConfigUri();
const uriWithoutDb = uri.replace(/\/[^/?]+(\?.*)?$/, '/');
const mongorestoreArgs = [
  '--uri=' + uriWithoutDb,
  '--archive=' + filePath,
  '--gzip',
  '--drop',
  '--nsInclude', sourceDbName + '.*'
];

if (sourceDb && sourceDb !== targetDb) {
  mongorestoreArgs.push('--nsFrom=' + sourceDbName + '.*');
  mongorestoreArgs.push('--nsTo=' + targetDb + '.*');
}

console.log('Exécution de mongorestore...');
const result = runCommand('mongorestore', mongorestoreArgs);

if (result.status !== 0) {
  console.error('Échec de mongorestore :');
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.error(result.stdout);
  process.exit(1);
}

console.log('Restauration terminée avec succès.');
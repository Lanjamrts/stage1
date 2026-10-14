#!/usr/bin/env node
"use strict";

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = process.env.SETUP_ROOT ? resolve(process.env.SETUP_ROOT) : resolve(__dirname, '..');

const envPairs = [
  { example: join(ROOT, 'backend', '.env.example'), target: join(ROOT, 'backend', '.env') },
  { example: join(ROOT, 'frontend', '.env.example'), target: join(ROOT, 'frontend', '.env') },
];

const results = { created: [], existing: [] };

for (const pair of envPairs) {
  if (!existsSync(pair.example)) {
    console.error(`ERREUR : fichier d'exemple manquant : ${pair.example}`);
    process.exit(1);
  }

  if (!existsSync(pair.target)) {
    copyFileSync(pair.example, pair.target);
    results.created.push(pair.target);
  } else {
    results.existing.push(pair.target);
  }
}

if (results.created.includes(join(ROOT, 'backend', '.env'))) {
  const backendEnvPath = join(ROOT, 'backend', '.env');
  let content = readFileSync(backendEnvPath, 'utf8');
  const newSecret = randomBytes(48).toString('hex');
  content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${newSecret}`);
  writeFileSync(backendEnvPath, content, 'utf8');
}

console.log('\n=== RÉSUMÉ DE LA CONFIGURATION ===');
if (results.created.length > 0) {
  console.log('\nFichiers créés :');
  for (const f of results.created) {
    console.log(`  ✓ ${f}`);
  }
}
if (results.existing.length > 0) {
  console.log('\nFichiers déjà existants (conservés) :');
  for (const f of results.existing) {
    console.log(`  ○ ${f}`);
  }
}

console.log('\n--- PROCHAINES ÉTAPES ---');
console.log('1. (Optionnel) Si MongoDB n\'est pas déjà en cours : npm run db:up');
console.log('2. Seed des données de démo : cd backend && npm run seed:demo');
console.log('3. Lancer l\'application : npm run dev (depuis la racine)');
console.log('4. Ouvrir http://localhost:5173 et se connecter avec 104562 / Test@2026');
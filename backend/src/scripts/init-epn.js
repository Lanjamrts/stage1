"use strict";

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { loadConfig } from '../config.js';

import Referentiel from '../models/Referentiel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/init');

const EPN_HEADERS = [
  'ministere',
  'ministere_liste_2019',
  'nom',
  'acronyme',
  'regime',
  'texte_creation',
  'rattachement',
  'valide',
  'note',
];
const MINISTERES_HEADERS = ['ministere', 'valide', 'note'];
const VALID_REGIMES = ['EPA', 'EPIC', 'EPP', 'EPC'];

function slugifyKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] && lines[0].startsWith('\uFEFF')) {
    lines[0] = lines[0].slice(1);
  }
  const header = lines[0].trim();
  const delimiter = header.includes(';') ? ';' : ',';
  const headers = header.split(delimiter).map((h) => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    if (fields.length !== headers.length) continue;
    const row = {};
    for (let k = 0; k < headers.length; k++) {
      row[headers[k]] = fields[k];
    }
    rows.push(row);
  }
  return { headers, rows, delimiter };
}

function parseArg(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

async function main() {
  const config = loadConfig();
  const APPLY = process.argv.includes('--apply');

  const dataDir = process.env.INIT_DATA_DIR || DEFAULT_DATA_DIR;
  const epnPath = parseArg('epn') || path.join(dataDir, 'epn.csv');
  const ministeresPath = parseArg('ministeres') || path.join(dataDir, 'ministeres.csv');

  if (!fs.existsSync(epnPath) || !fs.existsSync(ministeresPath)) {
    console.error('Fichiers CSV introuvables (epn:', epnPath, ', ministeres:', ministeresPath, ')');
    process.exit(1);
  }

  const epnContent = fs.readFileSync(epnPath, 'utf8');
  const ministeresContent = fs.readFileSync(ministeresPath, 'utf8');

  const { headers: epnHeaders, rows: epnRows } = parseCSV(epnContent);
  const { headers: ministeresHeaders, rows: ministeresRows } = parseCSV(ministeresContent);

  if (JSON.stringify(epnHeaders) !== JSON.stringify(EPN_HEADERS)) {
    console.error('En-tete invalide dans epn.csv :', epnHeaders.join(','));
    process.exit(1);
  }
  if (JSON.stringify(ministeresHeaders) !== JSON.stringify(MINISTERES_HEADERS)) {
    console.error('En-tete invalide dans ministeres.csv :', ministeresHeaders.join(','));
    process.exit(1);
  }

  const errors = [];
  const warnings = [];

  // Ministeres de reference
  const ministeres = [];
  const ministereKeys = new Set();
  for (let i = 0; i < ministeresRows.length; i++) {
    const row = ministeresRows[i];
    const lineNum = i + 2;
    const ministere = (row.ministere || '').trim();
    if (!ministere) {
      errors.push(`ministeres.csv ligne ${lineNum} : ministere vide`);
      continue;
    }
    const key = slugifyKey(ministere);
    if (ministereKeys.has(key)) {
      errors.push(`ministeres.csv ligne ${lineNum} : ministere duplique "${ministere}"`);
      continue;
    }
    ministereKeys.add(key);
    const valide = (row.valide || '').trim().toLowerCase();
    if (valide !== 'oui' && valide !== 'non') {
      errors.push(`ministeres.csv ligne ${lineNum} : valide doit etre "oui" ou "non" (recu "${row.valide}")`);
    }
    ministeres.push(ministere);
  }

  // EPN
  const epns = [];
  const epnNames = new Map();
  for (let i = 0; i < epnRows.length; i++) {
    const row = epnRows[i];
    const lineNum = i + 2;
    const ministere = (row.ministere || '').trim();
    const nom = (row.nom || '').trim();
    const acronyme = (row.acronyme || '').trim();
    const regime = (row.regime || '').trim();
    const valide = (row.valide || '').trim().toLowerCase();

    if (!nom) {
      errors.push(`epn.csv ligne ${lineNum} : nom vide`);
    }
    if (!ministere) {
      errors.push(`epn.csv ligne ${lineNum} : ministere vide`);
    }
    if (!ministereKeys.has(slugifyKey(ministere))) {
      errors.push(`epn.csv ligne ${lineNum} : ministere "${ministere}" absent de ministeres.csv`);
    }
    if (nom && epnNames.has(slugifyKey(nom))) {
      errors.push(`epn.csv ligne ${lineNum} : nom duplique "${nom}"`);
    } else if (nom) {
      epnNames.set(slugifyKey(nom), lineNum);
    }
    if (valide !== 'oui' && valide !== 'non') {
      errors.push(`epn.csv ligne ${lineNum} : valide doit etre "oui" ou "non" (recu "${row.valide}")`);
    }
    if (!regime || !VALID_REGIMES.includes(regime)) {
      warnings.push(`epn.csv ligne ${lineNum} : regime invalide ou vide "${regime}" pour "${nom}"`);
    }
    if (!acronyme) {
      warnings.push(`epn.csv ligne ${lineNum} : acronyme vide pour "${nom}"`);
    }

    epns.push({ ministere, nom, acronyme, regime, lineNum });
  }

  // Rapport a sec (dry-run compris)
  const regimeCounts = {};
  for (const e of epns) regimeCounts[e.regime || '(vide)'] = (regimeCounts[e.regime || '(vide)'] || 0) + 1;
  const ministereCounts = {};
  for (const e of epns) ministereCounts[e.ministere] = (ministereCounts[e.ministere] || 0) + 1;

  console.log(`Ministeres : ${ministeres.length} lignes lues`);
  console.log(`EPN : ${epns.length} lignes lues`);
  console.log(
    `Répartition par régime : ${Object.entries(regimeCounts)
      .map(([k, v]) => `${k} = ${v}`)
      .join(', ')}`
  );
  console.log(
    `Répartition par ministère : ${Object.entries(ministereCounts)
      .map(([k, v]) => `${k} = ${v}`)
      .join(', ')}`
  );

  if (warnings.length > 0) {
    console.log('Avertissements (non bloquants) :');
    for (const w of warnings) console.log(` - ${w}`);
  }

  if (errors.length > 0) {
    for (const err of errors) console.error(err);
    process.exit(1);
  }

  if (!APPLY) {
    console.log('DRY-RUN : aucune donnée écrite. Relancez avec --apply pour ecrire.');
    process.exit(0);
  }

  await mongoose.connect(config.MONGODB_URI);
  const dbName = mongoose.connection.name;
  console.log(`Base cible : ${dbName}`);

  let ministeresCreated = 0;
  let ministeresExisting = 0;
  for (const ministere of ministeres) {
    const res = await Referentiel.updateOne(
      { type: 'ministeres', value: ministere },
      { $setOnInsert: { type: 'ministeres', value: ministere } },
      { upsert: true }
    );
    if (res.upsertedCount) ministeresCreated++;
    else ministeresExisting++;
  }

  let epnsCreated = 0;
  let epnsExisting = 0;
  for (const e of epns) {
    const res = await Referentiel.updateOne(
      { type: 'epn', value: e.nom },
      { $set: { ministere: e.ministere, regime: e.regime, acronyme: e.acronyme }, $setOnInsert: { type: 'epn', value: e.nom } },
      { upsert: true }
    );
    if (res.upsertedCount) epnsCreated++;
    else epnsExisting++;
  }

  console.log(`Ministeres : ${ministeresCreated} cree(s), ${ministeresExisting} deja present(s)`);
  console.log(`EPN : ${epnsCreated} cree(s), ${epnsExisting} deja present(s)`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});

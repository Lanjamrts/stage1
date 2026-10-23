"use strict";

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import ProfilModel from '../models/Profil.js';
import ModuleModel from '../models/Module.js';
import ReferentielModel from '../models/Referentiel.js';
import { MODULES } from './modules.js';
import { loadConfig } from '../config.js';

export const PROFILS = [
  { code: 'client', label: 'Client' },
  { code: 'admin2', label: 'Administrateur regional (Admin 2)' },
  { code: 'admin1', label: 'Administrateur central (Admin 1)' },
  { code: 'developpeur', label: 'Developpeur' },
  { code: 'consultant', label: 'Consultant' },
];

export async function ensureProfils() {
  let created = 0;
  for (const p of PROFILS) {
    const res = await ProfilModel.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
    created += res.upsertedCount || 0;
  }
  return { created, existing: PROFILS.length - created };
}

export async function ensureModules() {
  let created = 0;
  for (const m of MODULES) {
    const res = await ModuleModel.updateOne(
      { code: m.code },
      { $setOnInsert: { ...m, version: 1, active: true } },
      { upsert: true },
    );
    created += res.upsertedCount || 0;
  }
  // Databases created before this field existed: fill it for RA only if it is missing.
  // Never overwrites a value that already exists (a developer may have chosen otherwise).
  await ModuleModel.updateOne(
    { code: 'RA', allowedPeriodicities: { $exists: false } },
    { $set: { allowedPeriodicities: ['monthly', 'quarterly'] } },
  );
  return { created, existing: MODULES.length - created };
}

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

// Règle `valide` : la colonne doit valoir "oui" ou "non" (après trim, insensible à la casse)
// sur chaque ligne de ministeres.csv et epn.csv. Toute autre valeur est une erreur bloquante.
// Les lignes valide=non sont neanmoins importees (le champ n'est pas persistant sur le referentiel).
export async function ensureEpnReference({ apply = false, epnPath, ministeresPath } = {}) {
  const dataDir = process.env.INIT_DATA_DIR || DEFAULT_DATA_DIR;
  const epnCsvPath = epnPath || path.join(dataDir, 'epn.csv');
  const ministeresCsvPath = ministeresPath || path.join(dataDir, 'ministeres.csv');

  if (!fs.existsSync(epnCsvPath) || !fs.existsSync(ministeresCsvPath)) {
    console.error('Fichiers CSV introuvables (epn:', epnCsvPath, ', ministeres:', ministeresCsvPath, ')');
    return { success: false };
  }

  const epnContent = fs.readFileSync(epnCsvPath, 'utf8');
  const ministeresContent = fs.readFileSync(ministeresCsvPath, 'utf8');

  const { headers: epnHeaders, rows: epnRows } = parseCSV(epnContent);
  const { headers: ministeresHeaders, rows: ministeresRows } = parseCSV(ministeresContent);

  if (JSON.stringify(epnHeaders) !== JSON.stringify(EPN_HEADERS)) {
    console.error('En-tete invalide dans epn.csv :', epnHeaders.join(','));
    return { success: false };
  }
  if (JSON.stringify(ministeresHeaders) !== JSON.stringify(MINISTERES_HEADERS)) {
    console.error('En-tete invalide dans ministeres.csv :', ministeresHeaders.join(','));
    return { success: false };
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
    return { success: false };
  }

  if (!apply) {
    console.log('DRY-RUN : aucune donnée écrite. Relancez avec --apply pour ecrire.');
    return { success: true, dryRun: true };
  }

  const alreadyConnected = mongoose.connection.readyState === 1;
  if (!alreadyConnected) {
    await mongoose.connect(loadConfig().MONGODB_URI);
  }
  const dbName = mongoose.connection.name;
  console.log(`Base cible : ${dbName}`);

  let ministeresCreated = 0;
  let ministeresExisting = 0;
  for (const ministere of ministeres) {
    const res = await ReferentielModel.updateOne(
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
    const res = await ReferentielModel.updateOne(
      { type: 'epn', value: e.nom },
      { $set: { ministere: e.ministere, regime: e.regime, acronyme: e.acronyme }, $setOnInsert: { type: 'epn', value: e.nom } },
      { upsert: true }
    );
    if (res.upsertedCount) epnsCreated++;
    else epnsExisting++;
  }

  if (!alreadyConnected) {
    await mongoose.disconnect();
  }

  return {
    success: true,
    dryRun: false,
    created: { ministeres: ministeresCreated, epns: epnsCreated },
    existing: { ministeres: ministeresExisting, epns: epnsExisting },
  };
}

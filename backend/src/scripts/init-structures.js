"use strict";

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { loadConfig } from '../config.js';

import Region from '../models/Region.js';
import Structure from '../models/Structure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/init');

const CENTRAL_STRUCTURES = [
  { code: 'SSEBF', label: 'SSEBF', type: 'SSEBF', regionId: null },
  { code: 'DGBF', label: 'DGBF', type: 'DGBF', regionId: null },
  { code: 'CELLULE_INFO', label: 'DGBF – Cellule Informatique', type: 'CELLULE_INFO', regionId: null },
];

const VALID_TYPES = ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF'];
const CENTRAL_TYPES = ['SSEBF', 'DGBF', 'CELLULE_INFO'];

function slugify(regionName) {
  return regionName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0].startsWith('\uFEFF')) {
    lines[0] = lines[0].slice(1);
  }
  const header = lines[0].trim();
  const delimiter = header.includes(';') ? ';' : ',';
  const headers = header.split(delimiter).map(h => h.trim());

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

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const ALLOW_UNVALIDATED = args.includes('--allow-unvalidated');

  const dataDir = process.env.INIT_DATA_DIR || DEFAULT_DATA_DIR;

  const regionsPath = path.join(dataDir, 'regions.csv');
  const structuresPath = path.join(dataDir, 'structures.csv');

  if (!fs.existsSync(regionsPath) || !fs.existsSync(structuresPath)) {
    console.error('Fichiers CSV introuvables dans', dataDir);
    process.exit(1);
  }

  const regionsContent = fs.readFileSync(regionsPath, 'utf8');
  const structuresContent = fs.readFileSync(structuresPath, 'utf8');

  const { headers: regionHeaders, rows: regionRows } = parseCSV(regionsContent);
  const { headers: structHeaders, rows: structRows } = parseCSV(structuresContent);

  const expectedRegionHeaders = ['region', 'valide', 'note'];
  const expectedStructHeaders = ['type', 'region', 'valide', 'note'];

  if (JSON.stringify(regionHeaders) !== JSON.stringify(expectedRegionHeaders)) {
    console.error('En-tete invalide dans regions.csv');
    process.exit(1);
  }
  if (JSON.stringify(structHeaders) !== JSON.stringify(expectedStructHeaders)) {
    console.error('En-tete invalide dans structures.csv');
    process.exit(1);
  }

  const errors = [];

  const regionNames = new Map();
  for (let i = 0; i < regionRows.length; i++) {
    const row = regionRows[i];
    const lineNum = i + 2;
    if (!row.region || !row.region.trim()) {
      errors.push(`regions.csv ligne ${lineNum} : region vide`);
    } else {
      const key = row.region.trim().toLowerCase();
      if (regionNames.has(key)) {
        errors.push(`regions.csv ligne ${lineNum} : region dupliquee "${row.region.trim()}"`);
      }
      regionNames.set(key, row.region.trim());
    }
    const valide = row.valide ? row.valide.trim().toLowerCase() : '';
    if (valide !== 'oui' && valide !== 'non') {
      errors.push(`regions.csv ligne ${lineNum} : valide doit etre "oui" ou "non" (recu "${row.valide}")`);
    }
  }

  const structPairs = new Map();
  const structInfos = [];
  for (let i = 0; i < structRows.length; i++) {
    const row = structRows[i];
    const lineNum = i + 2;
    const type = row.type ? row.type.trim() : '';
    if (!VALID_TYPES.includes(type)) {
      if (CENTRAL_TYPES.includes(type)) {
        errors.push(`structures.csv ligne ${lineNum} : type "${type}" reserve aux structures centrales (ne doit pas etre dans le CSV)`);
      } else {
        errors.push(`structures.csv ligne ${lineNum} : type invalide "${type}"`);
      }
    }
    const region = row.region ? row.region.trim() : '';
    if (!region) {
      errors.push(`structures.csv ligne ${lineNum} : region vide`);
    } else if (!regionNames.has(region.toLowerCase())) {
      errors.push(`structures.csv ligne ${lineNum} : region "${region}" absente de regions.csv`);
    }
    if (type && region) {
      const pairKey = `${type}|${region.toLowerCase()}`;
      if (structPairs.has(pairKey)) {
        errors.push(`structures.csv ligne ${lineNum} : doublon (type, region) "${type}, ${region}"`);
      }
      structPairs.set(pairKey, lineNum);
    }
    const valide = row.valide ? row.valide.trim().toLowerCase() : '';
    if (valide !== 'oui' && valide !== 'non') {
      errors.push(`structures.csv ligne ${lineNum} : valide doit etre "oui" ou "non" (recu "${row.valide}")`);
    }
    if (type && region) {
      const code = `${type}-${slugify(region)}`;
      const label = `${type} – ${region}`;
      structInfos.push({ code, type, region, label, valide, note: row.note });
    }
  }

  if (errors.length > 0) {
    for (const err of errors) console.error(err);
    process.exit(1);
  }

  await mongoose.connect(config.MONGODB_URI);
  const dbName = mongoose.connection.name;
  console.log(`Base cible : ${dbName}`);

  const existingRegions = await Region.find({ name: { $in: Array.from(regionNames.values()) } }).lean();
  const existingRegionMap = new Map();
  for (const r of existingRegions) existingRegionMap.set(r.name, r._id);

  const regionToCreate = [];
  const regionExisting = [];
  for (const name of regionNames.values()) {
    if (existingRegionMap.has(name)) regionExisting.push(name);
    else regionToCreate.push(name);
  }

  const structCodeSet = new Set(structInfos.map(i => i.code));
  if (structCodeSet.size !== structInfos.length) {
    console.error('Codes de structures dupliques generes');
    await mongoose.disconnect();
    process.exit(1);
  }

  const csvCodes = structInfos.map(i => i.code);
  const existingStructures = await Structure.find({ code: { $in: csvCodes } }).lean();
  const existingStructByCode = new Map();
  const existingStructByLabel = new Map();
  for (const s of existingStructures) {
    existingStructByCode.set(s.code, s);
    existingStructByLabel.set(s.label, s);
  }

  const centralCodes = CENTRAL_STRUCTURES.map(cs => cs.code);
  const existingCentral = await Structure.find({ code: { $in: centralCodes } }).lean();
  for (const s of existingCentral) {
    existingStructByCode.set(s.code, s);
    existingStructByLabel.set(s.label, s);
  }

  const conflicts = [];
  for (const info of structInfos) {
    if (existingStructByCode.has(info.code)) {
      const existing = existingStructByCode.get(info.code);
      if (existing.label !== info.label || existing.type !== info.type) {
        conflicts.push(`Structure code "${info.code}" : label "${existing.label}" vs "${info.label}", type "${existing.type}" vs "${info.type}"`);
      }
    }
    if (existingStructByLabel.has(info.label)) {
      const existing = existingStructByLabel.get(info.label);
      if (existing.code !== info.code) {
        conflicts.push(`Structure label "${info.label}" : code "${existing.code}" vs "${info.code}"`);
      }
    }
  }

  for (const cs of CENTRAL_STRUCTURES) {
    if (existingStructByCode.has(cs.code)) {
      const existing = existingStructByCode.get(cs.code);
      if (existing.label !== cs.label || existing.type !== cs.type || existing.regionId) {
        conflicts.push(`Structure centrale code "${cs.code}" : label "${existing.label}" vs "${cs.label}", type "${existing.type}" vs "${cs.type}", regionId different`);
      }
    }
    if (existingStructByLabel.has(cs.label)) {
      const existing = existingStructByLabel.get(cs.label);
      if (existing.code !== cs.code) {
        conflicts.push(`Structure centrale label "${cs.label}" : code "${existing.code}" vs "${cs.code}"`);
      }
    }
  }

  if (conflicts.length > 0) {
    for (const c of conflicts) console.error(c);
    await mongoose.disconnect();
    process.exit(1);
  }

  const unvalidatedRegions = regionRows.filter(r => r.valide.trim().toLowerCase() === 'non').length;
  const unvalidatedStructs = structRows.filter(r => r.valide.trim().toLowerCase() === 'non').length;
  const totalUnvalidated = unvalidatedRegions + unvalidatedStructs;

  const centralToCreate = CENTRAL_STRUCTURES.filter(cs => !existingStructByCode.has(cs.code)).length;
  const centralExisting = CENTRAL_STRUCTURES.length - centralToCreate;

  const csvToCreate = structInfos.filter((i) => !existingStructByCode.has(i.code)).length;
  const csvExisting = structInfos.length - csvToCreate;

  console.log(`Regions : ${regionToCreate.length} a creer, ${regionExisting.length} deja presente(s)`);
  console.log(`Structures : ${csvToCreate + centralToCreate} a creer, ${csvExisting + centralExisting} deja presente(s)`);
  console.log(`Lignes non validees : ${totalUnvalidated}`);

  if (!APPLY) {
    console.log('DRY-RUN : aucune donnee ecrite. Relancez avec --apply pour ecrire.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (totalUnvalidated > 0) {
    if (!ALLOW_UNVALIDATED) {
      console.error('Certaines lignes ne sont pas validees. Utilisez --allow-unvalidated pour forcer (interdit en production).');
      await mongoose.disconnect();
      process.exit(1);
    }
    if (config.NODE_ENV === 'production') {
      console.error('--allow-unvalidated est interdit en production.');
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  let regionsCreated = 0;
  let regionsExisting = 0;
  for (const name of regionToCreate) {
    const res = await Region.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
    if (res.upsertedCount) regionsCreated++;
  }
  regionsExisting = regionExisting.length;

  const finalRegionMap = new Map(existingRegionMap);
  for (const name of regionToCreate) {
    const r = await Region.findOne({ name }).lean();
    if (r) finalRegionMap.set(name, r._id);
  }

  let structsCreated = 0;
  let structsExisting = 0;

  for (const cs of CENTRAL_STRUCTURES) {
    const existing = await Structure.findOne({ code: cs.code }).lean();
    if (!existing) {
      await Structure.updateOne({ code: cs.code }, { $setOnInsert: cs }, { upsert: true });
      structsCreated++;
    } else {
      structsExisting++;
    }
  }

  for (const info of structInfos) {
    const existing = await Structure.findOne({ code: info.code }).lean();
    if (existing) {
      structsExisting++;
      continue;
    }
    const regionId = finalRegionMap.get(info.region);
    const doc = {
      code: info.code,
      label: info.label,
      type: info.type,
      regionId,
      active: true,
    };
    await Structure.updateOne({ code: info.code }, { $setOnInsert: doc }, { upsert: true });
    structsCreated++;
  }

  console.log(`Regions : ${regionsCreated} creee(s), ${regionsExisting} deja presente(s)`);
  console.log(`Structures : ${structsCreated} creee(s), ${structsExisting} deja presente(s)`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
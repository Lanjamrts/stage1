"use strict";

// Init structures et regions (etape 41.4b) : lecture + validation des CSV,
// planification puis ecriture — tout passe par les depots (aucun modele
// Mongoose direct). Messages, comptages et codes de sortie inchanges.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadConfig } from '../config.js';
import { getRegionRepository } from '../repositories/regionRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { ouvrirBase, fermerBase } from './connexion.js';

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

// Lecture et validation des deux CSV : aucune base n'est ouverte ni ecrite.
// Les erreurs sont imprimees (identiquement a avant) puis { success: false }.
export function lireCsv(dataDir = process.env.INIT_DATA_DIR || DEFAULT_DATA_DIR) {
  const regionsPath = path.join(dataDir, 'regions.csv');
  const structuresPath = path.join(dataDir, 'structures.csv');

  if (!fs.existsSync(regionsPath) || !fs.existsSync(structuresPath)) {
    console.error('Fichiers CSV introuvables dans', dataDir);
    return { success: false };
  }

  const regionsContent = fs.readFileSync(regionsPath, 'utf8');
  const structuresContent = fs.readFileSync(structuresPath, 'utf8');

  const { headers: regionHeaders, rows: regionRows } = parseCSV(regionsContent);
  const { headers: structHeaders, rows: structRows } = parseCSV(structuresContent);

  const expectedRegionHeaders = ['region', 'valide', 'note'];
  const expectedStructHeaders = ['type', 'region', 'valide', 'note'];

  if (JSON.stringify(regionHeaders) !== JSON.stringify(expectedRegionHeaders)) {
    console.error('En-tete invalide dans regions.csv');
    return { success: false };
  }
  if (JSON.stringify(structHeaders) !== JSON.stringify(expectedStructHeaders)) {
    console.error('En-tete invalide dans structures.csv');
    return { success: false };
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
    return { success: false };
  }

  return { success: true, regionNames, structInfos, regionRows, structRows };
}

// Planification : lecture par depot des regions et structures deja en place,
// detection des conflits (imprimes) puis comptages. Aucune ecriture.
export async function planifier({ regionNames, structInfos }) {
  const existingRegions = await getRegionRepository().listerParNoms(Array.from(regionNames.values()));
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
    return { success: false };
  }

  const csvCodes = structInfos.map(i => i.code);
  const existingStructures = await getStructureRepository().listerParCodes(csvCodes);
  const existingStructByCode = new Map();
  const existingStructByLabel = new Map();
  for (const s of existingStructures) {
    existingStructByCode.set(s.code, s);
    existingStructByLabel.set(s.label, s);
  }

  const centralCodes = CENTRAL_STRUCTURES.map(cs => cs.code);
  const existingCentral = await getStructureRepository().listerParCodes(centralCodes);
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
    return { success: false };
  }

  const centralToCreate = CENTRAL_STRUCTURES.filter(cs => !existingStructByCode.has(cs.code)).length;
  const centralExisting = CENTRAL_STRUCTURES.length - centralToCreate;

  const csvToCreate = structInfos.filter((i) => !existingStructByCode.has(i.code)).length;
  const csvExisting = structInfos.length - csvToCreate;

  return {
    success: true,
    regionNames,
    structInfos,
    regionToCreate,
    existingRegionMap,
    regions: { aCreer: regionToCreate.length, dejaPresentes: regionExisting.length },
    structures: { aCreer: csvToCreate + centralToCreate, dejaPresentes: csvExisting + centralExisting },
  };
}

// Ecritures : regions par assurer (compte « creee » seulement si la region
// n'existait pas), structures par creerSiAbsent (centrales en premier).
async function ecrire(plan) {
  let regionsCreees = 0;
  const finalRegionMap = new Map(plan.existingRegionMap);
  for (const name of plan.regionToCreate) {
    const { region, cree } = await getRegionRepository().assurer(name);
    if (cree) regionsCreees++;
    finalRegionMap.set(name, region._id);
  }

  let structsCreees = 0;
  let structsExistantes = 0;

  for (const cs of CENTRAL_STRUCTURES) {
    const { cree } = await getStructureRepository().creerSiAbsent({ ...cs });
    if (cree) structsCreees++;
    else structsExistantes++;
  }

  for (const info of plan.structInfos) {
    const { cree } = await getStructureRepository().creerSiAbsent({
      code: info.code,
      label: info.label,
      type: info.type,
      regionId: finalRegionMap.get(info.region),
      active: true,
    });
    if (cree) structsCreees++;
    else structsExistantes++;
  }

  return {
    regionsCreees,
    regionsExistantes: plan.regions.dejaPresentes,
    structsCreees,
    structsExistantes,
  };
}

// Orchestration complete (hors connexion) : retourne { code } sans process.exit.
export async function executerInitStructures({ data, apply = false, allowUnvalidated = false }) {
  if (!data || !data.success) return { code: 1 };

  const { regionRows, structRows } = data;
  const config = loadConfig();

  const plan = await planifier(data);
  if (!plan.success) return { code: 1 };

  const unvalidatedRegions = regionRows.filter(r => r.valide.trim().toLowerCase() === 'non').length;
  const unvalidatedStructs = structRows.filter(r => r.valide.trim().toLowerCase() === 'non').length;
  const totalUnvalidated = unvalidatedRegions + unvalidatedStructs;

  console.log(`Regions : ${plan.regions.aCreer} a creer, ${plan.regions.dejaPresentes} deja presente(s)`);
  console.log(`Structures : ${plan.structures.aCreer} a creer, ${plan.structures.dejaPresentes} deja presente(s)`);
  console.log(`Lignes non validees : ${totalUnvalidated}`);

  if (!apply) {
    console.log('DRY-RUN : aucune donnee ecrite. Relancez avec --apply pour ecrire.');
    return { code: 0 };
  }

  if (totalUnvalidated > 0) {
    if (!allowUnvalidated) {
      console.error('Certaines lignes ne sont pas validees. Utilisez --allow-unvalidated pour forcer (interdit en production).');
      return { code: 1 };
    }
    if (config.NODE_ENV === 'production') {
      console.error('--allow-unvalidated est interdit en production.');
      return { code: 1 };
    }
  }

  const ecrits = await ecrire(plan);

  console.log(`Regions : ${ecrits.regionsCreees} creee(s), ${ecrits.regionsExistantes} deja presente(s)`);
  console.log(`Structures : ${ecrits.structsCreees} creee(s), ${ecrits.structsExistantes} deja presente(s)`);

  return { code: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const allowUnvalidated = args.includes('--allow-unvalidated');

  const data = lireCsv();
  if (!data.success) {
    await fermerBase();
    process.exit(1);
  }

  const { nom } = await ouvrirBase();
  console.log(`Base cible : ${nom}`);

  const { code } = await executerInitStructures({ data, apply, allowUnvalidated });
  await fermerBase();
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error('Erreur:', err);
    await fermerBase();
    process.exit(1);
  });
}

"use strict";

// Ajoute (si absent) la colonne « N° de mandat » à la table « membres »
// du module NCA, sans toucher aux saisies existantes ni aux autres colonnes.
// Dry-run par défaut : rien n'est ecrit. Passez --apply pour ecrire.
// Idempotent : un second --apply ne cree aucune modification.

import { loadConfig } from '../config.js';
import mongoose from 'mongoose';

import Module from '../models/Module.js';

const MODULE_CODE = 'NCA';
const TABLE_KEY = 'membres';
const NEW_FIELD = {
  key: 'mandat',
  label: 'N° de mandat',
  type: 'integer',
  required: true,
  min: 1,
  placeholder: '1 = premier mandat, 2 = deuxième mandat, etc.',
};

function parseArg(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

function findTable(fields) {
  return Array.isArray(fields) ? fields.find((f) => f && f.key === TABLE_KEY && f.type === 'table') : null;
}

function fieldEqual(a, b) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

// Calcule la nouvelle definition des champs du module si la colonne est manquante
// ou differente. Retourne { needsChange, fields, message }.
function computeFields(moduleDoc) {
  const fields = Array.isArray(moduleDoc.fields) ? [...moduleDoc.fields] : [];
  const table = findTable(fields);
  if (!table) {
    return { needsChange: false, fields, message: `Aucune table "${TABLE_KEY}" trouvee dans le module ${MODULE_CODE}.` };
  }
  const subfields = Array.isArray(table.fields) ? [...table.fields] : [];
  const index = subfields.findIndex((f) => f && f.key === NEW_FIELD.key);
  const existing = index >= 0 ? subfields[index] : null;

  if (existing && fieldEqual(existing, NEW_FIELD)) {
    return { needsChange: false, fields, message: `La colonne "${NEW_FIELD.label}" est deja presente (table "${TABLE_KEY}", module ${MODULE_CODE}).` };
  }

  if (index >= 0) {
    subfields[index] = NEW_FIELD;
  } else {
    // Placement apres "qualite" si elle existe, sinon a la fin de la table.
    const qualiteIndex = subfields.findIndex((f) => f && f.key === 'qualite');
    const position = qualiteIndex >= 0 ? qualiteIndex + 1 : subfields.length;
    subfields.splice(position, 0, NEW_FIELD);
  }

  const tableIndex = fields.findIndex((f) => f && f.key === TABLE_KEY);
  fields[tableIndex] = { ...table, fields: subfields };
  return {
    needsChange: true,
    fields,
    message: index >= 0 ? `Colonne "${NEW_FIELD.label}" remplacee.` : `Colonne "${NEW_FIELD.label}" ajoutee apres "Qualite".`,
  };
}

async function main() {
  const config = loadConfig();
  const APPLY = process.argv.includes('--apply');

  await mongoose.connect(config.MONGODB_URI);
  const dbName = mongoose.connection.name;
  console.log(`Base cible : ${dbName}`);

  const moduleDoc = await Module.findOne({ code: MODULE_CODE }).lean();
  if (!moduleDoc) {
    console.error(`Module ${MODULE_CODE} introuvable.`);
    process.exit(1);
  }

  const { needsChange, fields, message } = computeFields(moduleDoc);

  console.log(`Module ${MODULE_CODE} (version ${moduleDoc.version}) :`);
  console.log(` - ${message}`);
  if (!needsChange) {
    console.log('DRY-RUN : aucune modification necessaire. Rien a ecrire.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log('DRY-RUN : la colonne serait ajoutee. Relancez avec --apply pour ecrire.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const res = await Module.updateOne({ code: MODULE_CODE }, { $set: { fields } });
  if (res.matchedCount === 0) {
    console.error(`Module ${MODULE_CODE} introuvable au moment de l'ecriture.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`${res.matchedCount} module(s) mis a jour, ${res.modifiedCount} modification(s) ecrite(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});

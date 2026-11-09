"use strict";

// Ajoute (si absent) la colonne « N° de mandat » à la table « membres »
// du module NCA, sans toucher aux saisies existantes ni aux autres colonnes.
// Dry-run par défaut : rien n'est ecrit. Passez --apply pour ecrire.
// Idempotent : un second --apply ne cree aucune modification.

import { pathToFileURL } from 'node:url';

import { getModuleRepository } from '../repositories/moduleRepository.js';
import { ouvrirBase, fermerBase } from './connexion.js';

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
export function computeFields(moduleDoc) {
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

// Exécution complète (sans connexion) : retourne le code de sortie et le
// résultat, en reprenant les messages de l'original.
export async function executerNcaMandat({ apply = false } = {}) {
  const moduleDoc = await getModuleRepository().trouverParCode(MODULE_CODE);
  if (!moduleDoc) {
    console.error(`Module ${MODULE_CODE} introuvable.`);
    return { code: 1, modifie: false };
  }

  const { needsChange, fields, message } = computeFields(moduleDoc);

  console.log(`Module ${MODULE_CODE} (version ${moduleDoc.version}) :`);
  console.log(` - ${message}`);
  if (!needsChange) {
    console.log('DRY-RUN : aucune modification necessaire. Rien a ecrire.');
    return { code: 0, modifie: false };
  }

  if (!apply) {
    console.log('DRY-RUN : la colonne serait ajoutee. Relancez avec --apply pour ecrire.');
    return { code: 0, modifie: false };
  }

  const modifie = await getModuleRepository().mettreAJourFields(MODULE_CODE, fields);
  if (!modifie) {
    console.error(`Module ${MODULE_CODE} introuvable au moment de l'ecriture.`);
    return { code: 1, modifie: false };
  }
  console.log(`1 module(s) mis a jour, 1 modification(s) ecrite(s).`);
  return { code: 0, modifie: true };
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const { nom } = await ouvrirBase();
  console.log(`Base cible : ${nom}`);
  try {
    const { code } = await executerNcaMandat({ apply: APPLY });
    return code;
  } finally {
    await fermerBase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('Erreur:', err.message);
      process.exit(1);
    }
  );
}

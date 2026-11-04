#!/usr/bin/env node
"use strict";

// Applique le schéma Oracle (backend/db/oracle/*.sql) à la base ciblée par
// ORACLE_* (ou ORACLE_TEST_* quand NODE_ENV=test). Le code applicatif reste
// sur MongoDB : ce script est un outil de migration, il ne touche à aucun
// modèle, contrôleur, seed ni test existant.
//
// Usage :
//   node src/scripts/oracle-schema.js            création (001_schema.sql)
//   node src/scripts/oracle-schema.js --drop     suppression (000_drop.sql)
//   node src/scripts/oracle-schema.js --reset    suppression puis création
//
// Règles : aucune liaison de paramètre dans le SQL (knex.raw sans "?"),
// une instruction à la fois, commentaire "--" retiré par ligne, découpe sur
// ";" en fin de ligne. --drop et --reset sont refusés en production.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getKnex, closeOracle, messageErreurOracle } from '../db/oracle.js';

const DOSSIER_SQL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/oracle');
const FICHIER_DROP = path.join(DOSSIER_SQL, '000_drop.sql');
const FICHIER_SCHEMA = path.join(DOSSIER_SQL, '001_schema.sql');
const ORA_TABLE_ABSENTE = 942;

// Analyse des options : refuse --drop/--reset en production (avant toute
// connexion). Exporté pour être testable sans base.
export function analyserOptions(argv, nodeEnv) {
  const reset = argv.includes('--reset');
  const drop = argv.includes('--drop');
  if ((drop || reset) && nodeEnv === 'production') {
    return {
      erreur:
        'Options --drop et --reset refusées en production (NODE_ENV=production) : ' +
        'le schéma Oracle ne peut pas être supprimé sur un environnement de production.',
    };
  }
  return { erreur: null, drop: drop || reset, create: !drop || reset };
}

// Lit un fichier .sql, retire les lignes de commentaire "--" et découpe sur
// les ";" en fin de ligne. Aucune modification des fichiers du dépôt.
export function lireInstructions(chemin) {
  const brut = fs.readFileSync(chemin, 'utf8');
  const sansCommentaires = brut
    .split('\n')
    .filter((ligne) => !ligne.trim().startsWith('--'))
    .join('\n');
  return sansCommentaires
    .split(/;\s*$/m)
    .map((instruction) => instruction.trim())
    .filter(Boolean);
}

async function executerInstructions(instructions, { ignorerTableAbsente = false } = {}) {
  const db = await getKnex();
  let executees = 0;
  for (const instruction of instructions) {
    try {
      await db.raw(instruction);
      executees += 1;
    } catch (err) {
      const code = err && err.errorNum != null ? Number(err.errorNum) : null;
      if (ignorerTableAbsente && code === ORA_TABLE_ABSENTE) continue;
      throw err;
    }
  }
  return executees;
}

async function supprimerSchema() {
  return executerInstructions(lireInstructions(FICHIER_DROP), { ignorerTableAbsente: true });
}

async function creerSchema() {
  return executerInstructions(lireInstructions(FICHIER_SCHEMA));
}

// Retourne le code de sortie (0 ou 1) sans appeler process.exit : testable.
export async function main(argv = process.argv.slice(2), nodeEnv = process.env.NODE_ENV) {
  const options = analyserOptions(argv, nodeEnv);
  if (options.erreur) {
    console.error(options.erreur);
    return 1;
  }

  let code = 0;
  try {
    if (options.drop) {
      const supprimes = await supprimerSchema();
      if (!options.create) console.log(`Schéma Oracle supprimé : ${supprimes} objets`);
    }
    if (options.create) {
      const crees = await creerSchema();
      console.log(`Schéma Oracle créé : ${crees} objets`);
    }
  } catch (err) {
    code = 1;
    console.error(`Échec Oracle : ${messageErreurOracle(err)}`);
  } finally {
    try {
      await closeOracle();
    } catch {
      /* pool déjà fermé */
    }
  }
  return code;
}

const executeDirectement =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executeDirectement) {
  main().then((code) => process.exit(code));
}

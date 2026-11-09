"use strict";

// Connexion partagée des scripts (étape 41.4a).
// MongoDB n'est ouvert que si CORE_STORE === 'mongo' (relu à chaque appel de
// ouvrirBase). En mode Oracle rien n'est ouvert ici : le pool knex s'ouvre à la
// demande dans les dépôts, et fermerBase() le referme. fermerBase() est appelé
// à chaque sortie d'un script (succès, erreur, process.exit) ; sans effet si
// rien n'a été ouvert.

import mongoose from 'mongoose';

import { loadConfig } from '../config.js';
import { closeOracle } from '../db/oracle.js';

let mongoOuverte = false;

// Libellé d'affichage de la base Oracle : service uniquement, jamais
// l'utilisateur ni le mot de passe.
function nomOracle(config) {
  const service =
    config.NODE_ENV === 'test' && config.ORACLE_TEST_CONNECT_STRING
      ? config.ORACLE_TEST_CONNECT_STRING
      : config.ORACLE_CONNECT_STRING;
  return `Oracle (${service || '127.0.0.1:1521/XEPDB1'})`;
}

// Ouvre la base cible et retourne { store, nom } : `nom` est le libellé à
// afficher (« Base cible : … »), jamais un identifiant.
export async function ouvrirBase() {
  const config = loadConfig();
  if (config.CORE_STORE === 'oracle') {
    return { store: 'oracle', nom: nomOracle(config) };
  }
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(config.MONGODB_URI);
    mongoOuverte = true;
  }
  return { store: 'mongo', nom: mongoose.connection.name };
}

// Ferme ce qui a été ouvert : MongoDB si ouvrirBase l'a ouvert, puis le pool
// Oracle (closeOracle est sans effet quand aucun pool n'a été ouvert).
export async function fermerBase() {
  try {
    if (mongoOuverte) {
      mongoOuverte = false;
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }
    }
  } finally {
    await closeOracle();
  }
}

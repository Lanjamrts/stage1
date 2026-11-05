"use strict";

// Stockage des utilisateurs : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as utilisateurMongo from './utilisateurMongo.js';
import * as utilisateurOracle from './utilisateurOracle.js';

export function getUtilisateurRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? utilisateurOracle : utilisateurMongo;
}

"use strict";

// Stockage des saisies : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as saisieMongo from './saisieMongo.js';
import * as saisieOracle from './saisieOracle.js';

export function getSaisieRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? saisieOracle : saisieMongo;
}

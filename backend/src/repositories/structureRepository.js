"use strict";

// Stockage des structures : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as structureMongo from './structureMongo.js';
import * as structureOracle from './structureOracle.js';

export function getStructureRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? structureOracle : structureMongo;
}

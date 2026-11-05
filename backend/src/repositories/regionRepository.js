"use strict";

// Stockage des régions : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as regionMongo from './regionMongo.js';
import * as regionOracle from './regionOracle.js';

export function getRegionRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? regionOracle : regionMongo;
}

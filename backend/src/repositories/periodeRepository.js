"use strict";

// Stockage des périodes : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as periodeMongo from './periodeMongo.js';
import * as periodeOracle from './periodeOracle.js';

export function getPeriodeRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? periodeOracle : periodeMongo;
}

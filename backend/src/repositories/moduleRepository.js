"use strict";

// Stockage des modules : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as moduleMongo from './moduleMongo.js';
import * as moduleOracle from './moduleOracle.js';

export function getModuleRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? moduleOracle : moduleMongo;
}

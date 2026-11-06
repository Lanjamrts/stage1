"use strict";

// Stockage des remarques : MongoDB par défaut, Oracle selon CORE_STORE.
// Le choix est relu À CHAQUE appel (aucun cache d'implémentation).

import { loadConfig } from '../config.js';
import * as remarqueMongo from './remarqueMongo.js';
import * as remarqueOracle from './remarqueOracle.js';

export function getRemarqueRepository() {
  return loadConfig().CORE_STORE === 'oracle' ? remarqueOracle : remarqueMongo;
}

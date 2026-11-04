"use strict";

import { loadConfig } from '../config.js';
import * as profilMongo from './profilMongo.js';
import * as profilOracle from './profilOracle.js';

// Le stockage des profils est relu À CHAQUE appel (aucun cache de
// l'implémentation) : les tests peuvent changer REFERENCE_STORE en cours de session.
export function getProfilRepository() {
  return loadConfig().REFERENCE_STORE === 'oracle' ? profilOracle : profilMongo;
}

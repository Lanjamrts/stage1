"use strict";

import { loadConfig } from '../config.js';
import * as referentielMongo from './referentielMongo.js';
import * as referentielOracle from './referentielOracle.js';

// Le stockage des référentiels est relu À CHAQUE appel (aucun cache de
// l'implémentation) : les tests peuvent changer REFERENCE_STORE en cours de session.
export function getReferentielRepository() {
  return loadConfig().REFERENCE_STORE === 'oracle' ? referentielOracle : referentielMongo;
}

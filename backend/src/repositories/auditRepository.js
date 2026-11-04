"use strict";

import { loadConfig } from '../config.js';
import * as auditMongo from './auditMongo.js';
import * as auditOracle from './auditOracle.js';

// Le stockage du journal d'audit est relu À CHAQUE appel (aucun cache de
// l'implémentation) : les tests peuvent changer AUDIT_STORE en cours de session.
export function getAuditRepository() {
  return loadConfig().AUDIT_STORE === 'oracle' ? auditOracle : auditMongo;
}

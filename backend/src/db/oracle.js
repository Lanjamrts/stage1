"use strict";

import { loadConfig } from '../config.js';

// Règle : aucune requête SQL n'est construite par concatenation de texte utilisateur.
// Uniquement des liaisons de paramètres (bindings) via knex/oracledb.

let knexInstance = null;

function configOracle() {
  const config = loadConfig();
  const estTest = config.NODE_ENV === 'test';
  return {
    user: estTest && config.ORACLE_TEST_USER ? config.ORACLE_TEST_USER : config.ORACLE_USER,
    password: estTest && config.ORACLE_TEST_PASSWORD ? config.ORACLE_TEST_PASSWORD : config.ORACLE_PASSWORD,
    connectString: (estTest && config.ORACLE_TEST_CONNECT_STRING ? config.ORACLE_TEST_CONNECT_STRING : config.ORACLE_CONNECT_STRING) || '127.0.0.1:1521/XEPDB1',
    pool: {
      min: Number(config.ORACLE_POOL_MIN ?? 1),
      max: Number(config.ORACLE_POOL_MAX ?? 10),
    },
  };
}

function masquerMotDePasse(message) {
  const config = loadConfig();
  if (!config.ORACLE_PASSWORD) return message;
  return message.replaceAll(config.ORACLE_PASSWORD, '*****');
}

function messageErreurOracle(err) {
  const code = err && err.errorNum ? String(err.errorNum) : null;
  const message = masquerMotDePasse(err && err.message ? String(err.message) : 'Erreur Oracle inconnue.');

  switch (code) {
    case '01017':
      return "Identifiants Oracle refuses (ORA-01017) : verifiez ORACLE_USER et ORACLE_PASSWORD. " + message;
    case '12514':
      return "Service Oracle introuvable (ORA-12514) : verifiez ORACLE_CONNECT_STRING. " + message;
    case '12170':
      return "Délai de connexion Oracle depasse (ORA-12170). " + message;
    default:
      break;
  }

  const lower = message.toLowerCase();
  if (lower.includes('connect timed out') || lower.includes('timeout')) {
    return "Délai de connexion Oracle depasse : l'hôte ne repond pas. " + message;
  }
  if (lower.includes('getaddrinfo') || lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('injoignable')) {
    return "Hôte Oracle injoignable : verifiez ORACLE_CONNECT_STRING et le reseau. " + message;
  }
  return "Erreur Oracle : " + message;
}

export async function getKnex() {
  if (knexInstance) return knexInstance;
  const knex = (await import('knex')).default;
  const { user, password, connectString, pool } = configOracle();
  knexInstance = knex({
    client: 'oracledb',
    connection: { user, password, connectString },
    pool,
  });
  return knexInstance;
}

export async function pingOracle() {
  const db = await getKnex();

  const testResult = await db.raw("SELECT 'OK' AS test FROM dual");
  const rows = testResult.rows || testResult;
  const test = rows[0] && (rows[0].TEST || rows[0].test) ? String(rows[0].TEST || rows[0].test) : 'OK';

  let version = 'inconnue';
  let service = 'inconnu';
  try {
    const config = loadConfig();
    service = config.ORACLE_CONNECT_STRING || '127.0.0.1:1521/XEPDB1';
    const verResult = await db.raw("SELECT version_full FROM product_component_version WHERE rownum = 1");
    const verRows = verResult.rows || verResult;
    if (verRows[0]) {
      version = verRows[0].VERSION_FULL ?? verRows[0].version_full ?? String(Object.values(verRows[0])[0]);
    }
  } catch (errVersion) {
    try {
      const verResult = await db.raw("SELECT version FROM product_component_version WHERE rownum = 1");
      const verRows = verResult.rows || verResult;
      if (verRows[0]) {
        version = verRows[0].VERSION ?? verRows[0].version ?? String(Object.values(verRows[0])[0]);
      }
    } catch {
      /* version indisponible, valeur par défaut conservée */
    }
  }

  return { test, version, service };
}

export async function closeOracle() {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
}

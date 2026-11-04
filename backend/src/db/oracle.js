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
  let motDePasse;
  try {
    motDePasse = loadConfig().ORACLE_PASSWORD;
  } catch {
    // Configuration incomplète : on masque quand même, via l'environnement.
    motDePasse = process.env.ORACLE_PASSWORD;
  }
  if (!motDePasse) return message;
  return message.replaceAll(motDePasse, '*****');
}

const MESSAGES_ORACLE = {
  identifiants: 'Identifiants Oracle refusés (ORA-01017) : vérifiez ORACLE_USER et ORACLE_PASSWORD. ',
  identifiantsAbsents: 'Identifiants Oracle absents : définissez ORACLE_USER et ORACLE_PASSWORD. ',
  service: 'Service Oracle introuvable (ORA-12514) : vérifiez ORACLE_CONNECT_STRING. ',
  serviceNonEnregistre: 'Service Oracle non enregistré : Oracle démarre peut-être encore, réessayez dans une minute, ou vérifiez ORACLE_CONNECT_STRING. ',
  delai: 'Délai de connexion Oracle dépassé (ORA-12170). ',
  injoignable: 'Oracle est injoignable (connexion refusée) : le conteneur ou le service Oracle est-il démarré ? Vérifiez ORACLE_CONNECT_STRING. ',
};

// Traduit une erreur Oracle/node-oracledb en une phrase claire en français,
// sur une seule ligne et sans jamais exposer le mot de passe.
export function messageErreurOracle(err) {
  const code = err && err.errorNum != null ? String(err.errorNum) : null;
  const brut = err && err.message ? String(err.message) : 'Erreur Oracle inconnue.';
  const message = masquerMotDePasse(brut).split('\n')[0].trim() || 'Erreur Oracle inconnue.';
  const lower = message.toLowerCase();

  if (lower.includes('njs-101')) {
    return MESSAGES_ORACLE.identifiantsAbsents + message;
  }
  if (lower.includes('njs-518') || (code === '12514' && lower.includes('not registered'))) {
    return MESSAGES_ORACLE.serviceNonEnregistre + message;
  }

  switch (code) {
    case '1017':
    case '01017':
      return MESSAGES_ORACLE.identifiants + message;
    case '12514':
      return MESSAGES_ORACLE.service + message;
    case '12170':
      return MESSAGES_ORACLE.delai + message;
    case '503':
      return MESSAGES_ORACLE.injoignable + message;
    default:
      break;
  }

  if (lower.includes('njs-503') || lower.includes('econnrefused')) {
    return MESSAGES_ORACLE.injoignable + message;
  }
  if (lower.includes('connect timed out') || lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return "Délai de connexion Oracle dépassé : l'hôte ne répond pas. " + message;
  }
  if (lower.includes('getaddrinfo') || lower.includes('enotfound') || lower.includes('injoignable')) {
    return 'Hôte Oracle injoignable : vérifiez ORACLE_CONNECT_STRING et le réseau. ' + message;
  }
  return 'Erreur Oracle : ' + message;
}

export async function getKnex() {
  if (knexInstance) return knexInstance;
  const knex = (await import('knex')).default;
  const { user, password, connectString, pool } = configOracle();
  knexInstance = knex({
    client: 'oracledb',
    connection: { user, password, connectString },
    pool,
    // Journal silencieux : les erreurs de connexion sont traduites par
    // messageErreurOracle() et affichées par le script appelant.
    log: {
      error: () => {},
      warn: () => {},
      deprecate: () => {},
      debug: () => {},
    },
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

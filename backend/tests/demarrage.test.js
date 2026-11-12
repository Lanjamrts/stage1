"use strict";

// Étape 44 : démarrage sans MongoDB quand les trois stocks sont sur Oracle.
// - Bloc « fonctions pures » TOUJOURS exécuté : mongoRequis/oracleRequis sur
//   les 8 combinaisons des trois stocks, MONGODB_URI absente acceptée
//   uniquement quand les trois sont sur Oracle (refus sinon, message clair),
//   URL invalide refusée, valeur par défaut en NODE_ENV=test conservée.
// - Bloc d'intégration en describe.skipIf sans ORACLE_TEST_USER /
//   ORACLE_TEST_PASSWORD : le serveur est lancé dans un processus séparé
//   (NODE_ENV=development pour que startServer() s'exécute), les trois stocks à
//   oracle, SANS MONGODB_URI, base de test (ORACLE_TEST_USER, sigbd_test —
//   jamais ORACLE_USER ni la base de développement sigbd), sur un port libre.
//   On vérifie qu'il répond à la route de connexion existante avec de mauvais
//   identifiants (400), qu'aucun message « MongoDB » n'apparaît dans sa
//   sortie, puis qu'il s'arrête proprement sur SIGTERM avec le code 0.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { parseEnv, loadConfig, mongoRequis, oracleRequis } from '../src/config.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);
const DOSSIER_BACKEND = resolve(fileURLToPath(import.meta.url), '..', '..');
const SERVEUR = join(DOSSIER_BACKEND, 'src', 'server.js');
const URI_TEST = 'mongodb://127.0.0.1:27017/sigbd_test';

const BASE = { JWT_SECRET: 'a'.repeat(96), NODE_ENV: 'development' };

// Les 8 combinaisons des trois interrupteurs.
const COMBINAISONS = ['mongo', 'oracle'].flatMap((core) =>
  ['mongo', 'oracle'].flatMap((reference) =>
    ['mongo', 'oracle'].map((audit) => ({ CORE_STORE: core, REFERENCE_STORE: reference, AUDIT_STORE: audit })),
  ),
);

function toutesSurOracle(combo) {
  return Object.values(combo).every((valeur) => valeur === 'oracle');
}

// ---------------------------------------------------------------------------
// Fonctions pures — toujours exécutées, aucune connexion
// ---------------------------------------------------------------------------

describe('Démarrage sans MongoDB — configuration (backend/src/config.js)', () => {
  it('D1 : mongoRequis et oracleRequis sur les 8 combinaisons des trois stocks', () => {
    expect(COMBINAISONS).toHaveLength(8);
    for (const combo of COMBINAISONS) {
      const config = parseEnv({ ...BASE, ...combo, MONGODB_URI: URI_TEST });
      expect(mongoRequis(config)).toBe(!toutesSurOracle(combo));
      expect(oracleRequis(config)).toBe(Object.values(combo).includes('oracle'));
    }
  });

  it('D2 : MONGODB_URI absente acceptée uniquement quand les trois stocks sont sur Oracle', () => {
    for (const combo of COMBINAISONS) {
      const env = { ...BASE, ...combo }; // pas de MONGODB_URI
      if (toutesSurOracle(combo)) {
        const config = parseEnv(env);
        expect(config.MONGODB_URI).toBeUndefined();
        expect(mongoRequis(config)).toBe(false);
      } else {
        expect(() => parseEnv(env)).toThrow(/MONGODB_URI/);
      }
    }
  });

  it('D3 : refus avec un message clair en français quand au moins un stock est sur MongoDB', () => {
    let message = '';
    try {
      parseEnv({ ...BASE, CORE_STORE: 'mongo', REFERENCE_STORE: 'oracle', AUDIT_STORE: 'oracle' });
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('MONGODB_URI est requis');
    expect(message).toContain('CORE_STORE, REFERENCE_STORE, AUDIT_STORE');
    expect(message).toContain("passez les trois stocks à 'oracle'");

    // Un seul stock sur MongoDB suffit à exiger l'URI.
    expect(() => parseEnv({ ...BASE, CORE_STORE: 'oracle', REFERENCE_STORE: 'oracle', AUDIT_STORE: 'oracle', MONGODB_URI: undefined })).not.toThrow();
    expect(() => parseEnv({ ...BASE, CORE_STORE: 'oracle', REFERENCE_STORE: 'oracle', AUDIT_STORE: 'mongo' })).toThrow(/MONGODB_URI est requis/);
  });

  it('D4 : URL invalide refusée, y compris en mode trois stocks sur Oracle', () => {
    const toutOracle = { CORE_STORE: 'oracle', REFERENCE_STORE: 'oracle', AUDIT_STORE: 'oracle' };
    expect(() => parseEnv({ ...BASE, MONGODB_URI: 'pas-une-url' })).toThrow(/MONGODB_URI doit être une URL valide/);
    expect(() => parseEnv({ ...BASE, ...toutOracle, MONGODB_URI: 'mongodb://@' })).toThrow(/MONGODB_URI doit être une URL valide/);
    // Une URI valide reste acceptée en mode Oracle (elle n'est simplement pas utilisée).
    expect(parseEnv({ ...BASE, ...toutOracle, MONGODB_URI: URI_TEST }).MONGODB_URI).toBe(URI_TEST);
  });

  it('D5 : en NODE_ENV=test, MONGODB_URI garde sa valeur par défaut (comportement inchangé)', () => {
    expect(loadConfig().NODE_ENV).toBe('test');
    expect(loadConfig().MONGODB_URI).toBe(URI_TEST);
    expect(mongoRequis(loadConfig())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Intégration — processus serveur sans MONGODB_URI, sauf si ORACLE_TEST_* absent
// ---------------------------------------------------------------------------

// Port libre : un serveur éphémère est ouvert puis refermé, le port relevé.
function portLibre() {
  return new Promise((reussi, echec) => {
    const serveur = net.createServer();
    serveur.once('error', echec);
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = serveur.address();
      serveur.close(() => reussi(port));
    });
  });
}

// Requête POST JSON sans keep-alive (Connection: close) : le serveur ne garde
// aucun socket ouvert, l'arrêt sur SIGTERM ne peut donc pas se bloquer dessus.
function postJSON(port, chemin, corps) {
  return new Promise((reussi, echec) => {
    const charge = JSON.stringify(corps);
    const requete = http.request(
      {
        host: '127.0.0.1',
        port,
        path: chemin,
        method: 'POST',
        agent: false,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(charge) },
      },
      (reponse) => {
        let data = '';
        reponse.setEncoding('utf8');
        reponse.on('data', (morceau) => {
          data += morceau;
        });
        reponse.on('end', () => reussi({ status: reponse.statusCode, body: data }));
      },
    );
    requete.on('error', echec);
    requete.end(charge);
  });
}

describe.skipIf(!oracleConfiguree)('Démarrage du serveur sans MongoDB (processus séparé)', () => {
  let enfant = null;
  let portServeur = null;
  let sortie = '';
  let codeSortie = null;
  let signalSortie = null;
  let ferme = false;
  let dossierTemp = null;

  function attacherFlux(flux) {
    flux.setEncoding('utf8');
    flux.on('data', (morceau) => {
      sortie += morceau;
    });
  }

  async function attendreDemarrage(delaiMs = 30000) {
    const limite = Date.now() + delaiMs;
    while (Date.now() < limite) {
      if (sortie.includes('Serveur démarré sur le port')) return;
      if (ferme) {
        throw new Error(`Le serveur s'est terminé avant d'écouter (code ${codeSortie}, signal ${signalSortie}) :\n${sortie}`);
      }
      await new Promise((reussi) => setTimeout(reussi, 50));
    }
    throw new Error(`Démarrage dépassé (${delaiMs} ms) :\n${sortie}`);
  }

  function attendreFin(delaiMs = 15000) {
    return new Promise((reussi, echec) => {
      if (ferme) return reussi({ code: codeSortie, signal: signalSortie });
      const minuteur = setTimeout(() => echec(new Error(`Le serveur ne s'est pas arrêté (${delaiMs} ms) :\n${sortie}`)), delaiMs);
      enfant.on('close', (code, signal) => {
        clearTimeout(minuteur);
        reussi({ code, signal });
      });
    });
  }

  beforeAll(async () => {;
    // Schéma de la base de test appliqué seulement si une table manque (jamais --reset).
    const db = await getKnex();
    const resultat = await db.raw(
      "SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN " +
        "('UTILISATEUR', 'JOURNAL_AUDIT', 'REGION', 'STRUCTURE', 'PERIODE', 'MODULE_SIGBD', 'SAISIE', 'REMARQUE')",
    );
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) < 8) {
      expect(await mainSchema([])).toBe(0);
    }
    await closeOracle();

    const config = loadConfig();
    portServeur = await portLibre();

    // L'environnement du serveur est reconstruit à partir de celui du test,
    // SANS MONGODB_URI, avec les trois stocks à oracle et les identifiants de
    // test. cwd sans .env : backend/.env n'est pas relu par dotenv.
    const environnement = { ...process.env };
    delete environnement.MONGODB_URI;
    expect(environnement.MONGODB_URI).toBeUndefined();
    dossierTemp = join(tmpdir(), `sigbd-demarrage-sans-mongo-${Date.now()}`);
    mkdirSync(dossierTemp, { recursive: true });

    enfant = spawn(process.execPath, [SERVEUR], {
      cwd: dossierTemp,
      env: {
        ...environnement,
        NODE_ENV: 'development',
        PORT: String(portServeur),
        JWT_SECRET: 'secret-de-demarrage-sans-mongo-etape-44-32-caracteres',
        CORE_STORE: 'oracle',
        REFERENCE_STORE: 'oracle',
        AUDIT_STORE: 'oracle',
        ORACLE_USER: config.ORACLE_TEST_USER,
        ORACLE_PASSWORD: config.ORACLE_TEST_PASSWORD,
        ORACLE_CONNECT_STRING: config.ORACLE_TEST_CONNECT_STRING || config.ORACLE_CONNECT_STRING,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    attacherFlux(enfant.stdout);
    attacherFlux(enfant.stderr);
    enfant.on('exit', (code, signal) => {
      codeSortie = code;
      signalSortie = signal;
    });
    enfant.on('close', () => {
      ferme = true;
    });

    await attendreDemarrage();;
  }, 60000);

  afterAll(async () => {;
    if (enfant && !ferme) {
      enfant.kill('SIGKILL');
      await attendreFin(5000).catch(() => {});
    }
    await closeOracle();;
    if (dossierTemp) {
      rmSync(dossierTemp, { recursive: true, force: true });
    }
  }, 60000);

  it("I1 : le serveur répond à /api/auth/login avec de mauvais identifiants (400)", async () => {
    const reponse = await postJSON(portServeur, '/api/auth/login', { im: '000000000000', password: 'MotDePasseFaux1!' });
    expect(reponse.status).toBe(400);
    expect(reponse.body).toContain('Identifiant ou mot de passe incorrect');
  }, 30000);

  it('I2 : aucun message « MongoDB » dans la sortie, « Oracle connecté » bien présent', () => {;
    expect(sortie).not.toContain('MongoDB');
    expect(sortie).toContain('✅ Oracle connecté');
    expect(sortie).toContain('Serveur démarré sur le port');
    // Jamais d'identifiant dans la sortie.
    expect(sortie).not.toContain(loadConfig().ORACLE_TEST_PASSWORD);
  }, 30000);

  it('I3 : SIGTERM → arrêt propre du serveur HTTP, de Mongo et du pool Oracle, code 0', async () => {;
    expect(ferme).toBe(false);
    enfant.kill('SIGTERM');
    const fin = await attendreFin();
    expect(fin.signal).toBeNull();;
    expect(fin.code).toBe(0);
    expect(sortie).not.toContain('MongoDB');
  }, 30000);
});

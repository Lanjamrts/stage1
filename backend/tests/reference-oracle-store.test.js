"use strict";

// Circuit complet avec REFERENCE_STORE=oracle : POST /api/referentiels (écriture
// developpeur), GET (lecture) puis PUT (renommage), même montage que
// backend/tests/audit-oracle-store.test.js.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

import { loadConfig } from '../src/config.js';
import { getReferentielRepository } from '../src/repositories/referentielRepository.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const IM_DEV = '123009'; // developpeur du seed de test
const PASSWORD = 'Test@2026';
const TYPE = 'grades';
const VALEUR = 'Grade oracle etape 37';
const NOUVELLE_VALEUR = 'Grade oracle renomme';

let app;
let referenceStoreAvant;

describe.skipIf(!oracleConfiguree)('Circuit complet REFERENCE_STORE=oracle — POST puis GET puis PUT /api/referentiels', () => {
  beforeAll(async () => {
    referenceStoreAvant = process.env.REFERENCE_STORE;
    process.env.REFERENCE_STORE = 'oracle';

    // L'import de l'APP se fait après la variable : la configuration est mise en
    // cache avec REFERENCE_STORE=oracle pour tout ce fichier.
    ({ default: app } = await import('../src/server.js'));
    await mongoose.connect(process.env.MONGODB_URI);

    // Schéma appliqué seulement si la table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw("SELECT COUNT(*) AS N FROM user_tables WHERE table_name = 'REFERENTIEL'");
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) === 0) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }

    expect(loadConfig().REFERENCE_STORE).toBe('oracle');
    await getReferentielRepository().supprimerTout();
  }, 60000);

  afterAll(async () => {
    await getReferentielRepository().supprimerTout();
    await mongoose.disconnect();
    await closeOracle();
    if (referenceStoreAvant === undefined) {
      delete process.env.REFERENCE_STORE;
    } else {
      process.env.REFERENCE_STORE = referenceStoreAvant;
    }
    loadConfig().REFERENCE_STORE = referenceStoreAvant ?? 'mongo';
  }, 60000);

  it("POST en developpeur écrit dans Oracle, GET renvoie la valeur, PUT la renomme", async () => {
    const agent = request.agent(app);
    const connexion = await agent.post('/api/auth/login').send({ im: IM_DEV, password: PASSWORD });
    expect(connexion.status).toBe(200);

    const cree = await agent.post(`/api/referentiels/${TYPE}`).send({ value: VALEUR });
    expect(cree.status).toBe(201);
    expect(cree.body).toEqual({ type: TYPE, value: VALEUR });

    const lu = await agent.get(`/api/referentiels/${TYPE}`);
    expect(lu.status).toBe(200);
    expect(lu.body.type).toBe(TYPE);
    expect(lu.body.values).toContain(VALEUR);

    const renomme = await agent.put(`/api/referentiels/${TYPE}`).send({ value: VALEUR, newValue: NOUVELLE_VALEUR });
    expect(renomme.status).toBe(200);
    expect(renomme.body).toEqual({ type: TYPE, value: NOUVELLE_VALEUR });

    const apres = await agent.get(`/api/referentiels/${TYPE}`);
    expect(apres.status).toBe(200);
    expect(apres.body.values).toContain(NOUVELLE_VALEUR);
    expect(apres.body.values).not.toContain(VALEUR);
  });
});

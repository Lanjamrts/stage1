"use strict";

// Circuit complet avec AUDIT_STORE=oracle : logAudit (écriture) puis
// GET /api/audit (lecture) sur l'API, même montage que backend/tests/audit.test.js.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

import { loadConfig } from '../src/config.js';
import { getAuditRepository } from '../src/repositories/auditRepository.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const IM_ADMIN1 = '120344';
const PASSWORD = 'Test@2026';

let app;
let auditStoreAvant;

describe.skipIf(!oracleConfiguree)("Circuit complet AUDIT_STORE=oracle — écriture logAudit puis lecture GET /api/audit", () => {
  beforeAll(async () => {
    auditStoreAvant = process.env.AUDIT_STORE;
    process.env.AUDIT_STORE = 'oracle';

    // L'import de l'APP se fait après la variable : la configuration est mise en
    // cache avec AUDIT_STORE=oracle pour tout ce fichier.
    ({ default: app } = await import('../src/server.js'));
    await mongoose.connect(process.env.MONGODB_URI);

    // Schéma appliqué seulement si la table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw("SELECT COUNT(*) AS N FROM user_tables WHERE table_name = 'JOURNAL_AUDIT'");
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) === 0) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }

    expect(loadConfig().AUDIT_STORE).toBe('oracle');
    await getAuditRepository().supprimerTout();
  }, 60000);

  afterAll(async () => {
    await getAuditRepository().supprimerTout();
    await mongoose.disconnect();
    await closeOracle();
    if (auditStoreAvant === undefined) {
      delete process.env.AUDIT_STORE;
    } else {
      process.env.AUDIT_STORE = auditStoreAvant;
    }
    loadConfig().AUDIT_STORE = auditStoreAvant ?? 'mongo';
  }, 60000);

  it("login admin1 écrit login_success dans Oracle, GET /api/audit le renvoie avec X-Total-Count", async () => {
    const agent = request.agent(app);
    const connexion = await agent.post('/api/auth/login').send({ im: IM_ADMIN1, password: PASSWORD });
    expect(connexion.status).toBe(200);

    const res = await agent.get('/api/audit?action=login_success&limit=100');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.headers['x-total-count']).toBeDefined();
    expect(parseInt(res.headers['x-total-count'], 10)).toBe(1);
    expect(res.headers['access-control-expose-headers']).toContain('X-Total-Count');

    expect(res.body).toHaveLength(1);
    const ligne = res.body[0];
    expect(ligne.action).toBe('login_success');
    expect(ligne.object).toBe('utilisateur');
    expect(ligne.userId).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(typeof ligne.date).toBe('string');
    expect(ligne.id).toBeTruthy();
    // userLabel provient de MongoDB (les utilisateurs ne quittent pas Mongo).
    expect(ligne.userLabel).toBeTruthy();
    expect(typeof ligne.ip).toBe('string');
  });
});

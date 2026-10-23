"use strict";

// ETAPE 29 — Gabarit : créer et supprimer un rapport (développeur uniquement).
// Base dédiée sigbd_test (semencée par `npm test`), jamais la base de dev.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

const { default: app } = await import('../src/server.js');

import Module from '../src/models/Module.js';
import Saisie from '../src/models/Saisie.js';
import JournalAudit from '../src/models/JournalAudit.js';
import Structure from '../src/models/Structure.js';
import Utilisateur from '../src/models/Utilisateur.js';

const PASSWORD = 'Test@2026';
const agents = {};
// Modules créés par ce fichier, à nettoyer en afterAll pour laisser 13 modules de seed.
const createdModuleIds = [];

async function login(im, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password });
  if (res.status !== 200) {
    throw new Error(`login ${im} → ${res.status} : ${JSON.stringify(res.body)}`);
  }
  return agent;
}

const modulePayload = (code) => ({
  code,
  label: 'Rapport de test E29',
  periodicity: 'monthly',
  kind: 'event',
  structureTypes: ['SRB'],
  fields: [{ key: 'titre', label: 'Titre', type: 'text' }],
});

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  agents.dev = await login('123009'); // développeur
  agents.client = await login('104562'); // client
  agents.admin1 = await login('120344'); // admin1
  agents.admin2 = await login('108231'); // admin2
  agents.consultant = await login('121775'); // consultant
});

afterAll(async () => {
  // Nettoyage : supprimer les saisies puis les modules créés par ce fichier.
  for (const id of createdModuleIds) {
    try {
      await Saisie.deleteMany({ moduleId: id });
      await Module.findByIdAndDelete(id);
    } catch {}
  }
  await mongoose.disconnect();
});

describe('ETAPE 29 — création de rapport (POST /api/config/modules)', () => {
  it('développeur crée un rapport : 201, actif par défaut, version 1', async () => {
    const res = await agents.dev.post('/api/config/modules').send(modulePayload('TEST29'));
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('TEST29');
    expect(res.body.version).toBe(1);
    const m = await Module.findOne({ code: 'TEST29' });
    expect(m).not.toBeNull();
    expect(m.active).toBe(true);
    createdModuleIds.push(String(m._id));
    // ligne d'audit de création
    const audit = await JournalAudit.findOne({ action: 'module_publish', object: `module:${m._id}` });
    expect(audit).not.toBeNull();
    expect(typeof audit.userId).toBe('string');
    expect(audit.userId.length).toBeGreaterThan(0);
  });

  it('code déjà existant : 409', async () => {
    const res = await agents.dev.post('/api/config/modules').send(modulePayload('TEST29'));
    expect(res.status).toBe(409);
  });

  it('autres rôles ne peuvent pas créer : 403', async () => {
    for (const [role, agent] of Object.entries(agents)) {
      if (role === 'dev') continue;
      const res = await agent.post('/api/config/modules').send(modulePayload('X29'));
      expect(res.status).toBe(403);
    }
  });
});

describe('ETAPE 29 — suppression de rapport (DELETE /api/config/modules/:id)', () => {
  let delId;
  let keepId;

  beforeAll(async () => {
    // Module sans saisie, destiné à être supprimé avec le bon code.
    const rDel = await agents.dev.post('/api/config/modules').send(modulePayload('TESTDEL'));
    expect(rDel.status).toBe(201);
    const mDel = await Module.findOne({ code: 'TESTDEL' });
    delId = String(mDel._id);
    createdModuleIds.push(delId);

    // Module sans saisie, conservé pour tester les refus (mauvais code, rôles, 404).
    const rKeep = await agents.dev.post('/api/config/modules').send(modulePayload('TESTKEEP'));
    expect(rKeep.status).toBe(201);
    const mKeep = await Module.findOne({ code: 'TESTKEEP' });
    keepId = String(mKeep._id);
    createdModuleIds.push(keepId);

    // Module avec une saisie : doit renvoyer 409 à la suppression.
    const rS = await agents.dev.post('/api/config/modules').send(modulePayload('TESTSAISIE'));
    expect(rS.status).toBe(201);
    const mS = await Module.findOne({ code: 'TESTSAISIE' });
    const devUser = await Utilisateur.findOne({ im: '123009' });
    const structure = await Structure.findOne({ type: 'SRB' });
    const saisie = await Saisie.create({
      structureId: structure._id,
      moduleId: mS._id,
      moduleVersion: 1,
      authorId: devUser._id,
      status: 'brouillon',
      values: {},
    });
    expect(saisie).not.toBeNull();
    createdModuleIds.push(String(mS._id));
  });

  it('DELETE bon code, aucune saisie → 200 et le module n\'existe plus', async () => {
    const res = await agents.dev.delete(`/api/config/modules/${delId}`).send({ confirmCode: 'TESTDEL' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(delId);
    expect(res.body.code).toBe('TESTDEL');
    expect(await Module.findById(delId)).toBeNull();
    // ligne d'audit de suppression
    const audit = await JournalAudit.findOne({ action: 'module_delete', object: `module:${delId}` });
    expect(audit).not.toBeNull();
  });

  it('DELETE mauvais code → 400', async () => {
    const res = await agents.dev.delete(`/api/config/modules/${keepId}`).send({ confirmCode: 'FAUXCODE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Le code saisi ne correspond pas.');
    expect(await Module.findById(keepId)).not.toBeNull();
  });

  it('DELETE confirmCode absent → 400', async () => {
    const res = await agents.dev.delete(`/api/config/modules/${keepId}`).send({});
    expect(res.status).toBe(400);
    expect(await Module.findById(keepId)).not.toBeNull();
  });

  it('DELETE rapport de départ (NCA) → 403', async () => {
    const nca = await Module.findOne({ code: 'NCA' });
    expect(nca).not.toBeNull();
    const res = await agents.dev.delete(`/api/config/modules/${String(nca._id)}`).send({ confirmCode: 'NCA' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Ce rapport fait partie des rapports de départ : désactivez-le plutôt.');
  });

  it('DELETE rapport avec une saisie → 409', async () => {
    const res = await agents.dev.delete(`/api/config/modules/${String((await Module.findOne({ code: 'TESTSAISIE' }))._id)}`).send({ confirmCode: 'TESTSAISIE' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Ce rapport contient des saisies : désactivez-le plutôt.');
  });

  it('DELETE autre rôle → 403', async () => {
    for (const [role, agent] of Object.entries(agents)) {
      if (role === 'dev') continue;
      const res = await agent.delete(`/api/config/modules/${keepId}`).send({ confirmCode: 'TESTKEEP' });
      expect(res.status).toBe(403);
    }
  });

  it('DELETE id inconnu → 404', async () => {
    const res = await agents.dev.delete('/api/config/modules/000000000000000000000000').send({ confirmCode: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Ressource introuvable.');
  });

  it('après suppression, la liste des modules ne contient plus le rapport supprimé', async () => {
    const list = await agents.dev.get('/api/modules');
    expect(list.status).toBe(200);
    expect(list.body.find((m) => m.code === 'TESTDEL')).toBeUndefined();
    // le module conservé et les rapports de départ sont toujours présents
    expect(list.body.find((m) => m.code === 'TESTKEEP')).not.toBeUndefined();
    expect(list.body.find((m) => m.code === 'NCA')).not.toBeUndefined();
    // le rapport de départ est bien marqué builtin
    expect(list.body.find((m) => m.code === 'NCA').builtin).toBe(true);
    expect(list.body.find((m) => m.code === 'TESTKEEP').builtin).toBe(false);
  });
});

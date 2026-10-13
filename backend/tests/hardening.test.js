"use strict";

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

const { default: app } = await import('../src/server.js');

import Saisie from '../src/models/Saisie.js';

const PASSWORD = 'Test@2026';

const agents = {};

async function login(im, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password });
  if (res.status !== 200) {
    throw new Error(`login ${im} → ${res.status} : ${JSON.stringify(res.body)}`);
  }
  return agent;
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  agents.client1 = await login('104562');
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Durcissement backend — parseEnv', () => {
  it('parseEnv: TRUST_PROXY false/0/absent -> false; true/1 -> true; valeur invalide -> throws', async () => {
    const { parseEnv } = await import('../src/config.js');
    const base = { JWT_SECRET: 'a'.repeat(40), MONGODB_URI: 'mongodb://127.0.0.1:27017/x' };

    const r1 = parseEnv({ ...base, TRUST_PROXY: 'false' });
    expect(r1.TRUST_PROXY).toBe(false);

    const r2 = parseEnv({ ...base, TRUST_PROXY: '0' });
    expect(r2.TRUST_PROXY).toBe(false);

    const r3 = parseEnv({ ...base });
    expect(r3.TRUST_PROXY).toBe(false);

    const r4 = parseEnv({ ...base, TRUST_PROXY: 'true' });
    expect(r4.TRUST_PROXY).toBe(true);

    const r5 = parseEnv({ ...base, TRUST_PROXY: '1' });
    expect(r5.TRUST_PROXY).toBe(true);

    expect(() => parseEnv({ ...base, TRUST_PROXY: 'oui' })).toThrow();
  });

  it('parseEnv: JWT_SECRET plus court que 32 caractères -> throw avec message contenant JWT_SECRET', async () => {
    const { parseEnv } = await import('../src/config.js');
    expect(() => parseEnv({ JWT_SECRET: 'court', MONGODB_URI: 'mongodb://127.0.0.1:27017/x' })).toThrow(/JWT_SECRET/);
  });
});

describe('Durcissement backend — body limit & JSON errors', () => {
  let saisieId;

  beforeAll(async () => {
    const rows = await Saisie.find({ structureId: agents.client1._id || '000000000000000000000000', status: 'brouillon' });
    if (rows.length > 0) {
      saisieId = String(rows[0]._id);
    }
  });

  it('un corps JSON de 150 KB n\'est PAS rejeté avec 413', async () => {
    if (!saisieId) return; // skip if no draft

    const bigNotes = 'x'.repeat(150000);
    const res = await agents.client1
      .put(`/api/saisies/${saisieId}`)
      .send({ values: { notes: bigNotes } });
    expect(res.status).not.toBe(413);
  });

  it('un corps de 3 MB renvoie 413 avec code PAYLOAD_TOO_LARGE', async () => {
    if (!saisieId) return;

    const hugeNotes = 'x'.repeat(3 * 1024 * 1024);
    const res = await agents.client1
      .put(`/api/saisies/${saisieId}`)
      .send({ values: { notes: hugeNotes } });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toMatch(/request entity/i);
  });

  it('JSON malformé renvoie 400 INVALID_JSON sans fuite du parser', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"im": ');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toMatch(/Unexpected|JSON/i);
  });
});

describe('Durcissement backend — token forgé & role enum', () => {
  it('token forgé avec un id malformé renvoie 401, pas de blocage', async () => {
    const { getConfig } = await import('../src/config.js');
    const config = getConfig();
    const token = jwt.sign({ id: 'not-an-object-id' }, config.JWT_SECRET);
    const res = await request(app)
      .get('/api/modules')
      .set('Cookie', [`token=${token}`]);
    expect(res.status).toBe(401);
  }, { timeout: 5000 });

  it('Utilisateur.role rejette les rôles inconnus', async () => {
    const Utilisateur = (await import('../src/models/Utilisateur.js')).default;
    const user = new Utilisateur({
      im: 'X1',
      nom: 'a',
      prenom: 'b',
      direction: 'd',
      service: 's',
      passwordHash: 'h',
      role: 'superadmin',
      structureId: new mongoose.Types.ObjectId(),
    });
    await expect(user.validate()).rejects.toThrow(/role/);
  });
});
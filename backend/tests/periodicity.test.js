"use strict";

// Periodicité — Tests pour le champ allowedPeriodicities et la logique associée.
// Exécutée par `npm test` (seed de la base dédiée sigbd_test inclus dans le script).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

// Garde-fous AVANT l'import de l'app : NODE_ENV et base de test forcés.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

const { default: app } = await import('../src/server.js');

import Structure from '../src/models/Structure.js';
import Module from '../src/models/Module.js';
import Periode from '../src/models/Periode.js';
import Saisie from '../src/models/Saisie.js';
import { acceptedPeriodicities } from '../src/utils/periodicity.js';

const PASSWORD = 'Test@2026';

const agents = {};
let structs = [];
let modulesByCode = {};
let periodesByLabel = {};

async function login(im, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password });
  if (res.status !== 200) {
    throw new Error(`login ${im} → ${res.status} : ${JSON.stringify(res.body)}`);
  }
  return agent;
}

function structId(type, regionName) {
  const s = structs.find(
    (x) => x.type === type && x.regionId && x.regionId.name === regionName
  );
  if (!s) throw new Error(`structure ${type}/${regionName} introuvable dans le seed`);
  return String(s._id);
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  structs = await Structure.find({}).populate('regionId');
  const mods = await Module.find({});
  modulesByCode = Object.fromEntries(mods.map((m) => [m.code, m]));
  const pers = await Periode.find({});
  periodesByLabel = Object.fromEntries(pers.map((p) => [p.label, p]));

  agents.client1 = await login('104562'); // client SRB – Analamanga
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('P1 acceptedPeriodicities : cadence principale puis cadences supplementaires, sans doublon', () => {
  it('retourne la cadence principale en premier, puis les supplementaires sans doublon (trois cas)', () => {
    expect(acceptedPeriodicities({ periodicity: 'monthly', allowedPeriodicities: ['quarterly', 'monthly'] })).toEqual(['monthly', 'quarterly']);
    expect(acceptedPeriodicities({ periodicity: 'quarterly' })).toEqual(['quarterly']);
    expect(acceptedPeriodicities({ periodicity: 'monthly', allowedPeriodicities: undefined })).toEqual(['monthly']);
  });
});

describe('P2 GET /api/modules expose allowedPeriodicities', () => {
  it('RA doit contenir monthly et quarterly ; RH doit avoir uniquement quarterly', async () => {
    const res = await agents.client1.get('/api/modules');
    expect(res.status).toBe(200);
    const ra = res.body.find((m) => m.code === 'RA');
    const rh = res.body.find((m) => m.code === 'RH');
    expect(ra).toBeDefined();
    expect(ra.allowedPeriodicities).toEqual(['monthly', 'quarterly']);
    expect(rh).toBeDefined();
    expect(rh.allowedPeriodicities).toEqual(['quarterly']);
  });
});

describe('P3 un client peut creer un Rapport d\'activites sur une periode trimestrielle', () => {
  let createdSaisieId = null;

  it('POST /api/saisies avec RA et la periode T3 2026 → 201', async () => {
    const t3 = periodesByLabel['T3 2026'];
    if (!t3) throw new Error('Période T3 2026 introuvable dans le seed');

    const res = await agents.client1.post('/api/saisies').send({
      moduleId: String(modulesByCode.RA._id),
      periodeId: String(t3._id),
    });

    if (res.status === 409 && res.body.existingId) {
      await Saisie.deleteOne({ _id: res.body.existingId });
      const res2 = await agents.client1.post('/api/saisies').send({
        moduleId: String(modulesByCode.RA._id),
        periodeId: String(t3._id),
      });
      expect(res2.status).toBe(201);
      createdSaisieId = res2.body.id;
    } else {
      expect(res.status).toBe(201);
      createdSaisieId = res.body.id;
    }
  });

  afterAll(async () => {
    if (createdSaisieId) {
      await Saisie.deleteOne({ _id: createdSaisieId });
    }
  });
});

describe('P4 un client ne peut pas creer une saisie RH sur une periode mensuelle', () => {
  it('POST RH avec Septembre 2026 → 400 et message attendu', async () => {
    const sept = periodesByLabel['Septembre 2026'];
    if (!sept) throw new Error('Période Septembre 2026 introuvable dans le seed');

    const res = await agents.client1.post('/api/saisies').send({
      moduleId: String(modulesByCode.RH._id),
      periodeId: String(sept._id),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('La période ne correspond pas à la périodicité du module.');
  });
});
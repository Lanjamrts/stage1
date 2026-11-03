"use strict";

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

const { default: app } = await import('../src/server.js');
import JournalAudit from '../src/models/JournalAudit.js';
import Utilisateur from '../src/models/Utilisateur.js';
import Structure from '../src/models/Structure.js';

const PASSWORD = 'Test@2026';
const agents = {};

async function login(im) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${im} → ${res.status}`);
  return agent;
}

const NOW = new Date();
const OLD = new Date(Date.now() - 200000 * 60000); // il y a ~139 jours

const TEST_PREFIX = 'TEST_P33:';
const Q = 'TEST_P33'; // toutes les lignes de test l contiennent dans leur objet

let testStructureId;
let id1, id2, id3;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  agents.admin1 = await login('120344');
  agents.dev = await login('123009');

  await JournalAudit.deleteMany({ object: new RegExp(`^${TEST_PREFIX}`) });
  await Utilisateur.deleteMany({ im: /^TEST_P33/ });

  const structure = await Structure.findOne().select('_id');
  testStructureId = structure._id;
  await Utilisateur.insertMany([
    { im: 'TEST_P33_U1', nom: 'Andriam', prenom: 'Marie', role: 'admin1', structureId: testStructureId, direction: 'D', service: 'S', passwordHash: 'x' },
    { im: 'TEST_P33_U2', nom: 'Rakoto', prenom: 'Jean', role: 'admin1', structureId: testStructureId, direction: 'D', service: 'S', passwordHash: 'x' },
    { im: 'TEST_P33_U3', nom: 'Rabe', prenom: 'Solo', role: 'client', structureId: testStructureId, direction: 'D', service: 'S', passwordHash: 'x' },
  ]);
  const u1 = await Utilisateur.findOne({ im: 'TEST_P33_U1' });
  const u2 = await Utilisateur.findOne({ im: 'TEST_P33_U2' });
  const u3 = await Utilisateur.findOne({ im: 'TEST_P33_U3' });
  id1 = String(u1._id);
  id2 = String(u2._id);
  id3 = String(u3._id);

  const rows = [];
  // 60 lignes paginables (20 login_failure, 20 saisie_reject, 20 logout)
  for (let i = 0; i < 60; i++) {
    rows.push({
      userId: i % 2 === 0 ? id1 : 'TEST_P33_IM',
      action: i % 3 === 0 ? 'login_failure' : i % 3 === 1 ? 'saisie_reject' : 'logout',
      object: `${TEST_PREFIX}objet${i}`,
      ip: '127.0.0.1',
      createdAt: i % 5 === 0 ? OLD : NOW,
    });
  }
  rows.push({ userId: id3, action: 'user_create', object: `${TEST_PREFIX}cible`, ip: '::1', createdAt: NOW });
  rows.push({ userId: id1, action: 'login_lockout', object: `${TEST_PREFIX}verrou`, ip: '::ffff:10.0.0.1', createdAt: NOW });
  rows.push({ userId: id2, action: 'saisie_export', object: `${TEST_PREFIX}export`, ip: '::ffff:10.0.0.2', createdAt: OLD });
  await JournalAudit.insertMany(rows);
});

afterAll(async () => {
  await JournalAudit.deleteMany({ object: new RegExp(`^${TEST_PREFIX}`) });
  await Utilisateur.deleteMany({ im: /^TEST_P33/ });
  await mongoose.disconnect();
});

function totalOf(res) {
  return parseInt(res.headers['x-total-count'] || res.headers['X-Total-Count'], 10);
}

describe('P33 — journal d\'audit : pagination', () => {
  it('page 1 / limit 25 renvoie 25 lignes et X-Total-Count = 63', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&page=1&limit=25`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(25);
    expect(totalOf(res)).toBe(63);
    expect(res.headers['access-control-expose-headers']).toContain('X-Total-Count');
  });

  it('page 3 / limit 25 renvoie les 13 lignes restantes', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&page=3&limit=25`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(13);
    expect(totalOf(res)).toBe(63);
  });

  it('défaut page=1 limit=50', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(50);
    expect(totalOf(res)).toBe(63);
  });

  it('limit maximal 100 accepté', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(63);
  });

  it('limit > 100 → 400', async () => {
    const res = await agents.admin1.get('/api/audit?limit=101');
    expect(res.status).toBe(400);
  });

  it('page < 1 → 400', async () => {
    expect((await agents.admin1.get('/api/audit?page=0')).status).toBe(400);
    expect((await agents.admin1.get('/api/audit?page=-1')).status).toBe(400);
  });

  it('page/limit non entiers → 400', async () => {
    expect((await agents.admin1.get('/api/audit?page=abc')).status).toBe(400);
    expect((await agents.admin1.get('/api/audit?limit=abc')).status).toBe(400);
    expect((await agents.admin1.get('/api/audit?limit=1.5')).status).toBe(400);
  });

  it('page au-delà → tableau vide, total conservé', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&page=100&limit=25`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
    expect(totalOf(res)).toBe(63);
  });

  it('tri stable createdAt décroissant puis _id décroissant', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&limit=5`);
    expect(res.status).toBe(200);
    const dates = res.body.map((r) => new Date(r.date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1] >= dates[i]).toBe(true);
    }
  });
});

describe('P33 — journal d\'audit : recherche q', () => {
  it('q par nom d\'utilisateur (nom/prénom/IM) filtre les lignes', async () => {
    const res = await agents.admin1.get('/api/audit?q=Andriam');
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBeGreaterThanOrEqual(31); // 30 paires + login_lockout de Marie Andriam
    expect(res.body.filter((r) => r.userId === id1).length).toBe(31);
  });

  it('q par objet', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${TEST_PREFIX}cible`);
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBeGreaterThanOrEqual(1);
    expect(res.body.some((r) => r.object === `${TEST_PREFIX}cible`)).toBe(true);
  });

  it('q insensible à la casse', async () => {
    const a = await agents.admin1.get(`/api/audit?q=${TEST_PREFIX.toUpperCase()}OBJET0`);
    const b = await agents.admin1.get(`/api/audit?q=${TEST_PREFIX}objet0`);
    expect(totalOf(a)).toBe(totalOf(b));
    expect(totalOf(a)).toBe(1);
  });

  it('q avec caractères spéciaux (.* et () sans erreur ni injection', async () => {
    const res1 = await agents.admin1.get('/api/audit?q=%2E%2A');
    expect(res1.status).toBe(200);
    expect(totalOf(res1)).toBe(0);
    const res2 = await agents.admin1.get('/api/audit?q=%28%20');
    expect(res2.status).toBe(200);
    expect(totalOf(res2)).toBe(0);
  });

  it('q trop long (>64) → 400', async () => {
    const res = await agents.admin1.get('/api/audit?q=' + 'a'.repeat(65));
    expect(res.status).toBe(400);
  });
});

describe('P33 — journal d\'audit : filtres action / userId', () => {
  it('action multi-valeurs ($in) : login_failure + saisie_reject', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&action=login_failure,saisie_reject`);
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(40); // 20 login_failure + 20 saisie_reject
    expect(res.body.every((r) => ['login_failure', 'saisie_reject'].includes(r.action))).toBe(true);
  });

  it('action unique', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&action=logout`);
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(20);
  });

  it('plus de 10 valeurs action → 400', async () => {
    const res = await agents.admin1.get('/api/audit?action=' + 'a,'.repeat(10) + 'a');
    expect(res.status).toBe(400);
  });

  it('userId exact (IM brut)', async () => {
    const res = await agents.admin1.get('/api/audit?userId=TEST_P33_IM');
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(30);
    expect(res.body.every((r) => r.userId === 'TEST_P33_IM')).toBe(true);
  });

  it('userId exact (ObjectId texte)', async () => {
    const res = await agents.admin1.get(`/api/audit?userId=${id1}`);
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(31);
    expect(res.body.every((r) => r.userId === id1)).toBe(true);
  });

  it('userId introuvable → 0 ligne', async () => {
    const res = await agents.admin1.get('/api/audit?userId=000000000000000000000000');
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(0);
  });
});

describe('P33 — journal d\'audit : sinceMinutes', () => {
  it('sinceMinutes=60 inclut les lignes récentes et exclut les anciennes', async () => {
    const res = await agents.admin1.get(`/api/audit?q=${Q}&sinceMinutes=60`);
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(50); // 48 récentes parmi les 60 + cible + verrou
    expect(res.body.some((r) => r.object === `${TEST_PREFIX}export`)).toBe(false);
  });

  it('sinceMinutes invalide → 400', async () => {
    expect((await agents.admin1.get('/api/audit?sinceMinutes=0')).status).toBe(400);
    expect((await agents.admin1.get('/api/audit?sinceMinutes=43201')).status).toBe(400);
  });
});

describe('P33 — journal d\'audit : intersections et combinaisons', () => {
  it('q + role = intersection des listes d\'utilisateurs', async () => {
    // q='Andriam' ne matche que id1 ; rôle admin1 = id1 + id2 (+ utilisateurs existants)
    // => intersection = id1 seulement
    const res = await agents.admin1.get('/api/audit?role=admin1&q=Andriam');
    expect(res.status).toBe(200);
    expect(totalOf(res)).toBe(31);
    expect(res.body.every((r) => r.userId === id1)).toBe(true);
  });

  it('combinaison avec dates (from/to)', async () => {
    const today = NOW.toISOString().slice(0, 10);
    const res = await agents.admin1.get(`/api/audit?q=${Q}&from=${today}&to=${today}&action=logout`);
    expect(res.status).toBe(200);
    expect(res.body.every((r) => r.action === 'logout')).toBe(true);
    expect(totalOf(res)).toBe(16); // logout du jour parmi les 60 (4 sont en OLD)
  });

  it('from > to → 400', async () => {
    const res = await agents.admin1.get('/api/audit?from=2026-11-03&to=2026-11-01');
    expect(res.status).toBe(400);
  });

  it('date invalide → 400', async () => {
    const res = await agents.admin1.get('/api/audit?from=not-a-date');
    expect(res.status).toBe(400);
  });
});

describe('P33 — journal d\'audit : lecture seule (pas de route d\'écriture)', () => {
  it('DELETE /api/audit/:id → 404', async () => {
    const res = await agents.admin1.delete('/api/audit/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('PATCH /api/audit/:id → 404', async () => {
    const res = await agents.admin1.patch('/api/audit/000000000000000000000000').send({ action: 'pirate' });
    expect(res.status).toBe(404);
  });

  it('POST /api/audit → 404', async () => {
    const res = await agents.admin1.post('/api/audit').send({ action: 'login_success' });
    expect(res.status).toBe(404);
  });

  it('développeur lit le journal (200)', async () => {
    const res = await agents.dev.get('/api/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

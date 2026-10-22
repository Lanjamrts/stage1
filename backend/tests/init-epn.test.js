"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import bcrypt from 'bcrypt';

import Referentiel from '../src/models/Referentiel.js';
import Utilisateur from '../src/models/Utilisateur.js';
import Structure from '../src/models/Structure.js';

// FORCE l'environnement de test AVANT d'importer l'app (supertest / requireAuth).
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_epncheck';
process.env.JWT_SECRET = 'a'.repeat(40);

import request from 'supertest';
import app from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URI = 'mongodb://127.0.0.1:27017/sigbd_epncheck';
const REAL_DATA_DIR = path.resolve(ROOT, 'data', 'init');

function run(script, extraArgs = [], extraEnv = {}) {
  const result = spawnSync('node', [script, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: URI,
      JWT_SECRET: 'a'.repeat(40),
      ...extraEnv,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sigbd-init-epn-'));
}

function writeFixtures(dir, ministeresCsv, epnCsv) {
  fs.writeFileSync(path.join(dir, 'ministeres.csv'), ministeresCsv, 'utf8');
  fs.writeFileSync(path.join(dir, 'epn.csv'), epnCsv, 'utf8');
}

const MINISTERES_CSV = `ministere;valide;note
Ministere A;non;
Ministere B;non;
`;

const EPN_CSV = `ministere;ministere_liste_2019;nom;acronyme;regime;texte_creation;rattachement;valide;note
Ministere A;;EPN un;EPN1;EPIC;Decreet;identique;non;
Ministere B;;EPN deux;EPN2;EPA;Decreet;identique;non;
`;

beforeAll(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('init-epn script', { timeout: 120000 }, () => {
  let tempDir;

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    tempDir = makeTempDir();
    writeFixtures(tempDir, MINISTERES_CSV, EPN_CSV);
  });

  it("E1 le dry-run n'ecrit rien", async () => {
    const r = run('src/scripts/init-epn.js', [], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY-RUN');
    expect(r.stdout).toContain('Ministeres : 2 lignes lues');
    expect(r.stdout).toContain('EPN : 2 lignes lues');
    const epns = await Referentiel.countDocuments({ type: 'epn' });
    const ministeres = await Referentiel.countDocuments({ type: 'ministeres' });
    expect(epns).toBe(0);
    expect(ministeres).toBe(0);
  });

  it('E2 --apply cree les ministeres et les EPN', async () => {
    const r = run('src/scripts/init-epn.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Ministeres : 2 cree(s), 0 deja present(s)');
    expect(r.stdout).toContain('EPN : 2 cree(s), 0 deja present(s)');
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(2);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(2);
    const epn = await Referentiel.findOne({ type: 'epn', value: 'EPN un' }).lean();
    expect(epn.ministere).toBe('Ministere A');
    expect(epn.regime).toBe('EPIC');
    expect(epn.acronyme).toBe('EPN1');
  });

  it('E3 --apply est idempotent (pas de doublon au 2e passage)', async () => {
    await run('src/scripts/init-epn.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    const r = run('src/scripts/init-epn.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Ministeres : 0 cree(s), 2 deja present(s)');
    expect(r.stdout).toContain('EPN : 0 cree(s), 2 deja present(s)');
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(2);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(2);
  });

  it("E4 --apply avec les vrais fichiers importe 32 ministeres et 223 EPN", async () => {
    const r = run('src/scripts/init-epn.js', ['--apply']);
    expect(r.status).toBe(0);
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(32);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(223);
  });

  it('E5 ministere inconnu = erreur et rien n est ecrit', async () => {
    const epnCsv = `ministere;ministere_liste_2019;nom;acronyme;regime;texte_creation;rattachement;valide;note
Ministere Inconnu;;EPN X;EPNX;EPIC;Decreet;identique;non;
`;
    writeFixtures(tempDir, MINISTERES_CSV, epnCsv);
    const r = run('src/scripts/init-epn.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(1);
    expect((r.stderr + r.stdout).toLowerCase()).toMatch(/absent de ministeres\.csv/);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(0);
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(0);
  });

  it('E6 nom en double = erreur', async () => {
    const epnCsv = `ministere;ministere_liste_2019;nom;acronyme;regime;texte_creation;rattachement;valide;note
Ministere A;;EPN Dup;EPN1;EPIC;Decreet;identique;non;
Ministere A;;EPN Dup;EPN2;EPA;Decreet;identique;non;
`;
    writeFixtures(tempDir, MINISTERES_CSV, epnCsv);
    const r = run('src/scripts/init-epn.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(1);
    expect((r.stderr + r.stdout).toLowerCase()).toMatch(/duplique/);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(0);
  });

  it('E7 options --epn= et --ministeres= sur chemins par defect', async () => {
    const r = run('src/scripts/init-epn.js', ['--apply', `--epn=${path.join(REAL_DATA_DIR, 'epn.csv')}`, `--ministeres=${path.join(REAL_DATA_DIR, 'ministeres.csv')}`]);
    expect(r.status).toBe(0);
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(32);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(223);
  });
});

describe('GET /api/referentiels', { timeout: 120000 }, () => {
  let agent;

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    // Import des vrais fichiers dans la base de test de ce fichier.
    const r = run('src/scripts/init-epn.js', ['--apply']);
    expect(r.status).toBe(0);
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(32);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(223);

    const structure = await Structure.create({ code: 'DIR-EPN', label: 'Direction test', type: 'DGBF', active: true });
    const passwordHash = await bcrypt.hash('Test@2026', 10);
    await Utilisateur.create({
      im: 'EPN-1',
      nom: 'Test',
      prenom: 'Epn',
      direction: 'DIR',
      service: 'SRV',
      role: 'developpeur',
      structureId: structure._id,
      status: 'actif',
      passwordHash,
    });

    agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ im: 'EPN-1', password: 'Test@2026' });
    expect(login.status).toBe(200);
  });

  it('G1 GET /api/referentiels/epn renvoie ministere/regime/acronyme en plus de value', async () => {
    const res = await agent.get('/api/referentiels/epn');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('epn');
    expect(Array.isArray(res.body.values)).toBe(true);
    expect(res.body.values.length).toBeGreaterThan(0);
    // Les clients qui lisent value trouvent toujours des chaînes.
    expect(typeof res.body.values[0]).toBe('string');
    expect(Array.isArray(res.body.items)).toBe(true);
    const edbm = res.body.items.find((i) => i.value === 'Economic Development Board of Madagascar');
    expect(edbm).not.toBeNull();
    expect(edbm.ministere).toBe('Présidence de la République');
    expect(edbm.regime).toBe('EPIC');
    expect(edbm.acronyme).toBe('EDBM');
  });

  it('G2 GET /api/referentiels/ministeres renvoie 32 elements apres import', async () => {
    const res = await agent.get('/api/referentiels/ministeres');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('ministeres');
    expect(Array.isArray(res.body.values)).toBe(true);
    expect(res.body.values).toHaveLength(32);
    expect(res.body.values).toContain('Présidence de la République');
    expect(res.body.values).toContain('Ministère délégué chargé de la Gendarmerie nationale');
  });
});

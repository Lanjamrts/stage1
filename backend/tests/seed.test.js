"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import JournalAudit from '../src/models/JournalAudit.js';
import Utilisateur from '../src/models/Utilisateur.js';
import Module from '../src/models/Module.js';
import Profil from '../src/models/Profil.js';
import Referentiel from '../src/models/Referentiel.js';
import Saisie from '../src/models/Saisie.js';

const URI = 'mongodb://127.0.0.1:27017/sigbd_seedcheck';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function run(script, extraArgs = [], extraEnv = {}) {
  const result = spawnSync('node', [script, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
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

beforeAll(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Seed split (reference vs demo)', { timeout: 120000 }, () => {
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('S1 seed:ref est idempotent', async () => {
    const r1 = run('src/seed/reference.js');
    expect(r1.status).toBe(0);
    const r2 = run('src/seed/reference.js');
    expect(r2.status).toBe(0);
    const profils = await Profil.countDocuments();
    const modules = await Module.countDocuments();
    const ministeres = await Referentiel.countDocuments({ type: 'ministeres' });
    const epns = await Referentiel.countDocuments({ type: 'epn' });
    expect(profils).toBe(5);
    expect(modules).toBe(13);
    expect(ministeres).toBe(32);
    expect(epns).toBe(223);
    expect(r1.stdout).toContain('Ministères : 32 créés, 0 déjà présents');
    expect(r1.stdout).toContain('EPN : 223 créés, 0 déjà présents');
    expect(r2.stdout).toContain('Ministères : 0 créés, 32 déjà présents');
    expect(r2.stdout).toContain('EPN : 0 créés, 223 déjà présents');
  });

  it('S10 seed:ref : tous les EPN ont un ministere non vide', async () => {
    await run('src/seed/reference.js');
    const sansMinistere = await Referentiel.countDocuments({
      type: 'epn',
      $or: [{ ministere: { $in: [null, undefined] } }, { ministere: '' }],
    });
    expect(sansMinistere).toBe(0);
  });

  it('S11 seed:ref relance ne crée aucun doublon', async () => {
    await run('src/seed/reference.js');
    await run('src/seed/reference.js');
    await run('src/seed/reference.js');
    expect(await Referentiel.countDocuments({ type: 'ministeres' })).toBe(32);
    expect(await Referentiel.countDocuments({ type: 'epn' })).toBe(223);
  });

  it('S12 seed:demo : aucune saisie ne référence un EPN absent du référentiel', async () => {
    await run('src/seed/demo.js', ['--yes']);
    const ncaModule = await Module.findOne({ code: 'NCA' });
    const tseModule = await Module.findOne({ code: 'TSE' });
    expect(ncaModule).not.toBeNull();
    expect(tseModule).not.toBeNull();
    const saisies = await Saisie.find({
      moduleId: { $in: [ncaModule._id, tseModule._id] },
    }).lean();
    const epnReferentiel = await Referentiel.find({ type: 'epn' }).lean();
    const epnValues = new Set(epnReferentiel.map((e) => e.value));
    for (const s of saisies) {
      const epn = s.values && s.values.epn;
      if (epn) {
        expect(epnValues.has(epn)).toBe(true);
      }
    }
  });

  it("S2 seed:ref n'ecrase pas un gabarit modifie", async () => {
    await run('src/seed/reference.js');
    await Module.updateOne({ code: 'RA' }, { $set: { label: 'RA MODIFIE', version: 2 } });
    await run('src/seed/reference.js');
    const mod = await Module.findOne({ code: 'RA' });
    expect(mod.label).toBe('RA MODIFIE');
    expect(mod.version).toBe(2);
  });

  it('S3 seed:ref ne supprime rien', async () => {
    await run('src/seed/reference.js');
    await JournalAudit.create({ userId: 'test', action: 'TEST', object: 'test', ip: '127.0.0.1' });
    const structId = new mongoose.Types.ObjectId();
    await Utilisateur.create({
      im: 'ZZ-1',
      nom: 'Test',
      prenom: 'User',
      direction: 'DIR',
      service: 'SRV',
      passwordHash: 'h',
      role: 'client',
      structureId: structId,
    });
    await run('src/seed/reference.js');
    const audit = await JournalAudit.countDocuments();
    const users = await Utilisateur.countDocuments();
    expect(audit).toBe(1);
    expect(users).toBe(1);
  });

  it('S4 seed:demo conserve le journal d\'audit par defaut', async () => {
    await run('src/seed/demo.js', ['--yes']);
    await JournalAudit.create({ userId: 'test', action: 'TEST_SEED_KEEP', object: 'test', ip: '127.0.0.1' });
    await run('src/seed/demo.js', ['--yes']);
    const audit = await JournalAudit.findOne({ action: 'TEST_SEED_KEEP' });
    expect(audit).not.toBeNull();
    const users = await Utilisateur.countDocuments();
    expect(users).toBe(10);
  });

  it('S5 seed:demo --purge-audit supprime le journal', async () => {
    await run('src/seed/demo.js', ['--yes', '--purge-audit']);
    const audit = await JournalAudit.countDocuments();
    expect(audit).toBe(0);
  });

  it('S6 seed:demo sans --yes en terminal non interactif ne modifie rien', async () => {
    const before = await Utilisateur.countDocuments();
    const r = run('src/seed/demo.js', [], { NODE_ENV: 'development' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--yes');
    const after = await Utilisateur.countDocuments();
    expect(after).toBe(before);
  });

  it('S7 seed:demo est refuse en production', async () => {
    const r = run('src/seed/demo.js', ['--yes'], { NODE_ENV: 'production', SEED_DEMO_PASSWORD: 'Aa1-aaaaaaaa' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('SEED_ALLOW_PRODUCTION');
  });

  it('S8 seed:ref est autorise en production', async () => {
    const r = run('src/seed/reference.js', [], { NODE_ENV: 'production' });
    expect(r.status).toBe(0);
  });

  it('S9 seed:demo sans --yes est refuse meme avec NODE_ENV=test', async () => {
    const before = await Utilisateur.countDocuments();
    const r = run('src/seed/demo.js', []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--yes');
    const after = await Utilisateur.countDocuments();
    expect(after).toBe(before);
  });
});
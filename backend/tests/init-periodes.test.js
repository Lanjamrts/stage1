"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Periode from '../src/models/Periode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URI = 'mongodb://127.0.0.1:27017/sigbd_periodcheck';

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

function defaultArgs() {
  return ['--annee', '2090', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15'];
}

beforeAll(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('init-periodes script', { timeout: 120000 }, () => {
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it("P1 le dry-run n'ecrit rien et annonce 16 periodes", async () => {
    const r = run('src/scripts/init-periodes.js', defaultArgs());
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Periodes : 16 a creer, 0 deja presente(s)');
    expect(r.stdout).toContain('DRY-RUN');
    const count = await Periode.countDocuments();
    expect(count).toBe(0);
  });

  it('P2 --apply cree les periodes avec les bonnes dates', async () => {
    const r = run('src/scripts/init-periodes.js', [...defaultArgs(), '--apply']);
    expect(r.status).toBe(0);
    const count = await Periode.countDocuments();
    expect(count).toBe(16);

    const sept = await Periode.findOne({ label: 'Septembre 2090' });
    expect(sept).not.toBeNull();
    expect(sept.periodicity).toBe('monthly');
    expect(formatDate(sept.start)).toBe('2090-09-01');
    expect(formatDate(sept.end)).toBe('2090-09-30');
    expect(formatDate(sept.deadline)).toBe('2090-10-05');

    const dec = await Periode.findOne({ label: 'Decembre 2090' });
    expect(dec).not.toBeNull();
    expect(dec.periodicity).toBe('monthly');
    expect(formatDate(dec.deadline)).toBe('2091-01-05');

    const t3 = await Periode.findOne({ label: 'T3 2090' });
    expect(t3).not.toBeNull();
    expect(t3.periodicity).toBe('quarterly');
    expect(formatDate(t3.start)).toBe('2090-07-01');
    expect(formatDate(t3.end)).toBe('2090-09-30');
    expect(formatDate(t3.deadline)).toBe('2090-10-15');

    const t4 = await Periode.findOne({ label: 'T4 2090' });
    expect(t4).not.toBeNull();
    expect(t4.periodicity).toBe('quarterly');
    expect(formatDate(t4.end)).toBe('2090-12-31');
    expect(formatDate(t4.deadline)).toBe('2091-01-15');
  });

  it('P3 annee bissextile : fevrier 2096 se termine le 29', async () => {
    const r = run('src/scripts/init-periodes.js', ['--annee', '2096', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15', '--apply']);
    expect(r.status).toBe(0);
    const fev = await Periode.findOne({ label: 'Fevrier 2096' });
    expect(fev).not.toBeNull();
    expect(formatDate(fev.end)).toBe('2096-02-29');
  });

  it('P4 --apply est idempotent', async () => {
    await run('src/scripts/init-periodes.js', [...defaultArgs(), '--apply']);
    const r = run('src/scripts/init-periodes.js', [...defaultArgs(), '--apply']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Periodes : 0 creee(s), 16 deja presente(s)');
    const count = await Periode.countDocuments();
    expect(count).toBe(16);
  });

  it("P5 les arguments obligatoires et les valeurs invalides sont refuses avant toute ecriture", async () => {
    const cases = [
      [],
      ['--annee', 'abc'],
      ['--annee', '2019'],
      ['--annee', '2101'],
      ['--annee', '2090', '--echeance-mensuelle-jour', '0'],
      ['--annee', '2090', '--echeance-mensuelle-jour', '29'],
      ['--annee', '2090', '--echeance-trimestrielle-jours', '0'],
      ['--annee', '2090', '--echeance-trimestrielle-jours', '91'],
      ['--annee', '2090', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15', '--premier-mois', '0'],
      ['--annee', '2090', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15', '--premier-mois', '13'],
      ['--annee', '2090', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15', '--xyz'],
    ];
    for (const args of cases) {
      const r = run('src/scripts/init-periodes.js', args);
      expect(r.status).toBe(1);
      expect(r.stderr.length + r.stdout.length).toBeGreaterThan(0);
      const count = await Periode.countDocuments();
      expect(count).toBe(0);
    }
  });

  it('P6 un conflit avec une periode existante ne modifie rien', async () => {
    await Periode.create({
      label: 'Septembre 2090',
      periodicity: 'monthly',
      start: new Date(Date.UTC(2090, 8, 1)),
      end: new Date(Date.UTC(2090, 8, 30)),
      deadline: new Date(Date.UTC(2090, 8, 20)),
    });

    const r = run('src/scripts/init-periodes.js', [...defaultArgs(), '--apply']);
    expect(r.status).toBe(1);
    const p = await Periode.findOne({ label: 'Septembre 2090' });
    expect(p).not.toBeNull();
    expect(formatDate(p.deadline)).toBe('2090-09-20');
    const count = await Periode.countDocuments();
    expect(count).toBe(1);
  });

  it('P7 les libelles sont en francais comme dans le seed', async () => {
    await run('src/scripts/init-periodes.js', [...defaultArgs(), '--apply']);
    const expectedLabels = [
      'Janvier 2090', 'Fevrier 2090', 'Mars 2090', 'Avril 2090', 'Mai 2090', 'Juin 2090',
      'Juillet 2090', 'Aout 2090', 'Septembre 2090', 'Octobre 2090', 'Novembre 2090', 'Decembre 2090',
      'T1 2090', 'T2 2090', 'T3 2090', 'T4 2090'
    ];
    for (const label of expectedLabels) {
      const p = await Periode.findOne({ label });
      expect(p).not.toBeNull();
    }
  });

  it("P8 l'index unique (periodicity, start) interdit les doublons", async () => {
    await Periode.init();
    await Periode.create({
      label: 'Test',
      periodicity: 'monthly',
      start: new Date(Date.UTC(2090, 0, 1)),
      end: new Date(Date.UTC(2090, 0, 31)),
      deadline: new Date(Date.UTC(2090, 1, 5)),
    });
    let error = null;
    try {
      await Periode.create({
        label: 'Test2',
        periodicity: 'monthly',
        start: new Date(Date.UTC(2090, 0, 1)),
        end: new Date(Date.UTC(2090, 0, 31)),
        deadline: new Date(Date.UTC(2090, 1, 5)),
      });
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.code).toBe(11000);
  });

  it('P9 les echeances deja depassees sont refusees sauf option explicite', async () => {
    // 1. Dry-run should show ATTENTION
    const r3 = run('src/scripts/init-periodes.js', ['--annee', '2020', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15']);
    expect(r3.status).toBe(0);
    expect(r3.stdout).toContain('ATTENTION');

    // 2. --apply without --autoriser-echeances-passees should fail
    const r1 = run('src/scripts/init-periodes.js', ['--annee', '2020', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15', '--apply']);
    expect(r1.status).toBe(1);
    expect(r1.stderr + r1.stdout).toMatch(/echeance deja depassee|Ecriture refusee/);
    const count1 = await Periode.countDocuments();
    expect(count1).toBe(0);

    // 3. --apply with --autoriser-echeances-passees should succeed
    const r2 = run('src/scripts/init-periodes.js', ['--annee', '2020', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15', '--apply', '--autoriser-echeances-passees']);
    expect(r2.status).toBe(0);
    const count2 = await Periode.countDocuments();
    expect(count2).toBe(16);
  });

  it('P10 --premier-mois limite les periodes generees', async () => {
    const r1 = run('src/scripts/init-periodes.js', [...defaultArgs(), '--premier-mois', '10']);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('Periodes : 4 a creer');
    expect(r1.stdout).toContain('Octobre 2090');
    expect(r1.stdout).toContain('Novembre 2090');
    expect(r1.stdout).toContain('Decembre 2090');
    expect(r1.stdout).toContain('T4 2090');

    const r2 = run('src/scripts/init-periodes.js', [...defaultArgs(), '--premier-mois', '8']);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('Periodes : 7 a creer');
    expect(r2.stdout).toContain('Aout 2090');
    expect(r2.stdout).toContain('Septembre 2090');
    expect(r2.stdout).toContain('Octobre 2090');
    expect(r2.stdout).toContain('Novembre 2090');
    expect(r2.stdout).toContain('Decembre 2090');
    expect(r2.stdout).toContain('T3 2090');
    expect(r2.stdout).toContain('T4 2090');
  });
});

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}
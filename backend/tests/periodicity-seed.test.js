"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Module from '../src/models/Module.js';

const URI = 'mongodb://127.0.0.1:27017/sigbd_periocheck';
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

describe('Seed periodicity backfill', { timeout: 120000 }, () => {
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('P5 seed:ref renseigne allowedPeriodicities du RA s\'il est absent', async () => {
    // Premier passage : crée les modules
    const r1 = run('src/seed/reference.js');
    expect(r1.status).toBe(0);

    // Supprimer allowedPeriodicities du RA
    await mongoose.connection.db.collection('modules').updateOne(
      { code: 'RA' },
      { $unset: { allowedPeriodicities: 1 } }
    );
    let mod = await Module.findOne({ code: 'RA' });
    expect(mod.allowedPeriodicities).toEqual([]);

    // Deuxième passage : doit le renseigner
    const r2 = run('src/seed/reference.js');
    expect(r2.status).toBe(0);

    mod = await Module.findOne({ code: 'RA' });
    expect(mod.allowedPeriodicities).toEqual(['monthly', 'quarterly']);
  });

  it('P6 seed:ref ne remplace pas un choix existant', async () => {
    // Premier passage : crée les modules
    const r1 = run('src/seed/reference.js');
    expect(r1.status).toBe(0);

    // Forcer allowedPeriodicities à ['monthly'] seulement
    await mongoose.connection.db.collection('modules').updateOne(
      { code: 'RA' },
      { $set: { allowedPeriodicities: ['monthly'] } }
    );
    let mod = await Module.findOne({ code: 'RA' });
    expect(mod.allowedPeriodicities).toEqual(['monthly']);

    // Deuxième passage : ne doit pas écraser
    const r2 = run('src/seed/reference.js');
    expect(r2.status).toBe(0);

    mod = await Module.findOne({ code: 'RA' });
    expect(mod.allowedPeriodicities).toEqual(['monthly']);
  });
});
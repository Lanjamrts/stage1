"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Module from '../src/models/Module.js';
import { MODULES } from '../src/seed/modules.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_ncamandat';
process.env.JWT_SECRET = 'a'.repeat(40);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URI = 'mongodb://127.0.0.1:27017/sigbd_ncamandat';

function run(extraArgs = []) {
  const result = spawnSync('node', ['src/scripts/init-nca-mandat.js', ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: URI,
      JWT_SECRET: 'a'.repeat(40),
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Module NCA en version 1 (ancienne version : table membres sans la colonne mandat).
function ancienModuleNca() {
  const source = MODULES.find((m) => m.code === 'NCA');
  const clone = JSON.parse(JSON.stringify(source));
  const table = clone.fields.find((f) => f.key === 'membres');
  table.fields = table.fields.filter((f) => f.key !== 'mandat');
  return { ...clone, version: 1, active: true };
}

function mandatField(moduleDoc) {
  const table = (moduleDoc.fields || []).find((f) => f.key === 'membres');
  return table && (table.fields || []).find((f) => f.key === 'mandat');
}

beforeAll(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('init-nca-mandat script (module NCA present, version 1 sans mandat)', { timeout: 120000 }, () => {
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Module.create(ancienModuleNca());
  });

  it("I1 le dry-run annonce l'ajout mais n'ecrit rien", async () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Colonne "N° de mandat" ajoutee apres "Qualite".');
    expect(r.stdout).toContain('DRY-RUN : la colonne serait ajoutee. Relancez avec --apply pour ecrire.');
    const nca = await Module.findOne({ code: 'NCA' });
    expect(mandatField(nca)).toBeUndefined();
    expect(nca.version).toBe(1);
  });

  it('I2 --apply ajoute la colonne mandat a la table membres du module NCA', async () => {
    const r = run(['--apply']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Colonne "N° de mandat" ajoutee');
    expect(r.stdout).toContain('1 module(s) mis a jour, 1 modification(s) ecrite(s).');
    const nca = await Module.findOne({ code: 'NCA' });
    const f = mandatField(nca);
    expect(f).not.toBeUndefined();
    expect(f.label).toBe('N° de mandat');
    expect(f.type).toBe('integer');
    expect(f.required).toBe(true);
    expect(f.min).toBe(1);
    expect(f.max).toBeUndefined();
    expect(f.placeholder).toBe('1 = premier mandat, 2 = deuxième mandat, etc.');
    // Le script met a jour le gabarit existant sans publier une nouvelle version.
    expect(nca.version).toBe(1);
    // Les autres colonnes de la table membres sont intactes.
    const cles = nca.fields.find((f) => f.key === 'membres').fields.map((f) => f.key);
    expect(cles).toEqual(['nom', 'prenom', 'qualite', 'mandat']);
  });

  it('I3 --apply est idempotent (aucune modification au 2e passage)', async () => {
    await run(['--apply']);
    const r = run(['--apply']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('est deja presente');
    expect(r.stdout).toContain('aucune modification necessaire. Rien a ecrire.');
    const nca = await Module.findOne({ code: 'NCA' });
    expect(mandatField(nca)).not.toBeUndefined();
    expect(nca.version).toBe(1);
  });
});

describe('init-nca-mandat script (module absent)', { timeout: 120000 }, () => {
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('I4 module absent = erreur en sortie 1 et rien n est ecrit', async () => {
    const r = run(['--apply']);
    expect(r.status).toBe(1);
    expect((r.stderr + r.stdout)).toMatch(/Module NCA introuvable/);
    expect(await Module.countDocuments({ code: 'NCA' })).toBe(0);
  });
});

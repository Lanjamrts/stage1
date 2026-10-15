"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

import Structure from '../src/models/Structure.js';
import Region from '../src/models/Region.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URI = 'mongodb://127.0.0.1:27017/sigbd_initcheck';

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

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sigbd-init-'));
}

function writeFixtures(dir, regionsCsv, structuresCsv) {
  fs.writeFileSync(path.join(dir, 'regions.csv'), regionsCsv, 'utf8');
  fs.writeFileSync(path.join(dir, 'structures.csv'), structuresCsv, 'utf8');
}

beforeAll(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('init-structures script', { timeout: 120000 }, () => {
  let tempDir;

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    tempDir = makeTempDir();

    const regionsCsv = `region;valide;note
Analamanga;oui;
Atsinanana;oui;
Diana;oui;
`;

    const structuresCsv = `type;region;valide;note
SRB;Analamanga;oui;
SRSP;Analamanga;oui;
SRPE;Analamanga;oui;
CIRBF;Analamanga;oui;
SRB;Atsinanana;oui;
SRSP;Atsinanana;oui;
SRPE;Atsinanana;oui;
CIRBF;Atsinanana;oui;
SRB;Diana;oui;
SRSP;Diana;oui;
SRPE;Diana;oui;
CIRBF;Diana;oui;
`;

    writeFixtures(tempDir, regionsCsv, structuresCsv);
  });

  it("I1 le dry-run n'ecrit rien", async () => {
    const r = run('src/scripts/init-structures.js', [], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY-RUN');
    const regions = await Region.countDocuments();
    const structs = await Structure.countDocuments();
    expect(regions).toBe(0);
    expect(structs).toBe(0);
  });

  it('I2 --apply cree structures centrales, regions et structures avec libelles TYPE – Region', async () => {
    const r = run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('creee(s)');

    const ssebf = await Structure.findOne({ code: 'SSEBF' });
    const dgbf = await Structure.findOne({ code: 'DGBF' });
    const cellule = await Structure.findOne({ code: 'CELLULE_INFO' });
    expect(ssebf).not.toBeNull();
    expect(ssebf.label).toBe('SSEBF');
    expect(dgbf).not.toBeNull();
    expect(dgbf.label).toBe('DGBF');
    expect(cellule).not.toBeNull();
    expect(cellule.label).toBe('DGBF – Cellule Informatique');

    const srbAnalamanga = await Structure.findOne({ code: 'SRB-ANALAMANGA' });
    expect(srbAnalamanga).not.toBeNull();
    expect(srbAnalamanga.label).toBe('SRB – Analamanga');
    expect(srbAnalamanga.type).toBe('SRB');
    const region = await Region.findOne({ name: 'Analamanga' });
    expect(region).not.toBeNull();
    expect(srbAnalamanga.regionId.toString()).toBe(region._id.toString());
  });

  it('I3 --apply est idempotent', async () => {
    await run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    const r = run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 creee(s)');
    const regions = await Region.countDocuments();
    const structs = await Structure.countDocuments();
    expect(regions).toBe(3);
    expect(structs).toBe(15);
  });

  it('I4 --apply refuse les lignes non validees', async () => {
    const regionsCsv = `region;valide;note
Analamanga;non;
`;
    const structuresCsv = `type;region;valide;note
SRB;Analamanga;non;
`;
    writeFixtures(tempDir, regionsCsv, structuresCsv);

    const r = run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(1);
    const regions = await Region.countDocuments();
    const structs = await Structure.countDocuments();
    expect(regions).toBe(0);
    expect(structs).toBe(0);
  });

  it('I5 --allow-unvalidated fonctionne hors production et est interdit en production', async () => {
    const regionsCsv = `region;valide;note
Analamanga;non;
`;
    const structuresCsv = `type;region;valide;note
SRB;Analamanga;non;
`;
    writeFixtures(tempDir, regionsCsv, structuresCsv);

    const r1 = run('src/scripts/init-structures.js', ['--apply', '--allow-unvalidated'], { INIT_DATA_DIR: tempDir });
    expect(r1.status).toBe(0);
    const regions1 = await Region.countDocuments();
    expect(regions1).toBe(1);

    await mongoose.connection.dropDatabase();
    const tempDir2 = makeTempDir();
    writeFixtures(tempDir2, regionsCsv, structuresCsv);
    const r2 = run('src/scripts/init-structures.js', ['--apply', '--allow-unvalidated'], { INIT_DATA_DIR: tempDir2, NODE_ENV: 'production' });
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain('--allow-unvalidated est interdit en production');
    const regions2 = await Region.countDocuments();
    expect(regions2).toBe(0);
  });

  it('I6 CSV avec separateur point-virgule et BOM', async () => {
    const regionsCsv = `\uFEFFregion;valide;note\r
Analamanga;oui;\r
`;
    const structuresCsv = `\uFEFFtype;region;valide;note\r
SRB;Analamanga;oui;\r
`;
    writeFixtures(tempDir, regionsCsv, structuresCsv);

    const r = run('src/scripts/init-structures.js', [], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY-RUN');
    expect(r.stdout).toContain('Regions : 1 a creer');
    expect(r.stdout).toContain('Structures : 4 a creer');
  });

  it('I7 les erreurs de validation arretent tout et donnent le numero de ligne', async () => {
    const regionsCsv = `region;valide;note
Analamanga;oui;
`;
    const structuresCsv = `type;region;valide;note
INVALID;Analamanga;oui;
SRB;Inconnu;oui;
SRB;Analamanga;oui;
SRB;Analamanga;oui;
`;
    writeFixtures(tempDir, regionsCsv, structuresCsv);

    const r = run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ligne');
    const regions = await Region.countDocuments();
    const structs = await Structure.countDocuments();
    expect(regions).toBe(0);
    expect(structs).toBe(0);
  });

  it('I8 un conflit avec une structure existante ne modifie rien', async () => {
    await Structure.create({
      code: 'SRB-ANALAMANGA',
      label: 'AUTRE',
      type: 'SRB',
      regionId: new mongoose.Types.ObjectId(),
      active: true,
    });

    const r = run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(1);
    const struct = await Structure.findOne({ code: 'SRB-ANALAMANGA' });
    expect(struct.label).toBe('AUTRE');
    const structs = await Structure.countDocuments();
    expect(structs).toBe(1);
  });

  it('I9 Structure.code est unique', async () => {
    await Structure.init();
    await Structure.create({
      code: 'TEST-CODE',
      label: 'Test',
      type: 'SRB',
      regionId: new mongoose.Types.ObjectId(),
      active: true,
    });
    let error = null;
    try {
      await Structure.create({
        code: 'TEST-CODE',
        label: 'Test2',
        type: 'SRSP',
        regionId: new mongoose.Types.ObjectId(),
        active: true,
      });
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.code).toBe(11000);
  });

  it('I10 le dry-run compte correctement sur une base deja initialisee', async () => {
    await run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });

    const r1 = run('src/scripts/init-structures.js', [], { INIT_DATA_DIR: tempDir });
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('Regions : 0 a creer');
    expect(r1.stdout).toContain('Structures : 0 a creer');

    const structuresCsv2 = `type;region;valide;note
SRB;Analamanga;oui;
SRSP;Analamanga;oui;
SRPE;Analamanga;oui;
CIRBF;Analamanga;oui;
SRB;Atsinanana;oui;
SRSP;Atsinanana;oui;
SRPE;Atsinanana;oui;
CIRBF;Atsinanana;oui;
SRB;Diana;oui;
SRSP;Diana;oui;
SRPE;Diana;oui;
CIRBF;Diana;oui;
SRB;Atsimo-Andrefana;oui;
`;
    writeFixtures(tempDir, `region;valide;note
Analamanga;oui;
Atsinanana;oui;
Diana;oui;
Atsimo-Andrefana;oui;
`, structuresCsv2);

    const r2 = run('src/scripts/init-structures.js', [], { INIT_DATA_DIR: tempDir });
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('Structures : 1 a creer');

    const structCount = await Structure.countDocuments();
    expect(structCount).toBe(15);
  });

  it('I11 DRBF est accepte dans structures.csv', async () => {
    const regionsCsv = `region;valide;note
Analamanga;oui;
`;
    const structuresCsv = `type;region;valide;note
DRBF;Analamanga;oui;
`;
    writeFixtures(tempDir, regionsCsv, structuresCsv);

    const r = run('src/scripts/init-structures.js', ['--apply'], { INIT_DATA_DIR: tempDir });
    expect(r.status).toBe(0);

    const drbf = await Structure.findOne({ code: 'DRBF-ANALAMANGA' });
    expect(drbf).not.toBeNull();
    expect(drbf.label).toBe('DRBF – Analamanga');
    expect(drbf.type).toBe('DRBF');
  });
});
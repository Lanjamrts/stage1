"use strict";

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');

function runSetup(extraEnv = {}) {
  const testDir = join(process.cwd(), '.test-setup-' + Date.now());
  mkdirSync(testDir, { recursive: true });

  const backendDir = join(testDir, 'backend');
  const frontendDir = join(testDir, 'frontend');
  mkdirSync(backendDir, { recursive: true });
  mkdirSync(frontendDir, { recursive: true });

  writeFileSync(join(backendDir, '.env.example'), `JWT_SECRET=votre-secret-jwt-d-au-moins-32-caracteres-ici\nNODE_ENV=development\n`);
  writeFileSync(join(frontendDir, '.env.example'), `VITE_API_URL=http://localhost:4000\nNODE_ENV=development\n`);

  const result = spawnSync('node', [join(ROOT, 'scripts', 'setup.mjs')], {
    cwd: testDir,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, SETUP_ROOT: testDir, ...extraEnv },
  });

  return { testDir, result, backendDir, frontendDir };
}

describe('Setup script (scripts/setup.mjs)', { timeout: 30000 }, () => {
  let testDirs = [];

  afterEach(() => {
    for (const dir of testDirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
    testDirs = [];
  });

  it('D1 : crée backend/.env avec un JWT_SECRET de 96 caractères hex, différent du modèle ; le secret n\'apparaît pas dans stdout', () => {
    const { testDir, result, backendDir } = runSetup();
    testDirs.push(testDir);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toMatch(/[0-9a-f]{96}/i);

    const envPath = join(backendDir, '.env');
    expect(existsSync(envPath)).toBe(true);

    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/^JWT_SECRET=([0-9a-f]{96})$/m);
    expect(match).not.toBeNull();
    expect(match[1]).not.toBe('votre-secret-jwt-d-au-moins-32-caracteres-ici');
    expect(match[1].length).toBe(96);
    expect(/^[0-9a-f]+$/i.test(match[1])).toBe(true);
  });

  it('D2 : un .env existant n\'est jamais modifié (contenu identique octet pour octet)', () => {
    const { testDir, result, backendDir, frontendDir } = runSetup();
    testDirs.push(testDir);

    // Premier passage
    expect(result.status).toBe(0);
    const firstBackend = readFileSync(join(backendDir, '.env'), 'utf8');
    const firstFrontend = readFileSync(join(frontendDir, '.env'), 'utf8');

    // Deuxième passage
    const result2 = spawnSync('node', [join(ROOT, 'scripts', 'setup.mjs')], {
      cwd: testDir,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, SETUP_ROOT: testDir },
    });
    expect(result2.status).toBe(0);

    const secondBackend = readFileSync(join(backendDir, '.env'), 'utf8');
    const secondFrontend = readFileSync(join(frontendDir, '.env'), 'utf8');

    expect(secondBackend).toBe(firstBackend);
    expect(secondFrontend).toBe(firstFrontend);
  });

  it('D3 : .env.example manquant → exit 1 et message clair', () => {
    const testDir = join(process.cwd(), '.test-setup-missing-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    testDirs.push(testDir);

    const backendDir = join(testDir, 'backend');
    mkdirSync(backendDir, { recursive: true });
    // NE PAS créer .env.example

    const result = spawnSync('node', [join(ROOT, 'scripts', 'setup.mjs')], {
      cwd: testDir,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, SETUP_ROOT: testDir },
    });

    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toMatch(/fichier d'exemple manquant/i);
  });
});
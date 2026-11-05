"use strict";

// Configuration CORE_STORE (interrupteur MongoDB / Oracle du noyau) et forme
// des identifiants selon le stockage actif (repositories/ids.js).

import { describe, it, expect, afterAll } from 'vitest';
import { parseEnv, loadConfig } from '../src/config.js';
import { estIdValide } from '../src/repositories/ids.js';

const BASE = {
  JWT_SECRET: 'a'.repeat(96),
  MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
};

describe("Configuration CORE_STORE (backend/src/config.js)", () => {
  it("C1 : défaut mongo quand CORE_STORE est absent", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development' }).CORE_STORE).toBe('mongo');
  });

  it("C2 : CORE_STORE=oracle accepté", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development', CORE_STORE: 'oracle' }).CORE_STORE).toBe('oracle');
  });

  it("C3 : valeur invalide refusée", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'development', CORE_STORE: 'fichier' })).toThrow(/CORE_STORE/);
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'development', CORE_STORE: 'Mongo' })).toThrow(/CORE_STORE/);
  });

  it("C4 : production + oracle sans ORACLE_USER → refus (message existant)", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production', CORE_STORE: 'oracle' })).toThrow(
      /ORACLE_USER est requis en production quand une variable Oracle est définie/
    );
  });

  it("C5 : production + oracle sans ORACLE_PASSWORD → refus (message existant)", () => {
    expect(() =>
      parseEnv({ ...BASE, NODE_ENV: 'production', CORE_STORE: 'oracle', ORACLE_USER: 'sigbd' })
    ).toThrow(/ORACLE_PASSWORD est requis en production quand une variable Oracle est définie/);
  });

  it("C6 : production + oracle complets → accepté", () => {
    const config = parseEnv({
      ...BASE,
      NODE_ENV: 'production',
      CORE_STORE: 'oracle',
      ORACLE_USER: 'sigbd',
      ORACLE_PASSWORD: 'motdepasse-de-production-suffisamment-long',
    });
    expect(config.CORE_STORE).toBe('oracle');
  });

  it("C7 : production + mongo sans variable Oracle → inchangé (aucun refus)", () => {
    const config = parseEnv({ ...BASE, NODE_ENV: 'production' });
    expect(config.CORE_STORE).toBe('mongo');
  });
});

describe("Forme des identifiants (backend/src/repositories/ids.js)", () => {
  const ID_MONGO = '6564abcdef0123456789abcd';
  const ID_ORACLE = '123456789012345678';

  const config = () => loadConfig();

  afterAll(() => {
    config().CORE_STORE = 'mongo';
  });

  it("I1 : CORE_STORE=mongo accepte les 24 chiffres hexadécimaux, refuse les nombres", () => {
    config().CORE_STORE = 'mongo';
    expect(estIdValide(ID_MONGO)).toBe(true);
    expect(estIdValide('6564ABCDEF0123456789ABCD')).toBe(true);
    expect(estIdValide(ID_ORACLE)).toBe(false);
    expect(estIdValide('123')).toBe(false);
  });

  it("I2 : CORE_STORE=oracle accepte 1 à 18 chiffres sans zéro initial, refuse l'hexadécimal", () => {
    config().CORE_STORE = 'oracle';
    expect(estIdValide(ID_ORACLE)).toBe(true);
    expect(estIdValide('1')).toBe(true);
    expect(estIdValide(ID_MONGO)).toBe(false);
    expect(estIdValide('0')).toBe(false);
    expect(estIdValide('012')).toBe(false);
    expect(estIdValide('1234567890123456789')).toBe(false);
    expect(estIdValide('abc')).toBe(false);
  });

  it("I3 : valeurs absentes ou non chaînes refusées dans les deux stockages", () => {
    for (const stockage of ['mongo', 'oracle']) {
      config().CORE_STORE = stockage;
      expect(estIdValide('')).toBe(false);
      expect(estIdValide('0')).toBe(false);
      expect(estIdValide('abc')).toBe(false);
      expect(estIdValide(null)).toBe(false);
      expect(estIdValide(undefined)).toBe(false);
      expect(estIdValide(123)).toBe(false);
      expect(estIdValide({})).toBe(false);
    }
    config().CORE_STORE = 'mongo';
  });
});

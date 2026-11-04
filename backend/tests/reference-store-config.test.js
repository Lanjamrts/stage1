"use strict";

import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config.js';

const BASE = {
  JWT_SECRET: 'a'.repeat(96),
  MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
};

describe("Configuration REFERENCE_STORE (backend/src/config.js)", () => {
  it("R1 : défaut mongo quand REFERENCE_STORE est absent", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development' }).REFERENCE_STORE).toBe('mongo');
  });

  it("R2 : REFERENCE_STORE=oracle accepté", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development', REFERENCE_STORE: 'oracle' }).REFERENCE_STORE).toBe('oracle');
  });

  it("R3 : valeur invalide refusée", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'development', REFERENCE_STORE: 'fichier' })).toThrow(/REFERENCE_STORE/);
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'development', REFERENCE_STORE: 'Mongo' })).toThrow(/REFERENCE_STORE/);
  });

  it("R4 : production + oracle sans ORACLE_USER → refus (message existant)", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production', REFERENCE_STORE: 'oracle' })).toThrow(
      /ORACLE_USER est requis en production quand une variable Oracle est définie/
    );
  });

  it("R5 : production + oracle sans ORACLE_PASSWORD → refus (message existant)", () => {
    expect(() =>
      parseEnv({ ...BASE, NODE_ENV: 'production', REFERENCE_STORE: 'oracle', ORACLE_USER: 'sigbd' })
    ).toThrow(/ORACLE_PASSWORD est requis en production quand une variable Oracle est définie/);
  });

  it("R6 : production + oracle complets → accepté", () => {
    const config = parseEnv({
      ...BASE,
      NODE_ENV: 'production',
      REFERENCE_STORE: 'oracle',
      ORACLE_USER: 'sigbd',
      ORACLE_PASSWORD: 'motdepasse-de-production-suffisamment-long',
    });
    expect(config.REFERENCE_STORE).toBe('oracle');
  });

  it("R7 : production + mongo sans variable Oracle → inchangé (aucun refus)", () => {
    const config = parseEnv({ ...BASE, NODE_ENV: 'production' });
    expect(config.REFERENCE_STORE).toBe('mongo');
  });
});

"use strict";

import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config.js';

const BASE = {
  JWT_SECRET: 'a'.repeat(96),
  MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
};

describe("Configuration AUDIT_STORE (backend/src/config.js)", () => {
  it("A1 : défaut mongo quand AUDIT_STORE est absent", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development' }).AUDIT_STORE).toBe('mongo');
  });

  it("A2 : AUDIT_STORE=oracle accepté", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development', AUDIT_STORE: 'oracle' }).AUDIT_STORE).toBe('oracle');
  });

  it("A3 : valeur invalide refusée", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'development', AUDIT_STORE: 'fichier' })).toThrow(/AUDIT_STORE/);
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'development', AUDIT_STORE: 'Mongo' })).toThrow(/AUDIT_STORE/);
  });

  it("A4 : production + oracle sans ORACLE_USER → refus (message existant)", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production', AUDIT_STORE: 'oracle' })).toThrow(
      /ORACLE_USER est requis en production quand une variable Oracle est définie/
    );
  });

  it("A5 : production + oracle sans ORACLE_PASSWORD → refus (message existant)", () => {
    expect(() =>
      parseEnv({ ...BASE, NODE_ENV: 'production', AUDIT_STORE: 'oracle', ORACLE_USER: 'sigbd' })
    ).toThrow(/ORACLE_PASSWORD est requis en production quand une variable Oracle est définie/);
  });

  it("A6 : production + oracle complets → accepté", () => {
    const config = parseEnv({
      ...BASE,
      NODE_ENV: 'production',
      AUDIT_STORE: 'oracle',
      ORACLE_USER: 'sigbd',
      ORACLE_PASSWORD: 'motdepasse-de-production-suffisamment-long',
    });
    expect(config.AUDIT_STORE).toBe('oracle');
  });

  it("A7 : production + mongo sans variable Oracle → inchangé (aucun refus)", () => {
    const config = parseEnv({ ...BASE, NODE_ENV: 'production' });
    expect(config.AUDIT_STORE).toBe('mongo');
  });
});

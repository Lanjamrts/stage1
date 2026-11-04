"use strict";

import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config.js';

const JWT_SECRET_TEST = 'a'.repeat(96);

describe("Configuration Oracle (backend/src/config.js)", () => {
  it("O1 : variables Oracle absentes → l'application démarre ; défauts corrects", () => {
    const config = parseEnv({
      NODE_ENV: 'development',
      JWT_SECRET: JWT_SECRET_TEST,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
    });

    expect(config.ORACLE_USER).toBeUndefined();
    expect(config.ORACLE_PASSWORD).toBeUndefined();
    expect(config.ORACLE_CONNECT_STRING).toBe('127.0.0.1:1521/XEPDB1');
    expect(config.ORACLE_POOL_MIN).toBe(1);
    expect(config.ORACLE_POOL_MAX).toBe(10);
    expect(config.ORACLE_TEST_USER).toBeUndefined();
  });

  it('O2 : production sans ORACLE_PASSWORD alors que ORACLE_USER est défini → erreur', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: JWT_SECRET_TEST,
        MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
        ORACLE_USER: 'sigbd',
      }),
    ).toThrow(/ORACLE_PASSWORD est requis en production/);
  });

  it("O3 : production avec ORACLE_PASSWORD = valeur d'exemple → erreur", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: JWT_SECRET_TEST,
        MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
        ORACLE_USER: 'sigbd',
        ORACLE_PASSWORD: 'votre-mot-de-passe-oracle-ici',
      }),
    ).toThrow(/ORACLE_PASSWORD ne peut pas être la valeur d'exemple en production/);
  });

  it('O4 : production avec ORACLE_USER et ORACLE_PASSWORD valides → accepté', () => {
    const config = parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: JWT_SECRET_TEST,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
      ORACLE_USER: 'sigbd',
      ORACLE_PASSWORD: 'MotDePasseOracle123!',
      ORACLE_CONNECT_STRING: '127.0.0.1:1521/XEPDB1',
      ORACLE_POOL_MIN: '2',
      ORACLE_POOL_MAX: '20',
    });

    expect(config.ORACLE_USER).toBe('sigbd');
    expect(config.ORACLE_PASSWORD).toBe('MotDePasseOracle123!');
    expect(config.ORACLE_POOL_MIN).toBe(2);
    expect(config.ORACLE_POOL_MAX).toBe(20);
  });

  it('O5 : variables Oracle de test non lues hors NODE_ENV=test', () => {
    const config = parseEnv({
      NODE_ENV: 'development',
      JWT_SECRET: JWT_SECRET_TEST,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
      ORACLE_TEST_USER: 'ignorée',
      ORACLE_TEST_PASSWORD: 'ignorée',
      ORACLE_TEST_CONNECT_STRING: 'ignorée',
    });

    expect(config.ORACLE_TEST_USER).toBeUndefined();
    expect(config.ORACLE_TEST_PASSWORD).toBeUndefined();
    expect(config.ORACLE_TEST_CONNECT_STRING).toBeUndefined();
  });
});

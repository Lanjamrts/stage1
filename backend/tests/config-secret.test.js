"use strict";

import { describe, it, expect } from 'vitest';
import { loadConfig, parseEnv } from '../src/config.js';

const DEFAULT_TEST_SECRET = 'test-secret-key-for-testing-only-do-not-use-in-production-32chars';

describe('Config secret validation (backend/src/config.js)', () => {
  it('D4 : NODE_ENV=production + secret d\'exemple → refusé', () => {
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'votre-secret-jwt-d-au-moins-32-caracteres-ici',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
    };

    expect(() => parseEnv(env)).toThrow("JWT_SECRET ne peut pas être la valeur d'exemple en production");
  });

  it('D5 : NODE_ENV=production + secret aléatoire de 96 caractères (+ les autres variables requises) → accepté', () => {
    const randomSecret = 'a'.repeat(96);
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: randomSecret,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd',
    };

    const config = parseEnv(env);
    expect(config.JWT_SECRET).toBe(randomSecret);
    expect(config.NODE_ENV).toBe('production');
    expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/sigbd');
  });
});
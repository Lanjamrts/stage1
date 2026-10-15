"use strict";

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit contenir au moins 32 caractères'),
  MONGODB_URI: z.string().url('MONGODB_URI doit être une URL valide'),
  PORT: z.coerce.number().int().positive().default(4000),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().url().optional(),
  TRUST_PROXY: z.enum(['true', 'false', '1', '0']).default('false').transform((v) => v === 'true' || v === '1'),
  JSON_BODY_LIMIT_KB: z.coerce.number().int().min(10).max(10240).default(2048),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().min(50).default(1200),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(5),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(5).default(60),
});

const DEFAULT_TEST_JWT_SECRET = 'test-secret-key-for-testing-only-do-not-use-in-production-32chars';

let config;

export function parseEnv(env) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Configuration invalide: ${errors}`);
  }
  const data = parsed.data;

  if (data.NODE_ENV === 'production') {
    if (data.JWT_SECRET === 'votre-secret-jwt-d-au-moins-32-caracteres-ici') {
      throw new Error('JWT_SECRET ne peut pas être la valeur d\'exemple en production');
    }
  }

  return data;
}

export function loadConfig() {
  if (config) return config;

  const env = {
    JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? DEFAULT_TEST_JWT_SECRET : undefined),
    MONGODB_URI: process.env.MONGODB_URI || (process.env.NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27017/sigbd_test' : undefined),
    PORT: process.env.PORT,
    SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES,
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    TRUST_PROXY: process.env.TRUST_PROXY,
    JSON_BODY_LIMIT_KB: process.env.JSON_BODY_LIMIT_KB,
    RATE_LIMIT_WINDOW_MINUTES: process.env.RATE_LIMIT_WINDOW_MINUTES,
    RATE_LIMIT_USER_MAX: process.env.RATE_LIMIT_USER_MAX,
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
    LOGIN_RATE_LIMIT_MAX: process.env.LOGIN_RATE_LIMIT_MAX,
  };

  config = parseEnv(env);

  if (config.NODE_ENV === 'production') {
    if (!config.JWT_SECRET) {
      throw new Error('JWT_SECRET est requis en production');
    }
    if (config.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET doit contenir au moins 32 caractères en production');
    }
    if (config.JWT_SECRET === 'change-me-in-production-sigbd-2026') {
      throw new Error('JWT_SECRET ne peut pas être la valeur par défaut en production');
    }
    if (config.JWT_SECRET === 'votre-secret-jwt-d-au-moins-32-caracteres-ici') {
      throw new Error('JWT_SECRET ne peut pas être la valeur d\'exemple en production');
    }
  }

  return config;
}

export function getConfig() {
  if (!config) return loadConfig();
  return config;
}
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
  TRUST_PROXY: z.coerce.boolean().default(false),
});

const DEFAULT_TEST_JWT_SECRET = 'test-secret-key-for-testing-only-do-not-use-in-production-32chars';

let config;

export function loadConfig() {
  if (config) return config;

  const env = {
    JWT_SECRET: process.env.JWT_SECRET,
    MONGODB_URI: process.env.MONGODB_URI,
    PORT: process.env.PORT,
    SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES,
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };

  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const errors = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Configuration invalide: ${errors}`);
  }

  config = parsed.data;

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
  }

  if (config.NODE_ENV === 'test' && !config.JWT_SECRET) {
    config.JWT_SECRET = DEFAULT_TEST_JWT_SECRET;
  }

  return config;
}

export function getConfig() {
  if (!config) return loadConfig();
  return config;
}
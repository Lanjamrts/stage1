// Safety guard: the seed purges the whole database and creates demo accounts
// (shared password). It must never run in production by accident.
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
  console.error('Seed interdit en production. Définissez ALLOW_SEED_IN_PRODUCTION=true pour forcer.');
  process.exit(1);
}
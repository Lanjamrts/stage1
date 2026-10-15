// Safety guard for the DEMO seed only: it deletes data and creates accounts with a shared password.
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
  console.error('Seed de demonstration interdit en production. Definissez SEED_ALLOW_PRODUCTION=true pour forcer (DANGER : supprime des donnees).');
  process.exit(1);
}
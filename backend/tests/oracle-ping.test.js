import { describe, it, expect, afterEach } from 'vitest';
import { pingOracle, closeOracle, getKnex } from '../src/db/oracle.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

describe.skipIf(!oracleConfiguree)('Oracle ping (integration) — ORACLE_TEST_* requises', () => {
  afterEach(async () => {
    await closeOracle();
  });

  it('pingOracle() renvoie test=OK, une version et le service ; closeOracle() ferme le pool', async () => {
    const result = await pingOracle();
    expect(result.test).toBe('OK');
    expect(typeof result.version).toBe('string');
    expect(result.version.length).toBeGreaterThan(0);
    expect(typeof result.service).toBe('string');
    expect(result.service).toContain(':');

    await closeOracle();

    // getKnex est paresseux : une nouvelle instance est recrée apres fermeture
    const db = await getKnex();
    expect(db).toBeDefined();
    await closeOracle();
  });
});

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getKnex, closeOracle } from '../src/db/oracle.js';
import { analyserOptions, lireInstructions, main } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const DOSSIER_SQL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/oracle');

// 10 modèles Mongoose -> 13 tables (Module -> 3 tables, Saisie -> 2 tables).
const TABLES_ATTENDUES = [
  'PROFIL',
  'REGION',
  'STRUCTURE',
  'UTILISATEUR',
  'PERIODE',
  'MODULE_SIGBD',
  'MODULE_PERIODICITE',
  'MODULE_TYPE_STRUCTURE',
  'SAISIE',
  'SAISIE_VALIDATION',
  'REFERENTIEL',
  'REMARQUE',
  'JOURNAL_AUDIT',
];

const ORA_CHECK = 2290;
const ORA_UNIQUE = 1;
const ORA_FK = 2291;

async function exec(requete) {
  const db = await getKnex();
  return db.raw(requete);
}

async function lignes(requete) {
  const resultat = await exec(requete);
  return resultat.rows || resultat;
}

async function refus(requete, codeOracle) {
  await expect(exec(requete)).rejects.toMatchObject({ errorNum: codeOracle });
}

async function idDe(table, condition) {
  const rows = await lignes(`SELECT ID FROM ${table} WHERE ${condition}`);
  expect(rows).toHaveLength(1);
  return Number(rows[0].ID);
}

// Oracle renvoie les colonnes JSON comme objet JS (parfois comme chaîne).
function enObjet(valeur) {
  if (valeur == null) return null;
  if (typeof valeur === 'string') return JSON.parse(valeur);
  if (Buffer.isBuffer(valeur)) return JSON.parse(valeur.toString('utf8'));
  return valeur;
}

describe('Script de schéma Oracle (unitaire, sans base)', () => {
  it("refuse --drop et --reset quand NODE_ENV=production", async () => {
    expect(analyserOptions(['--drop'], 'production').erreur).toMatch(/production/);
    expect(analyserOptions(['--reset'], 'production').erreur).toMatch(/production/);
    expect(analyserOptions([], 'production').erreur).toBeNull();

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['--drop'], 'production');
    const messages = spy.mock.calls.map((appel) => appel.join(' '));
    spy.mockRestore();

    expect(code).toBe(1);
    expect(messages.some((m) => m.includes('production'))).toBe(true);
  });

  it("accepte --drop et --reset hors production", () => {
    expect(analyserOptions(['--drop'], 'test').erreur).toBeNull();
    expect(analyserOptions(['--drop'], 'test')).toMatchObject({ drop: true, create: false });
    expect(analyserOptions(['--reset'], 'test')).toMatchObject({ drop: true, create: true });
    expect(analyserOptions([], 'development')).toMatchObject({ drop: false, create: true });
    expect(analyserOptions(['--drop', '--reset'], 'test')).toMatchObject({ drop: true, create: true });
  });

  it('lit 000_drop.sql : 13 DROP TABLE sans commentaire, ordre inverse', () => {
    const instructions = lireInstructions(path.join(DOSSIER_SQL, '000_drop.sql'));
    expect(instructions).toHaveLength(TABLES_ATTENDUES.length);
    expect(instructions.every((s) => s.startsWith('DROP TABLE '))).toBe(true);
    expect(instructions.every((s) => !s.includes('--'))).toBe(true);
    expect(instructions[0]).toContain('DROP TABLE JOURNAL_AUDIT');
    expect(instructions[instructions.length - 1]).toContain('DROP TABLE PROFIL');
  });

  it('lit 001_schema.sql : commentaires retirés, 13 tables, une instruction par ";"', () => {
    const instructions = lireInstructions(path.join(DOSSIER_SQL, '001_schema.sql'));
    const tables = instructions.filter((s) => s.startsWith('CREATE TABLE '));
    expect(tables).toHaveLength(TABLES_ATTENDUES.length);
    expect(tables.map((t) => t.split(/\s+/)[2]).sort()).toEqual([...TABLES_ATTENDUES].sort());
    expect(instructions.every((s) => !s.includes('--'))).toBe(true);
    expect(instructions.every((s) => !s.includes('?'))).toBe(true);
    expect(instructions.length).toBeGreaterThan(TABLES_ATTENDUES.length);
  });
});

describe.skipIf(!oracleConfiguree)('Schéma Oracle (intégration) — ORACLE_TEST_* requises', () => {
  const ids = {};

  beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe('test');
    // Le test ne cible que le schéma de l'utilisateur de test (jamais ORACLE_USER).
    const code = await main(['--reset']);
    expect(code).toBe(0);
  });

  afterEach(async () => {
    await closeOracle();
  });

  afterAll(async () => {
    await closeOracle();
  });

  it('les 13 tables attendues sont présentes (user_tables)', async () => {
    const rows = await lignes('SELECT TABLE_NAME FROM user_tables');
    const presents = rows.map((r) => String(r.TABLE_NAME ?? r.table_name));
    for (const table of TABLES_ATTENDUES) {
      expect(presents).toContain(table);
    }
  });

  it('insertion valide dans chaque table', async () => {
    await exec("INSERT INTO PROFIL (CODE, LABEL) VALUES ('PROFIL_SCH', 'Profil schema')");
    ids.profil = await idDe('PROFIL', "CODE = 'PROFIL_SCH'");

    await exec("INSERT INTO REGION (NAME_REGION) VALUES ('Region schema')");
    ids.region = await idDe('REGION', "NAME_REGION = 'Region schema'");

    await exec(
      `INSERT INTO STRUCTURE (CODE, LABEL, TYPE_STRUCTURE, REGION_ID, ACTIVE) ` +
        `VALUES ('STR_SCH', 'Structure schema', 'SRB', ${ids.region}, 1)`
    );
    ids.structure = await idDe('STRUCTURE', "CODE = 'STR_SCH'");

    await exec(
      `INSERT INTO UTILISATEUR (IM, NOM, PRENOM, DIRECTION, SERVICE, PASSWORD_HASH, ROLE_CODE, STRUCTURE_ID, STATUT, MUST_CHANGE_PASSWORD, FAILED_ATTEMPTS, LOCKED_UNTIL) ` +
        `VALUES ('IM_SCH', 'NOM_SCH', 'PRENOM_SCH', 'Direction schema', 'Service schema', '${'h'.repeat(60)}', 'client', ${ids.structure}, 'actif', 0, 0, NULL)`
    );
    ids.utilisateur = await idDe('UTILISATEUR', "IM = 'IM_SCH'");

    await exec(
      `INSERT INTO PERIODE (LABEL, DATE_DEBUT, DATE_FIN, DATE_LIMITE, PERIODICITE) ` +
        `VALUES ('Periode schema', TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-01-31 23:59:59', TIMESTAMP '2026-02-05 00:00:00', 'monthly')`
    );
    ids.periode = await idDe('PERIODE', "LABEL = 'Periode schema'");

    await exec(
      `INSERT INTO MODULE_SIGBD (CODE, LABEL, PERIODICITE, GENRE, VERSION_MODULE, ACTIVE, FIELDS_JSON) ` +
        `VALUES ('MOD_SCH', 'Module schema', 'monthly', 'periodic', 1, 1, '{"fields":[{"key":"montant","type":"number"}]}')`
    );
    ids.module = await idDe('MODULE_SIGBD', "CODE = 'MOD_SCH'");

    await exec(`INSERT INTO MODULE_PERIODICITE (MODULE_ID, PERIODICITE) VALUES (${ids.module}, 'monthly')`);
    await exec(`INSERT INTO MODULE_TYPE_STRUCTURE (MODULE_ID, TYPE_STRUCTURE) VALUES (${ids.module}, 'SRB')`);

    await exec(
      `INSERT INTO SAISIE (STRUCTURE_ID, MODULE_ID, VERSION_MODULE, PERIODE_ID, AUTEUR_ID, STATUT, VALEURS_JSON) ` +
        `VALUES (${ids.structure}, ${ids.module}, 1, ${ids.periode}, ${ids.utilisateur}, 'brouillon', '{"a":1,"b":[1,2]}')`
    );
    ids.saisie = await idDe('SAISIE', `STRUCTURE_ID = ${ids.structure} AND MODULE_ID = ${ids.module}`);

    await exec(
      `INSERT INTO SAISIE_VALIDATION (SAISIE_ID, DECISION, MOTIF, ACTEUR_ID, ACTEUR_LABEL, DATE_DECISION) ` +
        `VALUES (${ids.saisie}, 'soumise', NULL, ${ids.utilisateur}, 'IM_SCH', SYSTIMESTAMP)`
    );

    await exec("INSERT INTO REFERENTIEL (TYPE_REF, VALEUR, MINISTERE, REGIME, ACRONYME) VALUES ('directions', 'Direction schema', NULL, NULL, NULL)");

    await exec(
      `INSERT INTO REMARQUE (AUTEUR_ID, CONTEXTE, TEXTE, ETAT) ` +
        `VALUES (${ids.utilisateur}, 'module:MOD_SCH', 'Message de test', 'nouvelle')`
    );

    await exec("INSERT INTO JOURNAL_AUDIT (USER_REF, ACTION, OBJET, IP) VALUES ('unknown', 'login_failure', 'login', '::1')");

    for (const table of TABLES_ATTENDUES) {
      const rows = await lignes(`SELECT COUNT(*) AS N FROM ${table}`);
      expect(Number(rows[0].N)).toBeGreaterThan(0);
    }
  });

  it('un statut ou un type de structure inconnu est refusé (CHECK)', async () => {
    await refus(
      `INSERT INTO UTILISATEUR (IM, NOM, PRENOM, DIRECTION, SERVICE, PASSWORD_HASH, ROLE_CODE, STRUCTURE_ID, STATUT) ` +
        `VALUES ('IM_BAD', 'N', 'P', 'D', 'S', 'h', 'client', ${ids.structure}, 'inconnu')`,
      ORA_CHECK
    );
    await refus(`INSERT INTO STRUCTURE (CODE, LABEL, TYPE_STRUCTURE) VALUES ('STR_BAD', 'L', 'XXX')`, ORA_CHECK);
  });

  it('un IM ou un CODE de module en double est refusé (UQ)', async () => {
    await refus(
      `INSERT INTO UTILISATEUR (IM, NOM, PRENOM, DIRECTION, SERVICE, PASSWORD_HASH, ROLE_CODE, STRUCTURE_ID) ` +
        `VALUES ('IM_SCH', 'N', 'P', 'D', 'S', 'h', 'client', ${ids.structure})`,
      ORA_UNIQUE
    );
    await refus(
      `INSERT INTO MODULE_SIGBD (CODE, LABEL, PERIODICITE, GENRE, FIELDS_JSON) VALUES ('MOD_SCH', 'L', 'monthly', 'event', '{}')`,
      ORA_UNIQUE
    );
  });

  it('une structure avec une région inexistante est refusée (FK)', async () => {
    await refus(`INSERT INTO STRUCTURE (CODE, LABEL, TYPE_STRUCTURE, REGION_ID) VALUES ('STR_FK', 'L', 'SRB', 999999)`, ORA_FK);
  });

  it('SAISIE : doublon (structure, module, période) refusé, deux événements acceptés', async () => {
    await refus(
      `INSERT INTO SAISIE (STRUCTURE_ID, MODULE_ID, VERSION_MODULE, PERIODE_ID, AUTEUR_ID, VALEURS_JSON) ` +
        `VALUES (${ids.structure}, ${ids.module}, 1, ${ids.periode}, ${ids.utilisateur}, '{}')`,
      ORA_UNIQUE
    );

    await exec(
      `INSERT INTO MODULE_SIGBD (CODE, LABEL, PERIODICITE, GENRE, FIELDS_JSON) VALUES ('EVT_SCH', 'Module evenement', 'monthly', 'event', '{}')`
    );
    ids.moduleEvent = await idDe('MODULE_SIGBD', "CODE = 'EVT_SCH'");

    const insertion = (valeurs) =>
      exec(
        `INSERT INTO SAISIE (STRUCTURE_ID, MODULE_ID, VERSION_MODULE, PERIODE_ID, DATE_EVENEMENT, AUTEUR_ID, VALEURS_JSON) ` +
          `VALUES (${ids.structure}, ${ids.moduleEvent}, 1, NULL, ${valeurs}, ${ids.utilisateur}, '{}')`
      );

    await insertion("TIMESTAMP '2026-03-01 00:00:00'");
    await insertion("TIMESTAMP '2026-04-01 00:00:00'");

    const rows = await lignes(`SELECT COUNT(*) AS N FROM SAISIE WHERE MODULE_ID = ${ids.moduleEvent} AND PERIODE_ID IS NULL`);
    expect(Number(rows[0].N)).toBe(2);
  });

  it('JSON : écriture puis relecture de VALEURS_JSON et FIELDS_JSON', async () => {
    const saisie = await lignes(`SELECT VALEURS_JSON FROM SAISIE WHERE ID = ${ids.saisie}`);
    expect(enObjet(saisie[0].VALEURS_JSON)).toEqual({ a: 1, b: [1, 2] });

    const module = await lignes(`SELECT FIELDS_JSON FROM MODULE_SIGBD WHERE ID = ${ids.module}`);
    expect(enObjet(module[0].FIELDS_JSON)).toEqual({ fields: [{ key: 'montant', type: 'number' }] });
  });

  it('un booléen NUMBER(1) refuse 2', async () => {
    await refus(`UPDATE STRUCTURE SET ACTIVE = 2 WHERE ID = ${ids.structure}`, ORA_CHECK);
    const rows = await lignes(`SELECT ACTIVE FROM STRUCTURE WHERE ID = ${ids.structure}`);
    expect(Number(rows[0].ACTIVE)).toBe(1);
  });

  it("supprimer une saisie supprime ses SAISIE_VALIDATION (ON DELETE CASCADE)", async () => {
    await exec(
      `INSERT INTO SAISIE (STRUCTURE_ID, MODULE_ID, VERSION_MODULE, PERIODE_ID, DATE_EVENEMENT, AUTEUR_ID, VALEURS_JSON) ` +
        `VALUES (${ids.structure}, ${ids.moduleEvent}, 1, NULL, TIMESTAMP '2026-05-01 00:00:00', ${ids.utilisateur}, '{}')`
    );
    const rows = await lignes(
      `SELECT ID FROM SAISIE WHERE MODULE_ID = ${ids.moduleEvent} AND DATE_EVENEMENT = TIMESTAMP '2026-05-01 00:00:00'`
    );
    expect(rows).toHaveLength(1);
    const saisieCascade = Number(rows[0].ID);

    await exec(`INSERT INTO SAISIE_VALIDATION (SAISIE_ID, DECISION) VALUES (${saisieCascade}, 'soumise')`);
    const avant = await lignes(`SELECT COUNT(*) AS N FROM SAISIE_VALIDATION WHERE SAISIE_ID = ${saisieCascade}`);
    expect(Number(avant[0].N)).toBe(1);

    await exec(`DELETE FROM SAISIE WHERE ID = ${saisieCascade}`);
    const apres = await lignes(`SELECT COUNT(*) AS N FROM SAISIE_VALIDATION WHERE SAISIE_ID = ${saisieCascade}`);
    expect(Number(apres[0].N)).toBe(0);
  });

  it('REFERENTIEL accepte MINISTERE à NULL (chaîne vide = NULL)', async () => {
    await exec("INSERT INTO REFERENTIEL (TYPE_REF, VALEUR, MINISTERE) VALUES ('grades', 'Grade schema', NULL)");
    await exec("INSERT INTO REFERENTIEL (TYPE_REF, VALEUR, MINISTERE) VALUES ('epn', 'EPN schema', '')");

    const rows = await lignes(`SELECT VALEUR, MINISTERE FROM REFERENTIEL WHERE TYPE_REF IN ('grades','epn') ORDER BY VALEUR`);
    expect(rows).toHaveLength(2);
    expect(rows[0].VALEUR).toBe('EPN schema');
    expect(rows[0].MINISTERE).toBeNull();
    expect(rows[1].VALEUR).toBe('Grade schema');
    expect(rows[1].MINISTERE).toBeNull();
  });
});

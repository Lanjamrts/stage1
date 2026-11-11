"use strict";

// Étape 43a : sauvegarde et restauration Oracle.
// - Bloc « fonctions pures » TOUJOURS exécuté (format du fichier, somme de
//   contrôle, ordre des clés étrangères, refus) : aucune connexion, aucune
//   base.
// - Bloc d'intégration en describe.skipIf sans ORACLE_TEST_USER /
//   ORACLE_TEST_PASSWORD : sur sigbd_test uniquement (jamais la base de
//   développement sigbd), schéma appliqué si une table manque (jamais
//   --reset), données de démonstration via le seed, sauvegarde, vidage,
//   restauration, comparaison table par table, puis nouvel insert vérifié
//   sans collision d'id.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { executerSeedDemo } from '../src/seed/demo.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getAuditRepository } from '../src/repositories/auditRepository.js';

import {
  TABLES,
  FORMAT,
  VERSION,
  construireFichier,
  construireEnveloppe,
  calculerSomme,
  verifierSomme,
  verifierComptes,
  verifierStructure,
  lireFichierBackup,
  normaliserValeur,
  normaliserLigne,
  nomServiceOracle,
  nomFichierOracle,
  slugService,
  analyserArgs as analyserArgsBackup,
  maxIdSection,
} from '../src/scripts/backup-oracle.js';
import {
  analyserArgs as analyserArgsRestore,
  messageRefusProduction,
  messageCibleNonVide,
  messageRefusFichier,
  valeurPourBind,
} from '../src/scripts/restore-oracle.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);
const DOSSIER_BACKEND = resolve(fileURLToPath(import.meta.url), '..', '..');
const TEMP_DIR = join(tmpdir(), 'sigbd-backup-oracle-test-' + Date.now());

mkdirSync(TEMP_DIR, { recursive: true });

// Même montage que backup.test.js : script lancé en processus séparé, dossier
// de sauvegarde isolé, variables Oracle reprises de l'environnement du test.
function runScript(script, args = [], extraEnv = {}) {
  const resultat = spawnSync('node', [script, ...args], {
    cwd: DOSSIER_BACKEND,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      BACKUP_DIR: TEMP_DIR,
      ...extraEnv,
    },
  });
  return { status: resultat.status, stdout: resultat.stdout, stderr: resultat.stderr };
}

// Sections de test : une ligne dans REGION, le reste vide.
function sectionsDeTest() {
  return TABLES.map((definition) => ({
    name: definition.nom,
    rows:
      definition.nom === 'REGION'
        ? [
            {
              ID: 1,
              NAME_REGION: 'Analamanga',
              CREATED_AT: '2026-01-01T00:00:00.000Z',
              UPDATED_AT: '2026-01-01T00:00:00.000Z',
            },
          ]
        : [],
  }));
}

function fichierDeTest() {
  return construireFichier({
    date: '2026-11-11T00:00:00.000Z',
    service: '127.0.0.1:1521/XEPDB1',
    sections: sectionsDeTest(),
  });
}

function ecrireFichier(nom, contenu) {
  const chemin = join(TEMP_DIR, nom);
  writeFileSync(chemin, typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 2));
  return chemin;
}

// ---------------------------------------------------------------------------
// Fonctions pures — toujours exécutées
// ---------------------------------------------------------------------------

describe('Sauvegarde Oracle — fonctions pures (sans base)', () => {
  it("P1 : les 13 tables sont dans l'ordre des clés étrangères", () => {
    expect(TABLES.map((definition) => definition.nom)).toEqual([
      'PROFIL',
      'REGION',
      'STRUCTURE',
      'PERIODE',
      'MODULE_SIGBD',
      'MODULE_PERIODICITE',
      'MODULE_TYPE_STRUCTURE',
      'REFERENTIEL',
      'UTILISATEUR',
      'SAISIE',
      'SAISIE_VALIDATION',
      'REMARQUE',
      'JOURNAL_AUDIT',
    ]);
    expect(TABLES).toHaveLength(13);
    for (const definition of TABLES) {
      expect(definition.pk.length).toBeGreaterThan(0);
      const noms = definition.colonnes.map((colonne) => colonne.nom);
      expect(new Set(noms).size).toBe(noms.length);
      expect(noms).toContain(definition.pk[0]);
    }
    // Les deux tables de jonction n'ont pas de colonne IDENTITY.
    const sansIdentite = TABLES.filter((definition) => !definition.identite).map((d) => d.nom);
    expect(sansIdentite).toEqual(['MODULE_PERIODICITE', 'MODULE_TYPE_STRUCTURE']);
    expect(TABLES.find((d) => d.nom === 'SAISIE').colonnes.find((c) => c.nom === 'VALEURS_JSON').type).toBe('json');
    expect(TABLES.find((d) => d.nom === 'PERIODE').colonnes.find((c) => c.nom === 'DATE_DEBUT').type).toBe('date');
    expect(TABLES.find((d) => d.nom === 'UTILISATEUR').colonnes.map((c) => c.nom)).toContain('PASSWORD_HASH');
  });

  it('P2 : les dates passent en ISO et les colonnes JSON restent telles quelles', () => {
    expect(normaliserValeur(new Date('2026-03-04T05:06:07.008Z'), 'date')).toBe('2026-03-04T05:06:07.008Z');
    expect(normaliserValeur(null, 'date')).toBeNull();
    expect(normaliserValeur(undefined, 'scalaire')).toBeNull();
    expect(normaliserValeur(42, 'scalaire')).toBe(42);
    expect(normaliserValeur({ b: 2, a: [1, 'x'] }, 'json')).toEqual({ b: 2, a: [1, 'x'] });
    expect(normaliserValeur('{"d":1}', 'json')).toEqual({ d: 1 });
    expect(normaliserValeur('{non json}', 'json')).toBe('{non json}');

    const definition = TABLES.find((d) => d.nom === 'REGION');
    const ligne = normaliserLigne(
      { ID: 7, NAME_REGION: 'Boeny', CREATED_AT: new Date('2026-01-02T03:04:05.006Z'), UPDATED_AT: null },
      definition
    );
    expect(ligne).toEqual({
      ID: 7,
      NAME_REGION: 'Boeny',
      CREATED_AT: '2026-01-02T03:04:05.006Z',
      UPDATED_AT: null,
    });
    expect(Object.keys(ligne)).toEqual(definition.colonnes.map((c) => c.nom));
  });

  it("P3 : l'en-tête porte le format, la version, la date, le service et les comptes", () => {
    const fichier = fichierDeTest();
    expect(Object.keys(fichier)).toEqual(['format', 'version', 'date', 'service', 'counts', 'tables']);
    expect(fichier.format).toBe(FORMAT);
    expect(fichier.version).toBe(VERSION);
    expect(fichier.date).toBe('2026-11-11T00:00:00.000Z');
    expect(fichier.service).toBe('127.0.0.1:1521/XEPDB1');
    expect(fichier.counts).toEqual({ ...Object.fromEntries(TABLES.map((d) => [d.nom, 0])), REGION: 1 });
    expect(fichier.tables.map((section) => section.name)).toEqual(TABLES.map((d) => d.nom));
    expect(fichier.tables.find((s) => s.name === 'REGION').rows[0].NAME_REGION).toBe('Analamanga');
    // Ni utilisateur ni mot de passe dans le nom de service affiché.
    expect(nomServiceOracle({ NODE_ENV: 'test', ORACLE_CONNECT_STRING: 'h:1521/XEPDB1' })).toBe('h:1521/XEPDB1');
    expect(slugService('127.0.0.1:1521/XEPDB1')).toBe('XEPDB1');
    expect(slugService('XEPDB1')).toBe('XEPDB1');
    expect(nomFichierOracle('127.0.0.1:1521/XEPDB1', new Date('2026-11-11T06:07:08.009Z'))).toBe(
      'sigbd-oracle-XEPDB1-20261111T060708-9Z.json'
    );
  });

  it('P4 : la somme de contrôle est stable et change au moindre changement', () => {
    const fichier = fichierDeTest();
    const somme = calculerSomme(fichier);
    expect(somme).toMatch(/^[0-9a-f]{64}$/);
    expect(calculerSomme(fichierDeTest())).toBe(somme);
    // L'ordre des clés de haut niveau ne change pas la somme (ordre canonique).
    const melange = {
      tables: fichier.tables,
      sha256: 'x',
      counts: fichier.counts,
      service: fichier.service,
      date: fichier.date,
      version: fichier.version,
      format: fichier.format,
    };
    expect(construireEnveloppe(melange)).toEqual(construireEnveloppe(fichier));
    expect(calculerSomme(melange)).toBe(somme);
    // Une ligne modifiée change la somme.
    const touche = fichierDeTest();
    touche.tables.find((s) => s.name === 'REGION').rows[0].NAME_REGION = 'Boeny';
    expect(calculerSomme(touche)).not.toBe(somme);
    expect(verifierSomme({ ...fichier, sha256: somme }).ok).toBe(true);
    expect(verifierSomme({ ...fichier, sha256: '0'.repeat(64) }).ok).toBe(false);
    expect(verifierSomme(fichier).ok).toBe(false); // sha256 absent
  });

  it('P5 : la structure, les comptes et la somme sont contrôlés', () => {
    const fichier = fichierDeTest();
    expect(verifierStructure(fichier)).toEqual([]);
    expect(verifierComptes(fichier)).toEqual([]);

    const sansTable = { ...fichier, tables: fichier.tables.filter((s) => s.name !== 'PROFIL') };
    expect(verifierStructure(sansTable).join(' ')).toContain('PROFIL');

    const tableInconnue = { ...fichier, tables: [...fichier.tables, { name: 'INCONNUE', rows: [] }] };
    expect(verifierStructure(tableInconnue).join(' ')).toContain('INCONNUE');

    const colonneInconnue = JSON.parse(JSON.stringify(fichier));
    colonneInconnue.tables.find((s) => s.name === 'REGION').rows[0].HORS_SCHEMAS = 1;
    expect(verifierStructure(colonneInconnue).join(' ')).toContain('HORS_SCHEMAS');

    const mauvaisCompte = { ...fichier, counts: { ...fichier.counts, REGION: 9 } };
    expect(verifierComptes(mauvaisCompte).join(' ')).toContain('REGION');
    expect(verifierComptes({ ...fichier, counts: undefined }).join(' ')).toContain('counts');
  });

  it('P6 : un fichier est lu puis refusé dès qu il change', () => {
    const valide = ecrireFichier('valide.json', { ...fichierDeTest(), sha256: calculerSomme(fichierDeTest()) });
    const lecture = lireFichierBackup(valide);
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.ok).toBe(true);

    // Une ligne modifiée sans recalcul de la somme.
    const touche = JSON.parse(readFileSync(valide, 'utf8'));
    touche.tables.find((s) => s.name === 'REGION').rows[0].NAME_REGION = 'Modifiee';
    const cheminTouche = ecrireFichier('touche.json', touche);
    const lectureTouche = lireFichierBackup(cheminTouche);
    expect(lectureTouche.ok).toBe(false);
    expect(lectureTouche.erreurs.join(' ')).toContain('Somme de contrôle SHA-256 incorrecte');

    // Même contenu, somme recalculée : la somme seule ne suffit pas à valider
    // le format.
    const mauvaisFormat = JSON.parse(readFileSync(valide, 'utf8'));
    mauvaisFormat.format = 'sigbd-mongo-archive';
    delete mauvaisFormat.sha256;
    const lectureFormat = lireFichierBackup(ecrireFichier('format.json', { ...mauvaisFormat, sha256: calculerSomme(mauvaisFormat) }));
    expect(lectureFormat.ok).toBe(false);
    expect(lectureFormat.erreurs.join(' ')).toContain('Format inconnu');

    const lectureVersion = lireFichierBackup(
      ecrireFichier('version.json', { ...fichierDeTest(), version: 99, sha256: calculerSomme({ ...fichierDeTest(), version: 99 }) })
    );
    expect(lectureVersion.ok).toBe(false);
    expect(lectureVersion.erreurs.join(' ')).toContain('Version inconnue');

    expect(lireFichierBackup(ecrireFichier('casse.json', '{ pas du json')).ok).toBe(false);
    expect(lireFichierBackup(join(TEMP_DIR, 'absent.json')).ok).toBe(false);
  });

  it('P7 : les arguments sont analysés des deux côtés', () => {
    expect(analyserArgsBackup([])).toEqual({ output: null, erreurs: [] });
    expect(analyserArgsBackup(['--output', 'x.json'])).toEqual({ output: 'x.json', erreurs: [] });
    expect(analyserArgsBackup(['--output']).erreurs.join(' ')).toContain('fichier attendu');
    expect(analyserArgsBackup(['--foo']).erreurs.join(' ')).toContain('Option inconnue');

    expect(analyserArgsRestore(['sauvegarde.json'])).toEqual({
      apply: false,
      fichier: 'sauvegarde.json',
      erreurs: [],
    });
    expect(analyserArgsRestore(['sauvegarde.json', '--apply'])).toEqual({
      apply: true,
      fichier: 'sauvegarde.json',
      erreurs: [],
    });
    expect(analyserArgsRestore(['--apply']).erreurs.join(' ')).toContain('Fichier de sauvegarde attendu');
    expect(analyserArgsRestore(['a.json', 'b.json']).erreurs.join(' ')).toContain('Argument inattendu');
    expect(analyserArgsRestore(['a.json', '--yes']).erreurs.join(' ')).toContain('Option inconnue');
  });

  it('P8 : les refus purs ne dépendent d aucune base', () => {
    expect(messageRefusProduction('production', false)).toContain('production');
    expect(messageRefusProduction('production', true)).toBeNull();
    expect(messageRefusProduction('test', false)).toBeNull();
    expect(messageRefusProduction('development', false)).toBeNull();

    expect(messageCibleNonVide([])).toBeNull();
    expect(messageCibleNonVide(null)).toBeNull();
    expect(messageCibleNonVide(['REGION', 'SAISIE'])).toContain('REGION, SAISIE');
    expect(messageCibleNonVide(['REGION'])).toContain('non vide');

    expect(messageRefusFichier([])).toBeNull();
    expect(messageRefusFichier(['Somme de contrôle incorrecte'])).toContain('- Somme de contrôle incorrecte');
  });

  it("P9 : id maximal, valeurs à lier et refus d'un fichier invalide en production", () => {
    expect(maxIdSection(null)).toBeNull();
    expect(maxIdSection({ name: 'REGION', rows: [] })).toBeNull();
    expect(maxIdSection({ name: 'REGION', rows: [{ ID: 3 }, { ID: 12 }, { ID: 7 }] })).toBe(12);
    expect(maxIdSection({ name: 'X', rows: [{ ID: 'abc' }] })).toBeNull();

    expect(valeurPourBind(null, 'date', 'REGION')).toBeNull();
    expect(valeurPourBind(undefined, 'scalaire', 'REGION')).toBeNull();
    const date = valeurPourBind('2026-05-06T07:08:09.010Z', 'date', 'PERIODE');
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe('2026-05-06T07:08:09.010Z');
    expect(() => valeurPourBind('pas une date', 'date', 'PERIODE')).toThrow(/Date invalide/);
    expect(valeurPourBind({ a: 1 }, 'json', 'SAISIE')).toBe('{"a":1}');
    expect(valeurPourBind('{"a":1}', 'json', 'SAISIE')).toBe('{"a":1}');
    expect(valeurPourBind('Analamanga', 'scalaire', 'REGION')).toBe('Analamanga');

    // Un fichier valide reste refusé en production sans --apply explicite.
    const valide = ecrireFichier('production.json', {
      ...fichierDeTest(),
      sha256: calculerSomme(fichierDeTest()),
    });
    const refus = runScript('src/scripts/restore-oracle.js', [valide], { NODE_ENV: 'production' });
    expect(refus.status).toBe(1);
    expect(refus.stderr + refus.stdout).toContain('production');
    expect(refus.stderr + refus.stdout).not.toContain('Base cible');
  });
});

// ---------------------------------------------------------------------------
// Intégration — sigbd_test uniquement, sauf si ORACLE_TEST_* est absent
// ---------------------------------------------------------------------------

const config = loadConfig();
const AVANT = {
  CORE_STORE: config.CORE_STORE,
  REFERENCE_STORE: config.REFERENCE_STORE,
  AUDIT_STORE: config.AUDIT_STORE,
};

async function compterTables() {
  const db = await getKnex();
  const comptes = {};
  for (const definition of TABLES) {
    const resultat = await db.raw(`SELECT COUNT(*) AS N FROM ${definition.nom}`);
    const lignes = resultat.rows || resultat;
    comptes[definition.nom] = Number(lignes[0].N ?? lignes[0].n ?? 0);
  }
  return comptes;
}

// Toutes les lignes normalisées (mêmes règles que le fichier de sauvegarde).
async function lireTout() {
  const db = await getKnex();
  const sections = [];
  for (const definition of TABLES) {
    const colonnes = definition.colonnes.map((colonne) => colonne.nom).join(', ');
    const pk = definition.pk.join(', ');
    const resultat = await db.raw(`SELECT ${colonnes} FROM ${definition.nom} ORDER BY ${pk}`);
    const lignes = resultat.rows || resultat;
    sections.push({
      name: definition.nom,
      rows: lignes.map((ligne) => normaliserLigne(ligne, definition)),
    });
  }
  return sections;
}

// Vidage dans l'ordre inverse des clés étrangères.
async function nettoyer() {
  const db = await getKnex();
  for (const definition of [...TABLES].reverse()) {
    await db.raw(`DELETE FROM ${definition.nom}`);
  }
}

function dernierFichier() {
  const fichiers = readdirSync(TEMP_DIR)
    .filter((fichier) => fichier.endsWith('.json') && fichier.startsWith('sigbd-oracle-'))
    .map((fichier) => ({ fichier, temps: statSync(join(TEMP_DIR, fichier)).mtimeMs }))
    .sort((a, b) => b.temps - a.temps);
  expect(fichiers.length).toBeGreaterThan(0);
  return join(TEMP_DIR, fichiers[0].fichier);
}

describe.skipIf(!oracleConfiguree)(
  'Sauvegarde et restauration Oracle (sigbd_test)',
  { timeout: 120000 },
  () => {
    let fichierSauvegarde;
    let source;

    beforeAll(async () => {
      expect(process.env.NODE_ENV).toBe('test');
      // Le test ne cible que l'utilisateur de test (jamais ORACLE_USER).
      config.CORE_STORE = 'oracle';
      config.REFERENCE_STORE = 'oracle';
      config.AUDIT_STORE = 'oracle';

      // Schéma appliqué seulement si une table manque : jamais de --reset.
      const db = await getKnex();
      const resultat = await db.raw(
        `SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN (${TABLES.map((definition) => `'${definition.nom}'`).join(', ')})`
      );
      const lignes = resultat.rows || resultat;
      if (Number(lignes[0].N) < TABLES.length) {
        expect(await mainSchema([])).toBe(0);
      }

      await nettoyer();
      expect((await executerSeedDemo({ yes: true, purgeAudit: true })).code).toBe(0);

      // REMARQUE et JOURNAL_AUDIT ne sont pas remplis par le seed : une
      // remarque et deux entrées d'audit couvrent aussi ces deux tables.
      const client = (await getUtilisateurRepository().listerParRole('client'))[0];
      expect(client).toBeTruthy();
      await getRemarqueRepository().creer({
        authorId: client._id,
        context: 'module:RA',
        text: 'Remarque de la sauvegarde Oracle',
        state: 'nouvelle',
      });
      await getAuditRepository().ajouter({
        userRef: '104562',
        action: 'login',
        objet: 'login',
        ip: '::1',
      });
      await getAuditRepository().ajouter({
        userRef: String(client._id),
        action: 'saisie_create',
        objet: `saisie:${client._id}`,
        ip: '::1',
      });
    }, 120000);

    afterAll(async () => {
      try {
        await nettoyer();
      } finally {
        try {
          await closeOracle();
        } catch {
          /* pool déjà fermé */
        }
        Object.assign(config, AVANT);
      }
    }, 120000);

    it("O1 : la sauvegarde couvre les 13 tables, sans identifiant ni mot de passe", async () => {
      const compteurs = await compterTables();
      for (const definition of TABLES) {
        expect(compteurs[definition.nom], definition.nom).toBeGreaterThan(0);
      }

      const resultat = runScript('src/scripts/backup-oracle.js');
      expect(resultat.status).toBe(0);
      expect(resultat.stdout).toContain('Sauvegarde créée');
      expect(resultat.stdout).not.toContain(process.env.ORACLE_TEST_PASSWORD);

      fichierSauvegarde = dernierFichier();
      const brut = readFileSync(fichierSauvegarde, 'utf8');
      expect(brut).not.toContain(process.env.ORACLE_TEST_PASSWORD);
      expect(brut).not.toContain(process.env.ORACLE_TEST_USER);

      const lecture = lireFichierBackup(fichierSauvegarde);
      expect(lecture.erreurs).toEqual([]);
      expect(lecture.fichier.service).toBe(nomServiceOracle(config));
      expect(lecture.fichier.counts).toEqual(compteurs);

      source = await lireTout();
      expect(source.map((section) => section.rows.length)).toEqual(
        TABLES.map((definition) => compteurs[definition.nom])
      );
    }, 120000);

    it('O2 : la vérification du fichier confirme somme et comptes', () => {
      const resultat = runScript('src/scripts/verify-backup-oracle.js', [fichierSauvegarde]);
      expect(resultat.status).toBe(0);
      expect(resultat.stdout).toContain('Sauvegarde vérifiée');
      for (const definition of TABLES) {
        expect(resultat.stdout).toContain(`${definition.nom} |`);
      }
    });

    it("O3 : la restauration est refusée sur une base non vide", () => {
      const resultat = runScript('src/scripts/restore-oracle.js', [fichierSauvegarde]);
      expect(resultat.status).toBe(1);
      expect(resultat.stderr).toContain('Cible Oracle non vide');
      expect(resultat.stderr).not.toContain('DRY-RUN');
    });

    it('O4 : en dry-run sur base vidée, rien n est écrit', async () => {
      await nettoyer();
      const resultat = runScript('src/scripts/restore-oracle.js', [fichierSauvegarde]);
      expect(resultat.status).toBe(0);
      expect(resultat.stdout).toContain('DRY-RUN');
      expect(resultat.stdout).toContain('Base cible : vide');
      const comptes = await compterTables();
      for (const definition of TABLES) {
        expect(comptes[definition.nom], definition.nom).toBe(0);
      }
    });

    it('O5 : --apply restaure et chaque table est identique à la sauvegarde', async () => {
      const resultat = runScript('src/scripts/restore-oracle.js', [fichierSauvegarde, '--apply']);
      expect(resultat.status).toBe(0);
      expect(resultat.stdout).toContain('Restauration terminée');
      expect(resultat.stdout).toContain('Identités ré-alignées');

      const restaure = await lireTout();
      for (const definition of TABLES) {
        const attendu = source.find((section) => section.name === definition.nom);
        const obtenu = restaure.find((section) => section.name === definition.nom);
        expect(obtenu.rows, definition.nom).toEqual(attendu.rows);
      }
    }, 120000);

    it("O6 : un nouvel insert après restauration ne heurte aucun id", async () => {
      const db = await getKnex();
      const ids = source.find((section) => section.name === 'REGION').rows.map((ligne) => ligne.ID);
      const maxId = Math.max(...ids);
      await db.raw(`INSERT INTO REGION (NAME_REGION) VALUES (?)`, ['Region apres restauration']);
      const resultat = await db.raw(`SELECT ID FROM REGION WHERE NAME_REGION = ?`, [
        'Region apres restauration',
      ]);
      const lignes = resultat.rows || resultat;
      expect(Number(lignes[0].ID)).toBeGreaterThan(maxId);
      await db.raw(`DELETE FROM REGION WHERE NAME_REGION = ?`, ['Region apres restauration']);
      expect((await compterTables()).REGION).toBe(ids.length);
    });

    it('O7 : une seconde restauration est refusée sur base redevenue pleine', () => {
      const resultat = runScript('src/scripts/restore-oracle.js', [fichierSauvegarde, '--apply']);
      expect(resultat.status).toBe(1);
      expect(resultat.stderr).toContain('Cible Oracle non vide');
    });

    it('O8 : un fichier modifié sans recalcul de la somme est refusé', async () => {
      const touche = JSON.parse(readFileSync(fichierSauvegarde, 'utf8'));
      touche.tables.find((section) => section.name === 'REGION').rows[0].NAME_REGION = 'Region modifiee';
      const chemin = ecrireFichier('modifie.json', touche);
      const resultat = runScript('src/scripts/restore-oracle.js', [chemin, '--apply']);
      expect(resultat.status).toBe(1);
      expect(resultat.stderr).toContain('Somme de contrôle SHA-256 incorrecte');
      // Aucune écriture : les comptes sont inchangés.
      const comptes = await compterTables();
      expect(comptes.REGION).toBe(source.find((s) => s.name === 'REGION').rows.length);
    });

    it("O9 : une erreur en cours de restauration annule tout, sans retry", async () => {
      await nettoyer();
      const casse = JSON.parse(readFileSync(fichierSauvegarde, 'utf8'));
      casse.tables.find((section) => section.name === 'STRUCTURE').rows[0].TYPE_STRUCTURE = 'INCONNUE';
      casse.sha256 = calculerSomme(casse); // somme valable : le refus vient des données
      const chemin = ecrireFichier('invalide.json', casse);

      const resultat = runScript('src/scripts/restore-oracle.js', [chemin, '--apply']);
      expect(resultat.status).toBe(1);
      expect(resultat.stderr).toContain('Transaction annulée');
      expect(resultat.stderr).toContain('aucune donnée écrite');

      const comptes = await compterTables();
      for (const definition of TABLES) {
        expect(comptes[definition.nom], definition.nom).toBe(0);
      }
    }, 120000);
  }
);

afterAll(() => {
  if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
});

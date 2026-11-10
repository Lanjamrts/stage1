"use strict";

// Étape 42 : migration des données MongoDB → Oracle.
// - Fonctions pures testées sans base (remappage des références, orphelins,
//   doublons, comptes, analyse des arguments).
// - Contrat { conserverDates: true } des neuf méthodes Oracle modifiées, et
//   parité du retour de insererPlusieurs sans option (S11).
// - Intégration sigbd_corecheck (source, lecture seule) → sigbd_test (cible
//   vide) : dry-run, refus des orphelins et des doublons sans aucune écriture,
//   --apply avec vérification ligne à ligne, puis refus d'une seconde
//   migration sur cible non vide. La source est comparée en entier avant et
//   après : MongoDB n'est jamais écrit.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';

import { loadConfig } from '../src/config.js';
import { getKnex } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { ouvrirBase, fermerBase, nomOracle } from '../src/scripts/connexion.js';
import {
  ENTITES,
  remplacerRef,
  remplacerRefsStructure,
  remplacerRefsUtilisateur,
  remplacerRefsSaisie,
  remplacerRefsRemarque,
  remapperAuditEntree,
  detecterOrphelins,
  detecterDoublons,
  compterSource,
  nomBaseSource,
  parseArgs,
  lireSource,
  compterCible,
  executerMigration,
} from '../src/scripts/migrer-mongo-oracle.js';
import { executerSeedDemo } from '../src/seed/demo.js';

import Profil from '../src/models/Profil.js';
import Region from '../src/models/Region.js';
import Structure from '../src/models/Structure.js';
import Periode from '../src/models/Periode.js';
import ModuleSigbd from '../src/models/Module.js';
import Referentiel from '../src/models/Referentiel.js';
import Utilisateur from '../src/models/Utilisateur.js';
import Saisie from '../src/models/Saisie.js';
import Remarque from '../src/models/Remarque.js';
import JournalAudit from '../src/models/JournalAudit.js';

import * as profilOracle from '../src/repositories/profilOracle.js';
import * as regionOracle from '../src/repositories/regionOracle.js';
import * as structureOracle from '../src/repositories/structureOracle.js';
import * as periodeOracle from '../src/repositories/periodeOracle.js';
import * as moduleOracle from '../src/repositories/moduleOracle.js';
import * as referentielOracle from '../src/repositories/referentielOracle.js';
import * as utilisateurOracle from '../src/repositories/utilisateurOracle.js';
import * as saisieOracle from '../src/repositories/saisieOracle.js';
import * as remarqueOracle from '../src/repositories/remarqueOracle.js';
import * as auditOracle from '../src/repositories/auditOracle.js';

const URI_CORECHECK = 'mongodb://127.0.0.1:27017/sigbd_corecheck';
const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const config = loadConfig();
const AVANT = {
  CORE_STORE: config.CORE_STORE,
  REFERENCE_STORE: config.REFERENCE_STORE,
  AUDIT_STORE: config.AUDIT_STORE,
  MONGODB_URI: config.MONGODB_URI,
};

// Les 13 tables de la migration.
const TABLES = [
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
];

// Nettoyage de la cible Oracle dans l'ordre des clés étrangères.
async function nettoyerOracle() {
  await auditOracle.supprimerTout();
  await remarqueOracle.supprimerTout();
  await saisieOracle.supprimerTout();
  await utilisateurOracle.supprimerTout();
  await moduleOracle.supprimerTout();
  await periodeOracle.supprimerTout();
  await structureOracle.supprimerTout();
  await regionOracle.supprimerTout();
  await profilOracle.supprimerTout();
  await referentielOracle.supprimerTout();
}

async function nettoyerMongo() {
  await Remarque.deleteMany({});
  await Saisie.deleteMany({});
  await Utilisateur.deleteMany({});
  await ModuleSigbd.deleteMany({});
  await Periode.deleteMany({});
  await Structure.deleteMany({});
  await Region.deleteMany({});
  await Profil.deleteMany({});
  await Referentiel.deleteMany({});
  await JournalAudit.deleteMany({});
}

// Schéma appliqué seulement si une table manque : jamais de --reset.
async function appliquerSchemaSiManquant() {
  const db = await getKnex();
  const resultat = await db.raw(
    `SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN (${TABLES.map((t) => `'${t}'`).join(', ')})`
  );
  const lignes = resultat.rows || resultat;
  if (Number(lignes[0].N) < TABLES.length) {
    expect(await mainSchema([])).toBe(0);
  }
}

// Sorties capturées : le script parle, les tests assertent dessus.
let sorties;

function installerSorties() {
  sorties = { log: [], error: [] };
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    sorties.log.push(args.map((a) => String(a)).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    sorties.error.push(args.map((a) => String(a)).join(' '));
  });
}

// ---------------------------------------------------------------------------
// Jeux de données pour les fonctions pures
// ---------------------------------------------------------------------------

function tablesDeTest() {
  return {
    regions: new Map([['r1', '100']]),
    structures: new Map([['s1', '10']]),
    periodes: new Map([['p1', '40']]),
    modules: new Map([['m1', '20']]),
    utilisateurs: new Map([['u1', '30']]),
    saisies: new Map([['e1', '50']]),
    remarques: new Map(),
  };
}

// Graphe minimal cohérent : aucun orphelin, aucun doublon.
function sourcePropre() {
  return {
    profils: [{ _id: 'pr1', code: 'client', label: 'Client' }],
    regions: [{ _id: 'r1', name: 'Analamanga' }],
    structures: [
      { _id: 's1', code: 'SRB-ANL', regionId: 'r1' },
      { _id: 's2', code: 'SSEBF' },
    ],
    periodes: [{ _id: 'p1', periodicity: 'monthly', start: '2026-10-01T00:00:00.000Z' }],
    modules: [{ _id: 'm1', code: 'RA', allowedPeriodicities: ['monthly'], structureTypes: ['SRB'] }],
    referentiels: [{ type: 'std', value: 'A' }],
    utilisateurs: [{ _id: 'u1', im: '104562', structureId: 's1' }],
    saisies: [
      {
        _id: 'e1',
        structureId: 's1',
        moduleId: 'm1',
        periodeId: 'p1',
        authorId: 'u1',
        validations: [{ actorId: 'u1' }, { actorId: null }],
      },
      { _id: 'e2', structureId: 's1', moduleId: 'm1', authorId: 'u1', validations: [] },
    ],
    remarques: [{ _id: 'k1', authorId: 'u1' }],
    audit: [],
  };
}

function sourceVide() {
  return {
    profils: [],
    regions: [],
    structures: [],
    periodes: [],
    modules: [],
    referentiels: [],
    utilisateurs: [],
    saisies: [],
    remarques: [],
    audit: [],
  };
}

// ---------------------------------------------------------------------------
// (1) Fonctions pures — sans base
// ---------------------------------------------------------------------------

describe('Migration MongoDB → Oracle — fonctions pures', () => {
  it('P1 : ENTITES décrit les 13 entités dans le bon ordre', () => {
    expect(ENTITES.map((e) => e.cle)).toEqual([
      'profils',
      'regions',
      'structures',
      'periodes',
      'modules',
      'periodicites',
      'typesStructure',
      'referentiels',
      'utilisateurs',
      'saisies',
      'validations',
      'remarques',
      'journalAudit',
    ]);
    for (const entite of ENTITES) {
      expect(entite.table).toBe(entite.table.toUpperCase());
      expect(entite.libelle).toBeTruthy();
    }
  });

  it('P2 : remplacerRef remplace une clé connue et conserve une clé inconnue', () => {
    const table = new Map([['ancien', 'nouveau']]);
    expect(remplacerRef('ancien', table)).toBe('nouveau');
    expect(remplacerRef('inconnu', table)).toBe('inconnu');
    expect(remplacerRef(undefined, table)).toBeUndefined();
    expect(remplacerRef(null, table)).toBeNull();
    expect(remplacerRef(7, new Map([['7', 'soixante-dix']]))).toBe('soixante-dix');
  });

  it('P3 : remplacerRefsStructure ne touche pas une région absente ou nulle', () => {
    const tables = tablesDeTest();
    expect(remplacerRefsStructure({ code: 'A', regionId: 'r1' }, tables).regionId).toBe('100');
    expect(remplacerRefsStructure({ code: 'B', regionId: 'rX' }, tables).regionId).toBe('rX');
    expect(remplacerRefsStructure({ code: 'C' }, tables).regionId).toBeUndefined();
    expect(remplacerRefsStructure({ code: 'D', regionId: null }, tables).regionId).toBeNull();
  });

  it('P4 : remplacerRefsUtilisateur remplace la structure', () => {
    const tables = tablesDeTest();
    expect(remplacerRefsUtilisateur({ im: '1', structureId: 's1' }, tables).structureId).toBe('10');
    expect(remplacerRefsUtilisateur({ im: '2', structureId: 'sX' }, tables).structureId).toBe('sX');
  });

  it('P5 : remplacerRefsSaisie remplace les refs et les acteurs, sans muter', () => {
    const tables = tablesDeTest();
    const doc = {
      structureId: 's1',
      moduleId: 'm1',
      authorId: 'u1',
      periodeId: 'p1',
      validations: [{ actorId: 'u1' }, { actorId: null }, { actorId: 'uX' }, {}],
    };
    const sortie = remplacerRefsSaisie(doc, tables);
    expect(sortie.structureId).toBe('10');
    expect(sortie.moduleId).toBe('20');
    expect(sortie.authorId).toBe('30');
    expect(sortie.periodeId).toBe('40');
    expect(sortie.validations.map((v) => v.actorId)).toEqual(['30', null, 'uX', undefined]);
    expect(doc.structureId).toBe('s1');
    expect(doc.validations[0].actorId).toBe('u1');
  });

  it('P6 : remplacerRefsSaisie conserve une période absente ou nulle', () => {
    const tables = tablesDeTest();
    const sansPeriode = remplacerRefsSaisie(
      { structureId: 's1', moduleId: 'm1', authorId: 'u1' },
      tables
    );
    expect('periodeId' in sansPeriode).toBe(false);
    expect(sansPeriode.validations).toBeUndefined();

    const periodeNulle = remplacerRefsSaisie(
      { structureId: 's1', moduleId: 'm1', authorId: 'u1', periodeId: null },
      tables
    );
    expect(periodeNulle.periodeId).toBeNull();
  });

  it('P7 : remplacerRefsRemarque remplace le auteur', () => {
    const tables = tablesDeTest();
    expect(remplacerRefsRemarque({ authorId: 'u1' }, tables).authorId).toBe('30');
    expect(remplacerRefsRemarque({ authorId: 'uX' }, tables).authorId).toBe('uX');
  });

  it('P8 : remapperAuditEntree remappe seulement les ids connus', () => {
    const tables = tablesDeTest();

    const connu = remapperAuditEntree(
      { userId: 'u1', action: 'a', object: 'saisie:e1', ip: '1.1.1.1' },
      tables
    );
    expect(connu.remplacee).toBe(true);
    expect(connu.entree.userId).toBe('30');
    expect(connu.entree.object).toBe('saisie:50');

    const im = remapperAuditEntree(
      { userId: '104562', action: 'a', object: 'connexion', ip: '1.1.1.1' },
      tables
    );
    expect(im.remplacee).toBe(false);
    expect(im.entree.userId).toBe('104562');
    expect(im.entree.object).toBe('connexion');

    const unknown = remapperAuditEntree(
      { userId: 'unknown', action: 'a', object: 'utilisateur:u1', ip: '1.1.1.1' },
      tables
    );
    expect(unknown.remplacee).toBe(true);
    expect(unknown.entree.userId).toBe('unknown');
    expect(unknown.entree.object).toBe('utilisateur:30');

    const saisieInconnue = remapperAuditEntree(
      { userId: 'zz', action: 'a', object: 'saisie:eX', ip: '1.1.1.1' },
      tables
    );
    expect(saisieInconnue.remplacee).toBe(false);
    expect(saisieInconnue.entree.object).toBe('saisie:eX');

    const autrePrefixe = remapperAuditEntree(
      { userId: 'zz', action: 'a', object: 'autre:rien', ip: '1.1.1.1' },
      tables
    );
    expect(autrePrefixe.remplacee).toBe(false);
    expect(autrePrefixe.entree.object).toBe('autre:rien');

    const sansUserId = remapperAuditEntree(
      { userId: null, action: 'a', object: 'connexion', ip: '1.1.1.1' },
      tables
    );
    expect(sansUserId.remplacee).toBe(false);
    expect(sansUserId.entree.userId).toBeNull();

    const entree = { userId: 'u1', action: 'a', object: 'saisie:e1', ip: '1.1.1.1' };
    remapperAuditEntree(entree, tables);
    expect(entree.userId).toBe('u1');
    expect(entree.object).toBe('saisie:e1');
  });

  it('P9 : detecterOrphelins est vide sur un graphe cohérent', () => {
    expect(detecterOrphelins(sourcePropre())).toEqual([]);
  });

  it('P10 : detecterOrphelins repère chaque référence absente', () => {
    const structureOrpheline = sourcePropre();
    structureOrpheline.structures.push({ _id: 's3', regionId: 'rX' });
    expect(detecterOrphelins(structureOrpheline)).toEqual([
      '1 structure(s) orpheline(s) : region absente de la source',
    ]);

    const utilisateurOrphelin = sourcePropre();
    utilisateurOrphelin.utilisateurs.push({ _id: 'u2', im: '999999', structureId: 'sX' });
    expect(detecterOrphelins(utilisateurOrphelin)).toEqual([
      '1 utilisateur(s) orphelin(s) : structure absente de la source',
    ]);

    const saisiesOrphelines = sourcePropre();
    saisiesOrphelines.saisies.push({
      _id: 'e3',
      structureId: 'sX',
      moduleId: 'mX',
      periodeId: 'pX',
      authorId: 'uX',
      validations: [{ actorId: 'uX' }],
    });
    expect(detecterOrphelins(saisiesOrphelines)).toEqual([
      '1 saisie(s) orpheline(s) : reference structure absente de la source',
      '1 saisie(s) orpheline(s) : reference module absente de la source',
      '1 saisie(s) orpheline(s) : reference periode absente de la source',
      '1 saisie(s) orpheline(s) : reference auteur absente de la source',
      '1 validation(s) orpheline(s) : acteur absent de la source',
    ]);

    const remarqueOrpheline = sourcePropre();
    remarqueOrpheline.remarques.push({ _id: 'k2', authorId: 'uX' });
    expect(detecterOrphelins(remarqueOrpheline)).toEqual([
      '1 remarque(s) orpheline(s) : auteur absent de la source',
    ]);
  });

  it('P11 : detecterOrphelins ignore les références nules ou absentes', () => {
    const source = sourcePropre();
    source.structures.push({ _id: 's4', code: 'X', regionId: null });
    source.saisies.push({ _id: 'e4', structureId: 's1', moduleId: 'm1', authorId: 'u1', validations: [{ actorId: null }] });
    expect(detecterOrphelins(source)).toEqual([]);
  });

  it('P12 : detecterDoublons est vide sur un graphe cohérent', () => {
    expect(detecterDoublons(sourcePropre())).toEqual([]);
  });

  it('P13 : detecterDoublons repère les clés uniques de la cible', () => {
    const profil = sourcePropre();
    profil.profils.push({ _id: 'pr2', code: 'client' });
    expect(detecterDoublons(profil)).toEqual(['Profil en double : code "client" (2 occurrences)']);

    const region = sourcePropre();
    region.regions.push({ _id: 'r2', name: 'Analamanga' });
    expect(detecterDoublons(region)).toEqual(['Region en double : name "Analamanga" (2 occurrences)']);

    const structure = sourcePropre();
    structure.structures.push({ _id: 's9', code: 'SRB-ANL' });
    expect(detecterDoublons(structure)).toEqual(['Structure en double : code "SRB-ANL" (2 occurrences)']);

    const utilisateur = sourcePropre();
    utilisateur.utilisateurs.push({ _id: 'u9', im: '104562' });
    expect(detecterDoublons(utilisateur)).toEqual(['Utilisateur en double : IM "104562" (2 occurrences)']);

    const module = sourcePropre();
    module.modules.push({ _id: 'm9', code: 'RA' });
    expect(detecterDoublons(module)).toEqual(['Module en double : code "RA" (2 occurrences)']);

    const referentiel = sourcePropre();
    referentiel.referentiels.push({ type: 'std', value: 'A' });
    expect(detecterDoublons(referentiel)).toEqual([
      'Referentiel en double : type/valeur "std" / "A" (2 occurrences)',
    ]);

    const periode = sourcePropre();
    periode.periodes.push({ _id: 'p9', periodicity: 'monthly', start: '2026-10-01T00:00:00.000Z' });
    expect(detecterDoublons(periode)).toEqual([
      'Periode en double : periodicity "monthly" start 2026-10-01 (2 occurrences)',
    ]);

    const saisie = sourcePropre();
    saisie.saisies.push({ _id: 'e9', structureId: 's1', moduleId: 'm1', periodeId: 'p1' });
    expect(detecterDoublons(saisie)).toEqual([
      'Saisie en double : meme association structure/module/periode (2 occurrences)',
    ]);
  });

  it('P14 : les saisies sans période ne peuvent jamais être en doublon', () => {
    const source = sourcePropre();
    source.saisies.push({ _id: 'e8', structureId: 's1', moduleId: 'm1', authorId: 'u1' });
    expect(detecterDoublons(source)).toEqual([]);
  });

  it('P15 : detecterDoublons repère les doublons internes des modules', () => {
    const periodicites = sourcePropre();
    periodicites.modules[0].allowedPeriodicities = ['monthly', 'monthly'];
    expect(detecterDoublons(periodicites)).toEqual([
      'Module RA periodicites en double : "monthly" (2 occurrences)',
    ]);

    const types = sourcePropre();
    types.modules[0].structureTypes = ['SRB', 'SRB'];
    expect(detecterDoublons(types)).toEqual([
      'Module RA types structure en double : "SRB" (2 occurrences)',
    ]);
  });

  it('P16 : compterSource compte les 13 entités, y compris les tableaux enfants', () => {
    const comptes = compterSource(sourcePropre());
    expect(comptes).toEqual({
      profils: 1,
      regions: 1,
      structures: 2,
      periodes: 1,
      modules: 1,
      periodicites: 1,
      typesStructure: 1,
      referentiels: 1,
      utilisateurs: 1,
      saisies: 2,
      validations: 2,
      remarques: 1,
      journalAudit: 0,
    });
  });

  it('P17 : compterSource tolère les tableaux enfants absents', () => {
    const comptes = compterSource({ ...sourceVide(), modules: [{ code: 'X' }], saisies: [{ _id: 'e1' }] });
    expect(comptes.periodicites).toBe(0);
    expect(comptes.typesStructure).toBe(0);
    expect(comptes.validations).toBe(0);
    expect(comptes.saisies).toBe(1);
  });

  it('P18 : parseArgs ne connaît que --apply', () => {
    expect(parseArgs([])).toEqual({ apply: false, erreurs: [] });
    expect(parseArgs(['--apply'])).toEqual({ apply: true, erreurs: [] });
    expect(parseArgs(['--bogus'])).toEqual({ apply: false, erreurs: ['Option inconnue : --bogus'] });
    expect(parseArgs(['--apply', '--bogus']).apply).toBe(true);
    expect(parseArgs(['--apply', '--bogus']).erreurs).toEqual(['Option inconnue : --bogus']);
  });

  it("P19 : nomBaseSource ne montre que le nom de base, jamais d'identifiant", () => {
    expect(nomBaseSource({ MONGODB_URI: 'mongodb://127.0.0.1:27017/mondb' })).toBe('mondb');
    expect(nomBaseSource({ MONGODB_URI: 'mongodb://user:pass@127.0.0.1:27017/secret' })).toBe('secret');
    expect(nomBaseSource({ MONGODB_URI: 'mongodb://127.0.0.1:27017/' })).toBe('(inconnue)');
    expect(nomBaseSource({ MONGODB_URI: 'pas-une-url' })).toBe('(inconnue)');
  });
});

// ---------------------------------------------------------------------------
// (2) Contrat conserverDates — Oracle seul
// ---------------------------------------------------------------------------

describe.skipIf(!oracleConfiguree)('Migration — contrat conserverDates (sigbd_test)', { timeout: 120000 }, () => {
  const ANCIENNES = {
    createdAt: new Date('2020-01-02T03:04:05.000Z'),
    updatedAt: new Date('2020-06-07T08:09:10.000Z'),
  };

  const CIBLES = [
    ['PROFIL WHERE CODE = ?', ['CTRPROF']],
    ['REGION WHERE NAME_REGION = ?', ['Region contrat']],
    ['STRUCTURE WHERE CODE = ?', ['CTRSTR']],
    ['PERIODE WHERE LABEL = ?', ['Periode contrat']],
    ['MODULE_SIGBD WHERE CODE = ?', ['CTRMOD']],
    ['REFERENTIEL WHERE TYPE_REF = ? AND VALEUR = ?', ['std', 'Contrat std']],
    ['UTILISATEUR WHERE IM = ?', ['CTR0001']],
    ['SAISIE WHERE AUTEUR_ID = (SELECT ID FROM UTILISATEUR WHERE IM = ?)', ['CTR0001']],
    ['REMARQUE WHERE TEXTE = ?', ['Remarque contrat']],
  ];

  async function lireDates(requete, valeurs) {
    const db = await getKnex();
    const resultat = await db.raw(`SELECT CREATED_AT, UPDATED_AT FROM ${requete}`, valeurs);
    const lignes = resultat.rows || resultat;
    expect(lignes).toHaveLength(1);
    return {
      createdAt: new Date(lignes[0].CREATED_AT),
      updatedAt: new Date(lignes[0].UPDATED_AT),
    };
  }

  // Écrit les neuf entités modifiées (ordre des clés étrangères) et retourne
  // ce que chaque méthode a elle-même retourné.
  async function ecrireTout(options) {
    const dates = options.conserverDates ? ANCIENNES : {};

    await profilOracle.assurer(
      { code: 'CTRPROF', label: 'Profil contrat', ...dates },
      options
    );

    const regions = await regionOracle.insererPlusieurs(
      [{ name: 'Region contrat', ...dates }],
      options
    );

    const structures = await structureOracle.insererPlusieurs(
      [{ code: 'CTRSTR', label: 'Structure contrat', type: 'SRB', active: true, ...dates }],
      options
    );
    const structure = structures[0];

    const periodes = await periodeOracle.insererPlusieurs(
      [
        {
          label: 'Periode contrat',
          start: new Date('2026-01-01T00:00:00.000Z'),
          end: new Date('2026-01-31T00:00:00.000Z'),
          deadline: new Date('2026-02-05T00:00:00.000Z'),
          periodicity: 'monthly',
          ...dates,
        },
      ],
      options
    );
    const periode = periodes[0];

    const module = await moduleOracle.creer(
      {
        code: 'CTRMOD',
        label: 'Module contrat',
        periodicity: 'monthly',
        allowedPeriodicities: ['monthly'],
        kind: 'periodic',
        structureTypes: ['SRB'],
        version: 1,
        active: true,
        fields: { sections: [] },
        ...dates,
      },
      options
    );

    await referentielOracle.insererPlusieurs(
      [{ type: 'std', value: 'Contrat std', ...dates }],
      options
    );

    const utilisateur = await utilisateurOracle.creer(
      {
        im: 'CTR0001',
        nom: 'Contrat',
        prenom: 'Test',
        direction: 'DGBF',
        service: 'Service contrat',
        passwordHash: 'hash-de-test',
        role: 'client',
        status: 'actif',
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        structureId: structure._id,
        ...dates,
      },
      options
    );

    const resultatSaisie = await saisieOracle.insererPlusieurs(
      [
        {
          structureId: structure._id,
          moduleId: module._id,
          moduleVersion: 1,
          periodeId: periode._id,
          authorId: utilisateur._id,
          status: 'brouillon',
          values: { contrat: true },
          ...dates,
        },
      ],
      options
    );

    const remarque = await remarqueOracle.creer(
      {
        authorId: utilisateur._id,
        context: 'CTRMOD',
        text: 'Remarque contrat',
        state: 'nouvelle',
        ...dates,
      },
      options
    );

    return { regions, structures, periodes, module, utilisateur, resultatSaisie, remarque };
  }

  beforeAll(async () => {
    config.CORE_STORE = 'mongo';
    await appliquerSchemaSiManquant();
    await nettoyerOracle();
  });

  afterAll(async () => {
    await nettoyerOracle();
    await fermerBase();
    Object.assign(config, AVANT);
  });

  beforeEach(async () => {
    await nettoyerOracle();
  });

  it('C1 : sans option, le comportement est inchangé (S11 et dates par défaut)', async () => {
    const r = await ecrireTout({});

    // Retours inchangés : les tableaux existants restent des tableaux…
    expect(Array.isArray(r.regions)).toBe(true);
    expect(Array.isArray(r.structures)).toBe(true);
    expect(Array.isArray(r.periodes)).toBe(true);
    // …et insererPlusieurs des saisies continue de retourner undefined (S11).
    expect(r.resultatSaisie).toBeUndefined();

    // Les dates ne sont PAS conservées : valeurs par défaut SYSTIMESTAMP.
    for (const [requete, valeurs] of CIBLES) {
      const dates = await lireDates(requete, valeurs);
      expect(dates.createdAt.getTime()).not.toBe(ANCIENNES.createdAt.getTime());
      expect(dates.updatedAt.getTime()).not.toBe(ANCIENNES.updatedAt.getTime());
    }
  });

  it('C2 : avec { conserverDates: true }, les dates sont écrites telles quelles', async () => {
    const r = await ecrireTout({ conserverDates: true });

    // Retours inchangés sauf insererPlusieurs des saisies, qui livre les
    // lignes créées (les ids Oracle y sont) — nécessaire au remappage.
    expect(Array.isArray(r.regions)).toBe(true);
    expect(Array.isArray(r.structures)).toBe(true);
    expect(Array.isArray(r.periodes)).toBe(true);
    expect(r.module).toBeTruthy();
    expect(r.utilisateur).toBeTruthy();
    expect(r.remarque).toBeTruthy();
    expect(Array.isArray(r.resultatSaisie)).toBe(true);
    expect(r.resultatSaisie).toHaveLength(1);
    expect(r.resultatSaisie[0]._id).toBeTruthy();

    for (const [requete, valeurs] of CIBLES) {
      const dates = await lireDates(requete, valeurs);
      expect(dates.createdAt.getTime()).toBe(ANCIENNES.createdAt.getTime());
      expect(dates.updatedAt.getTime()).toBe(ANCIENNES.updatedAt.getTime());
    }
  });
});

// ---------------------------------------------------------------------------
// (3) Intégration MongoDB → Oracle
// ---------------------------------------------------------------------------

describe.skipIf(!oracleConfiguree)(
  'Migration MongoDB → Oracle (sigbd_corecheck → sigbd_test)',
  { timeout: 120000 },
  () => {
    beforeAll(async () => {
      installerSorties();

      config.CORE_STORE = 'mongo';
      config.REFERENCE_STORE = 'mongo';
      config.AUDIT_STORE = 'mongo';
      config.MONGODB_URI = URI_CORECHECK;
      expect(loadConfig().MONGODB_URI).toBe(URI_CORECHECK);
      expect(loadConfig().CORE_STORE).toBe('mongo');

      await appliquerSchemaSiManquant();
      await nettoyerOracle();

      await ouvrirBase();
      expect(mongoose.connection.readyState).toBe(1);
      expect(mongoose.connection.name).toBe('sigbd_corecheck');
      await nettoyerMongo();

      // Source de démonstration complète + remarques et journal d'audit.
      expect(await executerSeedDemo({ yes: true, purgeAudit: true })).toEqual({ code: 0 });

      const auteur = await Utilisateur.findOne({ im: '104562' }).lean();
      expect(auteur).toBeTruthy();
      const saisies = await Saisie.find().sort({ _id: 1 }).lean();
      expect(saisies.length).toBeGreaterThan(0);

      await Remarque.create({
        authorId: auteur._id,
        context: 'RA',
        text: 'Remarque de migration',
        state: 'nouvelle',
      });
      await Remarque.create({
        authorId: auteur._id,
        context: 'RH',
        text: 'Seconde remarque',
        state: 'en_cours',
      });

      const instant = (seconde) => new Date(Date.UTC(2026, 9, 10, 8, 0, seconde));
      await JournalAudit.create({
        userId: String(auteur._id),
        action: 'connexion.reussie',
        object: `utilisateur:${auteur._id}`,
        ip: '127.0.0.1',
        createdAt: instant(1),
      });
      await JournalAudit.create({
        userId: 'unknown',
        action: 'connexion.echouee',
        object: 'connexion',
        ip: '10.0.0.5',
        createdAt: instant(2),
      });
      await JournalAudit.create({
        userId: String(auteur._id),
        action: 'saisie.soumise',
        object: `saisie:${saisies[0]._id}`,
        ip: '127.0.0.1',
        createdAt: instant(3),
      });
      await JournalAudit.create({
        userId: '104562',
        action: 'export.csv',
        object: 'autre:rien',
        ip: '10.0.0.9',
        createdAt: instant(4),
      });
    });

    afterAll(async () => {
      await nettoyerOracle();
      await nettoyerMongo();
      await fermerBase();
      Object.assign(config, AVANT);
    });

    beforeEach(async () => {
      installerSorties();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function attendreCibleVide() {
      const comptes = await compterCible();
      for (const { cle } of ENTITES) expect(comptes[cle]).toBe(0);
    }

    it('M1 : dry-run affiche le plan et n’écrit rien', async () => {
      const resultat = await executerMigration({ apply: false });
      expect(resultat).toEqual({ code: 0, anomalies: [] });

      const journal = sorties.log.join('\n');
      expect(journal).toContain('Base source : sigbd_corecheck');
      expect(journal).toContain('Plan de migration MongoDB -> Oracle :');
      expect(journal).toContain('Anomalies : aucune.');
      expect(journal).toContain('DRY-RUN : aucune donnee ecrite.');

      // Aucun identifiant de connexion ni mot de passe dans le journal.
      expect(journal).not.toContain(config.ORACLE_TEST_PASSWORD);
      expect(journal).not.toContain(config.ORACLE_PASSWORD);
      const affichee = nomOracle(config);
      for (const identifiant of [
        config.ORACLE_USER,
        config.ORACLE_PASSWORD,
        config.ORACLE_TEST_USER,
        config.ORACLE_TEST_PASSWORD,
      ]) {
        if (identifiant) expect(affichee).not.toContain(identifiant);
      }

      await attendreCibleVide();
    });

    it('M2 : une référence orpheline est refusée sans rien écrire', async () => {
      const structure = await Structure.create({
        code: 'ORPHT',
        label: 'Structure orpheline',
        type: 'SRB',
        regionId: new mongoose.Types.ObjectId(),
      });
      try {
        const resultat = await executerMigration({ apply: true });
        expect(resultat.code).toBe(1);
        expect(resultat.anomalies).toEqual([
          '1 structure(s) orpheline(s) : region absente de la source',
        ]);
        expect(sorties.log.join('\n')).toContain(
          '1 structure(s) orpheline(s) : region absente de la source'
        );
        await attendreCibleVide();
      } finally {
        await Structure.deleteOne({ code: 'ORPHT' });
      }
    });

    it('M3 : un doublon interne est refusé sans rien écrire', async () => {
      await ModuleSigbd.create({
        code: 'DOUP',
        label: 'Module doublon',
        periodicity: 'monthly',
        allowedPeriodicities: ['monthly', 'monthly'],
        kind: 'periodic',
        structureTypes: ['SRB'],
        version: 1,
        active: true,
        fields: [{ key: 'valeur', type: 'text', label: 'Valeur' }],
      });
      try {
        const resultat = await executerMigration({ apply: true });
        expect(resultat.code).toBe(1);
        expect(resultat.anomalies).toEqual([
          'Module DOUP periodicites en double : "monthly" (2 occurrences)',
        ]);
        expect(sorties.log.join('\n')).toContain(
          'Module DOUP periodicites en double : "monthly" (2 occurrences)'
        );
        await attendreCibleVide();
      } finally {
        await ModuleSigbd.deleteOne({ code: 'DOUP' });
      }
    });

    it('M4 : --apply migre, vérifie ligne à ligne et ne touche pas la source', async () => {
      const sourceAvant = await lireSource();
      const comptesAvant = compterSource(sourceAvant);

      const resultat = await executerMigration({ apply: true });
      expect(resultat.code).toBe(0);
      expect(resultat.ecarts).toEqual([]);

      const journal = sorties.log.join('\n');
      expect(journal).toContain("Journal d'audit : 2 entree(s) remappee(s), 2 conservee(s) telles quelles.");
      expect(journal).toContain('Verification :');
      expect(journal).toContain('Verification terminee : aucun ecart.');

      // Cible = source, entité par entité.
      const comptesCible = await compterCible();
      expect(comptesCible).toEqual(comptesAvant);

      // MongoDB n'a été ni écrit ni supprimé : la source est identique.
      expect(await lireSource()).toEqual(sourceAvant);

      // Quelques contrôles ciblés au-delà de la vérification du script.
      expect(await utilisateurOracle.trouverParIm('104562')).toBeTruthy();
      expect(await structureOracle.trouverParCode('SRB-ANL')).toBeTruthy();
      expect(await profilOracle.trouverParCode('admin1')).toBeTruthy();

      // Le journal d'audit est relu dans l'ordre chronologique, ids remappés.
      const audit = await auditOracle.lister({ limit: 10, page: 1 });
      expect(audit.total).toBe(4);
      const remises = audit.lignes.slice().reverse();
      expect(remises.map((l) => l.action)).toEqual([
        'connexion.reussie',
        'connexion.echouee',
        'saisie.soumise',
        'export.csv',
      ]);
      expect(remises[0].userRef).toMatch(/^[0-9]+$/);
      expect(remises[0].objet).toMatch(/^utilisateur:[0-9]+$/);
      expect(remises[1].userRef).toBe('unknown');
      expect(remises[1].objet).toBe('connexion');
      expect(remises[3].userRef).toBe('104562');
      expect(remises[3].objet).toBe('autre:rien');

      // Chaque saisie cible garde ses références résolues et son objet JSON.
      const saisies = await saisieOracle.lister();
      expect(saisies).toHaveLength(comptesAvant.saisies);
      for (const saisie of saisies) {
        expect(typeof saisie.structureId).toBe('string');
        expect(typeof saisie.moduleId).toBe('string');
        expect(typeof saisie.authorId).toBe('string');
        expect(saisie.periodeId).not.toBeNull();
        expect(typeof saisie.values).toBe('object');
      }

      const remarques = await remarqueOracle.lister();
      expect(remarques).toHaveLength(comptesAvant.remarques);
      expect(remarques.map((r) => r.state).sort()).toEqual(['en_cours', 'nouvelle']);
    });

    it('M5 : une seconde migration est refusée (cible non vide)', async () => {
      const resultat = await executerMigration({ apply: true });
      expect(resultat.code).toBe(1);
      expect(resultat.anomalies[0]).toContain('Cible Oracle non vide');
      expect(sorties.log.join('\n')).toContain('Cible Oracle non vide');

      const comptes = await compterCible();
      expect(comptes.saisies).toBeGreaterThan(0);
      expect(comptes.utilisateurs).toBeGreaterThan(0);
    });
  }
);

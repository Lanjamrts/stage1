"use strict";

// Étape 41.4a : les quatre scripts d'initialisation passent par les dépôts.
// La logique est importée sans être lancée (main() protégé par
// import.meta.url) puis exécutée contre des bases de test dédiées :
// - version MongoDB : sigbd_corecheck (JAMAIS sigbd_test) ;
// - version Oracle : describe.skipIf sans ORACLE_TEST_USER/PASSWORD, sigbd_test,
//   schéma appliqué seulement si une table manque (jamais --reset).
// Aucun script réel n'est lancé contre une base qui ne soit pas une base de test.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';

import { loadConfig } from '../src/config.js';
import { getKnex } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { ouvrirBase, fermerBase } from '../src/scripts/connexion.js';
import { archiverSaisiesExportees } from '../src/scripts/archive.js';
import { parseArgs, executerInitPeriodes } from '../src/scripts/init-periodes.js';
import { executerNcaMandat } from '../src/scripts/init-nca-mandat.js';
import { creerPremierAdmin1 } from '../src/scripts/create-admin.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { getProfilRepository } from '../src/repositories/profilRepository.js';
import { MODULES } from '../src/seed/modules.js';

const URI_CORECHECK = 'mongodb://127.0.0.1:27017/sigbd_corecheck';
const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const config = loadConfig();
const AVANT = {
  CORE_STORE: config.CORE_STORE,
  REFERENCE_STORE: config.REFERENCE_STORE,
  MONGODB_URI: config.MONGODB_URI,
};

// Tables de ce circuit (11 sur les 13 + PROFIL).
const TABLES = [
  'REGION',
  'STRUCTURE',
  'PERIODE',
  'UTILISATEUR',
  'MODULE_SIGBD',
  'MODULE_PERIODICITE',
  'MODULE_TYPE_STRUCTURE',
  'SAISIE',
  'SAISIE_VALIDATION',
  'REMARQUE',
  'PROFIL',
];

// Ordre des clés étrangères : saisies, remarques, puis utilisateurs, modules,
// périodes, structures, régions.
async function nettoyer() {
  await getSaisieRepository().supprimerTout();
  await getRemarqueRepository().supprimerTout();
  await getUtilisateurRepository().supprimerTout();
  await getModuleRepository().supprimerTout();
  await getPeriodeRepository().supprimerTout();
  await getStructureRepository().supprimerTout();
  await getRegionRepository().supprimerTout();
}

// Sorties capturées : les scripts parlent, les tests assertent dessus.
let sorties;

function optionsInitPeriodes(extra = {}) {
  return {
    ...parseArgs(['--annee', '2091', '--echeance-mensuelle-jour', '5', '--echeance-trimestrielle-jours', '15']),
    ...extra,
  };
}

async function structureDeTest(code = 'STSCR') {
  const { structure } = await getStructureRepository().creerSiAbsent({
    code,
    label: 'Structure scripts',
    type: 'SRB',
  });
  return structure;
}

async function moduleDeTest(code) {
  return getModuleRepository().creer({
    code,
    label: `Module ${code}`,
    periodicity: 'monthly',
    kind: 'periodic',
    structureTypes: ['SRB'],
    version: 1,
    active: true,
    fields: [{ key: 'valeur', type: 'text', label: 'Valeur' }],
  });
}

async function periodeDeTest(label, start, end, deadline) {
  const { periode } = await getPeriodeRepository().creerSiAbsent({
    label,
    start,
    end,
    deadline,
    periodicity: 'monthly',
  });
  return periode;
}

async function utilisateurDeTest(overrides = {}) {
  const structure = overrides.structureId ? null : await structureDeTest();
  return getUtilisateurRepository().creer({
    im: '800101',
    nom: 'Scripts',
    prenom: 'Test',
    direction: 'DGBF',
    service: 'Service des scripts',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    role: 'client',
    status: 'actif',
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    structureId: structure ? structure._id : undefined,
    ...overrides,
  });
}

// Module NCA en version 1 (table membres sans la colonne mandat).
function moduleNcaSansMandat() {
  const source = MODULES.find((m) => m.code === 'NCA');
  const clone = JSON.parse(JSON.stringify(source));
  const table = clone.fields.find((f) => f.key === 'membres');
  table.fields = table.fields.filter((f) => f.key !== 'mandat');
  return { ...clone, version: 1, active: true };
}

function champMandat(moduleDoc) {
  const table = (moduleDoc.fields || []).find((f) => f.key === 'membres');
  return table && (table.fields || []).find((f) => f.key === 'mandat');
}

async function preparerCreateAdmin() {
  await getProfilRepository().assurer({ code: 'admin1', label: 'Administrateur central' });
  const { structure } = await getStructureRepository().creerSiAbsent({
    code: 'SSEBFSCR',
    label: 'SSEBF scripts',
    type: 'SSEBF',
  });
  return structure;
}

async function compterPeriodes() {
  return (await getPeriodeRepository().lister()).length;
}

function testsCommuns() {
  it("A1 : init-periodes en dry-run n'écrit rien", async () => {
    const r = await executerInitPeriodes(optionsInitPeriodes());
    expect(r.code).toBe(0);
    expect(r.creees).toBe(0);
    expect(r.conflits).toEqual([]);
    expect(await compterPeriodes()).toBe(0);
    expect(sorties.log.join('\n')).toContain('Periodes : 16 a creer, 0 deja presente(s)');
    expect(sorties.log.join('\n')).toContain('DRY-RUN : aucune donnee ecrite.');
  });

  it('A2 : init-periodes --apply crée les 16 périodes', async () => {
    const r = await executerInitPeriodes(optionsInitPeriodes({ apply: true }));
    expect(r.code).toBe(0);
    expect(r.creees).toBe(16);
    expect(await compterPeriodes()).toBe(16);
    expect(sorties.log.join('\n')).toContain('Periodes : 16 creee(s), 0 deja presente(s)');
  });

  it('A3 : un second apply ne crée rien (0 créée)', async () => {
    await executerInitPeriodes(optionsInitPeriodes({ apply: true }));
    const r = await executerInitPeriodes(optionsInitPeriodes({ apply: true }));
    expect(r.code).toBe(0);
    expect(r.creees).toBe(0);
    expect(r.dejaPresentes).toBe(16);
    expect(await compterPeriodes()).toBe(16);
    expect(sorties.log.join('\n')).toContain('Periodes : 0 creee(s), 16 deja presente(s)');
  });

  it('A4 : un conflit de label sort avec un code non nul et n\'écrit rien', async () => {
    // Libellé d'une période mensuelle sur la clé (quarterly, 1er janvier) :
    // le libellé « Janvier 2091 » est déjà pris, la clé de T1 aussi.
    await getPeriodeRepository().creerSiAbsent({
      label: 'Janvier 2091',
      periodicity: 'quarterly',
      start: new Date(Date.UTC(2091, 0, 1)),
      end: new Date(Date.UTC(2091, 2, 31)),
      deadline: new Date(Date.UTC(2091, 3, 15)),
    });
    expect(await compterPeriodes()).toBe(1);

    const r = await executerInitPeriodes(optionsInitPeriodes({ apply: true }));
    expect(r.code).toBe(1);
    expect(r.conflits.some((c) => c.includes('Label "Janvier 2091"'))).toBe(true);
    expect(sorties.error.join('\n')).toContain('Label "Janvier 2091"');
    expect(await compterPeriodes()).toBe(1);
  });

  it("B1 : init-nca-mandat en dry-run annonce l'ajout sans écrire", async () => {
    await getModuleRepository().creer(moduleNcaSansMandat());

    const r = await executerNcaMandat({ apply: false });
    expect(r.code).toBe(0);
    expect(r.modifie).toBe(false);
    expect(sorties.log.join('\n')).toContain('Colonne "N° de mandat" ajoutee apres "Qualite".');
    expect(sorties.log.join('\n')).toContain('DRY-RUN : la colonne serait ajoutee.');

    const nca = await getModuleRepository().trouverParCode('NCA');
    expect(champMandat(nca)).toBeUndefined();
    expect(nca.version).toBe(1);
  });

  it('B2 : init-nca-mandat --apply ajoute la colonne mandat', async () => {
    await getModuleRepository().creer(moduleNcaSansMandat());

    const r = await executerNcaMandat({ apply: true });
    expect(r.code).toBe(0);
    expect(r.modifie).toBe(true);
    expect(sorties.log.join('\n')).toContain('1 module(s) mis a jour, 1 modification(s) ecrite(s).');

    const nca = await getModuleRepository().trouverParCode('NCA');
    const f = champMandat(nca);
    expect(f).toBeDefined();
    expect(f.label).toBe('N° de mandat');
    expect(f.type).toBe('integer');
    expect(f.required).toBe(true);
    expect(f.min).toBe(1);
    expect(f.placeholder).toBe('1 = premier mandat, 2 = deuxième mandat, etc.');
    expect(nca.version).toBe(1);
    const cles = nca.fields.find((x) => x.key === 'membres').fields.map((x) => x.key);
    expect(cles).toEqual(['nom', 'prenom', 'qualite', 'mandat']);
  });

  it('B3 : un second apply ne modifie rien', async () => {
    await getModuleRepository().creer(moduleNcaSansMandat());
    await executerNcaMandat({ apply: true });

    const r = await executerNcaMandat({ apply: true });
    expect(r.code).toBe(0);
    expect(r.modifie).toBe(false);
    expect(sorties.log.join('\n')).toContain('est deja presente');
    expect(sorties.log.join('\n')).toContain('aucune modification necessaire. Rien a ecrire.');

    const nca = await getModuleRepository().trouverParCode('NCA');
    expect(champMandat(nca)).toBeDefined();
    expect(nca.version).toBe(1);
  });

  it("C1 : archive ne touche que les saisies exportées des périodes terminées", async () => {
    const structure = await structureDeTest();
    const moduleA = await moduleDeTest('MODSCRA');
    const moduleB = await moduleDeTest('MODSCRB');
    const auteur = await utilisateurDeTest({ im: '800102', structureId: structure._id });
    const periodeFinie = await periodeDeTest(
      'Periode finie',
      new Date(Date.UTC(2020, 0, 1)),
      new Date(Date.UTC(2020, 0, 31)),
      new Date(Date.UTC(2020, 1, 5))
    );
    const periodeCourante = await periodeDeTest(
      'Periode courante',
      new Date(Date.UTC(2099, 0, 1)),
      new Date(Date.UTC(2099, 0, 31)),
      new Date(Date.UTC(2099, 1, 5))
    );

    const courante = async (moduleId, periodeId, status) =>
      getSaisieRepository().creer({
        structureId: structure._id,
        moduleId,
        moduleVersion: 1,
        periodeId,
        authorId: auteur._id,
        status,
        values: {},
      });

    const exporteeFinie = await courante(moduleA._id, periodeFinie._id, 'exportee');
    const exporteeCourante = await courante(moduleA._id, periodeCourante._id, 'exportee');
    const valideeFinie = await courante(moduleB._id, periodeFinie._id, 'validee');
    const dejaArchivee = await courante(moduleB._id, periodeCourante._id, 'archivee');

    const r = await archiverSaisiesExportees();
    expect(r.code).toBe(0);
    expect(r.periodesTerminees).toBe(1);
    expect(r.archivees).toBe(1);
    expect(sorties.log.join('\n')).toContain('Periodes terminees: 1');
    expect(sorties.log.join('\n')).toContain('Saisies archivees: 1');

    const statuts = new Map(
      (await getSaisieRepository().lister({ limite: 100 })).map((s) => [String(s._id), s.status])
    );
    expect(statuts.get(String(exporteeFinie._id))).toBe('archivee');
    expect(statuts.get(String(exporteeCourante._id))).toBe('exportee');
    expect(statuts.get(String(valideeFinie._id))).toBe('validee');
    expect(statuts.get(String(dejaArchivee._id))).toBe('archivee');
  });

  it("D1 : create-admin refuse quand un admin1 existe déjà", async () => {
    const structure = await preparerCreateAdmin();
    await utilisateurDeTest({
      im: '810001',
      nom: 'Existant',
      prenom: 'Admin',
      role: 'admin1',
      structureId: structure._id,
    });

    await expect(
      creerPremierAdmin1({ im: '810002', nom: 'Dupont', prenom: 'Jean' })
    ).rejects.toThrow('Un admin1 existe déjà. Impossible de créer un nouvel admin1 initial.');
    expect(await getUtilisateurRepository().trouverParIm('810002')).toBeNull();
  });

  it('D2 : create-admin refuse un IM déjà pris', async () => {
    const structure = await preparerCreateAdmin();
    await utilisateurDeTest({ im: '810003', structureId: structure._id });

    await expect(
      creerPremierAdmin1({ im: '810003', nom: 'Dupont', prenom: 'Jean' })
    ).rejects.toThrow("Un utilisateur avec l'IM 810003 existe déjà.");
    expect(await getUtilisateurRepository().trouverPremierParRole('admin1')).toBeNull();
    expect(await getUtilisateurRepository().listerParRole('client')).toHaveLength(1);
  });

  it('D3 : create-admin crée le premier admin1', async () => {
    const structure = await preparerCreateAdmin();

    const r = await creerPremierAdmin1({ im: '810004', nom: 'Dupont', prenom: 'Jean' });
    expect(r.password).toMatch(/^[A-Z][a-z][0-9]-[A-Z][a-z][0-9]-[A-Z][a-z][0-9]$/);

    const u = await getUtilisateurRepository().trouverParIm('810004');
    expect(u).not.toBeNull();
    expect(u.role).toBe('admin1');
    expect(u.nom).toBe('Dupont');
    expect(u.prenom).toBe('Jean');
    expect(u.direction).toBe('SSEBF');
    expect(u.service).toBe('Service des structures excentriques');
    expect(u.status).toBe('actif');
    expect(u.mustChangePassword).toBe(true);
    expect(u.failedAttempts).toBe(0);
    expect(u.lockedUntil == null).toBe(true);
    expect(String(u.structureId)).toBe(String(structure._id));
    expect(u.passwordHash).toBeTruthy();
    expect(u.passwordHash).not.toBe(r.password);
    expect(await getUtilisateurRepository().trouverPremierParRole('admin1')).not.toBeNull();
  });
}

function installerSorties() {
  sorties = { log: [], error: [] };
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    sorties.log.push(args.map((a) => (a instanceof Error ? String(a) : String(a))).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    sorties.error.push(args.map((a) => (a instanceof Error ? String(a) : String(a))).join(' '));
  });
}

describe('Scripts sur les dépôts — version MongoDB (sigbd_corecheck)', () => {
  beforeAll(async () => {
    config.CORE_STORE = 'mongo';
    config.REFERENCE_STORE = 'mongo';
    config.MONGODB_URI = URI_CORECHECK;
    expect(loadConfig().MONGODB_URI).toBe(URI_CORECHECK);
    expect(loadConfig().CORE_STORE).toBe('mongo');
    await ouvrirBase();
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.name).toBe('sigbd_corecheck');
    await nettoyer();
  });

  afterAll(async () => {
    await nettoyer();
    await fermerBase();
    Object.assign(config, AVANT);
  });

  beforeEach(async () => {
    installerSorties();
    await nettoyer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  testsCommuns();
});

describe.skipIf(!oracleConfiguree)('Scripts sur les dépôts — version Oracle (sigbd_test)', () => {
  beforeAll(async () => {
    config.CORE_STORE = 'oracle';
    config.REFERENCE_STORE = 'oracle';

    // Schéma appliqué seulement si une table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw(
      `SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN (${TABLES.map((t) => `'${t}'`).join(', ')})`
    );
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) < TABLES.length) {
      expect(await mainSchema([])).toBe(0);
    }

    const { store, nom } = await ouvrirBase();
    expect(store).toBe('oracle');
    expect(nom.startsWith('Oracle (')).toBe(true);
    // Jamais d'identifiant dans le libellé affiché.
    for (const identifiant of [
      config.ORACLE_USER,
      config.ORACLE_PASSWORD,
      config.ORACLE_TEST_USER,
      config.ORACLE_TEST_PASSWORD,
    ]) {
      if (identifiant) expect(nom).not.toContain(identifiant);
    }
    await nettoyer();
  });

  afterAll(async () => {
    await nettoyer();
    await fermerBase();
    Object.assign(config, AVANT);
  });

  beforeEach(async () => {
    installerSorties();
    await nettoyer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  testsCommuns();
});

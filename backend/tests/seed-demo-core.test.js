"use strict";

// Étape 41.4c : le seed de démonstration passe par les dépôts.
// executerSeedDemo est importé sans être lancé (l'entrée du fichier est
// protégée par import.meta.url) puis exécuté contre des bases de test dédiées :
// - version MongoDB : sigbd_corecheck (JAMAIS sigbd_test) ;
// - version Oracle : describe.skipIf sans ORACLE_TEST_USER/PASSWORD, sigbd_test,
//   schéma appliqué seulement si une table manque (jamais --reset).
// Aucun script réel n'est lancé contre une base qui ne soit pas une base de test.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

import { loadConfig } from '../src/config.js';
import { getKnex } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { ouvrirBase, fermerBase } from '../src/scripts/connexion.js';
import { executerSeedDemo } from '../src/seed/demo.js';
import { buildSaisies } from '../src/seed/saisies.js';
import { MODULES } from '../src/seed/modules.js';
import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getProfilRepository } from '../src/repositories/profilRepository.js';
import { getReferentielRepository } from '../src/repositories/referentielRepository.js';
import { getAuditRepository } from '../src/repositories/auditRepository.js';

const URI_CORECHECK = 'mongodb://127.0.0.1:27017/sigbd_corecheck';
const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const config = loadConfig();
const AVANT = {
  CORE_STORE: config.CORE_STORE,
  REFERENCE_STORE: config.REFERENCE_STORE,
  AUDIT_STORE: config.AUDIT_STORE,
  MONGODB_URI: config.MONGODB_URI,
};

// Tables de ce circuit (les 12 de l'étape 41.4b + JOURNAL_AUDIT).
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
  'REFERENTIEL',
  'JOURNAL_AUDIT',
];

// Comptes de référence du seed : 12 régions, 3 régions × 4 types de structures
// régionales + 3 centrales, 3 périodes, 10 utilisateurs, MODULES.length modules,
// buildSaisies().length saisies, 12 référentiels de démonstration,
// 32 ministères et 223 EPN (data/init).
const ATTENDU = {
  regions: 12,
  structures: 15,
  periodes: 3,
  modules: MODULES.length,
  utilisateurs: 10,
  saisies: buildSaisies({
    moduleIdByCode: {},
    structureIdByCode: {},
    userIdByIm: {},
    periodeIdByLabel: {},
  }).length,
  referentiels: 12,
  ministeres: 32,
  epn: 223,
};

// Nettoyage : l'ordre des clés étrangères du seed lui-même, plus les
// référentiels, les profils et le journal, pour partir de zéro à chaque test.
async function nettoyer() {
  await getRemarqueRepository().supprimerTout();
  await getSaisieRepository().supprimerTout();
  await getUtilisateurRepository().supprimerTout();
  await getModuleRepository().supprimerTout();
  await getPeriodeRepository().supprimerTout();
  await getStructureRepository().supprimerTout();
  await getRegionRepository().supprimerTout();
  await getProfilRepository().supprimerTout();
  await getReferentielRepository().supprimerTout();
  await getAuditRepository().supprimerTout();
}

async function compterTout() {
  return {
    regions: (await getRegionRepository().lister()).length,
    structures: (await getStructureRepository().lister()).length,
    periodes: (await getPeriodeRepository().lister()).length,
    modules: (await getModuleRepository().lister()).length,
    utilisateurs: (await getUtilisateurRepository().listerAvecStructure({ limite: 100 })).length,
    saisies: (await getSaisieRepository().lister({ limite: 100 })).length,
    referentiels:
      (await getReferentielRepository().lister('directions')).length +
      (await getReferentielRepository().lister('services')).length +
      (await getReferentielRepository().lister('grades')).length +
      (await getReferentielRepository().lister('std')).length,
    ministeres: (await getReferentielRepository().lister('ministeres')).length,
    epn: (await getReferentielRepository().lister('epn')).length,
    profils: await compterProfils(),
    audit: (await getAuditRepository().lister({ limit: 1 })).total,
  };
}

async function compterProfils() {
  let total = 0;
  for (const code of ['client', 'admin2', 'admin1', 'developpeur', 'consultant']) {
    if (await getProfilRepository().trouverParCode(code)) total++;
  }
  return total;
}

function mdpDemo() {
  return process.env.SEED_DEMO_PASSWORD || (config.NODE_ENV === 'production' ? undefined : 'Test@2026');
}

// Sorties capturées : le seed parle, les tests assertent dessus.
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

function testsCommuns({ base, messageConnexion }) {
  it("A0 : la confirmation a lieu avant toute connexion et toute écriture", async () => {
    const isTtyAvant = process.stdin.isTTY;
    process.stdin.isTTY = false;
    let resultat;
    try {
      resultat = await executerSeedDemo({ yes: false, purgeAudit: false });
    } finally {
      process.stdin.isTTY = isTtyAvant;
    }

    expect(resultat).toEqual({ code: 1 });
    expect(sorties.log.join('\n')).toContain(`de la base "${base.nom}"`);
    // Aucune écriture, et le « Connecte a … » n'a pas été atteint.
    expect(sorties.log.join('\n')).not.toContain('Connecte a');
    expect(sorties.error.join('\n')).toContain('Terminal non interactif : relancez avec --yes pour confirmer.');
    const comptes = await compterTout();
    expect(comptes.regions).toBe(0);
    expect(comptes.structures).toBe(0);
    expect(comptes.utilisateurs).toBe(0);
    expect(comptes.saisies).toBe(0);
  });

  it('A1 : premier appel sur base vide → comptes exacts', async () => {
    const resultat = await executerSeedDemo({ yes: true, purgeAudit: false });
    expect(resultat).toEqual({ code: 0 });

    expect(await compterTout()).toMatchObject({
      regions: ATTENDU.regions,
      structures: ATTENDU.structures,
      periodes: ATTENDU.periodes,
      modules: ATTENDU.modules,
      utilisateurs: ATTENDU.utilisateurs,
      saisies: ATTENDU.saisies,
      referentiels: ATTENDU.referentiels,
      ministeres: ATTENDU.ministeres,
      epn: ATTENDU.epn,
      profils: 5,
      audit: 0,
    });

    const journal = sorties.log.join('\n');
    expect(journal).toContain(messageConnexion);
    expect(journal).toContain('Collections nettoyees');
    expect(journal).toContain("Journal d'audit conserve");
    expect(journal).toContain('5 profils prets');
    expect(journal).toContain(`${ATTENDU.regions} regions creees`);
    expect(journal).toContain(`${ATTENDU.structures} structures creees`);
    expect(journal).toContain(`${ATTENDU.periodes} periodes creees`);
    expect(journal).toContain(`${ATTENDU.modules} modules crees`);
    expect(journal).toContain(`${ATTENDU.utilisateurs} utilisateurs crees`);
    expect(journal).toContain(`${ATTENDU.saisies} saisies creees`);
    expect(journal).toContain(`${ATTENDU.referentiels} referentiels crees`);
    expect(journal).toContain('Seed termine avec succes.');
  });

  it('A2 : un second appel ne duplique rien', async () => {
    await executerSeedDemo({ yes: true, purgeAudit: false });
    const premier = await compterTout();

    const resultat = await executerSeedDemo({ yes: true, purgeAudit: false });
    expect(resultat).toEqual({ code: 0 });
    expect(await compterTout()).toEqual(premier);
    expect(premier.regions).toBe(ATTENDU.regions);
    expect(premier.structures).toBe(ATTENDU.structures);
    expect(premier.utilisateurs).toBe(ATTENDU.utilisateurs);
    expect(premier.saisies).toBe(ATTENDU.saisies);
    expect(premier.epn).toBe(ATTENDU.epn);
  });

  it("C1 : sans --purge-audit le journal d'audit est conservé", async () => {
    await getAuditRepository().ajouter({
      userRef: '104562',
      action: 'seed.demo.test',
      objet: 'ligne avant le seed',
      ip: '127.0.0.1',
    });
    expect((await getAuditRepository().lister({ limit: 10 })).total).toBe(1);

    const resultat = await executerSeedDemo({ yes: true, purgeAudit: false });
    expect(resultat).toEqual({ code: 0 });
    expect((await getAuditRepository().lister({ limit: 10 })).total).toBe(1);
    expect(sorties.log.join('\n')).toContain("Journal d'audit conserve");
    expect(sorties.log.join('\n')).not.toContain("Journal d'audit supprime");
  });

  it('C2 : --purge-audit supprime le journal d\'audit', async () => {
    await getAuditRepository().ajouter({
      userRef: '104562',
      action: 'seed.demo.test',
      objet: 'ligne avant le seed',
      ip: '127.0.0.1',
    });
    expect((await getAuditRepository().lister({ limit: 10 })).total).toBe(1);

    const resultat = await executerSeedDemo({ yes: true, purgeAudit: true });
    expect(resultat).toEqual({ code: 0 });
    expect((await getAuditRepository().lister({ limit: 10 })).total).toBe(0);
    expect(sorties.log.join('\n')).toContain("Journal d'audit supprime (--purge-audit)");
  });

  it('D1 : chaque utilisateur a un hash bcrypt valide', async () => {
    const resultat = await executerSeedDemo({ yes: true, purgeAudit: false });
    expect(resultat).toEqual({ code: 0 });

    const motDePasse = mdpDemo();
    expect(motDePasse).toBeTruthy();
    const utilisateurs = await getUtilisateurRepository().listerAvecStructure({ limite: 100 });
    expect(utilisateurs).toHaveLength(ATTENDU.utilisateurs);
    for (const u of utilisateurs) {
      expect(u.passwordHash).toBeTruthy();
      expect(u.passwordHash).not.toBe(motDePasse);
      expect(await bcrypt.compare(motDePasse, u.passwordHash)).toBe(true);
    }
  });

  it('E1 : les saisies et les utilisateurs référencent des entités existantes', async () => {
    const resultat = await executerSeedDemo({ yes: true, purgeAudit: false });
    expect(resultat).toEqual({ code: 0 });

    const structures = new Set((await getStructureRepository().lister()).map((s) => String(s._id)));
    const modules = new Set((await getModuleRepository().lister()).map((m) => String(m._id)));
    const periodes = new Set((await getPeriodeRepository().lister()).map((p) => String(p._id)));
    const utilisateurs = await getUtilisateurRepository().listerAvecStructure({ limite: 100 });
    const idsUtilisateurs = new Set(utilisateurs.map((u) => String(u._id)));

    const saisies = await getSaisieRepository().lister({ limite: 100 });
    expect(saisies).toHaveLength(ATTENDU.saisies);
    for (const s of saisies) {
      expect(structures.has(String(s.structureId))).toBe(true);
      expect(modules.has(String(s.moduleId))).toBe(true);
      expect(periodes.has(String(s.periodeId))).toBe(true);
      expect(idsUtilisateurs.has(String(s.authorId))).toBe(true);
    }

    expect(utilisateurs).toHaveLength(ATTENDU.utilisateurs);
    for (const u of utilisateurs) {
      expect(u.structureId).not.toBeNull();
      expect(structures.has(String(u.structureId._id))).toBe(true);
    }
  });
}

// Timeout de suite relevé : dans la suite complète (charge machine, processus
// spawns des autres fichiers) un seed Oracle + ses listers dépasse 30 s.
describe('Seed démonstration sur les dépôts — version MongoDB (sigbd_corecheck)', { timeout: 120000 }, () => {
  const base = {};

  beforeAll(async () => {
    config.CORE_STORE = 'mongo';
    config.REFERENCE_STORE = 'mongo';
    config.AUDIT_STORE = 'mongo';
    config.MONGODB_URI = URI_CORECHECK;
    expect(loadConfig().MONGODB_URI).toBe(URI_CORECHECK);
    expect(loadConfig().CORE_STORE).toBe('mongo');
    Object.assign(base, await ouvrirBase());
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

  testsCommuns({ base, messageConnexion: 'Connecte a MongoDB' });
});

describe.skipIf(!oracleConfiguree)('Seed démonstration sur les dépôts — version Oracle (sigbd_test)', { timeout: 120000 }, () => {
  const base = {};

  beforeAll(async () => {
    config.CORE_STORE = 'oracle';
    config.REFERENCE_STORE = 'oracle';
    config.AUDIT_STORE = 'oracle';

    // Schéma appliqué seulement si une table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw(
      `SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN (${TABLES.map((t) => `'${t}'`).join(', ')})`
    );
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) < TABLES.length) {
      expect(await mainSchema([])).toBe(0);
    }

    Object.assign(base, await ouvrirBase());
    expect(base.store).toBe('oracle');
    expect(base.nom.startsWith('Oracle (')).toBe(true);
    // Jamais d'identifiant dans le libellé affiché.
    for (const identifiant of [
      config.ORACLE_USER,
      config.ORACLE_PASSWORD,
      config.ORACLE_TEST_USER,
      config.ORACLE_TEST_PASSWORD,
    ]) {
      if (identifiant) expect(base.nom).not.toContain(identifiant);
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

  testsCommuns({ base, messageConnexion: 'Connecte a Oracle' });
});

"use strict";

// Étape 41.4b : init-structures, ensureModules et ensureEpnReference passent
// par les dépôts. La logique est importée sans être lancée (main() protégé par
// import.meta.url) puis exécutée contre des bases de test dédiées :
// - version MongoDB : sigbd_corecheck (JAMAIS sigbd_test) ;
// - version Oracle : describe.skipIf sans ORACLE_TEST_USER/PASSWORD, sigbd_test,
//   schéma appliqué seulement si une table manque (jamais --reset).
// Aucun script réel n'est lancé contre une base qui ne soit pas une base de test.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../src/config.js';
import { getKnex } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { ouvrirBase, fermerBase } from '../src/scripts/connexion.js';
import { lireCsv, executerInitStructures } from '../src/scripts/init-structures.js';
import { ensureModules, ensureEpnReference } from '../src/seed/common.js';
import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getReferentielRepository } from '../src/repositories/referentielRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { MODULES } from '../src/seed/modules.js';

const URI_CORECHECK = 'mongodb://127.0.0.1:27017/sigbd_corecheck';
const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const config = loadConfig();
const AVANT = {
  CORE_STORE: config.CORE_STORE,
  REFERENCE_STORE: config.REFERENCE_STORE,
  MONGODB_URI: config.MONGODB_URI,
};

// Tables de ce circuit (les 11 de l'étape 41.4a + REFERENTIEL).
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
];

// Ordre des clés étrangères : saisies, remarques, puis utilisateurs, modules,
// périodes, structures, régions ; référentiels et profils sans dépendant.
async function nettoyer() {
  await getSaisieRepository().supprimerTout();
  await getRemarqueRepository().supprimerTout();
  await getUtilisateurRepository().supprimerTout();
  await getModuleRepository().supprimerTout();
  await getPeriodeRepository().supprimerTout();
  await getStructureRepository().supprimerTout();
  await getRegionRepository().supprimerTout();
  await getReferentielRepository().supprimerTout();
}

const REGIONS_CSV = `region;valide;note
Analamanga;oui;
Atsinanana;oui;
Diana;oui;
`;

const STRUCTURES_CSV = `type;region;valide;note
SRB;Analamanga;oui;
SRSP;Analamanga;oui;
SRPE;Analamanga;oui;
CIRBF;Analamanga;oui;
SRB;Atsinanana;oui;
SRSP;Atsinanana;oui;
SRPE;Atsinanana;oui;
CIRBF;Atsinanana;oui;
SRB;Diana;oui;
SRSP;Diana;oui;
SRPE;Diana;oui;
CIRBF;Diana;oui;
`;

const MINISTERES_CSV = `ministere;valide;note
Ministere A;oui;
Ministere B;oui;
`;

const EPN_CSV = `ministere;ministere_liste_2019;nom;acronyme;regime;texte_creation;rattachement;valide;note
Ministere A;;EPN un;EPN1;EPIC;Decreet;identique;oui;
Ministere B;;EPN deux;EPN2;EPA;Decreet;identique;oui;
`;

let sorties;
let dossierStructures;
let dossierEpn;

function installerSorties() {
  sorties = { log: [], error: [] };
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    sorties.log.push(args.map((a) => (a instanceof Error ? String(a) : String(a))).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    sorties.error.push(args.map((a) => (a instanceof Error ? String(a) : String(a))).join(' '));
  });
}

function ecrireFixturesStructures(regionsCsv = REGIONS_CSV, structuresCsv = STRUCTURES_CSV) {
  dossierStructures = fs.mkdtempSync(path.join(os.tmpdir(), 'sigbd-init-struct-'));
  fs.writeFileSync(path.join(dossierStructures, 'regions.csv'), regionsCsv, 'utf8');
  fs.writeFileSync(path.join(dossierStructures, 'structures.csv'), structuresCsv, 'utf8');
  return dossierStructures;
}

function ecrireFixturesEpn() {
  dossierEpn = fs.mkdtempSync(path.join(os.tmpdir(), 'sigbd-init-epn-'));
  fs.writeFileSync(path.join(dossierEpn, 'ministeres.csv'), MINISTERES_CSV, 'utf8');
  fs.writeFileSync(path.join(dossierEpn, 'epn.csv'), EPN_CSV, 'utf8');
  return dossierEpn;
}

async function compterRegions() {
  return (await getRegionRepository().lister()).length;
}

async function compterStructures() {
  return (await getStructureRepository().lister()).length;
}

async function compterModules() {
  return (await getModuleRepository().lister()).length;
}

async function compterReferentiels(type) {
  return (await getReferentielRepository().lister(type)).length;
}

function lancerStructures(apply = false, allowUnvalidated = false) {
  return executerInitStructures({ data: lireCsv(dossierStructures), apply, allowUnvalidated });
}

function testsCommuns() {
  it("A1 : init-structures en dry-run n'écrit rien", async () => {
    ecrireFixturesStructures();
    const r = await lancerStructures(false);
    expect(r.code).toBe(0);
    expect(sorties.log.join('\n')).toContain('Regions : 3 a creer, 0 deja presente(s)');
    expect(sorties.log.join('\n')).toContain('Structures : 15 a creer, 0 deja presente(s)');
    expect(sorties.log.join('\n')).toContain('Lignes non validees : 0');
    expect(sorties.log.join('\n')).toContain('DRY-RUN : aucune donnee ecrite. Relancez avec --apply pour ecrire.');
    expect(await compterRegions()).toBe(0);
    expect(await compterStructures()).toBe(0);
  });

  it('A2 : --apply crée 3 régions et 15 structures (3 centrales + 12 du CSV)', async () => {
    ecrireFixturesStructures();
    const r = await lancerStructures(true);
    expect(r.code).toBe(0);
    expect(sorties.log.join('\n')).toContain('Regions : 3 creee(s), 0 deja presente(s)');
    expect(sorties.log.join('\n')).toContain('Structures : 15 creee(s), 0 deja presente(s)');
    expect(await compterRegions()).toBe(3);
    expect(await compterStructures()).toBe(15);

    const srb = await getStructureRepository().trouverParCode('SRB-ANALAMANGA');
    expect(srb.label).toBe('SRB – Analamanga');
    expect(srb.type).toBe('SRB');
    expect(srb.active).toBe(true);
    const region = await getRegionRepository().trouverParNom('Analamanga');
    expect(String(srb.regionId)).toBe(String(region._id));

    const cellule = await getStructureRepository().trouverParCode('CELLULE_INFO');
    expect(cellule.label).toBe('DGBF – Cellule Informatique');
    expect(cellule.type).toBe('CELLULE_INFO');
    expect(cellule.regionId).toBeNull();
  });

  it('A3 : un second apply ne crée rien (0 créée, tout déjà présent)', async () => {
    ecrireFixturesStructures();
    await lancerStructures(true);
    const r = await lancerStructures(true);
    expect(r.code).toBe(0);
    expect(sorties.log.join('\n')).toContain('Regions : 0 creee(s), 3 deja presente(s)');
    expect(sorties.log.join('\n')).toContain('Structures : 0 creee(s), 15 deja presente(s)');
    expect(await compterRegions()).toBe(3);
    expect(await compterStructures()).toBe(15);
  });

  it("A4 : un conflit de label sort en code 1 et n'écrit rien", async () => {
    ecrireFixturesStructures();
    await getStructureRepository().creerSiAbsent({
      code: 'SRB-ANALAMANGA',
      label: 'AUTRE',
      type: 'SRB',
      active: true,
    });

    const r = await lancerStructures(true);
    expect(r.code).toBe(1);
    expect(sorties.error.join('\n')).toContain(
      'Structure code "SRB-ANALAMANGA" : label "AUTRE" vs "SRB – Analamanga"'
    );
    expect(await compterRegions()).toBe(0);
    expect(await compterStructures()).toBe(1);
    expect(sorties.log.join('\n')).not.toContain('creee(s)');
  });

  it('A5 : un conflit de type sort en code 1 et n\'écrit rien', async () => {
    ecrireFixturesStructures();
    await getStructureRepository().creerSiAbsent({
      code: 'SRB-ANALAMANGA',
      label: 'SRB – Analamanga',
      type: 'SRSP',
      active: true,
    });

    const r = await lancerStructures(true);
    expect(r.code).toBe(1);
    expect(sorties.error.join('\n')).toContain('type "SRSP" vs "SRB"');
    expect(await compterRegions()).toBe(0);
    expect(await compterStructures()).toBe(1);
  });

  it("A6 : les lignes non validées sont refusées sans --allow-unvalidated", async () => {
    ecrireFixturesStructures(
      'region;valide;note\nAnalamanga;non;\n',
      'type;region;valide;note\nSRB;Analamanga;non;\n'
    );

    const refuse = await lancerStructures(true);
    expect(refuse.code).toBe(1);
    expect(sorties.error.join('\n')).toContain(
      'Certaines lignes ne sont pas validees. Utilisez --allow-unvalidated pour forcer (interdit en production).'
    );
    expect(await compterRegions()).toBe(0);
    expect(await compterStructures()).toBe(0);

    const autorise = await lancerStructures(true, true);
    expect(autorise.code).toBe(0);
    expect(await compterRegions()).toBe(1);
    // 1 structure du CSV + 3 structures centrales.
    expect(await compterStructures()).toBe(4);
  });

  it('A7 : lireCsv refuse un en-tête ou un type invalide avant toute base', async () => {
    ecrireFixturesStructures(REGIONS_CSV, 'type;region;valide;note\nINVALID;Analamanga;oui;\n');
    const data = lireCsv(dossierStructures);
    expect(data.success).toBe(false);
    expect(sorties.error.join('\n')).toContain('structures.csv ligne 2 : type invalide "INVALID"');

    const manquant = lireCsv(path.join(dossierStructures, 'inexistant'));
    expect(manquant.success).toBe(false);
    expect(sorties.error.join('\n')).toContain('Fichiers CSV introuvables dans');
  });

  it('B1 : ensureModules est idempotent et ne modifie pas l\'existant', async () => {
    const premier = await ensureModules();
    expect(premier).toEqual({ created: MODULES.length, existing: 0 });
    expect(await compterModules()).toBe(MODULES.length);

    const second = await ensureModules();
    expect(second).toEqual({ created: 0, existing: MODULES.length });
    expect(await compterModules()).toBe(MODULES.length);

    const ra = await getModuleRepository().trouverParCode('RA');
    await getModuleRepository().mettreAJour(String(ra._id), { label: 'RA modifie' });
    await ensureModules();
    const raApres = await getModuleRepository().trouverParCode('RA');
    expect(raApres.label).toBe('RA modifie');
    expect(await compterModules()).toBe(MODULES.length);
  });

  it('B2 : ensureModules complète les périodicités absentes de RA', async () => {
    await ensureModules();
    const ra = await getModuleRepository().trouverParCode('RA');
    expect([...ra.allowedPeriodicities].sort()).toEqual(['monthly', 'quarterly']);

    await getModuleRepository().mettreAJour(String(ra._id), { allowedPeriodicities: [] });
    const vide = await getModuleRepository().trouverParCode('RA');
    expect(vide.allowedPeriodicities).toEqual([]);

    const r = await ensureModules();
    expect(r.created).toBe(0);
    expect(r.existing).toBe(MODULES.length);
    const complet = await getModuleRepository().trouverParCode('RA');
    expect([...complet.allowedPeriodicities].sort()).toEqual(['monthly', 'quarterly']);
  });

  it('C1 : ensureEpnReference dry-run puis apply puis second apply', async () => {
    ecrireFixturesEpn();
    const options = { epnPath: path.join(dossierEpn, 'epn.csv'), ministeresPath: path.join(dossierEpn, 'ministeres.csv') };

    const sec = await ensureEpnReference({ ...options, apply: false });
    expect(sec).toMatchObject({ success: true, dryRun: true });
    expect(sorties.log.join('\n')).toContain('Ministeres : 2 lignes lues');
    expect(sorties.log.join('\n')).toContain('EPN : 2 lignes lues');
    expect(sorties.log.join('\n')).toContain('DRY-RUN : aucune donnée écrite. Relancez avec --apply pour ecrire.');
    expect(await compterReferentiels('ministeres')).toBe(0);
    expect(await compterReferentiels('epn')).toBe(0);

    const applique = await ensureEpnReference({ ...options, apply: true });
    expect(applique).toMatchObject({ success: true, dryRun: false });
    expect(applique.created).toEqual({ ministeres: 2, epns: 2 });
    expect(applique.existing).toEqual({ ministeres: 0, epns: 0 });
    expect(sorties.log.join('\n')).toContain('Base cible');
    expect(await compterReferentiels('ministeres')).toBe(2);
    expect(await compterReferentiels('epn')).toBe(2);

    const epn = (await getReferentielRepository().lister('epn')).find((e) => e.value === 'EPN un');
    expect(epn.ministere).toBe('Ministere A');
    expect(epn.regime).toBe('EPIC');
    expect(epn.acronyme).toBe('EPN1');

    const encore = await ensureEpnReference({ ...options, apply: true });
    expect(encore.created).toEqual({ ministeres: 0, epns: 0 });
    expect(encore.existing).toEqual({ ministeres: 2, epns: 2 });
    expect(await compterReferentiels('ministeres')).toBe(2);
    expect(await compterReferentiels('epn')).toBe(2);
  });
}

describe('init-structures, seed commun et EPN — version MongoDB (sigbd_corecheck)', () => {
  beforeAll(async () => {
    config.CORE_STORE = 'mongo';
    config.REFERENCE_STORE = 'mongo';
    config.MONGODB_URI = URI_CORECHECK;
    expect(loadConfig().MONGODB_URI).toBe(URI_CORECHECK);
    expect(loadConfig().CORE_STORE).toBe('mongo');
    await ouvrirBase();
    expect(loadConfig().MONGODB_URI).toBe(URI_CORECHECK);
    await nettoyer();
  });

  afterAll(async () => {
    await nettoyer();
    await fermerBase();
    Object.assign(config, AVANT);
  });

  beforeEach(async () => {
    installerSorties();
    ecrireFixturesStructures();
    ecrireFixturesEpn();
    await nettoyer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  testsCommuns();
});

describe.skipIf(!oracleConfiguree)('init-structures, seed commun et EPN — version Oracle (sigbd_test)', () => {
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
    ecrireFixturesStructures();
    ecrireFixturesEpn();
    await nettoyer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  testsCommuns();
});

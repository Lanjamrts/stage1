"use strict";

// Gabarits (config), modules, périodes, référentiels et options de champs
// avec CORE_STORE=oracle, REFERENCE_STORE=oracle et AUDIT_STORE=oracle :
// les cinq fichiers de l'étape 41.2 servis par les dépôts Module, Structure,
// Region et Periode sur Oracle. Même montage que
// backend/tests/auth-core-oracle.test.js.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/services/auth.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getReferentielRepository } from '../src/repositories/referentielRepository.js';
import { getAuditRepository } from '../src/repositories/auditRepository.js';
import { resolveOptions } from '../src/services/moduleMeta.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const IM_DEV = '900101';
const IM_CLIENT = '900102';
const MDP = 'Test@2026';
const EPN_VALEUR = 'EPN Oracle 41.2';

let app;
let coreStoreAvant;
let referenceStoreAvant;
let auditStoreAvant;
let agentDev;
let agentClient;
let structSRSP;
let periodeRef;
let client;
let modaId;
let modcId;

// Tables nécessaires à ce circuit (12 sur les 13 du schéma : PROFIL inutile).
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
  'REFERENTIEL',
  'JOURNAL_AUDIT',
];

// Ordre sûr : audit (sans FK), Saisie puis Remarque (FK sur UTILISATEUR),
// Utilisateur, Module, Structure, Periode, Region (dépendantes dans cet ordre).
async function nettoyer() {
  await getAuditRepository().supprimerTout();
  await getSaisieRepository().supprimerTout();
  await getRemarqueRepository().supprimerTout();
  await getUtilisateurRepository().supprimerTout();
  await getModuleRepository().supprimerTout();
  await getStructureRepository().supprimerTout();
  await getPeriodeRepository().supprimerTout();
  await getRegionRepository().supprimerTout();
}

async function nouvelUtilisateur(overrides) {
  return getUtilisateurRepository().creer({
    nom: 'Nom',
    prenom: 'Prenom',
    direction: 'Direction',
    service: 'Service',
    passwordHash: await hashPassword(MDP),
    role: 'client',
    status: 'actif',
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    structureId: String(overrides.structureId),
    ...overrides,
  });
}

function corpsGabarit(overrides = {}) {
  return {
    code: 'modx',
    label: 'Gabarit test',
    periodicity: 'monthly',
    kind: 'periodic',
    structureTypes: ['SRSP'],
    fields: [{ key: 'valeur', type: 'text', label: 'Valeur' }],
    ...overrides,
  };
}

describe.skipIf(!oracleConfiguree)(
  'Bascule CORE_STORE + REFERENCE_STORE + AUDIT_STORE = oracle — modules, structures, régions, périodes',
  () => {
    beforeAll(async () => {
      coreStoreAvant = process.env.CORE_STORE;
      referenceStoreAvant = process.env.REFERENCE_STORE;
      auditStoreAvant = process.env.AUDIT_STORE;
      process.env.CORE_STORE = 'oracle';
      process.env.REFERENCE_STORE = 'oracle';
      process.env.AUDIT_STORE = 'oracle';

      // L'import de l'APP se fait après les variables ; la configuration est en
      // cache (import de services/auth.js en tête de fichier) : les trois
      // interrupteurs y sont écrits directement ci-dessous.
      ({ default: app } = await import('../src/server.js'));
      loadConfig().CORE_STORE = 'oracle';
      loadConfig().REFERENCE_STORE = 'oracle';
      loadConfig().AUDIT_STORE = 'oracle';
      expect(loadConfig().CORE_STORE).toBe('oracle');
      expect(loadConfig().REFERENCE_STORE).toBe('oracle');
      expect(loadConfig().AUDIT_STORE).toBe('oracle');

      await mongoose.connect(process.env.MONGODB_URI);

      // Schéma appliqué seulement si une table manque : jamais de --reset.
      const db = await getKnex();
      const resultat = await db.raw(
        `SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN (${TABLES.map((t) => `'${t}'`).join(', ')})`
      );
      const lignes = resultat.rows || resultat;
      if (Number(lignes[0].N) < TABLES.length) {
        const code = await mainSchema([]);
        expect(code).toBe(0);
      }

      await nettoyer();

      // Fixtures créées avec les dépôts (Region, Structure, Utilisateur,
      // Periode, Referentiel).
      const { region } = await getRegionRepository().assurer('Analamanga');
      const { structure: srb } = await getStructureRepository().creerSiAbsent({
        code: 'SRB412',
        label: 'Alpha SRB',
        type: 'SRB',
        regionId: String(region._id),
      });
      ({ structure: structSRSP } = await getStructureRepository().creerSiAbsent({
        code: 'SRSP412',
        label: 'Beta SRSP',
        type: 'SRSP',
        regionId: String(region._id),
      }));
      expect(srb.type).toBe('SRB');

      const dev = await nouvelUtilisateur({
        im: IM_DEV,
        nom: 'Developpeur',
        prenom: 'Oracle',
        role: 'developpeur',
        structureId: String(srb._id),
      });
      client = await nouvelUtilisateur({
        im: IM_CLIENT,
        nom: 'Client',
        prenom: 'Oracle',
        role: 'client',
        structureId: String(structSRSP._id),
      });
      expect(dev.role).toBe('developpeur');

      ({ periode: periodeRef } = await getPeriodeRepository().creerSiAbsent({
        label: 'P2026-04',
        start: new Date('2026-04-01T00:00:00.000Z'),
        end: new Date('2026-04-30T23:59:59.000Z'),
        deadline: new Date('2026-05-10T00:00:00.000Z'),
        periodicity: 'monthly',
      }));
      await getPeriodeRepository().creerSiAbsent({
        label: 'P2026-01',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-01-31T23:59:59.000Z'),
        deadline: new Date('2026-02-10T00:00:00.000Z'),
        periodicity: 'monthly',
      });
      await getPeriodeRepository().creerSiAbsent({
        label: 'P2025-10',
        start: new Date('2025-10-01T00:00:00.000Z'),
        end: new Date('2025-10-31T23:59:59.000Z'),
        deadline: new Date('2025-11-10T00:00:00.000Z'),
        periodicity: 'monthly',
      });

      await getReferentielRepository().assurer({ type: 'epn', value: EPN_VALEUR });

      agentDev = request.agent(app);
      agentClient = request.agent(app);
      expect(
        (await agentDev.post('/api/auth/login').send({ im: IM_DEV, password: MDP })).status
      ).toBe(200);
      expect(
        (await agentClient.post('/api/auth/login').send({ im: IM_CLIENT, password: MDP })).status
      ).toBe(200);
    }, 60000);

    afterAll(async () => {
      await nettoyer();
      await mongoose.disconnect();
      await closeOracle();
      if (coreStoreAvant === undefined) {
        delete process.env.CORE_STORE;
      } else {
        process.env.CORE_STORE = coreStoreAvant;
      }
      if (referenceStoreAvant === undefined) {
        delete process.env.REFERENCE_STORE;
      } else {
        process.env.REFERENCE_STORE = referenceStoreAvant;
      }
      if (auditStoreAvant === undefined) {
        delete process.env.AUDIT_STORE;
      } else {
        process.env.AUDIT_STORE = auditStoreAvant;
      }
      loadConfig().CORE_STORE = coreStoreAvant ?? 'mongo';
      loadConfig().REFERENCE_STORE = referenceStoreAvant ?? 'mongo';
      loadConfig().AUDIT_STORE = auditStoreAvant ?? 'mongo';
    }, 60000);

    it('B1 : POST crée un gabarit (201) et refuse un code déjà pris (409)', async () => {
      // Créé dans l'ordre inverse du tri par code pour prouver que le tri ne
      // vient pas de l'ordre de création.
      const modc = await agentDev
        .post('/api/config/modules')
        .send(corpsGabarit({ code: 'modc', label: 'Gabarit C', structureTypes: ['SRB'] }));
      expect(modc.status).toBe(201);
      expect(modc.body.id).toMatch(/^[0-9]+$/);
      expect(modc.body).toEqual({ id: modc.body.id, code: 'modc', version: 1 });
      modcId = modc.body.id;

      const moda = await agentDev
        .post('/api/config/modules')
        .send(
          corpsGabarit({
            code: 'moda',
            label: 'Gabarit A',
            fields: [
              { key: 'localite', type: 'text', label: 'Localité' },
              { key: 'effectif', type: 'integer', label: 'Effectif' },
            ],
          })
        );
      expect(moda.status).toBe(201);
      expect(moda.body.version).toBe(1);
      modaId = moda.body.id;

      const modb = await agentDev
        .post('/api/config/modules')
        .send(corpsGabarit({ code: 'modb', label: 'Gabarit B' }));
      expect(modb.status).toBe(201);

      // Gabarit inactif (dépôt) : le developpeur doit quand même le voir.
      const inactif = await getModuleRepository().mettreAJour(modb.body.id, { active: false });
      expect(inactif.active).toBe(false);

      const doublon = await agentDev
        .post('/api/config/modules')
        .send(corpsGabarit({ code: 'modc', label: 'Gabarit C', structureTypes: ['SRB'] }));
      expect(doublon.status).toBe(409);
      expect(doublon.body.message).toBe('Ce code de gabarit existe déjà.');
    });

    it('B2 : GET /api/modules — developpeur voit tout (y compris inactif), client uniquement les actifs de son type', async () => {
      const devRes = await agentDev.get('/api/modules');
      expect(devRes.status).toBe(200);
      // Tri par code croissant (indépendant de l'ordre de création).
      expect(devRes.body.map((m) => m.code)).toEqual(['moda', 'modb', 'modc']);
      const modb = devRes.body.find((m) => m.code === 'modb');
      expect(modb.active).toBe(false);
      expect(devRes.body.every((m) => Array.isArray(m.fields))).toBe(true);
      expect(devRes.body.find((m) => m.code === 'moda').version).toBe(1);

      const clientRes = await agentClient.get('/api/modules');
      expect(clientRes.status).toBe(200);
      // client (structure SRSP) : actifs dont structureTypes contient SRSP.
      expect(clientRes.body.map((m) => m.code)).toEqual(['moda']);
      expect(clientRes.body[0].active).toBe(true);
      expect(clientRes.body[0].structureTypes).toContain('SRSP');
      expect(Array.isArray(clientRes.body[0].fields)).toBe(true);
    });

    it('B3 : GET /api/modules/:id — 200 avec fields, id 24 hex → 404, client hors type → 404', async () => {
      const lu = await agentDev.get(`/api/modules/${modaId}`);
      expect(lu.status).toBe(200);
      expect(lu.body.id).toBe(modaId);
      expect(lu.body.code).toBe('moda');
      expect(lu.body.version).toBe(1);
      expect(lu.body.builtin).toBe(false);
      expect(lu.body.fields).toEqual([
        { key: 'localite', type: 'text', label: 'Localité' },
        { key: 'effectif', type: 'integer', label: 'Effectif' },
      ]);

      const hex = await agentDev.get(`/api/modules/${'a'.repeat(24)}`);
      expect(hex.status).toBe(404);
      expect(hex.body.message).toBe('Module introuvable.');

      const horsType = await agentClient.get(`/api/modules/${modcId}`);
      expect(horsType.status).toBe(404);
      expect(horsType.body.message).toBe('Module introuvable.');
    });

    it('B4 : PUT crée la version 2, relecture de la version et des champs', async () => {
      const maj = await agentDev.put(`/api/config/modules/${modaId}`).send({
        label: 'Gabarit A v2',
        periodicity: 'monthly',
        allowedPeriodicities: ['monthly', 'quarterly'],
        kind: 'periodic',
        structureTypes: ['SRSP', 'SRB'],
        fields: [{ key: 'code_postal', type: 'text', label: 'Code postal' }],
      });
      expect(maj.status).toBe(200);
      expect(maj.body).toEqual({ id: modaId, code: 'moda', version: 2 });

      const relu = await agentDev.get(`/api/modules/${modaId}`);
      expect(relu.status).toBe(200);
      expect(relu.body.version).toBe(2);
      expect(relu.body.fields).toEqual([{ key: 'code_postal', type: 'text', label: 'Code postal' }]);
      expect([...relu.body.allowedPeriodicities].sort()).toEqual(['monthly', 'quarterly']);
      expect([...relu.body.structureTypes].sort()).toEqual(['SRB', 'SRSP']);
    });

    it('B5 : PATCH active:false — le client ne voit plus le gabarit', async () => {
      const patch = await agentDev
        .patch(`/api/config/modules/${modaId}/active`)
        .send({ active: false });
      expect(patch.status).toBe(200);
      expect(patch.body).toEqual({ id: modaId, active: false });

      const clientRes = await agentClient.get('/api/modules');
      expect(clientRes.status).toBe(200);
      expect(clientRes.body.map((m) => m.code)).not.toContain('moda');
      expect(clientRes.body).toHaveLength(0);
    });

    it('B6 : DELETE — confirmation erronée 400, saisie 409, succès 200, rapport de départ 403', async () => {
      const mauvais = await agentDev
        .delete(`/api/config/modules/${modcId}`)
        .send({ confirmCode: 'autre' });
      expect(mauvais.status).toBe(400);
      expect(mauvais.body.message).toBe('Le code saisi ne correspond pas.');

      const modd = await agentDev
        .post('/api/config/modules')
        .send(corpsGabarit({ code: 'modd', label: 'Gabarit D' }));
      expect(modd.status).toBe(201);
      await getSaisieRepository().creer({
        structureId: String(structSRSP._id),
        moduleId: modd.body.id,
        moduleVersion: modd.body.version,
        periodeId: String(periodeRef._id),
        authorId: String(client._id),
        status: 'brouillon',
        values: {},
      });
      const avecSaisie = await agentDev
        .delete(`/api/config/modules/${modd.body.id}`)
        .send({ confirmCode: 'modd' });
      expect(avecSaisie.status).toBe(409);
      expect(avecSaisie.body.message).toBe('Ce rapport contient des saisies : désactivez-le plutôt.');

      const suppression = await agentDev
        .delete(`/api/config/modules/${modcId}`)
        .send({ confirmCode: 'modc' });
      expect(suppression.status).toBe(200);
      expect(suppression.body).toEqual({ id: modcId, code: 'modc' });
      expect(await getModuleRepository().trouverParCode('modc')).toBeNull();

      // Rapport de départ (code du seed) : désactivation obligatoire.
      const departDoc = await getModuleRepository().creer({
        code: 'RA',
        label: 'Rapport annuel',
        periodicity: 'monthly',
        allowedPeriodicities: ['monthly', 'quarterly'],
        kind: 'periodic',
        structureTypes: ['SRB'],
        fields: [{ key: 'x', type: 'text', label: 'X' }],
        version: 1,
        active: true,
      });
      const depart = await agentDev
        .delete(`/api/config/modules/${String(departDoc._id)}`)
        .send({ confirmCode: 'RA' });
      expect(depart.status).toBe(403);
      expect(depart.body.message).toBe(
        'Ce rapport fait partie des rapports de départ : désactivez-le plutôt.'
      );
    });

    it('B7 : GET /api/periodes — start décroissant, dates ISO', async () => {
      const res = await agentDev.get('/api/periodes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.map((p) => p.label)).toEqual(['P2026-04', 'P2026-01', 'P2025-10']);
      const starts = res.body.map((p) => p.start);
      for (const start of starts) {
        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
      expect(new Date(starts[0]).getTime()).toBeGreaterThan(new Date(starts[1]).getTime());
      expect(new Date(starts[1]).getTime()).toBeGreaterThan(new Date(starts[2]).getTime());
      expect(res.body[0].periodicity).toBe('monthly');
      expect(res.body[0].id).toMatch(/^[0-9]+$/);
    });

    it('B8 : GET /api/referentiels/structures, ?full=1 (région nommée) et /regions', async () => {
      const structures = await agentDev.get('/api/referentiels/structures');
      expect(structures.status).toBe(200);
      expect(structures.body).toEqual({
        type: 'structures',
        values: ['Alpha SRB', 'Beta SRSP'],
      });

      const plein = await agentDev.get('/api/referentiels/structures?full=1');
      expect(plein.status).toBe(200);
      expect(plein.body.type).toBe('structures');
      expect(plein.body.items.map((s) => s.label)).toEqual(['Alpha SRB', 'Beta SRSP']);
      expect(plein.body.items[0]).toEqual({
        id: expect.stringMatching(/^[0-9]+$/),
        label: 'Alpha SRB',
        type: 'SRB',
        region: 'Analamanga',
      });
      expect(plein.body.items[1].region).toBe('Analamanga');

      const regions = await agentDev.get('/api/referentiels/regions');
      expect(regions.status).toBe(200);
      expect(regions.body).toEqual({ type: 'regions', values: ['Analamanga'] });
    });

    it('B9 : resolveOptions([structures, epn]) sert les listes triées des dépôts', async () => {
      const options = await resolveOptions(['structures', 'epn']);
      expect(options.structures).toEqual(['Alpha SRB', 'Beta SRSP']);
      expect(options.epn).toContain(EPN_VALEUR);
    });
  }
);

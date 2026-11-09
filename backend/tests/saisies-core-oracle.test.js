"use strict";

// Étape 41.3 — circuit saisies + remarques avec CORE_STORE=oracle,
// REFERENCE_STORE=oracle et AUDIT_STORE=oracle : les cinq fichiers de
// l'étape (saisieController, collecteController, consultationController,
// dashboardController, routes/remarques) servis par les dépôts Saisie et
// Remarque sur Oracle (écritures par mettreAJour avec validation atomique).
// Même montage que backend/tests/config-core-oracle.test.js.

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
import { getAuditRepository } from '../src/repositories/auditRepository.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const MDP = 'Test@2026';
const IM = {
  clientA: '900211',
  clientB: '900212',
  admin2A: '900213',
  admin2B: '900214',
  admin1: '900215',
  consultant: '900216',
  developpeur: '900217',
};

const NOT_FOUND = 'Ressource introuvable.';

let app;
let coreStoreAvant;
let referenceStoreAvant;
let auditStoreAvant;

// Fixtures (créées par les dépôts)
let regionA;
let regionB;
let structA;
let structB;
let modPeriodique;
let modEvenement;
let periode1;
let periode2;
let periode3;
let clientA;
let clientB;
let admin1;

// Agents supertest (cookies conservés entre les requêtes)
let agentClientA;
let agentClientB;
let agentAdmin2A;
let agentAdmin2B;
let agentAdmin1;
let agentConsultant;
let agentDev;

// Parcours
let idPeriodiqueA;
let idEvenement1;
let idEvenement2;
let idPeriodiqueB;
let idRemarque;

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

async function connexion(im) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password: MDP });
  expect(res.status).toBe(200, `login ${im} → ${res.status}`);
  return agent;
}

const idsDe = (body) => body.map((r) => r.id);
const memeEnsemble = (actuels, attendus) => {
  expect([...actuels].sort()).toEqual([...attendus].sort());
};

describe.skipIf(!oracleConfiguree)(
  'Bascule CORE_STORE + REFERENCE_STORE + AUDIT_STORE = oracle — saisies et remarques',
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

      // Deux régions, chacune avec une structure régionale.
      ({ region: regionA } = await getRegionRepository().assurer('Analamanga'));
      ({ region: regionB } = await getRegionRepository().assurer('Atsinanana'));
      ({ structure: structA } = await getStructureRepository().creerSiAbsent({
        code: 'SRBA413',
        label: 'Structure A 41.3',
        type: 'SRB',
        regionId: String(regionA._id),
      }));
      ({ structure: structB } = await getStructureRepository().creerSiAbsent({
        code: 'SRSPB413',
        label: 'Structure B 41.3',
        type: 'SRSP',
        regionId: String(regionB._id),
      }));
      expect(structA.type).toBe('SRB');
      expect(structB.type).toBe('SRSP');

      // Un client par structure, un admin2 par région, un admin1, un
      // consultant et un developpeur (mots de passe hachés avec hashPassword).
      clientA = await nouvelUtilisateur({
        im: IM.clientA,
        nom: 'Rakoto',
        prenom: 'Alice',
        role: 'client',
        structureId: String(structA._id),
      });
      clientB = await nouvelUtilisateur({
        im: IM.clientB,
        nom: 'Rasoa',
        prenom: 'Berie',
        role: 'client',
        structureId: String(structB._id),
      });
      await nouvelUtilisateur({
        im: IM.admin2A,
        nom: 'Andria',
        prenom: 'Hery',
        role: 'admin2',
        structureId: String(structA._id),
      });
      await nouvelUtilisateur({
        im: IM.admin2B,
        nom: 'Ranaivo',
        prenom: 'Voahangy',
        role: 'admin2',
        structureId: String(structB._id),
      });
      admin1 = await nouvelUtilisateur({
        im: IM.admin1,
        nom: 'Ranaivo',
        prenom: 'Hery',
        role: 'admin1',
        structureId: String(structA._id),
      });
      await nouvelUtilisateur({
        im: IM.consultant,
        nom: 'Rakoto',
        prenom: 'Fanja',
        role: 'consultant',
        structureId: String(structA._id),
      });
      await nouvelUtilisateur({
        im: IM.developpeur,
        nom: 'Testeur',
        prenom: 'Oracle',
        role: 'developpeur',
        structureId: String(structA._id),
      });

      // Un module périodique et un module d'événement, ouverts aux deux types
      // de structure. Champs minimaux : aucune source de référentiel.
      modPeriodique = await getModuleRepository().creer({
        code: 'MODP413',
        label: 'Module périodique 41.3',
        periodicity: 'monthly',
        kind: 'periodic',
        structureTypes: ['SRB', 'SRSP'],
        fields: [{ key: 'valeur', type: 'integer', label: 'Valeur', required: true }],
        version: 1,
        active: true,
      });
      modEvenement = await getModuleRepository().creer({
        code: 'MODE413',
        label: 'Module événement 41.3',
        periodicity: 'monthly',
        kind: 'event',
        structureTypes: ['SRB', 'SRSP'],
        fields: [{ key: 'commentaire', type: 'text', label: 'Commentaire', required: true }],
        version: 1,
        active: true,
      });
      expect(String(modPeriodique._id)).toMatch(/^[0-9]+$/);

      // Plusieurs périodes mensuelles déjà échues (pour le tableau de bord).
      ({ periode: periode1 } = await getPeriodeRepository().creerSiAbsent({
        label: 'P2026-01',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-01-31T23:59:59.000Z'),
        deadline: new Date('2026-02-10T00:00:00.000Z'),
        periodicity: 'monthly',
      }));
      ({ periode: periode2 } = await getPeriodeRepository().creerSiAbsent({
        label: 'P2026-02',
        start: new Date('2026-02-01T00:00:00.000Z'),
        end: new Date('2026-02-28T23:59:59.000Z'),
        deadline: new Date('2026-03-10T00:00:00.000Z'),
        periodicity: 'monthly',
      }));
      ({ periode: periode3 } = await getPeriodeRepository().creerSiAbsent({
        label: 'P2026-03',
        start: new Date('2026-03-01T00:00:00.000Z'),
        end: new Date('2026-03-31T23:59:59.000Z'),
        deadline: new Date('2026-04-10T00:00:00.000Z'),
        periodicity: 'monthly',
      }));
      expect(String(periode2._id)).toMatch(/^[0-9]+$/);

      agentClientA = await connexion(IM.clientA);
      agentClientB = await connexion(IM.clientB);
      agentAdmin2A = await connexion(IM.admin2A);
      agentAdmin2B = await connexion(IM.admin2B);
      agentAdmin1 = await connexion(IM.admin1);
      agentConsultant = await connexion(IM.consultant);
      agentDev = await connexion(IM.developpeur);
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

    it('S1 : client crée une saisie périodique (201, brouillon)', async () => {
      const res = await agentClientA.post('/api/saisies').send({
        moduleId: String(modPeriodique._id),
        periodeId: String(periode1._id),
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('brouillon');
      expect(res.body.id).toMatch(/^[0-9]+$/);
      idPeriodiqueA = res.body.id;
    });

    it('S2 : même clé (structure + module + période) → 409 avec existingId', async () => {
      const res = await agentClientA.post('/api/saisies').send({
        moduleId: String(modPeriodique._id),
        periodeId: String(periode1._id),
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Une saisie existe déjà pour cette période.');
      expect(res.body.existingId).toBe(idPeriodiqueA);
    });

    it("S3 : module d'événement avec eventDate (201) puis seconde saisie identique (201)", async () => {
      const corps = { moduleId: String(modEvenement._id), eventDate: '2026-06-15' };
      const premiere = await agentClientA.post('/api/saisies').send(corps);
      expect(premiere.status).toBe(201);
      idEvenement1 = premiere.body.id;

      const seconde = await agentClientA.post('/api/saisies').send(corps);
      expect(seconde.status).toBe(201);
      idEvenement2 = seconde.body.id;
      expect(idEvenement2).not.toBe(idEvenement1);
    });

    it("S3b : l'autre client crée et soumet sa saisie (future masse de test admin2)", async () => {
      const cree = await agentClientB.post('/api/saisies').send({
        moduleId: String(modPeriodique._id),
        periodeId: String(periode1._id),
      });
      expect(cree.status).toBe(201);
      idPeriodiqueB = cree.body.id;

      const save = await agentClientB
        .put(`/api/saisies/${idPeriodiqueB}`)
        .send({ values: { valeur: 7 } });
      expect(save.status).toBe(200);

      const soumis = await agentClientB.post(`/api/saisies/${idPeriodiqueB}/soumettre`).send({});
      expect(soumis.status).toBe(200);
      expect(soumis.body.status).toBe('soumise');
    });

    it('S4 : PUT enregistre le brouillon (200, savedAt)', async () => {
      const res = await agentClientA
        .put(`/api/saisies/${idPeriodiqueA}`)
        .send({ values: { valeur: 42 } });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Brouillon enregistré.');
      expect(res.body.savedAt).toBeTruthy();
    });

    it('S5 : GET liste — le client ne voit que ses propres saisies', async () => {
      const res = await agentClientA.get('/api/saisies');
      expect(res.status).toBe(200);
      memeEnsemble(idsDe(res.body), [idPeriodiqueA, idEvenement1, idEvenement2]);
      for (const row of res.body) {
        expect(row.structureId).toBe(String(structA._id));
      }
      expect(idsDe(res.body)).not.toContain(idPeriodiqueB);
    });

    it('S6 : GET une saisie avec son module et ses fields', async () => {
      const res = await agentClientA.get(`/api/saisies/${idPeriodiqueA}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(idPeriodiqueA);
      expect(res.body.status).toBe('brouillon');
      expect(res.body.values).toEqual({ valeur: 42 });
      expect(res.body.module).toBeTruthy();
      expect(res.body.module.code).toBe('MODP413');
      expect(Array.isArray(res.body.module.fields)).toBe(true);
      expect(res.body.module.fields[0].key).toBe('valeur');
      expect(res.body.periodeLabel).toBe('P2026-01');
      expect(res.body.authorLabel).toBe(`${clientA.prenom} ${clientA.nom}`);
    });

    it('S7 : GET historique — étape « créée » portée par le client', async () => {
      const res = await agentClientA.get(`/api/saisies/${idPeriodiqueA}/historique`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].decision).toBe('creee');
      expect(res.body[0].decisionLabel).toBe('Créée');
      expect(res.body[0].actor).toBe(`${clientA.prenom} ${clientA.nom}`);
      expect(res.body[0].date).toBeTruthy();
    });

    it('S8 : id de 24 caractères hexadécimaux → 404 (GET et PUT)', async () => {
      const hex = 'a'.repeat(24);
      const lu = await agentClientA.get(`/api/saisies/${hex}`);
      expect(lu.status).toBe(404);
      expect(lu.body.message).toBe(NOT_FOUND);

      // Auparavant : erreur serveur (CastError non rattrapé) — 404 voulu.
      const maj = await agentClientA.put(`/api/saisies/${hex}`).send({ values: {} });
      expect(maj.status).toBe(404);
      expect(maj.body.message).toBe(NOT_FOUND);
    });

    it('S9 : soumission (brouillon → soumise)', async () => {
      const res = await agentClientA.post(`/api/saisies/${idPeriodiqueA}/soumettre`).send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Saisie soumise.', status: 'soumise' });
    });

    it("S10 : admin2 voit la saisie soumise de sa région, jamais un brouillon, rien de l'autre région", async () => {
      const res = await agentAdmin2A.get('/api/saisies');
      expect(res.status).toBe(200);
      expect(idsDe(res.body)).toEqual([idPeriodiqueA]);
      for (const row of res.body) {
        expect(row.status).not.toBe('brouillon');
        expect(row.structureId).toBe(String(structA._id));
      }

      // Détail : brouillon de sa région → 404, saisie de l'autre région → 404.
      const brouillon = await agentAdmin2A.get(`/api/saisies/${idEvenement1}`);
      expect(brouillon.status).toBe(404);
      const autreRegion = await agentAdmin2A.get(`/api/saisies/${idPeriodiqueB}`);
      expect(autreRegion.status).toBe(404);

      // Miroir : l'admin2 de l'autre région ne voit que la sienne.
      const miroir = await agentAdmin2B.get('/api/saisies');
      expect(miroir.status).toBe(200);
      expect(idsDe(miroir.body)).toEqual([idPeriodiqueB]);
    });

    it('S11 : admin2 valide (soumise → validee)', async () => {
      const res = await agentAdmin2A.post(`/api/saisies/${idPeriodiqueA}/valider`).send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Saisie validée.', status: 'validee' });
    });

    it('S11b : le client enregistre puis soumet son saisie d’événement', async () => {
      const save = await agentClientA
        .put(`/api/saisies/${idEvenement1}`)
        .send({ values: { commentaire: 'Événement test' } });
      expect(save.status).toBe(200);

      const soumis = await agentClientA.post(`/api/saisies/${idEvenement1}/soumettre`).send({});
      expect(soumis.status).toBe(200);
      expect(soumis.body.status).toBe('soumise');
    });

    it('S12 : rejet sans motif → 400 puis rejet avec motif → 200', async () => {
      const sansMotif = await agentAdmin2A.post(`/api/saisies/${idEvenement1}/rejeter`).send({});
      expect(sansMotif.status).toBe(400);
      expect(sansMotif.body.message).toBe('Le motif de rejet est obligatoire.');

      const avecMotif = await agentAdmin2A
        .post(`/api/saisies/${idEvenement1}/rejeter`)
        .send({ motif: 'Merci de compléter la description.' });
      expect(avecMotif.status).toBe(200);
      expect(avecMotif.body).toEqual({ message: 'Saisie rejetée.', status: 'rejetee' });
    });

    it('S13 : resoumission après rejet (rejetee → soumise)', async () => {
      const res = await agentClientA.post(`/api/saisies/${idEvenement1}/soumettre`).send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Saisie soumise.', status: 'soumise' });
    });

    it('S14 : collecte admin1 — filtres seuls et combinés (intersections)', async () => {
      const tous = await agentAdmin1.get('/api/collecte');
      expect(tous.status).toBe(200);
      memeEnsemble(idsDe(tous.body), [idPeriodiqueA, idEvenement1, idEvenement2, idPeriodiqueB]);

      // Régions (noms)
      const dansA = await agentAdmin1.get('/api/collecte?regions=Analamanga');
      expect(dansA.status).toBe(200);
      memeEnsemble(idsDe(dansA.body), [idPeriodiqueA, idEvenement1, idEvenement2]);
      const dansB = await agentAdmin1.get('/api/collecte?regions=Atsinanana');
      memeEnsemble(idsDe(dansB.body), [idPeriodiqueB]);

      // Types de structure
      const srb = await agentAdmin1.get('/api/collecte?types=SRB');
      memeEnsemble(idsDe(srb.body), [idPeriodiqueA, idEvenement1, idEvenement2]);
      const srsp = await agentAdmin1.get('/api/collecte?types=SRSP');
      memeEnsemble(idsDe(srsp.body), [idPeriodiqueB]);

      // Intersection vide : région Analamanga ∩ type SRSP = aucune structure
      const vide = await agentAdmin1.get('/api/collecte?regions=Analamanga&types=SRSP');
      expect(vide.status).toBe(200);
      expect(vide.body).toEqual([]);

      // Structure précise
      const structure = await agentAdmin1.get(`/api/collecte?structure=${String(structA._id)}`);
      memeEnsemble(idsDe(structure.body), [idPeriodiqueA, idEvenement1, idEvenement2]);

      // Statuts
      const soumises = await agentAdmin1.get('/api/collecte?statut=soumise');
      memeEnsemble(idsDe(soumises.body), [idEvenement1, idPeriodiqueB]);
      const brouillons = await agentAdmin1.get('/api/collecte?statut=brouillon');
      memeEnsemble(idsDe(brouillons.body), [idEvenement2]);
      const validees = await agentAdmin1.get('/api/collecte?statut=validee');
      memeEnsemble(idsDe(validees.body), [idPeriodiqueA]);

      // Modules : seul, liste, et intersection module ∩ modules
      const moduleSeul = await agentAdmin1.get(`/api/collecte?module=${String(modPeriodique._id)}`);
      memeEnsemble(idsDe(moduleSeul.body), [idPeriodiqueA, idPeriodiqueB]);
      const listeModules = await agentAdmin1.get(
        `/api/collecte?modules=${modPeriodique._id},${modEvenement._id}`
      );
      memeEnsemble(idsDe(listeModules.body), [
        idPeriodiqueA,
        idEvenement1,
        idEvenement2,
        idPeriodiqueB,
      ]);
      const contradiction = await agentAdmin1.get(
        `/api/collecte?module=${modPeriodique._id}&modules=${modEvenement._id}`
      );
      expect(contradiction.status).toBe(200);
      expect(contradiction.body).toEqual([]);
      const coherent = await agentAdmin1.get(
        `/api/collecte?module=${modPeriodique._id}&modules=${modPeriodique._id},${modEvenement._id}`
      );
      memeEnsemble(idsDe(coherent.body), [idPeriodiqueA, idPeriodiqueB]);

      // Période
      const periode = await agentAdmin1.get(`/api/collecte?periode=${String(periode1._id)}`);
      memeEnsemble(idsDe(periode.body), [idPeriodiqueA, idPeriodiqueB]);

      // Combinés
      const combine1 = await agentAdmin1.get('/api/collecte?regions=Analamanga&statut=soumise');
      memeEnsemble(idsDe(combine1.body), [idEvenement1]);
      const combine2 = await agentAdmin1.get(
        `/api/collecte?structure=${structA._id}&module=${modEvenement._id}`
      );
      memeEnsemble(idsDe(combine2.body), [idEvenement1, idEvenement2]);
      const combine3 = await agentAdmin1.get(
        `/api/collecte?regions=Analamanga&periode=${periode1._id}&statut=validee`
      );
      memeEnsemble(idsDe(combine3.body), [idPeriodiqueA]);
      const combineVide = await agentAdmin1.get(
        '/api/collecte?regions=Analamanga&types=SRSP&statut=soumise'
      );
      expect(combineVide.body).toEqual([]);
    });

    it('S15 : historique de collecte — métadonnées seulement (values null)', async () => {
      const res = await agentAdmin1.get('/api/collecte/historique');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      for (const row of res.body) {
        expect(row.values).toBeNull();
      }
    });

    it('S16 : export xlsx (avec et sans ids) et refus « none_selected »', async () => {
      const sansIds = await agentAdmin1.get('/api/collecte/export?format=xlsx');
      expect(sansIds.status).toBe(200);
      expect(sansIds.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      const avecIds = await agentAdmin1.get(
        `/api/collecte/export?format=xlsx&ids=${idPeriodiqueA}`
      );
      expect(avecIds.status).toBe(200);
      expect(avecIds.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(String(avecIds.headers['content-disposition'])).toContain('sigbd-collecte-');

      // Id valide mais inexistant → 400 none_selected
      const inexistant = await agentAdmin1.get('/api/collecte/export?format=xlsx&ids=999999999');
      expect(inexistant.status).toBe(400);
      expect(inexistant.body.message).toBe('Aucune saisie sélectionnée à exporter.');

      // Hors périmètre : admin2 + id d'une saisie de l'autre région → 400.
      const horsPerimetre = await agentAdmin2A.get(
        `/api/collecte/export?format=xlsx&ids=${idPeriodiqueB}`
      );
      expect(horsPerimetre.status).toBe(400);
      expect(horsPerimetre.body.message).toBe('Aucune saisie sélectionnée à exporter.');

      const dansPerimetre = await agentAdmin2A.get(
        `/api/collecte/export?format=xlsx&ids=${idPeriodiqueA}`
      );
      expect(dansPerimetre.status).toBe(200);
    });

    it('S17 : admin2 exporte sa saisie validée (validee → exportee)', async () => {
      const res = await agentAdmin2A
        .post(`/api/saisies/${idPeriodiqueA}/exporter`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Saisie exportée vers la base centrale.',
        status: 'exportee',
      });
    });

    it('S18 : consultant — liste de consultation uniquement exportee/archivee', async () => {
      const res = await agentConsultant.get('/api/consultation');
      expect(res.status).toBe(200);
      expect(idsDe(res.body)).toContain(idPeriodiqueA);
      for (const row of res.body) {
        expect(['exportee', 'archivee']).toContain(row.status);
      }
      expect(idsDe(res.body)).not.toContain(idEvenement1);
      expect(idsDe(res.body)).not.toContain(idEvenement2);
      expect(idsDe(res.body)).not.toContain(idPeriodiqueB);
    });

    it('S19 : tableau de bord admin1 — totaux cohérents', async () => {
      const res = await agentAdmin1.get('/api/dashboard');
      expect(res.status).toBe(200);
      const { totals, regions, structuresEnRetard } = res.body;

      // 3 périodes échues × 1 module périodique (mensuel) × 2 structures.
      expect(totals.attendues).toBe(6);
      // Les deux saisies périodiques « soumise ou ultérieur » couvrent P2026-01.
      expect(totals.soumises).toBe(2);
      expect(totals.enRetard).toBe(totals.attendues - totals.soumises);
      expect(totals.tauxSoumission).toBe(33.3);
      expect(totals.tauxRejet).toBe(0); // aucune rejetee au moment du calcul

      expect(regions).toHaveLength(2);
      for (const row of regions) {
        expect(row.structures).toBe(1);
        expect(row.attendues).toBe(3);
        expect(row.soumises).toBe(1);
        expect(row.enRetard).toBe(2);
      }
      expect(structuresEnRetard).toHaveLength(2);
    });

    it('S20 : remarques — POST 201, /mes, boîte developpeur avec auteur résolu, PATCH état', async () => {
      const cree = await agentAdmin1.post('/api/remarques').send({
        context: 'Collecte — P2026-01',
        text: 'Nombre de structures en retard ?',
      });
      expect(cree.status).toBe(201);
      expect(cree.body.message).toBe('Remarque envoyée.');
      expect(cree.body.id).toMatch(/^[0-9]+$/);
      idRemarque = cree.body.id;

      const mes = await agentAdmin1.get('/api/remarques/mes');
      expect(mes.status).toBe(200);
      expect(idsDe(mes.body)).toContain(idRemarque);
      for (const row of mes.body) {
        expect(row.author).toBe(`${admin1.prenom} ${admin1.nom}`);
      }

      const boite = await agentDev.get('/api/remarques');
      expect(boite.status).toBe(200);
      const ligne = boite.body.find((r) => r.id === idRemarque);
      expect(ligne).toBeDefined();
      expect(ligne.author).toBe(`${admin1.prenom} ${admin1.nom}`);
      expect(ligne.authorRole).toBe('admin1');
      expect(ligne.state).toBe('nouvelle');

      const etat = await agentDev
        .patch(`/api/remarques/${idRemarque}/etat`)
        .send({ etat: 'en_cours' });
      expect(etat.status).toBe(200);
      expect(etat.body).toEqual({ message: 'État mis à jour.', state: 'en_cours' });

      // Id bien formé mais inconnu → 404 ; id de 24 hexadécimaux → 404.
      const inconnu = await agentDev
        .patch('/api/remarques/999999999/etat')
        .send({ etat: 'traitee' });
      expect(inconnu.status).toBe(404);
      expect(inconnu.body.message).toBe(NOT_FOUND);

      const hex = await agentDev
        .patch(`/api/remarques/${'a'.repeat(24)}/etat`)
        .send({ etat: 'traitee' });
      expect(hex.status).toBe(404);
      expect(hex.body.message).toBe(NOT_FOUND);
    });

    it('S21 : DELETE d’un module qui a des saisies → 409', async () => {
      const res = await agentDev
        .delete(`/api/config/modules/${String(modEvenement._id)}`)
        .send({ confirmCode: 'MODE413' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        'Ce rapport contient des saisies : désactivez-le plutôt.'
      );
      // Le module existe toujours.
      expect(await getModuleRepository().trouverParId(String(modEvenement._id))).not.toBeNull();
    });
  }
);

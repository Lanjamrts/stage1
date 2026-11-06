"use strict";

// Contrat du dépôt Saisie : la même suite est exécutée pour les deux
// implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).
// MongoDB cible une base dédiée (sigbd_corecheck) : les données semées de
// sigbd_test ne sont jamais touchées.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { loadConfig } from '../src/config.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const URI_MONGO = 'mongodb://127.0.0.1:27017/sigbd_corecheck';

// loadConfig() met en cache la configuration : le stockage est changé sur cet
// objet, et les dépôts le relisent à CHAQUE appel.
function fixerCoreStore(valeur) {
  loadConfig().CORE_STORE = valeur;
}

const depotSaisie = () => getSaisieRepository();
const depotRemarque = () => getRemarqueRepository();
const depotUtilisateur = () => getUtilisateurRepository();
const depotModule = () => getModuleRepository();
const depotStructure = () => getStructureRepository();
const depotPeriode = () => getPeriodeRepository();
const depotRegion = () => getRegionRepository();

// Clés exactes d'une saisie périodique (sans eventDate), __v MongoDB en plus
// (forme .lean()) ; Oracle expose eventDate (null) et n'a pas de __v.
const CLES = [
  '_id',
  'authorId',
  'createdAt',
  'dates',
  'moduleId',
  'moduleVersion',
  'periodeId',
  'status',
  'structureId',
  'updatedAt',
  'values',
  'validations',
];

// Ids bien formés mais absents / valides pour l'autre stockage.
function ID_ABSENT() {
  return loadConfig().CORE_STORE === 'oracle' ? '99999999999' : 'a'.repeat(24);
}
function ID_AUTRE() {
  return loadConfig().CORE_STORE === 'oracle' ? 'a'.repeat(24) : '12345';
}

let sequence = 0;

async function nouvelleStructure(type = 'SRB') {
  sequence += 1;
  const { structure } = await depotStructure().creerSiAbsent({
    code: `STR${sequence}`,
    label: `Structure ${sequence}`,
    type,
  });
  return structure;
}

async function nouvelUtilisateur(overrides = {}) {
  sequence += 1;
  const structureId =
    overrides.structureId !== undefined
      ? overrides.structureId
      : String((await nouvelleStructure())._id);
  return depotUtilisateur().creer({
    im: `IM${sequence}`,
    nom: 'Nom',
    prenom: 'Prenom',
    direction: 'Direction',
    service: 'Service',
    passwordHash: 'hash',
    role: 'client',
    status: 'actif',
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    ...overrides,
    structureId,
  });
}

async function nouveauModule(overrides = {}) {
  sequence += 1;
  return depotModule().creer({
    code: `MOD${sequence}`,
    label: `Module ${sequence}`,
    periodicity: 'monthly',
    allowedPeriodicities: ['monthly', 'quarterly'],
    kind: 'periodic',
    structureTypes: ['SRB'],
    version: 1,
    active: true,
    fields: { sections: [] },
    ...overrides,
  });
}

async function nouvellePeriode(periodicity = 'monthly') {
  sequence += 1;
  const { periode } = await depotPeriode().creerSiAbsent({
    label: `Periode ${sequence}`,
    start: new Date(Date.UTC(2026, 0, sequence)),
    end: new Date(Date.UTC(2026, 0, sequence + 20)),
    deadline: new Date(Date.UTC(2026, 0, sequence + 25)),
    periodicity,
  });
  return periode;
}

// Jeu de base : une structure, un module périodique, une période, un auteur.
async function jeuSaisie() {
  const structure = await nouvelleStructure();
  const moduleDoc = await nouveauModule();
  const periode = await nouvellePeriode();
  const utilisateur = await nouvelUtilisateur({ structureId: String(structure._id) });
  return { structure, moduleDoc, periode, utilisateur };
}

function docSaisie(jeu, overrides = {}) {
  return {
    structureId: String(jeu.structure._id),
    moduleId: String(jeu.moduleDoc._id),
    moduleVersion: jeu.moduleDoc.version,
    periodeId: String(jeu.periode._id),
    authorId: String(jeu.utilisateur._id),
    status: 'brouillon',
    values: {},
    dates: { created: new Date('2026-02-01T08:00:00.000Z'), submitted: null, exported: null },
    ...overrides,
  };
}

const ids = (saisies) => saisies.map((s) => String(s._id));

function suiteContrat(nom, { mode, skip = false, preparer, nettoyer }) {
  describe.skipIf(skip)(nom, () => {
    beforeAll(async () => {
      await preparer();
    }, 60000);

    afterAll(async () => {
      if (nettoyer) await nettoyer();
      fixerCoreStore('mongo');
    }, 60000);

    beforeEach(async () => {
      // Ordre sûr : Saisie puis Remarque (FK sur UTILISATEUR), Utilisateur,
      // Module, Structure, Periode, Region (dépendantes dans cet ordre).
      await depotSaisie().supprimerTout();
      await depotRemarque().supprimerTout();
      await depotUtilisateur().supprimerTout();
      await depotModule().supprimerTout();
      await depotStructure().supprimerTout();
      await depotPeriode().supprimerTout();
      await depotRegion().supprimerTout();
    });

    // ---------------------------------------------------------------- Forme

    it('S1 : forme exacte des objets saisie (périodique)', async () => {
      const jeu = await jeuSaisie();
      const cree = await depotSaisie().creer(docSaisie(jeu));

      // Mongoose n'écrit pas les objets vides (minimize) : normaliserSaisie
      // complète values à {} à la lecture, comme Oracle.
      const attendues = mode === 'mongo' ? [...CLES, '__v'] : [...CLES, 'eventDate'];
      expect(Object.keys(cree).sort()).toEqual(attendues.sort());
      expect(cree.status).toBe('brouillon');
      expect(cree.moduleVersion).toBe(1);
      expect(cree.values).toEqual({});
      expect(cree.validations).toEqual([]);
      expect(Object.keys(cree.dates).sort()).toEqual(['created', 'exported', 'submitted']);
      expect(cree.dates.created).toBeInstanceOf(Date);
      expect(cree.dates.submitted).toBeNull();
      expect(cree.dates.exported).toBeNull();
      expect(cree.createdAt).toBeInstanceOf(Date);
      expect(cree.updatedAt).toBeInstanceOf(Date);
      expect(String(cree.structureId)).toBe(String(jeu.structure._id));
      expect(String(cree.moduleId)).toBe(String(jeu.moduleDoc._id));
      expect(String(cree.periodeId)).toBe(String(jeu.periode._id));
      expect(String(cree.authorId)).toBe(String(jeu.utilisateur._id));
      if (mode === 'mongo') {
        expect(String(cree._id)).toMatch(/^[0-9a-f]{24}$/);
        expect(cree).not.toHaveProperty('eventDate');
      } else {
        expect(typeof cree._id).toBe('string');
        expect(cree._id).toMatch(/^[1-9][0-9]{0,17}$/);
        expect(cree.eventDate).toBeNull();
      }
    });

    // ------------------------------------------------------- creer + doublon

    it("S2 : creer écrit la saisie puis violation de l'index unique → DOUBLON", async () => {
      const jeu = await jeuSaisie();
      const premiere = await depotSaisie().creer(docSaisie(jeu));
      expect(String(premiere._id)).toBeTruthy();

      const trouvee = await depotSaisie().trouverParCle({
        structureId: String(jeu.structure._id),
        moduleId: String(jeu.moduleDoc._id),
        periodeId: String(jeu.periode._id),
      });
      expect(String(trouvee._id)).toBe(String(premiere._id));

      let erreur = null;
      try {
        await depotSaisie().creer(docSaisie(jeu));
      } catch (e) {
        erreur = e;
      }
      expect(erreur).not.toBeNull();
      expect(erreur.code).toBe('DOUBLON');
      expect(erreur.message).toBeTruthy();
      expect(erreur.cause).toBeDefined();
      expect(await depotSaisie().lister()).toHaveLength(1);
    });

    it("S3 : deux saisies d'événement identiques restent possibles", async () => {
      const jeu = await jeuSaisie();
      const moduleEvent = await nouveauModule({ kind: 'event' });
      const base = docSaisie(jeu, {
        moduleId: String(moduleEvent._id),
        periodeId: null,
        eventDate: new Date('2026-03-05T00:00:00.000Z'),
      });

      const premiere = await depotSaisie().creer(base);
      const deuxieme = await depotSaisie().creer(base);
      expect(String(premiere._id)).not.toBe(String(deuxieme._id));
      expect(await depotSaisie().lister()).toHaveLength(2);

      // La période reste absente (Mongo) ou nulle (Oracle) sur les deux.
      const relu = await depotSaisie().trouverParId(String(premiere._id));
      expect(relu.periodeId == null).toBe(true);
      expect(relu.eventDate).toBeInstanceOf(Date);
    });

    // ---------------------------------------------------------- trouverParId

    it('S4 : trouverParId présent/absent/invalide, avec et sans liens', async () => {
      const jeu = await jeuSaisie();
      const cree = await depotSaisie().creer(docSaisie(jeu));
      const id = String(cree._id);

      // Sans liens : simples références.
      const brut = await depotSaisie().trouverParId(id);
      expect(String(brut.structureId)).toBe(String(jeu.structure._id));
      expect(String(brut.moduleId)).toBe(String(jeu.moduleDoc._id));
      expect(String(brut.periodeId)).toBe(String(jeu.periode._id));
      expect(String(brut.authorId)).toBe(String(jeu.utilisateur._id));

      // Avec liens : objets complets, utilisateur SANS passwordHash.
      const liens = await depotSaisie().trouverParId(id, { avecLiens: true });
      expect(liens.structureId).toMatchObject({
        code: jeu.structure.code,
        label: jeu.structure.label,
      });
      expect(liens.moduleId).toMatchObject({
        code: jeu.moduleDoc.code,
        fields: { sections: [] },
      });
      expect(Array.isArray(liens.moduleId.allowedPeriodicities)).toBe(true);
      expect([...liens.moduleId.structureTypes]).toEqual(['SRB']);
      expect(liens.periodeId).toMatchObject({
        label: jeu.periode.label,
        periodicity: 'monthly',
      });
      expect(liens.authorId).not.toHaveProperty('passwordHash');
      expect(liens.authorId).toMatchObject({ im: jeu.utilisateur.im, role: 'client' });
      expect(String(liens.authorId._id)).toBe(String(jeu.utilisateur._id));

      // Saisie d'événement : periodeId null avec liens (les deux modes).
      const evenement = await depotSaisie().creer(
        docSaisie(jeu, {
          moduleId: String((await nouveauModule({ kind: 'event' }))._id),
          periodeId: null,
          eventDate: new Date('2026-03-06T00:00:00.000Z'),
        })
      );
      const liensEvt = await depotSaisie().trouverParId(String(evenement._id), {
        avecLiens: true,
      });
      expect(liensEvt.periodeId).toBeNull();

      // Absent (bien formé) ou invalide → null, sans exception.
      expect(await depotSaisie().trouverParId(ID_ABSENT())).toBeNull();
      expect(await depotSaisie().trouverParId('0')).toBeNull();
      expect(await depotSaisie().trouverParId('abc')).toBeNull();
      expect(await depotSaisie().trouverParId('')).toBeNull();
      expect(await depotSaisie().trouverParId(null)).toBeNull();
      expect(await depotSaisie().trouverParId(123)).toBeNull();
      expect(await depotSaisie().trouverParId(ID_AUTRE())).toBeNull();
      expect(await depotSaisie().trouverParId(ID_ABSENT(), { avecLiens: true })).toBeNull();

      // Référence introuvable → null (Mongo sans clé étrangère ; en Oracle
      // les FK rendent ce cas impossible, le null y signifie « pas de
      // référence » — testé ci-dessus avec l'événement).
      if (mode === 'mongo') {
        await depotStructure().supprimerTout();
        const orpheline = await depotSaisie().trouverParId(id, { avecLiens: true });
        expect(orpheline.structureId).toBeNull();
        expect(orpheline.moduleId).not.toBeNull();
      }
    });

    // ---------------------------------------------------------- trouverParCle

    it('S5 : trouverParCle applique l’égalité sur les clés fournies', async () => {
      const jeu = await jeuSaisie();
      const cree = await depotSaisie().creer(docSaisie(jeu));

      const trouvee = await depotSaisie().trouverParCle({
        structureId: String(jeu.structure._id),
        moduleId: String(jeu.moduleDoc._id),
        periodeId: String(jeu.periode._id),
      });
      expect(String(trouvee._id)).toBe(String(cree._id));

      // Sans periodeId : l'égalité ne porte que sur les clés fournies.
      const sansPeriode = await depotSaisie().trouverParCle({
        structureId: String(jeu.structure._id),
        moduleId: String(jeu.moduleDoc._id),
      });
      expect(String(sansPeriode._id)).toBe(String(cree._id));

      // Mauvaise période → null.
      const autrePeriode = await nouvellePeriode('quarterly');
      expect(
        await depotSaisie().trouverParCle({
          structureId: String(jeu.structure._id),
          moduleId: String(jeu.moduleDoc._id),
          periodeId: String(autrePeriode._id),
        })
      ).toBeNull();

      // Aucune clé ou id invalide → null.
      expect(await depotSaisie().trouverParCle({})).toBeNull();
      expect(await depotSaisie().trouverParCle()).toBeNull();
      expect(
        await depotSaisie().trouverParCle({
          structureId: 'abc',
          moduleId: String(jeu.moduleDoc._id),
          periodeId: String(jeu.periode._id),
        })
      ).toBeNull();
    });

    // ----------------------------------------------------------- mettreAJour

    it('S6 : mettreAJour change chaque champ, fusionne les dates, ajoute la validation', async () => {
      const jeu = await jeuSaisie();
      const cree = await depotSaisie().creer(docSaisie(jeu));
      const id = String(cree._id);

      // values : accents, imbriqué, unicode, null.
      const valeurs = {
        titre: 'Résumé éàü — 日本語 🎉',
        total: 1234.5,
        actif: true,
        rien: null,
        liste: [1, 'deux', { cle: 'valeur' }],
        profond: { interne: { cle: 'valeur' } },
      };
      expect((await depotSaisie().mettreAJour(id, { values: valeurs })).values).toEqual(valeurs);

      // status et moduleVersion.
      expect((await depotSaisie().mettreAJour(id, { status: 'soumise' })).status).toBe('soumise');
      expect((await depotSaisie().mettreAJour(id, { moduleVersion: 3 })).moduleVersion).toBe(3);

      // Fusion des dates : seule submitted change.
      const soumisLe = new Date('2026-02-02T10:00:00.000Z');
      const majDates = await depotSaisie().mettreAJour(id, { dates: { submitted: soumisLe } });
      expect(majDates.dates.submitted).toEqual(soumisLe);
      expect(majDates.dates.created).toEqual(new Date('2026-02-01T08:00:00.000Z'));
      expect(majDates.dates.exported).toBeNull();

      // Champs hors liste blanche refusés AVANT toute écriture.
      await expect(depotSaisie().mettreAJour(id, { inconnu: 1 })).rejects.toThrow(/inconnu/);
      await expect(depotSaisie().mettreAJour(id, { structureId: 'x' })).rejects.toThrow(
        /structureId/
      );
      await expect(depotSaisie().mettreAJour(id, { authorId: 'x' })).rejects.toThrow(/authorId/);
      await expect(depotSaisie().mettreAJour(id, { validations: [] })).rejects.toThrow(
        /validations/
      );
      await expect(
        depotSaisie().mettreAJour(id, { status: 'exportee', inconnu: 1 })
      ).rejects.toThrow(/inconnu/);
      expect((await depotSaisie().trouverParId(id)).status).toBe('soumise');

      // Validation ajoutée dans la même opération que la mise à jour.
      const valideLe = new Date('2026-02-03T09:00:00.000Z');
      const avecValidation = await depotSaisie().mettreAJour(
        id,
        { status: 'validee' },
        {
          decision: 'validee',
          actorId: String(jeu.utilisateur._id),
          actorLabel: 'Admin 2',
          date: valideLe,
        }
      );
      expect(avecValidation.status).toBe('validee');
      expect(avecValidation.validations).toHaveLength(1);
      expect(Object.keys(avecValidation.validations[0]).sort()).toEqual([
        'actorId',
        'actorLabel',
        'date',
        'decision',
        'motif',
      ]);
      expect(avecValidation.validations[0]).toMatchObject({
        decision: 'validee',
        actorLabel: 'Admin 2',
        date: valideLe,
      });
      expect(avecValidation.validations[0].motif).toBeNull();
      expect(String(avecValidation.validations[0].actorId)).toBe(String(jeu.utilisateur._id));

      // Ordre des validations conservé après plusieurs appels ; date par
      // défaut = maintenant ; actorId/motif absents → null.
      const avecDeuxieme = await depotSaisie().mettreAJour(
        id,
        {},
        { decision: 'exportee', actorLabel: 'Admin 2' }
      );
      expect(avecDeuxieme.validations.map((v) => v.decision)).toEqual(['validee', 'exportee']);
      expect(avecDeuxieme.validations[1].motif).toBeNull();
      expect(avecDeuxieme.validations[1].actorId).toBeNull();
      expect(avecDeuxieme.validations[1].date).toBeInstanceOf(Date);

      // Id invalide ou absent → null, sans exception.
      expect(await depotSaisie().mettreAJour('0', { status: 'soumise' })).toBeNull();
      expect(await depotSaisie().mettreAJour('abc', { status: 'soumise' })).toBeNull();
      expect(await depotSaisie().mettreAJour(ID_ABSENT(), { status: 'soumise' })).toBeNull();
      expect(await depotSaisie().mettreAJour(ID_AUTRE(), { status: 'soumise' })).toBeNull();
    });

    it('S6b : values round-trip JSON (~50 Ko) et ordre des clés conservés', async () => {
      const jeu = await jeuSaisie();
      const cree = await depotSaisie().creer(docSaisie(jeu));
      const id = String(cree._id);

      // Ordre des clés préservé à l'écriture comme à la lecture.
      const ordre = { zeta: 1, alpha: 2, mid: { beta: 3, aaa: 4 }, liste: [3, 1, 2] };
      await depotSaisie().mettreAJour(id, { values: ordre });
      const reluOrdre = await depotSaisie().trouverParId(id);
      expect(Object.keys(reluOrdre.values)).toEqual(['zeta', 'alpha', 'mid', 'liste']);
      expect(Object.keys(reluOrdre.values.mid)).toEqual(['beta', 'aaa']);
      expect(reluOrdre.values).toEqual(ordre);

      // Gabarit d'environ 50 Ko (au-delà des 4000 octets).
      const gabarit = { version: '1.0', note: 'unicode éàü 🎉', champs: [] };
      for (let i = 0; i < 400; i++) {
        gabarit.champs.push({
          id: `champ_${i}`,
          label: `Champ numéro ${i} — libellé avec accents éàü`,
          type: ['text', 'number', 'select'][i % 3],
          requis: i % 3 === 0,
          defaut: i % 5 === 0 ? null : i,
          options: [`opt_${i}_a`, `opt_${i}_b`],
        });
      }
      const chaine = JSON.stringify(gabarit);
      expect(Buffer.byteLength(chaine, 'utf8')).toBeGreaterThan(40000);
      expect(Buffer.byteLength(chaine, 'utf8')).toBeLessThan(70000);

      await depotSaisie().mettreAJour(id, { values: gabarit });
      const relu = await depotSaisie().trouverParId(id);
      expect(relu.values).toEqual(gabarit);
      expect(JSON.stringify(relu.values)).toBe(chaine);
    });

    // ---------------------------------------------------------------- lister

    it('S7 : lister applique chaque filtre, les deux tris, la limite et les liens', async () => {
      const jeu = await jeuSaisie();
      const structure2 = await nouvelleStructure();
      const module2 = await nouveauModule();
      const periode2 = await nouvellePeriode('quarterly');
      const utilisateur2 = await nouvelUtilisateur({ structureId: String(structure2._id) });

      const s1 = await depotSaisie().creer(docSaisie(jeu));
      const s2 = await depotSaisie().creer(
        docSaisie(jeu, {
          status: 'soumise',
          structureId: String(structure2._id),
          authorId: String(utilisateur2._id),
        })
      );
      const s3 = await depotSaisie().creer(
        docSaisie(jeu, { status: 'validee', periodeId: String(periode2._id) })
      );
      const s4 = await depotSaisie().creer(
        docSaisie(jeu, {
          status: 'exportee',
          moduleId: String(module2._id),
          periodeId: String(periode2._id),
        })
      );

      const memeEnsemble = (liste, attendus) =>
        expect(ids(liste).sort()).toEqual(ids(attendus).sort());

      // Chaque filtre seul.
      memeEnsemble(await depotSaisie().lister({ statuts: ['brouillon'] }), [s1]);
      memeEnsemble(await depotSaisie().lister({ statuts: ['brouillon', 'validee'] }), [s1, s3]);
      memeEnsemble(await depotSaisie().lister({ structureIds: [String(jeu.structure._id)] }), [
        s1,
        s3,
        s4,
      ]);
      memeEnsemble(await depotSaisie().lister({ structureIds: [String(structure2._id)] }), [s2]);
      memeEnsemble(await depotSaisie().lister({ moduleId: String(jeu.moduleDoc._id) }), [
        s1,
        s2,
        s3,
      ]);
      memeEnsemble(await depotSaisie().lister({ moduleId: String(module2._id) }), [s4]);
      memeEnsemble(
        await depotSaisie().lister({ moduleIds: [String(jeu.moduleDoc._id), String(module2._id)] }),
        [s1, s2, s3, s4]
      );
      memeEnsemble(await depotSaisie().lister({ periodeId: String(jeu.periode._id) }), [s1, s2]);
      memeEnsemble(await depotSaisie().lister({ periodeId: String(periode2._id) }), [s3, s4]);
      memeEnsemble(await depotSaisie().lister({ ids: [String(s1._id), String(s4._id)] }), [
        s1,
        s4,
      ]);

      // Listes vides = aucune ligne (et ids invalides ignorés → aucune ligne).
      expect(await depotSaisie().lister({ statuts: [] })).toEqual([]);
      expect(await depotSaisie().lister({ statuts: ['inconnu'] })).toEqual([]);
      expect(await depotSaisie().lister({ structureIds: [] })).toEqual([]);
      expect(await depotSaisie().lister({ moduleIds: [] })).toEqual([]);
      expect(await depotSaisie().lister({ ids: [] })).toEqual([]);
      expect(await depotSaisie().lister({ ids: ['abc'] })).toEqual([]);
      expect(await depotSaisie().lister({ structureIds: [ID_ABSENT()] })).toEqual([]);
      expect(await depotSaisie().lister({ moduleId: ID_ABSENT() })).toEqual([]);
      expect(await depotSaisie().lister({ periodeId: ID_AUTRE() })).toEqual([]);

      // Filtres combinés en ET.
      memeEnsemble(
        await depotSaisie().lister({
          statuts: ['brouillon', 'validee'],
          structureIds: [String(jeu.structure._id)],
        }),
        [s1, s3]
      );
      expect(
        await depotSaisie().lister({ statuts: ['brouillon'], moduleId: String(module2._id) })
      ).toEqual([]);
      memeEnsemble(
        await depotSaisie().lister({
          statuts: ['exportee'],
          periodeId: String(periode2._id),
          ids: [String(s4._id), String(s3._id)],
        }),
        [s4]
      );

      // Tri par défaut majDesc : updatedAt non croissant.
      const defaut = await depotSaisie().lister();
      expect(defaut).toHaveLength(4);
      for (let i = 1; i < defaut.length; i++) {
        expect(defaut[i].updatedAt.getTime()).toBeLessThanOrEqual(
          defaut[i - 1].updatedAt.getTime()
        );
      }

      // Tri structureMajAsc : groupes de structures dans l'ordre de création,
      // updatedAt croissant au sein d'un même groupe.
      const parStructure = await depotSaisie().lister({ tri: 'structureMajAsc' });
      expect(parStructure).toHaveLength(4);
      const premieres = [];
      for (const saisie of parStructure) {
        const cle = String(saisie.structureId);
        if (!premieres.includes(cle)) premieres.push(cle);
      }
      expect(premieres).toEqual([String(jeu.structure._id), String(structure2._id)]);
      for (let i = 1; i < parStructure.length; i++) {
        const precedent = parStructure[i - 1];
        const courant = parStructure[i];
        if (String(precedent.structureId) === String(courant.structureId)) {
          expect(courant.updatedAt.getTime()).toBeGreaterThanOrEqual(
            precedent.updatedAt.getTime()
          );
        }
      }

      // Limite.
      expect(await depotSaisie().lister({ limite: 2 })).toHaveLength(2);
      expect(await depotSaisie().lister({ limite: 100 })).toHaveLength(4);

      // avecLiens sur la liste.
      const avecLiens = await depotSaisie().lister({ avecLiens: true });
      expect(avecLiens).toHaveLength(4);
      const s1Liens = avecLiens.find((s) => String(s._id) === String(s1._id));
      expect(s1Liens.structureId).toMatchObject({ code: jeu.structure.code });
      expect(s1Liens.moduleId).toMatchObject({ code: jeu.moduleDoc.code });
      expect(s1Liens.periodeId).toMatchObject({ label: jeu.periode.label });
      expect(s1Liens.authorId).not.toHaveProperty('passwordHash');
      expect(s1Liens.authorId).toMatchObject({ im: jeu.utilisateur.im });
      const s4Liens = avecLiens.find((s) => String(s._id) === String(s4._id));
      expect(s4Liens.moduleId).toMatchObject({ code: module2.code });
      expect(s4Liens.structureId).toMatchObject({ code: jeu.structure.code });
    });

    // ----------------------------------------------------------- listerResume

    it('S8 : listerResume ne renvoie que les 4 champs du tableau de bord', async () => {
      const jeu = await jeuSaisie();
      const s1 = await depotSaisie().creer(docSaisie(jeu));
      const s2 = await depotSaisie().creer(
        docSaisie(jeu, { periodeId: String((await nouvellePeriode('quarterly'))._id) })
      );

      const resume = await depotSaisie().listerResume();
      expect(resume).toHaveLength(2);
      expect(Object.keys(resume[0]).sort()).toEqual([
        'moduleId',
        'periodeId',
        'status',
        'structureId',
      ]);
      expect(resume[0].status).toBe('brouillon');
      expect(String(resume[0].structureId)).toBe(String(jeu.structure._id));
      expect(String(resume[0].moduleId)).toBe(String(jeu.moduleDoc._id));
      expect(String(resume[0].periodeId)).toBe(String(jeu.periode._id));
      // Aucun autre champ (values, validations, dates, _id…).
      expect(resume[0]).not.toHaveProperty('values');
      expect(resume[0]).not.toHaveProperty('validations');
      expect(resume[0]).not.toHaveProperty('_id');

      // Filtres moduleId / periodeId ; id invalide → [].
      expect(await depotSaisie().listerResume({ moduleId: String(jeu.moduleDoc._id) })).toHaveLength(
        2
      );
      expect(await depotSaisie().listerResume({ periodeId: String(jeu.periode._id) })).toHaveLength(
        1
      );
      const module2 = await nouveauModule();
      await depotSaisie().creer(
        docSaisie(jeu, { moduleId: String(module2._id), periodeId: String(s2.periodeId) })
      );
      expect(await depotSaisie().listerResume({ moduleId: String(module2._id) })).toHaveLength(1);
      expect(await depotSaisie().listerResume({ moduleId: 'abc' })).toEqual([]);
      expect(await depotSaisie().listerResume({ periodeId: ID_AUTRE() })).toEqual([]);
      expect(String(s1._id)).toBeTruthy();
    });

    // -------------------------------------------------------- existePourModule

    it('S9 : existePourModule renvoie un booléen', async () => {
      const jeu = await jeuSaisie();
      await depotSaisie().creer(docSaisie(jeu));
      const module2 = await nouveauModule();

      expect(await depotSaisie().existePourModule(String(jeu.moduleDoc._id))).toBe(true);
      expect(await depotSaisie().existePourModule(String(module2._id))).toBe(false);
      expect(await depotSaisie().existePourModule('abc')).toBe(false);
      expect(await depotSaisie().existePourModule(ID_ABSENT())).toBe(false);
      expect(await depotSaisie().existePourModule(ID_AUTRE())).toBe(false);
    });

    // ------------------------------------------------------- archiverExportees

    it('S10 : archiverExportees ne touche que exportee avec période', async () => {
      const jeu = await jeuSaisie();
      const structure2 = await nouvelleStructure();
      const periode2 = await nouvellePeriode('quarterly');
      const moduleEvent = await nouveauModule({ kind: 'event' });
      const utilisateur2 = await nouvelUtilisateur({ structureId: String(structure2._id) });

      const exporteeA = await depotSaisie().creer(docSaisie(jeu, { status: 'exportee' }));
      const brouillonA = await depotSaisie().creer(
        docSaisie(jeu, {
          structureId: String(structure2._id),
          authorId: String(utilisateur2._id),
        })
      );
      const exporteeB = await depotSaisie().creer(
        docSaisie(jeu, { status: 'exportee', periodeId: String(periode2._id) })
      );
      const evenementExporte = await depotSaisie().creer(
        docSaisie(jeu, {
          status: 'exportee',
          moduleId: String(moduleEvent._id),
          periodeId: null,
          eventDate: new Date('2026-03-07T00:00:00.000Z'),
        })
      );

      // Liste vide ou sans id valide → 0.
      expect(await depotSaisie().archiverExportees([])).toBe(0);
      expect(await depotSaisie().archiverExportees(['abc'])).toBe(0);

      // Une seule exportee sur la période 1 (le brouillon est épargné).
      expect(await depotSaisie().archiverExportees([String(jeu.periode._id)])).toBe(1);
      const etats = new Map(
        (await depotSaisie().lister()).map((s) => [String(s._id), s.status])
      );
      expect(etats.get(String(exporteeA._id))).toBe('archivee');
      expect(etats.get(String(brouillonA._id))).toBe('brouillon');
      expect(etats.get(String(exporteeB._id))).toBe('exportee');
      expect(etats.get(String(evenementExporte._id))).toBe('exportee');

      // Deuxième appel : seule l'exportee de la période 2 reste à archiver.
      expect(
        await depotSaisie().archiverExportees([
          String(jeu.periode._id),
          String(periode2._id),
        ])
      ).toBe(1);
      expect((await depotSaisie().trouverParId(String(exporteeB._id))).status).toBe('archivee');
      // La saisie d'événement (sans période) n'est jamais archivée.
      expect((await depotSaisie().trouverParId(String(evenementExporte._id))).status).toBe(
        'exportee'
      );
    });

    // -------------------------------------------------------- insererPlusieurs

    it('S11 : insererPlusieurs écrit tout (void) et les listes vides ne font rien', async () => {
      const jeu = await jeuSaisie();
      const periode2 = await nouvellePeriode('quarterly');

      const resultat = await depotSaisie().insererPlusieurs([
        docSaisie(jeu),
        docSaisie(jeu, { periodeId: String(periode2._id), status: 'soumise' }),
      ]);
      expect(resultat).toBeUndefined();
      expect(await depotSaisie().lister()).toHaveLength(2);

      expect(await depotSaisie().insererPlusieurs([])).toBeUndefined();
      expect(await depotSaisie().insererPlusieurs(null)).toBeUndefined();
      expect(await depotSaisie().lister()).toHaveLength(2);
    });

    // ----------------------------------------------------- supprimerTout + cascade

    it('S12 : supprimerTout vide les saisies et cascade les validations (Oracle)', async () => {
      const jeu = await jeuSaisie();
      const cree = await depotSaisie().creer(docSaisie(jeu));
      const id = String(cree._id);

      await depotSaisie().mettreAJour(
        id,
        { status: 'soumise' },
        {
          decision: 'soumise',
          actorId: String(jeu.utilisateur._id),
          actorLabel: 'Client',
          date: new Date('2026-02-05T00:00:00.000Z'),
        }
      );
      await depotSaisie().mettreAJour(
        id,
        { status: 'rejetee' },
        {
          decision: 'rejetee',
          motif: 'Incomplet',
          actorId: String(jeu.utilisateur._id),
          actorLabel: 'Admin 2',
          date: new Date('2026-02-06T00:00:00.000Z'),
        }
      );
      const relu = await depotSaisie().trouverParId(id);
      expect(relu.status).toBe('rejetee');
      expect(relu.validations.map((v) => v.decision)).toEqual(['soumise', 'rejetee']);
      expect(relu.validations[1].motif).toBe('Incomplet');

      await depotSaisie().supprimerTout();
      expect(await depotSaisie().lister()).toHaveLength(0);
      expect(await depotSaisie().trouverParId(id)).toBeNull();

      // En Oracle les validations sont des lignes enfantes (ON DELETE
      // CASCADE) ; en Mongo elles sont embarquées dans le document.
      if (mode === 'oracle') {
        const db = await getKnex();
        const resultat = await db.raw('SELECT COUNT(*) AS N FROM SAISIE_VALIDATION');
        const lignes = resultat.rows || resultat;
        expect(Number(lignes[0].N)).toBe(0);
      }
    });
  });
}

suiteContrat('Contrat du dépôt Saisie — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // L'index unique partiel (structure, module, période) est exigé par S2 :
    // il est créé ici (le modèle le déclare aussi, création idempotente).
    await mongoose.connection.db.collection('saisies').createIndex(
      { structureId: 1, moduleId: 1, periodeId: 1 },
      { unique: true, partialFilterExpression: { periodeId: { $exists: true } } }
    );
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat du dépôt Saisie — Oracle', {
  mode: 'oracle',
  skip: !oracleConfiguree,
  preparer: async () => {
    fixerCoreStore('oracle');
    // Le schéma n'est appliqué QUE si une table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw(
      "SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN " +
        "('REGION', 'STRUCTURE', 'PERIODE', 'UTILISATEUR', 'MODULE_SIGBD', " +
        "'MODULE_PERIODICITE', 'MODULE_TYPE_STRUCTURE', 'SAISIE', 'SAISIE_VALIDATION', 'REMARQUE')"
    );
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) < 10) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }
  },
  nettoyer: async () => {
    await closeOracle();
  },
});

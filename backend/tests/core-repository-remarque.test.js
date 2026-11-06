"use strict";

// Contrat du dépôt Remarque : la même suite est exécutée pour les deux
// implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).
// MongoDB cible une base dédiée (sigbd_corecheck) : les données semées de
// sigbd_test ne sont jamais touchées.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
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

const depotRemarque = () => getRemarqueRepository();
const depotUtilisateur = () => getUtilisateurRepository();
const depotModule = () => getModuleRepository();
const depotStructure = () => getStructureRepository();
const depotPeriode = () => getPeriodeRepository();
const depotSaisie = () => getSaisieRepository();
const depotRegion = () => getRegionRepository();

// Clés exactes d'une remarque, __v MongoDB en plus (forme .lean()).
const CLES = ['_id', 'authorId', 'context', 'createdAt', 'state', 'text', 'updatedAt'];

let sequence = 0;

async function nouvelUtilisateur(im = null) {
  sequence += 1;
  const { structure } = await depotStructure().creerSiAbsent({
    code: `STR${sequence}`,
    label: `Structure ${sequence}`,
    type: 'SRB',
  });
  return depotUtilisateur().creer({
    im: im || `IM${sequence}`,
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
    structureId: String(structure._id),
  });
}

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

    it('R1 : forme exacte des objets remarque', async () => {
      const utilisateur = await nouvelUtilisateur();
      const cree = await depotRemarque().creer({
        authorId: String(utilisateur._id),
        context: 'module:MOD001',
        text: 'Première remarque',
      });

      expect(Object.keys(cree).sort()).toEqual(mode === 'mongo' ? [...CLES, '__v'].sort() : CLES);
      expect(cree.state).toBe('nouvelle');
      expect(cree.context).toBe('module:MOD001');
      expect(cree.text).toBe('Première remarque');
      expect(String(cree.authorId)).toBe(String(utilisateur._id));
      expect(cree.createdAt).toBeInstanceOf(Date);
      expect(cree.updatedAt).toBeInstanceOf(Date);
      if (mode === 'mongo') {
        expect(String(cree._id)).toMatch(/^[0-9a-f]{24}$/);
      } else {
        expect(typeof cree._id).toBe('string');
        expect(cree._id).toMatch(/^[1-9][0-9]{0,17}$/);
      }
    });

    it('R2 : creer prend le défaut state et un état explicite', async () => {
      const utilisateur = await nouvelUtilisateur();

      const avecEtat = await depotRemarque().creer({
        authorId: String(utilisateur._id),
        context: 'ctx',
        text: 'txt',
        state: 'en_cours',
      });
      expect(avecEtat.state).toBe('en_cours');

      const sansEtat = await depotRemarque().creer({
        authorId: String(utilisateur._id),
        context: 'ctx2',
        text: 'txt2',
      });
      expect(sansEtat.state).toBe('nouvelle');

      expect(await depotRemarque().lister()).toHaveLength(2);
    });

    // ---------------------------------------------------------------- Lister

    it('R3 : lister trie createdAt décroissant puis id décroissant, limite acceptée', async () => {
      const utilisateur = await nouvelUtilisateur();
      const creer = (texte) =>
        depotRemarque().creer({ authorId: String(utilisateur._id), context: 'ctx', text: texte });
      const r1 = await creer('Première');
      const r2 = await creer('Deuxième');
      const r3 = await creer('Troisième');

      const liste = await depotRemarque().lister();
      expect(liste.map((r) => String(r._id))).toEqual([r3, r2, r1].map((r) => String(r._id)));

      const limitee = await depotRemarque().lister({ limite: 2 });
      expect(limitee).toHaveLength(2);
      expect(String(limitee[0]._id)).toBe(String(r3._id));
      expect(String(limitee[1]._id)).toBe(String(r2._id));
    });

    it('R4 : listerParAuteur filtre, [] sans id valide, avecAuteur retire passwordHash', async () => {
      const utilisateur1 = await nouvelUtilisateur();
      const utilisateur2 = await nouvelUtilisateur();
      const mienne = await depotRemarque().creer({
        authorId: String(utilisateur1._id),
        context: 'ctx',
        text: 'De moi',
      });
      const autre = await depotRemarque().creer({
        authorId: String(utilisateur2._id),
        context: 'ctx',
        text: "D'un autre",
      });

      const de1 = await depotRemarque().listerParAuteur(String(utilisateur1._id));
      expect(de1.map((r) => String(r._id))).toEqual([String(mienne._id)]);
      const de2 = await depotRemarque().listerParAuteur(String(utilisateur2._id));
      expect(de2.map((r) => String(r._id))).toEqual([String(autre._id)]);

      // Sans id valide → [].
      expect(await depotRemarque().listerParAuteur('abc')).toEqual([]);
      expect(await depotRemarque().listerParAuteur('0')).toEqual([]);
      expect(await depotRemarque().listerParAuteur(ID_AUTRE())).toEqual([]);

      // avecAuteur : objet utilisateur complet SANS passwordHash, ou null.
      const [avecAuteur] = await depotRemarque().listerParAuteur(String(utilisateur1._id), {
        avecAuteur: true,
      });
      expect(avecAuteur.authorId).not.toBeNull();
      expect(avecAuteur.authorId).not.toHaveProperty('passwordHash');
      expect(avecAuteur.authorId).toMatchObject({ im: utilisateur1.im, role: 'client' });
      expect(String(avecAuteur.authorId._id)).toBe(String(utilisateur1._id));

      // lister avecAuteur aussi.
      const [premiere] = await depotRemarque().lister({ avecAuteur: true, limite: 1 });
      expect(premiere.authorId).not.toHaveProperty('passwordHash');

      // Sans avecAuteur : authorId reste une simple référence.
      const [brute] = de1;
      expect(String(brute.authorId)).toBe(String(utilisateur1._id));
    });

    // ------------------------------------------------------------ changerEtat

    it('R5 : changerEtat met à jour, null pour id absent ou invalide', async () => {
      const utilisateur = await nouvelUtilisateur();
      const cree = await depotRemarque().creer({
        authorId: String(utilisateur._id),
        context: 'ctx',
        text: 'txt',
      });

      const maj = await depotRemarque().changerEtat(String(cree._id), 'traitee');
      expect(maj.state).toBe('traitee');
      expect(String(maj._id)).toBe(String(cree._id));
      expect(maj.text).toBe('txt');
      // Relecture.
      const relu = await depotRemarque().lister();
      expect(relu[0].state).toBe('traitee');

      // Id invalide ou absent → null, sans exception.
      expect(await depotRemarque().changerEtat('0', 'en_cours')).toBeNull();
      expect(await depotRemarque().changerEtat('abc', 'en_cours')).toBeNull();
      expect(await depotRemarque().changerEtat('', 'en_cours')).toBeNull();
      expect(await depotRemarque().changerEtat(null, 'en_cours')).toBeNull();
      expect(await depotRemarque().changerEtat(ID_ABSENT(), 'en_cours')).toBeNull();
      expect(await depotRemarque().changerEtat(ID_AUTRE(), 'en_cours')).toBeNull();
    });

    // ----------------------------------------------------------- supprimerTout

    it('R6 : supprimerTout vide les remarques', async () => {
      const utilisateur = await nouvelUtilisateur();
      await depotRemarque().creer({ authorId: String(utilisateur._id), context: 'a', text: '1' });
      await depotRemarque().creer({ authorId: String(utilisateur._id), context: 'b', text: '2' });
      expect(await depotRemarque().lister()).toHaveLength(2);

      await depotRemarque().supprimerTout();
      expect(await depotRemarque().lister()).toHaveLength(0);
    });
  });
}

// Ids bien formés mais absents / valides pour l'autre stockage.
function ID_ABSENT() {
  return loadConfig().CORE_STORE === 'oracle' ? '99999999999' : 'a'.repeat(24);
}
function ID_AUTRE() {
  return loadConfig().CORE_STORE === 'oracle' ? 'a'.repeat(24) : '12345';
}

suiteContrat('Contrat du dépôt Remarque — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat du dépôt Remarque — Oracle', {
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

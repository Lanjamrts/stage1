"use strict";

// Contrat du dépôt Utilisateur : la même suite est exécutée pour les deux
// implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).
// MongoDB cible une base dédiée (sigbd_corecheck) : les données semées de
// sigbd_test ne sont jamais touchées.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
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

const depotUtilisateur = () => getUtilisateurRepository();
const depotModule = () => getModuleRepository();
const depotStructure = () => getStructureRepository();
const depotRegion = () => getRegionRepository();

// Clés exactes d'un utilisateur, __v MongoDB en plus (forme .lean()).
const CLES = [
  '_id',
  'createdAt',
  'direction',
  'failedAttempts',
  'im',
  'lockedUntil',
  'mustChangePassword',
  'nom',
  'passwordHash',
  'prenom',
  'role',
  'service',
  'status',
  'structureId',
  'updatedAt',
];

let sequence = 0;

async function nouvelleStructure(label = 'Structure test') {
  sequence += 1;
  const { structure } = await depotStructure().creerSiAbsent({
    code: `STR${sequence}`,
    label,
    type: 'SRB',
  });
  return structure;
}

async function creerUtilisateur(overrides = {}) {
  const structureId =
    overrides.structureId !== undefined
      ? overrides.structureId
      : String((await nouvelleStructure())._id);
  return depotUtilisateur().creer({
    im: 'IM001',
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
      // Ordre sûr : Utilisateur (FK sur STRUCTURE) puis Module, Structure,
      // Region (dépendantes les unes des autres dans cet ordre).
      await depotUtilisateur().supprimerTout();
      await depotModule().supprimerTout();
      await depotStructure().supprimerTout();
      await depotRegion().supprimerTout();
    });

    // ---------------------------------------------------------------- Forme

    it('U1 : forme exacte des objets utilisateur', async () => {
      const cree = await creerUtilisateur({ im: 'FORME01', nom: 'Forme' });

      expect(Object.keys(cree).sort()).toEqual(mode === 'mongo' ? [...CLES, '__v'].sort() : CLES);
      expect(typeof cree.im).toBe('string');
      expect(typeof cree.nom).toBe('string');
      expect(typeof cree.prenom).toBe('string');
      expect(typeof cree.role).toBe('string');
      expect(typeof cree.status).toBe('string');
      expect(typeof cree.mustChangePassword).toBe('boolean');
      expect(typeof cree.failedAttempts).toBe('number');
      expect(cree.lockedUntil).toBeNull();
      expect(cree.createdAt).toBeInstanceOf(Date);
      expect(cree.updatedAt).toBeInstanceOf(Date);
      if (mode === 'mongo') {
        expect(String(cree._id)).toMatch(/^[0-9a-f]{24}$/);
        expect(String(cree.structureId)).toMatch(/^[0-9a-f]{24}$/);
      } else {
        expect(typeof cree._id).toBe('string');
        expect(cree._id).toMatch(/^[1-9][0-9]{0,17}$/);
        expect(typeof cree.structureId).toBe('string');
        expect(cree.structureId).toMatch(/^[1-9][0-9]{0,17}$/);
      }
    });

    // ------------------------------------------------------------- Recherche

    it('U2 : trouverParId / trouverParIm / trouverPremierParRole', async () => {
      const cree = await creerUtilisateur({ im: 'TROUV01', nom: 'Trouve' });
      const id = String(cree._id);

      expect(await depotUtilisateur().trouverParId(id)).toMatchObject({ im: 'TROUV01', nom: 'Trouve' });
      // Identifiant bien formé mais absent.
      expect(await depotUtilisateur().trouverParId(mode === 'mongo' ? 'a'.repeat(24) : '99999999999')).toBeNull();
      // Identifiant refusé par les deux stockages.
      expect(await depotUtilisateur().trouverParId('0')).toBeNull();
      expect(await depotUtilisateur().trouverParId('abc')).toBeNull();
      expect(await depotUtilisateur().trouverParId('')).toBeNull();
      expect(await depotUtilisateur().trouverParId(null)).toBeNull();
      expect(await depotUtilisateur().trouverParId(123)).toBeNull();
      // Identifiant valide pour l'AUTRE stockage uniquement.
      expect(
        await depotUtilisateur().trouverParId(mode === 'mongo' ? '12345' : '6564abcdef0123456789abcd')
      ).toBeNull();

      expect(await depotUtilisateur().trouverParIm('TROUV01')).toMatchObject({ nom: 'Trouve' });
      expect(await depotUtilisateur().trouverParIm('ABSENT')).toBeNull();

      await creerUtilisateur({ im: 'ROLE001', role: 'admin1', nom: 'Premier' });
      await creerUtilisateur({ im: 'ROLE002', role: 'admin1', nom: 'Second' });
      await creerUtilisateur({ im: 'ROLE003', role: 'consultant', nom: 'Tiers' });

      expect(await depotUtilisateur().trouverPremierParRole('admin1')).toMatchObject({ im: 'ROLE001' });
      expect(await depotUtilisateur().trouverPremierParRole('developpeur')).toBeNull();
    });

    // ---------------------------------------------------- listerAvecStructure

    async function jeuFiltres() {
      const s1 = await nouvelleStructure('Structure un');
      const s2 = await nouvelleStructure('Structure deux');
      const id1 = String(s1._id);
      const id2 = String(s2._id);
      await creerUtilisateur({
        im: 'FIL001',
        nom: 'Alpha',
        prenom: 'Un',
        role: 'client',
        status: 'actif',
        structureId: id1,
      });
      await creerUtilisateur({
        im: 'FIL002',
        nom: 'Beta',
        prenom: 'Deux',
        role: 'admin2',
        status: 'actif',
        structureId: id1,
      });
      await creerUtilisateur({
        im: 'FIL003',
        nom: 'Charlie',
        prenom: 'Trois',
        role: 'client',
        status: 'desactive',
        structureId: id2,
      });
      await creerUtilisateur({
        im: 'FIL004',
        nom: 'Delta',
        prenom: 'Quatre',
        role: 'client',
        status: 'actif',
        structureId: id2,
      });
      return { id1, id2 };
    }

    const ims = (liste) => liste.map((u) => u.im);

    it('U3 : listerAvecStructure applique chaque filtre seul (ET)', async () => {
      const { id1, id2 } = await jeuFiltres();

      expect(ims(await depotUtilisateur().listerAvecStructure())).toEqual([
        'FIL001',
        'FIL002',
        'FIL003',
        'FIL004',
      ]);
      expect(ims(await depotUtilisateur().listerAvecStructure({ role: 'client' }))).toEqual([
        'FIL001',
        'FIL003',
        'FIL004',
      ]);
      expect(ims(await depotUtilisateur().listerAvecStructure({ status: 'actif' }))).toEqual([
        'FIL001',
        'FIL002',
        'FIL004',
      ]);
      expect(ims(await depotUtilisateur().listerAvecStructure({ structureId: id1 }))).toEqual([
        'FIL001',
        'FIL002',
      ]);
      expect(ims(await depotUtilisateur().listerAvecStructure({ structureId: id2 }))).toEqual([
        'FIL003',
        'FIL004',
      ]);
      expect(ims(await depotUtilisateur().listerAvecStructure({ q: 'Charlie' }))).toEqual(['FIL003']);
      // q cherche dans im, nom ET prenom.
      expect(ims(await depotUtilisateur().listerAvecStructure({ q: 'FIL004' }))).toEqual(['FIL004']);
      expect(ims(await depotUtilisateur().listerAvecStructure({ q: 'Quatre' }))).toEqual(['FIL004']);
    });

    it('U4 : listerAvecStructure combine les filtres en ET', async () => {
      const { id1, id2 } = await jeuFiltres();

      expect(
        ims(await depotUtilisateur().listerAvecStructure({ role: 'client', status: 'actif' }))
      ).toEqual(['FIL001', 'FIL004']);
      expect(
        ims(await depotUtilisateur().listerAvecStructure({ role: 'client', structureId: id2 }))
      ).toEqual(['FIL003', 'FIL004']);
      expect(
        ims(await depotUtilisateur().listerAvecStructure({ status: 'actif', structureId: id1 }))
      ).toEqual(['FIL001', 'FIL002']);
      expect(
        ims(
          await depotUtilisateur().listerAvecStructure({
            role: 'client',
            status: 'actif',
            structureId: id2,
          })
        )
      ).toEqual(['FIL004']);
      expect(
        ims(
          await depotUtilisateur().listerAvecStructure({
            role: 'client',
            status: 'actif',
            structureId: id1,
          })
        )
      ).toEqual(['FIL001']);
      expect(
        ims(await depotUtilisateur().listerAvecStructure({ role: 'client', q: 'Charlie' }))
      ).toEqual(['FIL003']);
      expect(
        ims(await depotUtilisateur().listerAvecStructure({ role: 'admin2', q: 'Charlie' }))
      ).toEqual([]);
      expect(
        ims(
          await depotUtilisateur().listerAvecStructure({
            role: 'client',
            status: 'actif',
            structureId: id2,
            q: 'Delta',
          })
        )
      ).toEqual(['FIL004']);
    });

    it('U5 : tri nom puis prenom (accents) avec dégagement par id', async () => {
      await creerUtilisateur({ im: 'TRI001', nom: 'Élodie', prenom: 'Anne' });
      await creerUtilisateur({ im: 'TRI002', nom: 'alpha', prenom: 'Bernard' });
      await creerUtilisateur({ im: 'TRI003', nom: 'Zoé', prenom: 'Charles' });
      await creerUtilisateur({ im: 'TRI004', nom: 'beta', prenom: 'Diane' });
      await creerUtilisateur({ im: 'TRI005', nom: 'élan', prenom: 'Eve' });
      await creerUtilisateur({ im: 'TRI006', nom: 'Émile', prenom: 'Francois' });
      await creerUtilisateur({ im: 'TRI007', nom: 'Identique', prenom: 'Zebre' });
      await creerUtilisateur({ im: 'TRI008', nom: 'Identique', prenom: 'abeille' });

      const liste = await depotUtilisateur().listerAvecStructure();
      expect(ims(liste)).toEqual([
        'TRI007', // Identique / Zebre  (I < Z, puis prenom)
        'TRI008', // Identique / abeille (Z < a)
        'TRI003', // Zoé    (Z)
        'TRI002', // alpha  (a)
        'TRI004', // beta   (b)
        'TRI001', // Élodie (É, puis l < m)
        'TRI006', // Émile
        'TRI005', // élan   (é minuscule après É majuscule)
      ]);
      expect(liste.map((u) => u.nom)).toEqual([
        'Identique',
        'Identique',
        'Zoé',
        'alpha',
        'beta',
        'Élodie',
        'Émile',
        'élan',
      ]);
    });

    it('U6 : q est littéral (., .*, %, _, \\) et insensible à la casse', async () => {
      await creerUtilisateur({ im: 'QDOT', nom: 'A.B', prenom: 'Pdot' });
      await creerUtilisateur({ im: 'QX', nom: 'AXB', prenom: 'Px' });
      await creerUtilisateur({ im: 'QPCT', nom: '50% et demi', prenom: 'Ppct' });
      await creerUtilisateur({ im: 'QSANS', nom: 'sans pourcent', prenom: 'Psans' });
      await creerUtilisateur({ im: 'QUS', nom: 'a_b', prenom: 'Pus' });
      await creerUtilisateur({ im: 'QAB', nom: 'ab', prenom: 'Pab' });
      await creerUtilisateur({ im: 'QBS', nom: 'a\\b', prenom: 'Pbs' });
      await creerUtilisateur({ im: 'QSTAR', nom: 'a.*b', prenom: 'Pstar' });
      await creerUtilisateur({ im: 'QABC', nom: 'ABC', prenom: 'Pabc' });

      const chercher = async (q) => ims(await depotUtilisateur().listerAvecStructure({ q })).sort();

      // « . » : seuls les noms contenant un point littéral (regex échappée).
      expect(await chercher('.')).toEqual(['QDOT', 'QSTAR']);
      expect(await chercher('.*')).toEqual(['QSTAR']);
      expect(await chercher('%')).toEqual(['QPCT']);
      expect(await chercher('_')).toEqual(['QUS']);
      expect(await chercher('\\')).toEqual(['QBS']);
      // Insensibilité à la casse dans les deux sens.
      expect(await chercher('abc')).toEqual(['QABC']);
      expect(await chercher('ABC')).toEqual(['QABC']);
      expect(await chercher('50%')).toEqual(['QPCT']);
    });

    it('U7 : limite explicite (défaut 500)', async () => {
      await creerUtilisateur({ im: 'LIM001', nom: 'Limite un' });
      await creerUtilisateur({ im: 'LIM002', nom: 'Limite deux' });
      await creerUtilisateur({ im: 'LIM003', nom: 'Limite trois' });

      const borne = await depotUtilisateur().listerAvecStructure({ limite: 2 });
      expect(ims(borne)).toEqual(['LIM002', 'LIM003']); // tri nom : deux < trois < un
      expect(await depotUtilisateur().listerAvecStructure({ limite: 1 })).toHaveLength(1);
      // Le défaut (500) laisse passer les trois utilisateurs.
      expect(await depotUtilisateur().listerAvecStructure()).toHaveLength(3);
    });

    it('U8 : structureId peuplé { _id, label }, null si absente', async () => {
      const structure = await nouvelleStructure('Structure peuplee');
      await creerUtilisateur({ im: 'PEUP001', structureId: String(structure._id) });

      const [utilisateur] = await depotUtilisateur().listerAvecStructure();
      expect(utilisateur.structureId.label).toBe('Structure peuplee');
      expect(String(utilisateur.structureId._id)).toBe(String(structure._id));

      if (mode === 'mongo') {
        // MongoDB n'a pas de clé étrangère : une structure supprimée laisse un
        // utilisateur orphelin, dont structureId devient null (en Oracle la FK
        // interdit ce cas).
        await depotStructure().supprimerTout();
        const orphelins = await depotUtilisateur().listerAvecStructure();
        expect(orphelins[0].structureId).toBeNull();
      }
    });

    // ------------------------------------------------------ lister / rechercher

    it('U9 : listerParRole ne renvoie que les utilisateurs du rôle', async () => {
      await creerUtilisateur({ im: 'RL001', role: 'client', nom: 'ClientUn' });
      await creerUtilisateur({ im: 'RL002', role: 'admin2', nom: 'Admin deux' });
      await creerUtilisateur({ im: 'RL003', role: 'client', nom: 'ClientDeux' });

      expect(ims(await depotUtilisateur().listerParRole('client'))).toEqual(['RL003', 'RL001']);
      expect(ims(await depotUtilisateur().listerParRole('admin2'))).toEqual(['RL002']);
      expect(await depotUtilisateur().listerParRole('developpeur')).toEqual([]);
    });

    it('U10 : rechercher cherche dans im, nom et prenom (même règle littérale)', async () => {
      await creerUtilisateur({ im: 'RECH01', nom: 'Bernard', prenom: 'Jean' });
      await creerUtilisateur({ im: 'RECH02', nom: 'Dupont', prenom: 'Marie' });
      await creerUtilisateur({ im: 'AUTRE1', nom: 'Durand' });

      expect(ims(await depotUtilisateur().rechercher('rech'))).toEqual(['RECH01', 'RECH02']);
      expect(ims(await depotUtilisateur().rechercher('bernard'))).toEqual(['RECH01']);
      expect(ims(await depotUtilisateur().rechercher('Marie'))).toEqual(['RECH02']);
      expect(ims(await depotUtilisateur().rechercher('.*'))).toEqual([]);
      expect(await depotUtilisateur().rechercher('inexistant')).toEqual([]);

      // listerParRole / rechercher ne peuplent PAS la structure.
      const [premier] = await depotUtilisateur().rechercher('RECH01');
      expect(premier.structureId.label).toBeUndefined();
    });

    // ------------------------------------------------------------ trouParRefs

    it('U11 : trouverParRefs mélange ids et IM, ignore les ids invalides', async () => {
      const a = await creerUtilisateur({ im: 'REF001', nom: 'RefUn' });
      const b = await creerUtilisateur({ im: 'REF002', nom: 'RefDeux' });

      const mixtes = await depotUtilisateur().trouverParRefs([String(a._id), 'REF002']);
      expect(ims(mixtes).sort()).toEqual(['REF001', 'REF002']);

      expect(await depotUtilisateur().trouverParRefs([])).toEqual([]);

      // Ids refusés par estIdValide : ignorés côté id, mais essayés comme IM.
      expect(await depotUtilisateur().trouverParRefs(['0', 'abc', ''])).toEqual([]);

      // Id bien formé mais absent + IM inconnu → rien.
      expect(
        await depotUtilisateur().trouverParRefs([
          mode === 'mongo' ? 'f'.repeat(24) : '88888888888',
          'REF999',
        ])
      ).toEqual([]);

      // Un id valide à côté de refs invalides → seulement l'id.
      expect(ims(await depotUtilisateur().trouverParRefs([String(b._id), '0', 'inconnu']))).toEqual([
        'REF002',
      ]);
      expect(String(b._id)).toBeTruthy();
    });

    // -------------------------------------------------------- creer / doublon

    it("U12 : creer puis violation d'unicité (IM) → Error code 'DOUBLON'", async () => {
      const cree = await creerUtilisateur({ im: 'DOUBLE1', nom: 'Premier' });
      expect(cree.im).toBe('DOUBLE1');
      expect(await depotUtilisateur().trouverParIm('DOUBLE1')).not.toBeNull();

      let erreur = null;
      try {
        await creerUtilisateur({ im: 'DOUBLE1', nom: 'Deuxieme' });
      } catch (e) {
        erreur = e;
      }

      expect(erreur).not.toBeNull();
      expect(erreur.code).toBe('DOUBLON');
      expect(erreur.message).toBeTruthy();
      expect(erreur.cause).toBeDefined();
      expect(await depotUtilisateur().trouverParIm('DOUBLE1')).toMatchObject({ nom: 'Premier' });
    });

    // ------------------------------------------------------------ mettreAJour

    it('U13 : mettreAJour change chaque champ modifiable, refuse les autres', async () => {
      const structure2 = await nouvelleStructure('Structure deuxieme');
      const cree = await creerUtilisateur({ im: 'MAJ001' });
      const id = String(cree._id);

      const champs = {
        nom: 'NouveauNom',
        prenom: 'NouveauPrenom',
        direction: 'NouvelleDirection',
        service: 'NouveauService',
        role: 'admin1',
        structureId: String(structure2._id),
        passwordHash: 'nouveau-hash',
        status: 'desactive',
        mustChangePassword: true,
        failedAttempts: 7,
      };
      for (const [cle, valeur] of Object.entries(champs)) {
        const maj = await depotUtilisateur().mettreAJour(id, { [cle]: valeur });
        if (cle === 'structureId') {
          expect(String(maj.structureId)).toBe(String(valeur));
        } else {
          expect(maj[cle]).toEqual(valeur);
        }
      }
      const { structureId: attenduStructure, ...attendus } = champs;
      const relu = await depotUtilisateur().trouverParId(id);
      expect(relu).toMatchObject(attendus);
      expect(String(relu.structureId)).toBe(String(attenduStructure));
      expect(relu.im).toBe('MAJ001'); // im jamais modifiable

      // Booléens dans les deux sens.
      const faux = await depotUtilisateur().mettreAJour(id, { mustChangePassword: false });
      expect(faux.mustChangePassword).toBe(false);
      expect(typeof faux.mustChangePassword).toBe('boolean');

      // lockedUntil : Date puis null.
      const date = new Date('2026-06-01T10:00:00.000Z');
      const avecDate = await depotUtilisateur().mettreAJour(id, {
        lockedUntil: date,
        failedAttempts: 3,
      });
      expect(avecDate.lockedUntil).toBeInstanceOf(Date);
      expect(avecDate.lockedUntil.getTime()).toBe(date.getTime());
      expect(avecDate.failedAttempts).toBe(3);
      const sansDate = await depotUtilisateur().mettreAJour(id, { lockedUntil: null });
      expect(sansDate.lockedUntil).toBeNull();

      // Champs inconnus (ou non modifiables) refusés explicitement.
      await expect(depotUtilisateur().mettreAJour(id, { inconnu: 1 })).rejects.toThrow(/inconnu/);
      await expect(depotUtilisateur().mettreAJour(id, { im: 'AUTRE' })).rejects.toThrow(/im/);
      await expect(depotUtilisateur().mettreAJour(id, { createdAt: new Date() })).rejects.toThrow(
        /createdAt/
      );

      // Id invalide ou absent → null, sans exception.
      expect(await depotUtilisateur().mettreAJour('0', { nom: 'X' })).toBeNull();
      expect(await depotUtilisateur().mettreAJour('abc', { nom: 'X' })).toBeNull();
      expect(
        await depotUtilisateur().mettreAJour(mode === 'mongo' ? 'b'.repeat(24) : '99999999999', {
          nom: 'X',
        })
      ).toBeNull();
      expect((await depotUtilisateur().trouverParId(id)).im).toBe('MAJ001');
    });

    it('U14 : mettreAJourParIm met à jour par IM (void)', async () => {
      await creerUtilisateur({ im: 'PARIM01', nom: 'Avant' });

      const resultat = await depotUtilisateur().mettreAJourParIm('PARIM01', {
        nom: 'Apres',
        prenom: 'Autre',
      });
      expect(resultat).toBeUndefined();

      const relu = await depotUtilisateur().trouverParIm('PARIM01');
      expect(relu.nom).toBe('Apres');
      expect(relu.prenom).toBe('Autre');

      await expect(
        depotUtilisateur().mettreAJourParIm('PARIM01', { roleInconnu: 'client' })
      ).rejects.toThrow(/roleInconnu/);

      // IM inconnu : aucune exception, aucun utilisateur créé.
      await depotUtilisateur().mettreAJourParIm('ABSENT01', { nom: 'Zzz' });
      expect(await depotUtilisateur().trouverParIm('ABSENT01')).toBeNull();
    });

    // --------------------------------------------------------- debloquerExpires

    it('U15 : debloquerExpires ne débloque que les comptes expirés', async () => {
      const maintenant = new Date('2026-06-15T12:00:00.000Z');
      await creerUtilisateur({
        im: 'LOCK001',
        lockedUntil: new Date('2026-06-15T11:00:00.000Z'),
        failedAttempts: 5,
      });
      await creerUtilisateur({
        im: 'LOCK002',
        lockedUntil: new Date('2026-06-15T13:00:00.000Z'),
        failedAttempts: 2,
      });
      await creerUtilisateur({ im: 'LOCK003', lockedUntil: null, failedAttempts: 1 });

      expect(await depotUtilisateur().debloquerExpires(maintenant)).toBe(1);

      const expire = await depotUtilisateur().trouverParIm('LOCK001');
      expect(expire.lockedUntil).toBeNull();
      expect(expire.failedAttempts).toBe(0);

      const pasExpire = await depotUtilisateur().trouverParIm('LOCK002');
      expect(pasExpire.lockedUntil).toBeInstanceOf(Date);
      expect(pasExpire.lockedUntil.getTime()).toBe(new Date('2026-06-15T13:00:00.000Z').getTime());
      expect(pasExpire.failedAttempts).toBe(2);

      const sansVerrou = await depotUtilisateur().trouverParIm('LOCK003');
      expect(sansVerrou.lockedUntil).toBeNull();
      expect(sansVerrou.failedAttempts).toBe(1);

      // Rien à débloquer : 0.
      expect(await depotUtilisateur().debloquerExpires(maintenant)).toBe(0);
    });

    // ----------------------------------------------------------- supprimerTout

    it('U16 : supprimerTout vide les utilisateurs', async () => {
      await creerUtilisateur({ im: 'SUP001' });
      await creerUtilisateur({ im: 'SUP002' });
      expect(await depotUtilisateur().listerAvecStructure()).toHaveLength(2);

      await depotUtilisateur().supprimerTout();
      expect(await depotUtilisateur().listerAvecStructure()).toHaveLength(0);
      expect(await depotUtilisateur().trouverParIm('SUP001')).toBeNull();
      expect(await depotUtilisateur().listerParRole('client')).toEqual([]);
    });
  });
}

suiteContrat('Contrat du dépôt Utilisateur — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // L'index unique (im) est exigé par U12 : il est créé ici (le modèle le
    // déclare aussi, création idempotente).
    await mongoose.connection.db.collection('utilisateurs').createIndex({ im: 1 }, { unique: true });
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat du dépôt Utilisateur — Oracle', {
  mode: 'oracle',
  skip: !oracleConfiguree,
  preparer: async () => {
    fixerCoreStore('oracle');
    // Le schéma n'est appliqué QUE si une table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw(
      "SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN " +
        "('REGION', 'STRUCTURE', 'UTILISATEUR', 'MODULE_SIGBD', 'MODULE_PERIODICITE', 'MODULE_TYPE_STRUCTURE')"
    );
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) < 6) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }
    // Purgement préalable : SAISIE_VALIDATION → SAISIE / REMARQUE →
    // UTILISATEUR finissent toutes sur STRUCTURE, MODULE_SIGBD ou UTILISATEUR
    // et bloqueraient le supprimerTout de beforeEach. Les lignes concernées
    // viennent des autres suites, qui repartent d'un --reset ou de leurs
    // propres inserts.
    await db.raw('DELETE FROM SAISIE_VALIDATION');
    await db.raw('DELETE FROM SAISIE');
    await db.raw('DELETE FROM REMARQUE');
  },
  nettoyer: async () => {
    await closeOracle();
  },
});

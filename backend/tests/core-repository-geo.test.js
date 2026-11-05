"use strict";

// Contrat des dépôts Region et Structure : la même suite est exécutée pour les
// deux implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).
// MongoDB cible une base dédiée (sigbd_corecheck) : les données semées de
// sigbd_test ne sont jamais touchées.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
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

const depotRegion = () => getRegionRepository();
const depotStructure = () => getStructureRepository();
const depotPeriode = () => getPeriodeRepository();

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
      // Ordre imposé par la clé étrangère STRUCTURE → REGION.
      await depotStructure().supprimerTout();
      await depotRegion().supprimerTout();
      await depotPeriode().supprimerTout();
    });

    // ---------------------------------------------------------------- Region

    it("R1 : lister trie par name croissant", async () => {
      await depotRegion().insererPlusieurs(['Zo', 'Beta', 'alpha']);
      expect((await depotRegion().lister()).map((r) => r.name)).toEqual(['Beta', 'Zo', 'alpha']);
    });

    it('R2 : listerParNoms ne renvoie que les noms demandés (liste vide → [])', async () => {
      await depotRegion().insererPlusieurs(['Afrique', 'Bourg', 'Canton']);

      const trouvees = await depotRegion().listerParNoms(['Canton', 'Afrique']);
      expect(trouvees).toHaveLength(2);
      expect(trouvees.map((r) => r.name).sort()).toEqual(['Afrique', 'Canton']);

      expect(await depotRegion().listerParNoms(['Absent'])).toEqual([]);
      expect(await depotRegion().listerParNoms([])).toEqual([]);
    });

    it('R3 : trouverParId renvoie la région présente, sinon null', async () => {
      const { region } = await depotRegion().assurer('Region a trouver');
      const id = String(region._id);

      expect(await depotRegion().trouverParId(id)).toMatchObject({ name: 'Region a trouver' });

      // Identifiant bien formé mais absent.
      expect(await depotRegion().trouverParId(mode === 'mongo' ? 'a'.repeat(24) : '99999999999')).toBeNull();
      // Identifiant refusé par les deux stockages.
      expect(await depotRegion().trouverParId('0')).toBeNull();
      expect(await depotRegion().trouverParId('abc')).toBeNull();
      expect(await depotRegion().trouverParId('')).toBeNull();
      expect(await depotRegion().trouverParId(null)).toBeNull();
      expect(await depotRegion().trouverParId(123)).toBeNull();
      // Identifiant valide pour l'AUTRE stockage uniquement.
      expect(await depotRegion().trouverParId(mode === 'mongo' ? '12345' : '6564abcdef0123456789abcd')).toBeNull();
    });

    it('R4 : trouverParNom renvoie la région présente, sinon null', async () => {
      await depotRegion().insererPlusieurs(['Connue', 'Autre']);

      expect(await depotRegion().trouverParNom('Connue')).toMatchObject({ name: 'Connue' });
      expect(await depotRegion().trouverParNom('Absente')).toBeNull();
    });

    it('R5 : assurer crée puis renvoie existante sans écraser', async () => {
      const premier = await depotRegion().assurer('Region assurer');
      expect(premier.cree).toBe(true);
      expect(premier.region.name).toBe('Region assurer');

      const second = await depotRegion().assurer('Region assurer');
      expect(second.cree).toBe(false);
      expect(String(second.region._id)).toBe(String(premier.region._id));
      expect(await depotRegion().lister()).toHaveLength(1);
    });

    it("R6 : violation d'unicité → Error code 'DOUBLON'", async () => {
      await depotRegion().insererPlusieurs(['Region doublon']);

      let erreur = null;
      try {
        await depotRegion().insererPlusieurs(['Region doublon']);
      } catch (e) {
        erreur = e;
      }

      expect(erreur).not.toBeNull();
      expect(erreur.code).toBe('DOUBLON');
      expect(erreur.message).toBeTruthy();
      expect(erreur.cause).toBeDefined();
      expect(await depotRegion().lister()).toHaveLength(1);
    });

    it('R7 : forme exacte des objets { _id, name, createdAt, updatedAt }', async () => {
      const { region } = await depotRegion().assurer('Region forme');

      expect(Object.keys(region).sort()).toEqual(
        mode === 'mongo'
          ? ['__v', '_id', 'createdAt', 'name', 'updatedAt']
          : ['_id', 'createdAt', 'name', 'updatedAt']
      );
      expect(typeof region.name).toBe('string');
      expect(region.createdAt).toBeInstanceOf(Date);
      expect(region.updatedAt).toBeInstanceOf(Date);
      if (mode === 'mongo') {
        expect(String(region._id)).toMatch(/^[0-9a-f]{24}$/);
      } else {
        expect(typeof region._id).toBe('string');
        expect(region._id).toMatch(/^[1-9][0-9]{0,17}$/);
      }
    });

    it('R8 : supprimerTout vide les régions', async () => {
      await depotRegion().insererPlusieurs(['R1', 'R2']);
      expect(await depotRegion().lister()).toHaveLength(2);

      await depotRegion().supprimerTout();
      expect(await depotRegion().lister()).toHaveLength(0);
      expect(await depotRegion().trouverParNom('R1')).toBeNull();
    });

    // -------------------------------------------------------------- Structure

    async function creerRegions() {
      const r1 = await depotRegion().assurer('Region une');
      const r2 = await depotRegion().assurer('Region deux');
      return { id1: String(r1.region._id), id2: String(r2.region._id) };
    }

    async function creerJeuStructures() {
      const { id1, id2 } = await creerRegions();
      await depotStructure().insererPlusieurs([
        { code: 'A', label: 'Structure A', type: 'SRB', regionId: id1, active: true },
        { code: 'B', label: 'Structure B', type: 'SRB', regionId: id1, active: false },
        { code: 'C', label: 'Structure C', type: 'SRPE', regionId: id2, active: true },
        { code: 'D', label: 'Structure D', type: 'SRPE', active: true },
      ]);
      return { id1, id2 };
    }

    it('S1 : lister respecte la création, trierParLabel trie par label croissant', async () => {
      await depotStructure().insererPlusieurs([
        { code: 'S1', label: 'Beta', type: 'SRB' },
        { code: 'S2', label: 'Alpha', type: 'SRSP' },
        { code: 'S3', label: 'Gamma', type: 'SRB' },
      ]);

      expect((await depotStructure().lister()).map((s) => s.code)).toEqual(['S1', 'S2', 'S3']);
      expect((await depotStructure().lister({ trierParLabel: true })).map((s) => s.label)).toEqual([
        'Alpha',
        'Beta',
        'Gamma',
      ]);
    });

    it('S2 : filtres actives / types / regionId / regionIds, seuls et combinés en ET', async () => {
      const { id1, id2 } = await creerJeuStructures();

      expect((await depotStructure().lister()).map((s) => s.code)).toEqual(['A', 'B', 'C', 'D']);
      expect((await depotStructure().lister({ actives: true })).map((s) => s.code)).toEqual(['A', 'C', 'D']);
      expect((await depotStructure().lister({ actives: false })).map((s) => s.code)).toEqual(['B']);
      expect((await depotStructure().lister({ types: ['SRB'] })).map((s) => s.code)).toEqual(['A', 'B']);
      expect((await depotStructure().lister({ regionId: id1 })).map((s) => s.code)).toEqual(['A', 'B']);
      expect((await depotStructure().lister({ regionIds: [id1, id2] })).map((s) => s.code)).toEqual(['A', 'B', 'C']);

      // Listes vides : aucune ligne (cohérent avec $in: [] de MongoDB).
      expect(await depotStructure().lister({ types: [] })).toEqual([]);
      expect(await depotStructure().lister({ regionIds: [] })).toEqual([]);

      // Combinés en ET.
      expect((await depotStructure().lister({ actives: true, types: ['SRPE'] })).map((s) => s.code)).toEqual(['C', 'D']);
      expect((await depotStructure().lister({ types: ['SRB'], regionIds: [id1] })).map((s) => s.code)).toEqual([
        'A',
        'B',
      ]);
      expect((await depotStructure().lister({ actives: false, regionIds: [id1] })).map((s) => s.code)).toEqual(['B']);
      expect(
        (await depotStructure().lister({ actives: true, types: ['SRB'], regionIds: [id1] })).map((s) => s.code)
      ).toEqual(['A']);
      expect(await depotStructure().lister({ actives: true, types: ['SRB'], regionIds: [] })).toEqual([]);
    });

    it('S3 : trouverParType renvoie le premier du type créé, sinon null', async () => {
      await depotStructure().insererPlusieurs([
        { code: 'T1', label: 'Premier SRB', type: 'SRB' },
        { code: 'T2', label: 'Deuxieme SRB', type: 'SRB' },
        { code: 'T3', label: 'Seul SRSP', type: 'SRSP' },
      ]);

      expect(await depotStructure().trouverParType('SRB')).toMatchObject({ code: 'T1' });
      expect(await depotStructure().trouverParType('SRSP')).toMatchObject({ code: 'T3' });
      expect(await depotStructure().trouverParType('DRBF')).toBeNull();
    });

    it('S4 : trouverParCode et trouverParId renvoient la structure ou null', async () => {
      const { structure } = await depotStructure().creerSiAbsent({
        code: 'FCODE',
        label: 'Structure trouvee',
        type: 'DGBF',
      });

      expect(await depotStructure().trouverParCode('FCODE')).toMatchObject({ code: 'FCODE' });
      expect(await depotStructure().trouverParCode('INCONNU')).toBeNull();

      const id = String(structure._id);
      expect(await depotStructure().trouverParId(id)).toMatchObject({ code: 'FCODE' });
      expect(await depotStructure().trouverParId('0')).toBeNull();
      expect(await depotStructure().trouverParId('abc')).toBeNull();
      expect(await depotStructure().trouverParId(mode === 'mongo' ? '123' : '6564abcdef0123456789abcd')).toBeNull();
    });

    it('S5 : listerParCodes renvoie les codes demandés (liste vide → [])', async () => {
      await depotStructure().insererPlusieurs([
        { code: 'S1', label: 'Une', type: 'SRB' },
        { code: 'S2', label: 'Deux', type: 'SRSP' },
        { code: 'S3', label: 'Trois', type: 'SRPE' },
      ]);

      const trouvees = await depotStructure().listerParCodes(['S3', 'S1']);
      expect(trouvees.map((s) => s.code).sort()).toEqual(['S1', 'S3']);
      expect(await depotStructure().listerParCodes(['INCONNU'])).toEqual([]);
      expect(await depotStructure().listerParCodes([])).toEqual([]);
    });

    it('S6 : creerSiAbsent crée puis renvoie existante sans écraser', async () => {
      const premier = await depotStructure().creerSiAbsent({
        code: 'KEEP',
        label: 'Libelle original',
        type: 'SSEBF',
      });
      expect(premier.cree).toBe(true);

      const second = await depotStructure().creerSiAbsent({
        code: 'KEEP',
        label: 'Libelle modifie',
        type: 'CELLULE_INFO',
      });
      expect(second.cree).toBe(false);
      expect(String(second.structure._id)).toBe(String(premier.structure._id));
      expect(second.structure.label).toBe('Libelle original');
      expect(second.structure.type).toBe('SSEBF');
      expect(await depotStructure().lister()).toHaveLength(1);
    });

    it("S7 : violation d'unicité → Error code 'DOUBLON'", async () => {
      await depotStructure().insererPlusieurs([{ code: 'DOUBLE', label: 'Une', type: 'SRB' }]);

      let erreur = null;
      try {
        await depotStructure().insererPlusieurs([{ code: 'DOUBLE', label: 'Deux', type: 'SRSP' }]);
      } catch (e) {
        erreur = e;
      }

      expect(erreur).not.toBeNull();
      expect(erreur.code).toBe('DOUBLON');
      expect(erreur.cause).toBeDefined();
      expect(await depotStructure().lister()).toHaveLength(1);
    });

    it('S8 : forme exacte des objets (regionId null ou chaîne, active booléen)', async () => {
      const { id1 } = await creerRegions();
      const { structure } = await depotStructure().creerSiAbsent({
        code: 'FORME',
        label: 'Structure forme',
        type: 'SRPE',
        regionId: id1,
        active: false,
      });

      expect(Object.keys(structure).sort()).toEqual(
        mode === 'mongo'
          ? ['__v', '_id', 'active', 'code', 'createdAt', 'label', 'regionId', 'type', 'updatedAt']
          : ['_id', 'active', 'code', 'createdAt', 'label', 'regionId', 'type', 'updatedAt']
      );
      expect(typeof structure.active).toBe('boolean');
      expect(structure.active).toBe(false);
      expect(String(structure.regionId)).toBe(id1);
      expect(structure.createdAt).toBeInstanceOf(Date);
      expect(structure.updatedAt).toBeInstanceOf(Date);
      if (mode === 'mongo') {
        expect(String(structure._id)).toMatch(/^[0-9a-f]{24}$/);
      } else {
        expect(typeof structure._id).toBe('string');
        expect(structure._id).toMatch(/^[1-9][0-9]{0,17}$/);
      }

      const sans = (await depotStructure().creerSiAbsent({
        code: 'SANSREG',
        label: 'Sans region',
        type: 'SRB',
      })).structure;
      expect(sans.regionId ?? null).toBeNull();
      expect(sans.active).toBe(true);
      expect(typeof sans.active).toBe('boolean');
    });

    it('S9 : supprimerTout vide les structures', async () => {
      await depotStructure().insererPlusieurs([
        { code: 'X1', label: 'Une', type: 'SRB' },
        { code: 'X2', label: 'Deux', type: 'SRSP' },
      ]);
      expect(await depotStructure().lister()).toHaveLength(2);

      await depotStructure().supprimerTout();
      expect(await depotStructure().lister()).toHaveLength(0);
      expect(await depotStructure().trouverParCode('X1')).toBeNull();
    });
  });
}

suiteContrat('Contrat des dépôts Region/Structure — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // Les index uniques (regions.name, structures.code) sont exigés par R6/S7 :
    // ils sont créés ici (les modèles les déclarent aussi, création idempotente).
    await mongoose.connection.db.collection('regions').createIndex({ name: 1 }, { unique: true });
    await mongoose.connection.db.collection('structures').createIndex({ code: 1 }, { unique: true });
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat des dépôts Region/Structure — Oracle', {
  mode: 'oracle',
  skip: !oracleConfiguree,
  preparer: async () => {
    fixerCoreStore('oracle');
    // Le schéma n'est appliqué QUE si une table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw(
      "SELECT COUNT(*) AS N FROM user_tables WHERE table_name IN ('REGION', 'STRUCTURE', 'PERIODE')"
    );
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) < 3) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }
    // Purgement préalable : SAISIE_VALIDATION → SAISIE / REMARQUE → UTILISATEUR
    // finissent toutes sur STRUCTURE ou PERIODE (clés étrangères du schéma) et
    // bloqueraient le supprimerTout de beforeEach. Les lignes concernées viennent
    // des autres suites, qui repartent d'un --reset ou de leurs propres inserts.
    await db.raw('DELETE FROM SAISIE_VALIDATION');
    await db.raw('DELETE FROM SAISIE');
    await db.raw('DELETE FROM REMARQUE');
    await db.raw('DELETE FROM UTILISATEUR');
  },
  nettoyer: async () => {
    await closeOracle();
  },
});

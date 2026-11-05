"use strict";

// Contrat du dépôt Periode : la même suite est exécutée pour les deux
// implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).
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

const d = (iso) => new Date(iso);

function periode(label, start, end, deadline, periodicity = 'monthly') {
  return { label, start: d(start), end: d(end), deadline: d(deadline), periodicity };
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
      // Ordre imposé par la clé étrangère STRUCTURE → REGION.
      await depotStructure().supprimerTout();
      await depotRegion().supprimerTout();
      await depotPeriode().supprimerTout();
    });

    it('P1 : lister trie par start décroissant', async () => {
      await depotPeriode().insererPlusieurs([
        periode('Janvier', '2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.000Z', '2026-02-05T00:00:00.000Z'),
        periode('Mars', '2026-03-01T00:00:00.000Z', '2026-03-31T23:59:59.000Z', '2026-04-05T00:00:00.000Z'),
        periode('Fevrier', '2026-02-01T00:00:00.000Z', '2026-02-28T23:59:59.000Z', '2026-03-05T00:00:00.000Z'),
      ]);

      expect((await depotPeriode().lister()).map((p) => p.label)).toEqual(['Mars', 'Fevrier', 'Janvier']);
    });

    it('P2 : listerTerminees ne renvoie que les périodes dont end < avant', async () => {
      await depotPeriode().insererPlusieurs([
        periode('T1', '2026-04-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-05T00:00:00.000Z'),
        periode('T2', '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', '2026-07-05T00:00:00.000Z'),
        periode('T3', '2026-06-05T00:00:00.000Z', '2026-06-14T23:59:59.999Z', '2026-06-20T00:00:00.000Z'),
      ]);

      const terminees = await depotPeriode().listerTerminees(d('2026-06-15T00:00:00.000Z'));
      expect(terminees.map((p) => p.label)).toEqual(['T3', 'T1']);

      // Comparaison stricte : une période finie exactement à `avant` est exclue.
      const frontiere = await depotPeriode().listerTerminees(d('2026-06-14T23:59:59.999Z'));
      expect(frontiere.map((p) => p.label)).toEqual(['T1']);

      expect(await depotPeriode().listerTerminees(d('2026-04-01T00:00:00.000Z'))).toEqual([]);
    });

    it('P3 : listerParCles ne renvoie que les (periodicity, start) demandés', async () => {
      const jeu = [
        periode('A', '2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.000Z', '2026-02-05T00:00:00.000Z', 'monthly'),
        periode('B', '2026-01-01T00:00:00.000Z', '2026-03-31T23:59:59.000Z', '2026-04-05T00:00:00.000Z', 'quarterly'),
        periode('C', '2026-02-01T00:00:00.000Z', '2026-02-28T23:59:59.000Z', '2026-03-05T00:00:00.000Z', 'monthly'),
      ];
      await depotPeriode().insererPlusieurs(jeu);

      const trouves = await depotPeriode().listerParCles([
        { periodicity: 'monthly', start: d('2026-01-01T00:00:00.000Z') },
        { periodicity: 'quarterly', start: d('2026-01-01T00:00:00.000Z') },
      ]);
      expect(trouves.map((p) => p.label).sort()).toEqual(['A', 'B']);

      expect(
        await depotPeriode().listerParCles([{ periodicity: 'monthly', start: d('2026-02-01T00:00:00.000Z') }])
      ).toHaveLength(1);
      expect(await depotPeriode().listerParCles([{ periodicity: 'monthly', start: d('2025-01-01T00:00:00.000Z') }])).toEqual([]);
      expect(await depotPeriode().listerParCles([])).toEqual([]);
    });

    it('P4 : creerSiAbsent crée puis renvoie existante sans écraser', async () => {
      const cle = {
        start: d('2026-09-01T00:00:00.000Z'),
        end: d('2026-09-30T23:59:59.000Z'),
        deadline: d('2026-10-05T00:00:00.000Z'),
        periodicity: 'monthly',
      };

      const premier = await depotPeriode().creerSiAbsent({ label: 'Original', ...cle });
      expect(premier.cree).toBe(true);

      const second = await depotPeriode().creerSiAbsent({ label: 'Modifie', ...cle });
      expect(second.cree).toBe(false);
      expect(String(second.periode._id)).toBe(String(premier.periode._id));
      expect(second.periode.label).toBe('Original');
      expect(await depotPeriode().lister()).toHaveLength(1);
    });

    it("P5 : violation d'unicité (periodicity, start) → Error code 'DOUBLON'", async () => {
      await depotPeriode().insererPlusieurs([
        periode('Unique', '2026-11-01T00:00:00.000Z', '2026-11-30T23:59:59.000Z', '2026-12-05T00:00:00.000Z'),
      ]);

      let erreur = null;
      try {
        await depotPeriode().insererPlusieurs([
          periode('Doublon', '2026-11-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z', '2027-01-05T00:00:00.000Z'),
        ]);
      } catch (e) {
        erreur = e;
      }

      expect(erreur).not.toBeNull();
      expect(erreur.code).toBe('DOUBLON');
      expect(erreur.cause).toBeDefined();
      expect(await depotPeriode().lister()).toHaveLength(1);
    });

    it('P6 : les dates reviennent à la milliseconde près (création et relecture)', async () => {
      const start = d('2026-03-15T10:30:45.123Z');
      const end = d('2026-03-20T11:22:33.456Z');
      const deadline = d('2026-03-25T12:00:00.789Z');

      const { periode: creee } = await depotPeriode().creerSiAbsent({
        label: 'Millisecondes',
        start,
        end,
        deadline,
        periodicity: 'monthly',
      });

      expect(creee.start.getTime()).toBe(start.getTime());
      expect(creee.end.getTime()).toBe(end.getTime());
      expect(creee.deadline.getTime()).toBe(deadline.getTime());

      const relu = await depotPeriode().trouverParId(String(creee._id));
      expect(relu.start.getTime()).toBe(start.getTime());
      expect(relu.end.getTime()).toBe(end.getTime());
      expect(relu.deadline.getTime()).toBe(deadline.getTime());

      const parCle = await depotPeriode().listerParCles([{ periodicity: 'monthly', start }]);
      expect(parCle).toHaveLength(1);
      expect(parCle[0].start.getTime()).toBe(start.getTime());
    });

    it('P7 : trouverParId renvoie la période présente, sinon null', async () => {
      const { periode: creee } = await depotPeriode().creerSiAbsent(
        periode('A trouver', '2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.000Z', '2026-09-05T00:00:00.000Z')
      );

      expect(await depotPeriode().trouverParId(String(creee._id))).toMatchObject({ label: 'A trouver' });
      expect(await depotPeriode().trouverParId(mode === 'mongo' ? 'b'.repeat(24) : '99999999999')).toBeNull();
      expect(await depotPeriode().trouverParId('0')).toBeNull();
      expect(await depotPeriode().trouverParId('abc')).toBeNull();
      expect(await depotPeriode().trouverParId(null)).toBeNull();
      expect(await depotPeriode().trouverParId(mode === 'mongo' ? '12345' : '6564abcdef0123456789abcd')).toBeNull();
    });

    it('P8 : forme exacte des objets { _id, label, start, end, deadline, periodicity, createdAt, updatedAt }', async () => {
      const { periode: creee } = await depotPeriode().creerSiAbsent(
        periode('Forme', '2026-07-01T00:00:00.000Z', '2026-07-31T23:59:59.000Z', '2026-08-05T00:00:00.000Z', 'quarterly')
      );

      expect(Object.keys(creee).sort()).toEqual(
        mode === 'mongo'
          ? ['__v', '_id', 'createdAt', 'deadline', 'end', 'label', 'periodicity', 'start', 'updatedAt']
          : ['_id', 'createdAt', 'deadline', 'end', 'label', 'periodicity', 'start', 'updatedAt']
      );
      expect(typeof creee.label).toBe('string');
      expect(creee.periodicity).toBe('quarterly');
      expect(creee.start).toBeInstanceOf(Date);
      expect(creee.end).toBeInstanceOf(Date);
      expect(creee.deadline).toBeInstanceOf(Date);
      expect(creee.createdAt).toBeInstanceOf(Date);
      expect(creee.updatedAt).toBeInstanceOf(Date);
      if (mode === 'mongo') {
        expect(String(creee._id)).toMatch(/^[0-9a-f]{24}$/);
      } else {
        expect(typeof creee._id).toBe('string');
        expect(creee._id).toMatch(/^[1-9][0-9]{0,17}$/);
      }
    });

    it('P9 : supprimerTout vide les périodes', async () => {
      await depotPeriode().insererPlusieurs([
        periode('P1', '2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.000Z', '2026-02-05T00:00:00.000Z'),
        periode('P2', '2026-02-01T00:00:00.000Z', '2026-02-28T23:59:59.000Z', '2026-03-05T00:00:00.000Z'),
      ]);
      expect(await depotPeriode().lister()).toHaveLength(2);

      await depotPeriode().supprimerTout();
      expect(await depotPeriode().lister()).toHaveLength(0);
      expect(await depotPeriode().trouverParId('0')).toBeNull();
    });
  });
}

suiteContrat('Contrat du dépôt Periode — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // L'index unique (periodicity, start) est exigé par P5 : il est créé ici
    // (le modèle le déclare aussi, création idempotente).
    await mongoose.connection.db.collection('periodes').createIndex(
      { periodicity: 1, start: 1 },
      { unique: true }
    );
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat du dépôt Periode — Oracle', {
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

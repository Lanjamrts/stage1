"use strict";

// Contrat du dépôt Module : la même suite est exécutée pour les deux
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

// Clés exactes d'un module, __v MongoDB en plus (forme .lean()).
const CLES = [
  '_id',
  'active',
  'allowedPeriodicities',
  'code',
  'createdAt',
  'fields',
  'kind',
  'label',
  'periodicity',
  'structureTypes',
  'updatedAt',
  'version',
];

function moduleDoc(overrides = {}) {
  return {
    code: 'MOD001',
    label: 'Module un',
    periodicity: 'monthly',
    allowedPeriodicities: ['monthly', 'quarterly'],
    kind: 'periodic',
    structureTypes: ['SRB'],
    version: 1,
    active: true,
    fields: { sections: [] },
    ...overrides,
  };
}

// Les tests comparent sans tenir compte de l'ordre des deux tableaux
// (Mongo garde l'ordre fourni, Oracle les lit en ordre alphabétique).
const trie = (valeurs) => [...valeurs].sort();

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

    it('M1 : forme exacte des objets module', async () => {
      const cree = await depotModule().creer(moduleDoc({ code: 'FORME01' }));

      expect(Object.keys(cree).sort()).toEqual(mode === 'mongo' ? [...CLES, '__v'].sort() : CLES);
      expect(typeof cree.code).toBe('string');
      expect(typeof cree.label).toBe('string');
      expect(typeof cree.version).toBe('number');
      expect(typeof cree.active).toBe('boolean');
      expect(Array.isArray(cree.allowedPeriodicities)).toBe(true);
      expect(Array.isArray(cree.structureTypes)).toBe(true);
      expect(cree.fields).toBeTypeOf('object');
      expect(cree.createdAt).toBeInstanceOf(Date);
      expect(cree.updatedAt).toBeInstanceOf(Date);
      if (mode === 'mongo') {
        expect(String(cree._id)).toMatch(/^[0-9a-f]{24}$/);
      } else {
        expect(typeof cree._id).toBe('string');
        expect(cree._id).toMatch(/^[1-9][0-9]{0,17}$/);
      }
    });

    // ------------------------------------------------------- creer + enfants

    it('M2 : creer écrit les tableaux enfants (ordre non contractuel)', async () => {
      const cree = await depotModule().creer(
        moduleDoc({
          code: 'ENF001',
          allowedPeriodicities: ['quarterly', 'monthly'],
          structureTypes: ['SRPE', 'SRB'],
        })
      );
      expect(trie(cree.allowedPeriodicities)).toEqual(['monthly', 'quarterly']);
      expect(trie(cree.structureTypes)).toEqual(['SRB', 'SRPE']);

      const relu = await depotModule().trouverParCode('ENF001');
      expect(trie(relu.allowedPeriodicities)).toEqual(['monthly', 'quarterly']);
      expect(trie(relu.structureTypes)).toEqual(['SRB', 'SRPE']);

      // Sans tableaux : les deux renvoient [].
      const { allowedPeriodicities, structureTypes, ...sansTableaux } = moduleDoc({ code: 'ENF002' });
      const vide = await depotModule().creer(sansTableaux);
      expect(vide.allowedPeriodicities).toEqual([]);
      expect(vide.structureTypes).toEqual([]);
      expect(allowedPeriodicities).toBeDefined();
      expect(structureTypes).toBeDefined();
    });

    // ---------------------------------------------------------------- lister

    async function jeuModules() {
      await depotModule().creer(
        moduleDoc({ code: 'AAA', active: true, structureTypes: ['SRB'] })
      );
      await depotModule().creer(
        moduleDoc({ code: 'BBB', active: false, structureTypes: ['SRPE'], kind: 'event' })
      );
      await depotModule().creer(
        moduleDoc({ code: 'CCC', active: true, structureTypes: ['SRB', 'SRPE'] })
      );
      await depotModule().creer(moduleDoc({ code: 'DDD', active: true, structureTypes: [] }));
    }

    const codes = (liste) => liste.map((m) => m.code);

    it('M3 : lister trie par code croissant et applique chaque filtre seul', async () => {
      await jeuModules();

      expect(codes(await depotModule().lister())).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
      expect(codes(await depotModule().lister({ actifs: true }))).toEqual(['AAA', 'CCC', 'DDD']);
      expect(codes(await depotModule().lister({ actifs: false }))).toEqual(['BBB']);
      expect(codes(await depotModule().lister({ typeStructure: 'SRB' }))).toEqual(['AAA', 'CCC']);
      expect(codes(await depotModule().lister({ typeStructure: 'SRPE' }))).toEqual([
        'BBB',
        'CCC',
      ]);
      expect(codes(await depotModule().lister({ codes: ['DDD', 'AAA'] }))).toEqual([
        'AAA',
        'DDD',
      ]);
      // Listes vides : aucune ligne (cohérent avec $in: [] de MongoDB).
      expect(await depotModule().lister({ codes: [] })).toEqual([]);
      expect(await depotModule().lister({ codes: ['ZZZ'] })).toEqual([]);
      expect(await depotModule().lister({ typeStructure: 'DRBF' })).toEqual([]);
    });

    it('M4 : lister combine les filtres en ET', async () => {
      await jeuModules();

      expect(codes(await depotModule().lister({ actifs: true, typeStructure: 'SRB' }))).toEqual([
        'AAA',
        'CCC',
      ]);
      expect(codes(await depotModule().lister({ actifs: true, codes: ['BBB'] }))).toEqual([]);
      expect(codes(await depotModule().lister({ typeStructure: 'SRPE', codes: ['CCC'] }))).toEqual([
        'CCC',
      ]);
      expect(
        codes(
          await depotModule().lister({
            actifs: true,
            typeStructure: 'SRB',
            codes: ['AAA', 'BBB', 'CCC'],
          })
        )
      ).toEqual(['AAA', 'CCC']);
      expect(codes(await depotModule().lister({ actifs: true, typeStructure: 'SRB', codes: [] }))).toEqual(
        []
      );
    });

    it('M5 : lister trie par code croissant (MOD1, MOD10, MOD2)', async () => {
      await depotModule().creer(moduleDoc({ code: 'MOD10' }));
      await depotModule().creer(moduleDoc({ code: 'MOD2' }));
      await depotModule().creer(moduleDoc({ code: 'MOD1' }));

      expect(codes(await depotModule().lister())).toEqual(['MOD1', 'MOD10', 'MOD2']);
    });

    // -------------------------------------------------------- creer / doublon

    it("M6 : creer puis violation d'unicité (code) → Error code 'DOUBLON'", async () => {
      const cree = await depotModule().creer(moduleDoc({ code: 'DOUBLE1', label: 'Premier' }));
      expect(cree.code).toBe('DOUBLE1');

      let erreur = null;
      try {
        await depotModule().creer(moduleDoc({ code: 'DOUBLE1', label: 'Deuxieme' }));
      } catch (e) {
        erreur = e;
      }

      expect(erreur).not.toBeNull();
      expect(erreur.code).toBe('DOUBLON');
      expect(erreur.message).toBeTruthy();
      expect(erreur.cause).toBeDefined();
      expect(await depotModule().trouverParCode('DOUBLE1')).toMatchObject({ label: 'Premier' });
      expect(await depotModule().lister()).toHaveLength(1);
    });

    // ------------------------------------------------------------ mettreAJour

    it('M7 : mettreAJour change les champs, remplace les tableaux entièrement', async () => {
      const cree = await depotModule().creer(moduleDoc({ code: 'MAJ001' }));
      const id = String(cree._id);

      const majLabel = await depotModule().mettreAJour(id, { label: 'Nouveau libelle' });
      expect(majLabel.label).toBe('Nouveau libelle');
      expect(majLabel.code).toBe('MAJ001'); // code non modifiable
      expect(majLabel.version).toBe(1);

      // Remplacement intégral des tableaux enfants.
      const majTableaux = await depotModule().mettreAJour(id, {
        allowedPeriodicities: ['monthly'],
        structureTypes: ['DGBF', 'DRBF'],
      });
      expect(trie(majTableaux.allowedPeriodicities)).toEqual(['monthly']);
      expect(trie(majTableaux.structureTypes)).toEqual(['DGBF', 'DRBF']);
      const reluTableaux = await depotModule().trouverParId(id);
      expect(trie(reluTableaux.allowedPeriodicities)).toEqual(['monthly']);
      expect(trie(reluTableaux.structureTypes)).toEqual(['DGBF', 'DRBF']);

      const majVersion = await depotModule().mettreAJour(id, { version: 3 });
      expect(majVersion.version).toBe(3);
      expect(typeof majVersion.version).toBe('number');

      const majActive = await depotModule().mettreAJour(id, { active: false });
      expect(majActive.active).toBe(false);
      expect(typeof majActive.active).toBe('boolean');

      const majFields = await depotModule().mettreAJour(id, { fields: { nouveau: true } });
      expect(majFields.fields).toEqual({ nouveau: true });

      const majPeriodicite = await depotModule().mettreAJour(id, { periodicity: 'quarterly' });
      expect(majPeriodicite.periodicity).toBe('quarterly');

      const majKind = await depotModule().mettreAJour(id, { kind: 'event' });
      expect(majKind.kind).toBe('event');

      // Persistance.
      const relu = await depotModule().trouverParCode('MAJ001');
      expect(relu).toMatchObject({
        label: 'Nouveau libelle',
        version: 3,
        active: false,
        periodicity: 'quarterly',
        kind: 'event',
      });
      expect(relu.fields).toEqual({ nouveau: true });

      // Champs inconnus (ou non modifiables) refusés explicitement.
      await expect(depotModule().mettreAJour(id, { inconnu: 1 })).rejects.toThrow(/inconnu/);
      await expect(depotModule().mettreAJour(id, { code: 'AUTRE' })).rejects.toThrow(/code/);

      // Id invalide ou absent → null, sans exception.
      expect(await depotModule().mettreAJour('0', { label: 'X' })).toBeNull();
      expect(await depotModule().mettreAJour('abc', { label: 'X' })).toBeNull();
      expect(
        await depotModule().mettreAJour(mode === 'mongo' ? 'c'.repeat(24) : '99999999999', {
          label: 'X',
        })
      ).toBeNull();
    });

    // -------------------------------------------------------------- supprimer

    it('M8 : supprimer renvoie true puis false, id invalide → false', async () => {
      const cree = await depotModule().creer(moduleDoc({ code: 'SUP001' }));
      const id = String(cree._id);

      expect(await depotModule().supprimer(id)).toBe(true);
      expect(await depotModule().supprimer(id)).toBe(false);
      expect(await depotModule().supprimer('0')).toBe(false);
      expect(await depotModule().supprimer('abc')).toBe(false);
      expect(await depotModule().supprimer(mode === 'mongo' ? 'd'.repeat(24) : '99999999999')).toBe(
        false
      );
      expect(await depotModule().trouverParId(id)).toBeNull();
      expect(await depotModule().trouverParCode('SUP001')).toBeNull();
    });

    it('M9 : supprimer cascade les tableaux enfants (Oracle) / le document (Mongo)', async () => {
      const cree = await depotModule().creer(
        moduleDoc({
          code: 'CASC001',
          allowedPeriodicities: ['monthly', 'quarterly'],
          structureTypes: ['SRB'],
        })
      );
      const id = String(cree._id);

      expect(await depotModule().supprimer(id)).toBe(true);
      expect(await depotModule().trouverParId(id)).toBeNull();
      expect(await depotModule().trouverParCode('CASC001')).toBeNull();

      if (mode === 'oracle') {
        // ON DELETE CASCADE : les tables de jonction sont vides.
        const db = await getKnex();
        const periodicites = await db.raw('SELECT COUNT(*) AS N FROM MODULE_PERIODICITE');
        expect(Number((periodicites.rows || periodicites)[0].N)).toBe(0);
        const types = await db.raw('SELECT COUNT(*) AS N FROM MODULE_TYPE_STRUCTURE');
        expect(Number((types.rows || types)[0].N)).toBe(0);
      }
    });

    // --------------------------------------------------------------- assurer

    it('M10 : assurer crée puis renvoie existante sans écraser (version, active)', async () => {
      const premier = await depotModule().assurer(
        moduleDoc({ code: 'ASSUR01', label: 'Original', version: 2, active: false })
      );
      expect(premier.cree).toBe(true);
      expect(premier.module.label).toBe('Original');
      expect(premier.module.version).toBe(2);
      expect(premier.module.active).toBe(false);

      const second = await depotModule().assurer(
        moduleDoc({ code: 'ASSUR01', label: 'Modifie', version: 9, active: true })
      );
      expect(second.cree).toBe(false);
      expect(String(second.module._id)).toBe(String(premier.module._id));
      expect(second.module.label).toBe('Original');
      expect(second.module.version).toBe(2);
      expect(second.module.active).toBe(false);
      expect(await depotModule().lister()).toHaveLength(1);
    });

    // ------------------------------------------------------ mettreAJourFields

    it('M11 : mettreAJourFields remplace fields par code (true/false)', async () => {
      await depotModule().creer(moduleDoc({ code: 'FLD001', fields: { a: 1 } }));

      expect(await depotModule().mettreAJourFields('FLD001', { b: [1, 2], c: 'texte' })).toBe(true);
      const relu = await depotModule().trouverParCode('FLD001');
      expect(relu.fields).toEqual({ b: [1, 2], c: 'texte' });

      expect(await depotModule().mettreAJourFields('ABSENT', { x: 1 })).toBe(false);
    });

    // --------------------------------------------- completerPeriodicitesAutorisees

    it('M12 : completerPeriodicitesAutorisees applique une fois puis ne change plus', async () => {
      const { allowedPeriodicities, structureTypes, ...sansPeriodicites } = moduleDoc({
        code: 'PER001',
      });
      await depotModule().creer(sansPeriodicites);
      expect(allowedPeriodicities).toBeDefined();
      expect(structureTypes).toBeDefined();

      expect(await depotModule().completerPeriodicitesAutorisees('PER001', ['quarterly', 'monthly'])).toBe(
        true
      );
      const complet = await depotModule().trouverParCode('PER001');
      expect(trie(complet.allowedPeriodicities)).toEqual(['monthly', 'quarterly']);

      // N'écrase jamais une périodicité déjà enregistrée.
      expect(await depotModule().completerPeriodicitesAutorisees('PER001', ['monthly'])).toBe(false);
      const apres = await depotModule().trouverParCode('PER001');
      expect(trie(apres.allowedPeriodicities)).toEqual(['monthly', 'quarterly']);

      // Module déjà pourvu dès la création.
      await depotModule().creer(moduleDoc({ code: 'PER002', allowedPeriodicities: ['quarterly'] }));
      expect(await depotModule().completerPeriodicitesAutorisees('PER002', ['monthly'])).toBe(false);
      expect((await depotModule().trouverParCode('PER002')).allowedPeriodicities).toEqual(['quarterly']);

      // Module absent.
      expect(await depotModule().completerPeriodicitesAutorisees('ABSENT', ['monthly'])).toBe(false);
    });

    // ------------------------------------------------------------ JSON (fields)

    it('M13 : round-trip JSON (accents, nombres, booléens, null, tableaux, unicode)', async () => {
      const imbrique = {
        titre: 'Résumé éàü — 日本語 🎉',
        total: 1234.5,
        actif: true,
        rien: null,
        liste: [1, 'deux', { cle: 'valeur', flag: false }],
        profond: { interne: { cle: 'valeur' } },
      };
      await depotModule().creer(moduleDoc({ code: 'JSON001', fields: imbrique }));

      const relu = await depotModule().trouverParCode('JSON001');
      expect(relu.fields).toEqual(imbrique);
      expect(relu.fields.rien).toBeNull();
      expect(relu.fields.total).toBe(1234.5);
      expect(relu.fields.liste[2].flag).toBe(false);
    });

    it('M14 : round-trip JSON d’un gabarit de ~50 Ko (au-delà de 4000 octets)', async () => {
      const gabarit = { version: '1.0', note: 'unicode éàü 🎉', sections: [] };
      for (let i = 0; i < 400; i++) {
        gabarit.sections.push({
          id: `champ_${i}`,
          label: `Champ numéro ${i} — libellé avec accents éàü`,
          type: ['text', 'number', 'select', 'date'][i % 4],
          requis: i % 3 === 0,
          defaut: i % 5 === 0 ? null : i,
          options: [`opt_${i}_a`, `opt_${i}_b`, `opt_${i}_c`],
        });
      }
      const chaine = JSON.stringify(gabarit);
      expect(Buffer.byteLength(chaine, 'utf8')).toBeGreaterThan(40000);
      expect(Buffer.byteLength(chaine, 'utf8')).toBeLessThan(70000);

      await depotModule().creer(moduleDoc({ code: 'JSON002', fields: gabarit }));
      const relu = await depotModule().trouverParCode('JSON002');
      expect(relu.fields).toEqual(gabarit);
      expect(JSON.stringify(relu.fields)).toBe(chaine);

      // Même liaison sur le chemin UPDATE.
      expect(await depotModule().mettreAJourFields('JSON002', gabarit)).toBe(true);
      const reluApres = await depotModule().trouverParCode('JSON002');
      expect(reluApres.fields).toEqual(gabarit);
      expect(JSON.stringify(reluApres.fields)).toBe(chaine);
    });

    it("M15 : l'ordre des clés JSON est conservé à l'écriture comme à la lecture", async () => {
      const ordre = { zeta: 1, alpha: 2, mid: { beta: 3, aaa: 4 }, liste: [3, 1, 2] };
      await depotModule().creer(moduleDoc({ code: 'JSON003', fields: ordre }));

      const relu = await depotModule().trouverParCode('JSON003');
      expect(Object.keys(relu.fields)).toEqual(['zeta', 'alpha', 'mid', 'liste']);
      expect(Object.keys(relu.fields.mid)).toEqual(['beta', 'aaa']);
      expect(relu.fields).toEqual(ordre);
    });
  });
}

suiteContrat('Contrat du dépôt Module — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // L'index unique (code) est exigé par M6 : il est créé ici (le modèle le
    // déclare aussi, création idempotente).
    await mongoose.connection.db.collection('modules').createIndex({ code: 1 }, { unique: true });
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat du dépôt Module — Oracle', {
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
    // UTILISATEUR et MODULE_SIGBD finissent toutes sur l'une de ces tables
    // (clés étrangères du schéma) et bloqueraient le supprimerTout de
    // beforeEach. Les lignes concernées viennent des autres suites, qui
    // repartent d'un --reset ou de leurs propres inserts.
    await db.raw('DELETE FROM SAISIE_VALIDATION');
    await db.raw('DELETE FROM SAISIE');
    await db.raw('DELETE FROM REMARQUE');
  },
  nettoyer: async () => {
    await closeOracle();
  },
});

"use strict";

// Contrat des dépôts Referentiel et Profil : la même suite est exécutée pour les
// deux implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).
// MongoDB cible une base dédiée (sigbd_refcheck) : les données semées de
// sigbd_test ne sont jamais touchées.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getReferentielRepository } from '../src/repositories/referentielRepository.js';
import { getProfilRepository } from '../src/repositories/profilRepository.js';
import { loadConfig } from '../src/config.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const URI_MONGO = 'mongodb://127.0.0.1:27017/sigbd_refcheck';

// loadConfig() met en cache la configuration : le stockage est changé sur cet
// objet, et les dépôts le relisent à CHAQUE appel.
function fixerReferenceStore(valeur) {
  loadConfig().REFERENCE_STORE = valeur;
}

const depot = () => getReferentielRepository();
const depotProfil = () => getProfilRepository();

// Jeu de valeurs de tri : la casse, les accents et les chiffres mélangés
// distinguent l'ordre binaire (MongoDB) de tout autre collation (Oracle).
const VALEURS_TRI = ['Zèbre', 'abc', 'Abc', 'École', 'école', '10', '9'];
// Ordre binaire UTF-8 attendu des DEUX implémentations (JS .sort() = code unités
// = octets UTF-8 pour ces caractères).
const TRI_ATTENDU = ['10', '9', 'Abc', 'Zèbre', 'abc', 'École', 'école'];

function suiteContrat(nom, { skip = false, preparer, nettoyer }) {
  describe.skipIf(skip)(nom, () => {
    beforeAll(async () => {
      await preparer();
    }, 60000);

    afterAll(async () => {
      if (nettoyer) await nettoyer();
      fixerReferenceStore('mongo');
    }, 60000);

    beforeEach(async () => {
      await depot().supprimerTout();
      await depotProfil().supprimerTout();
    });

    // ------------------------------------------------------------ Referentiel

    it('C1 : creer puis lister restitue { type, value, ministere, regime, acronyme }', async () => {
      const cree = await depot().creer({ type: 'grades', value: "Agent d'execution" });
      expect(cree).toEqual({
        type: 'grades',
        value: "Agent d'execution",
        ministere: '',
        regime: '',
        acronyme: '',
      });

      const elements = await depot().lister('grades');
      expect(elements).toHaveLength(1);
      expect(elements[0]).toEqual(cree);
    });

    it("C2 : lister trie par value croissant (identique aux deux implémentations)", async () => {
      await depot().insererPlusieurs(VALEURS_TRI.map((value) => ({ type: 'grades', value })));
      const ordre = (await depot().lister('grades')).map((e) => e.value);
      expect(ordre).toEqual(TRI_ATTENDU);
    });

    it('C3 : trouver renvoie l’élément présent, sinon null', async () => {
      await depot().creer({ type: 'std', value: 'Direction Regionale de l Education' });

      const trouve = await depot().trouver('std', 'Direction Regionale de l Education');
      expect(trouve).toEqual({
        type: 'std',
        value: 'Direction Regionale de l Education',
        ministere: '',
        regime: '',
        acronyme: '',
      });

      expect(await depot().trouver('std', 'Valeur absente')).toBeNull();
      expect(await depot().trouver('grades', 'Direction Regionale de l Education')).toBeNull();
    });

    it('C4 : renommer change la valeur', async () => {
      await depot().creer({ type: 'directions', value: 'Ancienne direction' });
      await depot().renommer('directions', 'Ancienne direction', 'Nouvelle direction');

      expect(await depot().trouver('directions', 'Ancienne direction')).toBeNull();
      const apres = await depot().trouver('directions', 'Nouvelle direction');
      expect(apres).not.toBeNull();
      expect(apres.value).toBe('Nouvelle direction');
      expect((await depot().lister('directions')).map((e) => e.value)).toEqual(['Nouvelle direction']);
    });

    it('C5 : doublon (type, value) refusé au niveau base', async () => {
      await depot().creer({ type: 'services', value: 'Service en double' });
      await expect(depot().creer({ type: 'services', value: 'Service en double' })).rejects.toThrow();
      expect((await depot().lister('services'))).toHaveLength(1);
    });

    it('C6 : assurer renvoie true puis false, sans mise à jour', async () => {
      expect(await depot().assurer({ type: 'grades', value: 'Grade assurer' })).toBe(true);
      expect(await depot().assurer({ type: 'grades', value: 'Grade assurer' })).toBe(false);

      const elements = await depot().lister('grades');
      expect(elements).toHaveLength(1);
      expect(elements[0].value).toBe('Grade assurer');
    });

    it('C7 : assurerEpn crée puis met à jour sans doublon', async () => {
      expect(
        await depot().assurerEpn({ value: 'EPN contrat', ministere: 'Ministere A', regime: 'EPIC', acronyme: 'ECA' })
      ).toBe(true);
      expect((await depot().lister('epn'))).toHaveLength(1);

      expect(
        await depot().assurerEpn({ value: 'EPN contrat', ministere: 'Ministere B', regime: 'EPA', acronyme: 'ECB' })
      ).toBe(false);

      const elements = await depot().lister('epn');
      expect(elements).toHaveLength(1);
      expect(elements[0]).toEqual({
        type: 'epn',
        value: 'EPN contrat',
        ministere: 'Ministere B',
        regime: 'EPA',
        acronyme: 'ECB',
      });
    });

    it('C8 : ministere/regime/acronyme vides sont lus en chaîne vide', async () => {
      await depot().creer({ type: 'epn', value: 'EPN sans champ' });
      const lu = await depot().trouver('epn', 'EPN sans champ');
      expect(lu.ministere).toBe('');
      expect(lu.regime).toBe('');
      expect(lu.acronyme).toBe('');

      await depot().assurerEpn({ value: 'EPN sans champ', ministere: '', regime: '', acronyme: '' });
      const relu = await depot().trouver('epn', 'EPN sans champ');
      expect(relu.ministere).toBe('');
      expect(relu.regime).toBe('');
      expect(relu.acronyme).toBe('');
      expect((await depot().lister('epn'))).toHaveLength(1);
    });

    it('C9 : insererPlusieurs ajoute chaque élément', async () => {
      await depot().insererPlusieurs([
        { type: 'directions', value: 'Direction A' },
        { type: 'directions', value: 'Direction B' },
        { type: 'services', value: 'Service A' },
      ]);

      expect((await depot().lister('directions')).map((e) => e.value)).toEqual(['Direction A', 'Direction B']);
      expect((await depot().lister('services')).map((e) => e.value)).toEqual(['Service A']);
      expect(await depot().lister('grades')).toHaveLength(0);
    });

    it('C10 : supprimerTout vide le dépôt', async () => {
      await depot().insererPlusieurs([
        { type: 'grades', value: 'Grade X' },
        { type: 'grades', value: 'Grade Y' },
        { type: 'epn', value: 'EPN X', ministere: 'M', regime: 'EPA', acronyme: 'EX' },
      ]);
      expect((await depot().lister('grades'))).toHaveLength(2);

      await depot().supprimerTout();
      expect(await depot().lister('grades')).toHaveLength(0);
      expect(await depot().lister('epn')).toHaveLength(0);
      expect(await depot().trouver('grades', 'Grade X')).toBeNull();
    });

    // ------------------------------------------------------------------ Profil

    it('P1 : assurer renvoie true puis false, sans mise à jour', async () => {
      expect(await depotProfil().assurer({ code: 'admin1', label: 'Administrateur central (Admin 1)' })).toBe(true);
      expect(await depotProfil().assurer({ code: 'admin1', label: 'Libellé modifié' })).toBe(false);

      const profil = await depotProfil().trouverParCode('admin1');
      expect(profil).toEqual({ code: 'admin1', label: 'Administrateur central (Admin 1)' });
    });

    it('P2 : trouverParCode renvoie { code, label } ou null', async () => {
      await depotProfil().assurer({ code: 'consultant', label: 'Consultant' });

      expect(await depotProfil().trouverParCode('consultant')).toEqual({ code: 'consultant', label: 'Consultant' });
      expect(await depotProfil().trouverParCode('inconnu')).toBeNull();
    });

    it('P3 : supprimerTout vide les profils', async () => {
      await depotProfil().assurer({ code: 'client', label: 'Client' });
      await depotProfil().assurer({ code: 'admin2', label: 'Administrateur regional (Admin 2)' });

      await depotProfil().supprimerTout();
      expect(await depotProfil().trouverParCode('client')).toBeNull();
      expect(await depotProfil().trouverParCode('admin2')).toBeNull();
    });
  });
}

suiteContrat('Contrat des dépôts Referentiel/Profil — MongoDB', {
  preparer: async () => {
    fixerReferenceStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // L'index unique (type, value) est exigé par C5 : il est créé ici (le
    // modèle le déclare aussi, la création est donc idempotente).
    await mongoose.connection.db.collection('referentiels').createIndex(
      { type: 1, value: 1 },
      { unique: true }
    );
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat des dépôts Referentiel/Profil — Oracle', {
  skip: !oracleConfiguree,
  preparer: async () => {
    fixerReferenceStore('oracle');
    // Le schéma n'est appliqué QUE si une table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw("SELECT COUNT(*) AS N FROM user_tables WHERE table_name = 'REFERENTIEL'");
    const lignes = resultat.rows || resultat;
    const profil = await db.raw("SELECT COUNT(*) AS N FROM user_tables WHERE table_name = 'PROFIL'");
    const lignesProfil = profil.rows || profil;
    if (Number(lignes[0].N) === 0 || Number(lignesProfil[0].N) === 0) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }
  },
  nettoyer: async () => {
    await closeOracle();
  },
});

describe.skipIf(!oracleConfiguree)('Tri comparé MongoDB / Oracle (REFERENCE_STORE)', () => {
  afterAll(async () => {
    fixerReferenceStore('mongo');
  });

  it("T1 : les deux implémentations ordonnent exactement pareil", async () => {
    const elements = () => VALEURS_TRI.map((value) => ({ type: 'grades', value }));

    fixerReferenceStore('oracle');
    const dbOracle = await getKnex();
    const resultat = await dbOracle.raw("SELECT COUNT(*) AS N FROM user_tables WHERE table_name = 'REFERENTIEL'");
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) === 0) {
      expect(await mainSchema([])).toBe(0);
    }
    await depot().supprimerTout();
    await depot().insererPlusieurs(elements());
    const ordreOracle = (await depot().lister('grades')).map((e) => e.value);

    fixerReferenceStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    await depot().insererPlusieurs(elements());
    const ordreMongo = (await depot().lister('grades')).map((e) => e.value);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();

    fixerReferenceStore('oracle');
    await depot().supprimerTout();

    // Toute différence entre les deux ordres fait échouer le test avec les deux
    // suites détaillées (aucune n'est masquée).
    expect(
      ordreOracle,
      `Oracle : ${JSON.stringify(ordreOracle)} — MongoDB : ${JSON.stringify(ordreMongo)}`
    ).toEqual(ordreMongo);
    expect(ordreMongo).toEqual(TRI_ATTENDU);
  }, 60000);
});

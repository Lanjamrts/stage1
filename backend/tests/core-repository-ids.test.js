"use strict";

// Contrat de la méthode d'ajout étape 40 : listerParIds(ids) des dépôts
// Structure, Periode, Utilisateur et Module. La même suite est exécutée pour
// les deux implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont
// définies). MongoDB cible une base dédiée (sigbd_corecheck) : les données
// semées de sigbd_test ne sont jamais touchées.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
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

const depotStructure = () => getStructureRepository();
const depotPeriode = () => getPeriodeRepository();
const depotUtilisateur = () => getUtilisateurRepository();
const depotModule = () => getModuleRepository();
const depotSaisie = () => getSaisieRepository();
const depotRemarque = () => getRemarqueRepository();
const depotRegion = () => getRegionRepository();

// Id bien formé mais absent, pour chaque stockage.
const ID_ABSENT = (mode) => (mode === 'mongo' ? 'a'.repeat(24) : '99999999999');
// Id valide pour l'AUTRE stockage uniquement (jamais retenu).
const ID_AUTRE = (mode) => (mode === 'mongo' ? '12345' : 'a'.repeat(24));

let sequence = 0;

async function jeuDepots() {
  sequence += 1;
  const structure1 = (
    await depotStructure().creerSiAbsent({ code: `STR${sequence}A`, label: 'Structure A', type: 'SRB' })
  ).structure;
  sequence += 1;
  const structure2 = (
    await depotStructure().creerSiAbsent({ code: `STR${sequence}B`, label: 'Structure B', type: 'SRSP' })
  ).structure;
  sequence += 1;
  const periode1 = (
    await depotPeriode().creerSiAbsent({
      label: `Periode ${sequence}A`,
      start: new Date(Date.UTC(2026, 0, sequence)),
      end: new Date(Date.UTC(2026, 0, sequence + 20)),
      deadline: new Date(Date.UTC(2026, 0, sequence + 25)),
      periodicity: 'monthly',
    })
  ).periode;
  sequence += 1;
  const periode2 = (
    await depotPeriode().creerSiAbsent({
      label: `Periode ${sequence}B`,
      start: new Date(Date.UTC(2026, 0, sequence)),
      end: new Date(Date.UTC(2026, 0, sequence + 20)),
      deadline: new Date(Date.UTC(2026, 0, sequence + 25)),
      periodicity: 'quarterly',
    })
  ).periode;
  sequence += 1;
  const utilisateur1 = await depotUtilisateur().creer({
    im: `IM${sequence}A`,
    nom: 'Alpha',
    prenom: 'Un',
    direction: 'Direction',
    service: 'Service',
    passwordHash: 'hash1',
    role: 'client',
    status: 'actif',
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    structureId: String(structure1._id),
  });
  sequence += 1;
  const utilisateur2 = await depotUtilisateur().creer({
    im: `IM${sequence}B`,
    nom: 'Beta',
    prenom: 'Deux',
    direction: 'Direction',
    service: 'Service',
    passwordHash: 'hash2',
    role: 'admin2',
    status: 'actif',
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    structureId: String(structure2._id),
  });
  sequence += 1;
  const module1 = await depotModule().creer({
    code: `MOD${sequence}A`,
    label: 'Module A',
    periodicity: 'monthly',
    allowedPeriodicities: ['monthly', 'quarterly'],
    kind: 'periodic',
    structureTypes: ['SRB'],
    version: 1,
    active: true,
    fields: { sections: [] },
  });
  sequence += 1;
  const module2 = await depotModule().creer({
    code: `MOD${sequence}B`,
    label: 'Module B',
    periodicity: 'quarterly',
    allowedPeriodicities: ['quarterly'],
    kind: 'event',
    structureTypes: ['SRSP'],
    version: 2,
    active: false,
    fields: { sections: [{ id: 'champ' }] },
  });
  return { structure1, structure2, periode1, periode2, utilisateur1, utilisateur2, module1, module2 };
}

const ids = (objets) => objets.map((o) => String(o._id));

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

    // ------------------------------------------------------------ cas vides

    it('I1 : [] pour une liste vide, non-tableau ou sans id valide (4 dépôts)', async () => {
      const depots = [depotStructure(), depotPeriode(), depotUtilisateur(), depotModule()];
      for (const depot of depots) {
        expect(await depot.listerParIds([])).toEqual([]);
        expect(await depot.listerParIds(null)).toEqual([]);
        expect(await depot.listerParIds('STR001')).toEqual([]);
        expect(await depot.listerParIds(undefined)).toEqual([]);
        expect(await depot.listerParIds(['abc', '0', '', ' '])).toEqual([]);
        expect(await depot.listerParIds([ID_AUTRE(mode)])).toEqual([]);
      }
    });

    it('I2 : ids invalides et en double ignorés, ordre de création (4 dépôts)', async () => {
      const jeu = await jeuDepots();

      const trouvesStructures = await depotStructure().listerParIds([
        String(jeu.structure2._id),
        String(jeu.structure1._id),
        String(jeu.structure1._id),
        'abc',
        ID_AUTRE(mode),
        ID_ABSENT(mode),
      ]);
      expect(ids(trouvesStructures)).toEqual([String(jeu.structure1._id), String(jeu.structure2._id)]);

      const trouveesPeriodes = await depotPeriode().listerParIds([
        String(jeu.periode2._id),
        String(jeu.periode1._id),
        String(jeu.periode1._id),
        'abc',
      ]);
      expect(ids(trouveesPeriodes)).toEqual([String(jeu.periode1._id), String(jeu.periode2._id)]);

      const trouvesUtilisateurs = await depotUtilisateur().listerParIds([
        String(jeu.utilisateur2._id),
        String(jeu.utilisateur1._id),
        ID_AUTRE(mode),
      ]);
      expect(ids(trouvesUtilisateurs)).toEqual([
        String(jeu.utilisateur1._id),
        String(jeu.utilisateur2._id),
      ]);

      const trouvesModules = await depotModule().listerParIds([
        String(jeu.module2._id),
        String(jeu.module1._id),
        String(jeu.module2._id),
        ID_ABSENT(mode),
      ]);
      expect(ids(trouvesModules)).toEqual([String(jeu.module1._id), String(jeu.module2._id)]);

      // Un seul id valide, les autres ignorés.
      const unSeul = await depotStructure().listerParIds([
        'n importe quoi',
        String(jeu.structure2._id),
      ]);
      expect(ids(unSeul)).toEqual([String(jeu.structure2._id)]);
    });

    // -------------------------------------------------------- format habituel

    it('I3 : chaque dépôt renvoie ses objets au format habituel', async () => {
      const jeu = await jeuDepots();

      const [structure] = await depotStructure().listerParIds([String(jeu.structure1._id)]);
      expect(structure).toMatchObject({
        code: jeu.structure1.code,
        label: 'Structure A',
        type: 'SRB',
        active: true,
      });
      expect(structure.regionId == null).toBe(true);
      expect(structure.createdAt).toBeInstanceOf(Date);
      expect(structure.updatedAt).toBeInstanceOf(Date);

      const [periode] = await depotPeriode().listerParIds([String(jeu.periode1._id)]);
      expect(periode).toMatchObject({ label: jeu.periode1.label, periodicity: 'monthly' });
      expect(periode.start).toBeInstanceOf(Date);
      expect(periode.end).toBeInstanceOf(Date);
      expect(periode.deadline).toBeInstanceOf(Date);

      // Format habituel : passwordHash PRÉSENT ici (le retrait n'a lieu qu'au
      // moment de construire un lien dans les dépôts Saisie/Remarque).
      const [utilisateur] = await depotUtilisateur().listerParIds([String(jeu.utilisateur1._id)]);
      expect(utilisateur).toMatchObject({
        im: jeu.utilisateur1.im,
        nom: 'Alpha',
        role: 'client',
        status: 'actif',
        passwordHash: 'hash1',
      });
      expect(String(utilisateur.structureId)).toBe(String(jeu.structure1._id));

      const [moduleDoc] = await depotModule().listerParIds([String(jeu.module1._id)]);
      expect(moduleDoc).toMatchObject({
        code: jeu.module1.code,
        label: 'Module A',
        kind: 'periodic',
        version: 1,
        active: true,
        fields: { sections: [] },
      });
      expect([...moduleDoc.allowedPeriodicities].sort()).toEqual(['monthly', 'quarterly']);
      expect([...moduleDoc.structureTypes].sort()).toEqual(['SRB']);
    });
  });
}

suiteContrat('Contrat de listerParIds — MongoDB', {
  mode: 'mongo',
  preparer: async () => {
    fixerCoreStore('mongo');
    await mongoose.connect(URI_MONGO);
    await mongoose.connection.dropDatabase();
    // Aucun index unique nécessaire ici (pas de test de doublon) : les
    // indexes des autres suites sont recréés par ces suites elles-mêmes.
  },
  nettoyer: async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});

suiteContrat('Contrat de listerParIds — Oracle', {
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

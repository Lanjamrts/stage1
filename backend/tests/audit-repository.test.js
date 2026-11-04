"use strict";

// Contrat du dépôt d'audit : la même suite de tests est exécutée pour les deux
// implémentations (MongoDB toujours, Oracle si ORACLE_TEST_* sont définies).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { getAuditRepository } from '../src/repositories/auditRepository.js';
import { loadConfig } from '../src/config.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

// loadConfig() met en cache la configuration : le stockage est changé sur cet
// objet, et getAuditRepository() le relit à CHAQUE appel.
function fixerAuditStore(valeur) {
  loadConfig().AUDIT_STORE = valeur;
}

const depot = () => getAuditRepository();

async function ajouter(partiel) {
  await depot().ajouter({
    userRef: 'u1',
    action: 'action_test',
    objet: 'objet_test',
    ip: '127.0.0.1',
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    ...partiel,
  });
}

function suiteContrat(nom, { skip = false, preparer, nettoyer }) {
  describe.skipIf(skip)(nom, () => {
    beforeAll(async () => {
      await preparer();
    }, 60000);

    afterAll(async () => {
      if (nettoyer) await nettoyer();
      fixerAuditStore('mongo');
    }, 60000);

    beforeEach(async () => {
      await depot().supprimerTout();
    });

    it('C1 : ajouter puis lister restitue la ligne (id, createdAt, action, userRef, objet, ip)', async () => {
      const quand = new Date('2026-02-01T10:00:00.000Z');
      await depot().ajouter({ userRef: 'u1', action: 'login_success', objet: 'utilisateur', ip: '::1', createdAt: quand });

      const { total, lignes } = await depot().lister({ page: 1, limit: 50 });
      expect(total).toBe(1);
      expect(lignes).toHaveLength(1);
      const ligne = lignes[0];
      expect(typeof ligne.id).toBe('string');
      expect(ligne.id.length).toBeGreaterThan(0);
      expect(ligne.createdAt).toBeInstanceOf(Date);
      expect(ligne.createdAt.getTime()).toBe(quand.getTime());
      expect(ligne.action).toBe('login_success');
      expect(ligne.userRef).toBe('u1');
      expect(ligne.objet).toBe('utilisateur');
      expect(ligne.ip).toBe('::1');
    });

    it('C2 : tri createdAt décroissant, puis id décroissant à date égale', async () => {
      const t1 = new Date('2026-02-01T10:00:00.000Z');
      const t2 = new Date('2026-02-02T10:00:00.000Z');
      await ajouter({ objet: 'premier', createdAt: t1 });
      await ajouter({ objet: 'deuxieme', createdAt: t2 });
      await ajouter({ objet: 'instant-1', createdAt: t2 });
      await ajouter({ objet: 'instant-2', createdAt: t2 });

      const { lignes } = await depot().lister({ page: 1, limit: 10 });
      expect(lignes.map((l) => l.objet)).toEqual(['instant-2', 'instant-1', 'deuxieme', 'premier']);
    });

    it('C3 : pagination page=2 limit=2 sur 5 lignes, total = 5', async () => {
      for (let i = 1; i <= 5; i++) {
        await ajouter({ objet: `o${i}`, createdAt: new Date(Date.UTC(2026, 1, i, 10, 0, 0)) });
      }

      const { total, lignes } = await depot().lister({ page: 2, limit: 2 });
      expect(total).toBe(5);
      expect(lignes.map((l) => l.objet)).toEqual(['o3', 'o2']);

      const premiere = await depot().lister({ page: 1, limit: 2 });
      expect(premiere.total).toBe(5);
      expect(premiere.lignes.map((l) => l.objet)).toEqual(['o5', 'o4']);
    });

    it("C4 : filtre actions (liste = IN), liste vide = aucune ligne", async () => {
      await ajouter({ action: 'login_success', objet: 'x1' });
      await ajouter({ action: 'logout', objet: 'x2' });
      await ajouter({ action: 'login_failure', objet: 'x3' });

      const choix = await depot().lister({ actions: ['login_success', 'login_failure'], page: 1, limit: 50 });
      expect(choix.total).toBe(2);
      expect(choix.lignes.every((l) => ['login_success', 'login_failure'].includes(l.action))).toBe(true);

      const vide = await depot().lister({ actions: [], page: 1, limit: 50 });
      expect(vide.total).toBe(0);
      expect(vide.lignes).toHaveLength(0);
    });

    it('C5 : bornes depuis / jusqu inclusives sur createdAt', async () => {
      const jours = [10, 11, 12, 13, 14].map((j) => new Date(Date.UTC(2026, 0, j, 10, 0, 0)));
      for (let i = 0; i < jours.length; i++) {
        await ajouter({ objet: `jour${i + 1}`, createdAt: jours[i] });
      }

      const entre = await depot().lister({ depuis: jours[1], jusqu: jours[3], page: 1, limit: 50 });
      expect(entre.total).toBe(3);
      expect(entre.lignes.map((l) => l.objet)).toEqual(['jour4', 'jour3', 'jour2']);

      const depuis = await depot().lister({ depuis: jours[3], page: 1, limit: 50 });
      expect(depuis.total).toBe(2);

      const jusqu = await depot().lister({ jusqu: jours[1], page: 1, limit: 50 });
      expect(jusqu.total).toBe(2);
      expect(jusqu.lignes.map((l) => l.objet)).toEqual(['jour2', 'jour1']);
    });

    it('C6 : filtre userRefsIn (IN sur les identifiants)', async () => {
      await ajouter({ userRef: 'u1' });
      await ajouter({ userRef: 'u2' });
      await ajouter({ userRef: 'u3' });

      const { total, lignes } = await depot().lister({ userRefsIn: ['u1', 'u3'], page: 1, limit: 50 });
      expect(total).toBe(2);
      expect(lignes.map((l) => l.userRef).sort()).toEqual(['u1', 'u3']);
    });

    it('C7 : objetContient est insensible à la casse', async () => {
      await ajouter({ objet: 'Saisie module NCA validée' });
      await ajouter({ objet: 'autre ligne' });

      for (const texte of ['nca', 'NCA', 'valid', 'VALIDÉE']) {
        const { total } = await depot().lister({ objetContient: texte, page: 1, limit: 50 });
        expect(total, `recherche « ${texte} »`).toBe(1);
      }
    });

    it('C8 : objetContient traite % et _ littéralement', async () => {
      await ajouter({ objet: 'taux 100%' });
      await ajouter({ objet: 'taux 1000' });
      await ajouter({ objet: 'a_b' });
      await ajouter({ objet: 'axb' });

      const pourcent = await depot().lister({ objetContient: '100%', page: 1, limit: 50 });
      expect(pourcent.total).toBe(1);
      expect(pourcent.lignes[0].objet).toBe('taux 100%');

      const souligne = await depot().lister({ objetContient: 'a_b', page: 1, limit: 50 });
      expect(souligne.total).toBe(1);
      expect(souligne.lignes[0].objet).toBe('a_b');
    });

    it('C9 : objetContient + userRefsIn sont combinés en OU', async () => {
      await ajouter({ userRef: 'u1', objet: 'ligne annexe' });
      await ajouter({ userRef: 'u2', objet: 'ligne dans la cible' });
      await ajouter({ userRef: 'u3', objet: 'ligne annexe aussi' });

      const { total, lignes } = await depot().lister({ objetContient: 'cible', userRefsIn: ['u1'], page: 1, limit: 50 });
      expect(total).toBe(2);
      expect(lignes.map((l) => l.userRef).sort()).toEqual(['u1', 'u2']);
    });

    it('C10 : userRefsIn vide = aucune ligne', async () => {
      await ajouter({ userRef: 'u1' });
      await ajouter({ userRef: 'u2' });

      const { total, lignes } = await depot().lister({ userRefsIn: [], page: 1, limit: 50 });
      expect(total).toBe(0);
      expect(lignes).toHaveLength(0);
    });

    it('C11 : 1500 userRefsIn (découpage de l IN)', async () => {
      const refs = ['cible'];
      for (let i = 0; i < 1499; i++) refs.push(`ref${i}`);
      await ajouter({ userRef: 'cible' });
      await ajouter({ userRef: 'hors-liste' });

      const { total, lignes } = await depot().lister({ userRefsIn: refs, page: 1, limit: 50 });
      expect(total).toBe(1);
      expect(lignes[0].userRef).toBe('cible');
    });

    it('C12 : supprimerTout vide le dépôt', async () => {
      await ajouter({ objet: 'a' });
      await ajouter({ objet: 'b' });
      await ajouter({ objet: 'c' });
      expect((await depot().lister({ page: 1, limit: 50 })).total).toBe(3);

      await depot().supprimerTout();
      const apres = await depot().lister({ page: 1, limit: 50 });
      expect(apres.total).toBe(0);
      expect(apres.lignes).toHaveLength(0);
    });
  });
}

suiteContrat("Contrat du dépôt d'audit — MongoDB", {
  preparer: async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    fixerAuditStore('mongo');
  },
  nettoyer: async () => {
    await mongoose.disconnect();
  },
});

suiteContrat("Contrat du dépôt d'audit — Oracle", {
  skip: !oracleConfiguree,
  preparer: async () => {
    fixerAuditStore('oracle');
    // Le schéma n'est appliqué QUE si la table manque : jamais de --reset.
    const db = await getKnex();
    const resultat = await db.raw("SELECT COUNT(*) AS N FROM user_tables WHERE table_name = 'JOURNAL_AUDIT'");
    const lignes = resultat.rows || resultat;
    if (Number(lignes[0].N) === 0) {
      const code = await mainSchema([]);
      expect(code).toBe(0);
    }
  },
  nettoyer: async () => {
    await closeOracle();
  },
});

"use strict";

// Circuit connexion + comptes avec CORE_STORE=oracle ET AUDIT_STORE=oracle :
// login, /me, changement de mot de passe et /api/users servis par les dépôts
// Utilisateur/Structure sur Oracle, journal d'audit sur Oracle. Même montage
// que backend/tests/audit-oracle-store.test.js.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/services/auth.js';
import { getKnex, closeOracle } from '../src/db/oracle.js';
import { main as mainSchema } from '../src/scripts/oracle-schema.js';
import { getRegionRepository } from '../src/repositories/regionRepository.js';
import { getStructureRepository } from '../src/repositories/structureRepository.js';
import { getUtilisateurRepository } from '../src/repositories/utilisateurRepository.js';
import { getSaisieRepository } from '../src/repositories/saisieRepository.js';
import { getRemarqueRepository } from '../src/repositories/remarqueRepository.js';
import { getModuleRepository } from '../src/repositories/moduleRepository.js';
import { getPeriodeRepository } from '../src/repositories/periodeRepository.js';
import { getAuditRepository } from '../src/repositories/auditRepository.js';

const oracleConfiguree = Boolean(process.env.ORACLE_TEST_USER && process.env.ORACLE_TEST_PASSWORD);

const IM_ADMIN1 = '900001';
const IM_CIBLE = '900002';
const IM_PROVISOIRE = '900003';
const IM_VERROU = '900004';
const IM_NEUF = '900010';
const MDP = 'Test@2026';
const MDP_NOUVEAU = 'Nouveau@2026';
const STRUCTURE_LABEL = 'SRB – Analamanga Oracle';

let app;
let coreStoreAvant;
let auditStoreAvant;
let agentAdmin;
let structure;
let admin1;
let cible;

// Ordre sûr : Saisie puis Remarque (FK sur UTILISATEUR), Utilisateur, Module,
// Structure, Periode, Region (dépendantes dans cet ordre).
async function nettoyer() {
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
    structureId: String(structure._id),
    ...overrides,
  });
}

describe.skipIf(!oracleConfiguree)('Bascule CORE_STORE + AUDIT_STORE = oracle — connexion et comptes', () => {
  beforeAll(async () => {
    coreStoreAvant = process.env.CORE_STORE;
    auditStoreAvant = process.env.AUDIT_STORE;
    process.env.CORE_STORE = 'oracle';
    process.env.AUDIT_STORE = 'oracle';

    // L'import de l'APP se fait après les variables ; la configuration est en
    // cache (import de services/auth.js en tête de fichier) : les deux
    // interrupteurs y sont écrits directement ci-dessous.
    ({ default: app } = await import('../src/server.js'));
    loadConfig().CORE_STORE = 'oracle';
    loadConfig().AUDIT_STORE = 'oracle';
    expect(loadConfig().CORE_STORE).toBe('oracle');
    expect(loadConfig().AUDIT_STORE).toBe('oracle');

    await mongoose.connect(process.env.MONGODB_URI);

    // Schéma appliqué seulement si une table manque : jamais de --reset.
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

    await getAuditRepository().supprimerTout();
    await nettoyer();

    // Fixtures créées avec les dépôts (Region, Structure, Utilisateur).
    const { region } = await getRegionRepository().assurer('Analamanga');
    ({ structure } = await getStructureRepository().creerSiAbsent({
      code: 'SRB999',
      label: STRUCTURE_LABEL,
      type: 'SRB',
      regionId: String(region._id),
    }));
    admin1 = await nouvelUtilisateur({
      im: IM_ADMIN1,
      nom: 'Ranaivo',
      prenom: 'Hery',
      role: 'admin1',
    });
    cible = await nouvelUtilisateur({ im: IM_CIBLE, nom: 'Rakoto', prenom: 'Fanja' });
    await nouvelUtilisateur({ im: IM_PROVISOIRE, nom: 'Andria', prenom: 'Lova', mustChangePassword: true });
    await nouvelUtilisateur({ im: IM_VERROU, nom: 'Rasoa', prenom: 'Voahangy' });

    agentAdmin = request.agent(app);
  }, 60000);

  afterAll(async () => {
    await getAuditRepository().supprimerTout();
    await nettoyer();
    await mongoose.disconnect();
    await closeOracle();
    if (coreStoreAvant === undefined) {
      delete process.env.CORE_STORE;
    } else {
      process.env.CORE_STORE = coreStoreAvant;
    }
    if (auditStoreAvant === undefined) {
      delete process.env.AUDIT_STORE;
    } else {
      process.env.AUDIT_STORE = auditStoreAvant;
    }
    loadConfig().CORE_STORE = coreStoreAvant ?? 'mongo';
    loadConfig().AUDIT_STORE = auditStoreAvant ?? 'mongo';
  }, 60000);

  it('A1 : login admin1 réussi, cookie de session posé', async () => {
    const res = await agentAdmin.post('/api/auth/login').send({ im: IM_ADMIN1, password: MDP });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Connexion réussie');
    expect(res.body.user).toEqual({ im: IM_ADMIN1, role: 'admin1' });
    expect(res.headers['set-cookie']).toBeDefined();
    expect(String(res.headers['set-cookie'])).toContain('token=');
  });

  it('A2 : GET /api/auth/me renvoie la structure liée (structureLabel)', async () => {
    const res = await agentAdmin.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.im).toBe(IM_ADMIN1);
    expect(res.body.role).toBe('admin1');
    expect(res.body.structureId).toBe(String(structure._id));
    expect(res.body.structureLabel).toBe(STRUCTURE_LABEL);
    expect(res.body.mustChangePassword).toBe(false);
  });

  it('A3 : mauvais mot de passe → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ im: IM_ADMIN1, password: 'Faute@2026' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Identifiant ou mot de passe incorrect.');
  });

  it('A4 : 5 échecs verrouillent le compte (403 verrouillage)', async () => {
    for (let i = 0; i < 5; i++) {
      const echec = await request(app)
        .post('/api/auth/login')
        .send({ im: IM_VERROU, password: 'Faute@2026' });
      expect(echec.status).toBe(400);
      expect(echec.body.message).toBe('Identifiant ou mot de passe incorrect.');
    }

    // Le verrouillage est vérifié AVANT la comparaison : même le bon mot de
    // passe est refusé.
    const verrouille = await request(app)
      .post('/api/auth/login')
      .send({ im: IM_VERROU, password: MDP });
    expect(verrouille.status).toBe(403);
    expect(verrouille.body.message).toMatch(/verrouillé/i);

    const relu = await getUtilisateurRepository().trouverParIm(IM_VERROU);
    expect(relu.failedAttempts).toBe(5);
    expect(new Date(relu.lockedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("A5 : token d'un autre stockage (id 24 hex) → 401 Token invalide", async () => {
    const token = jwt.sign(
      {
        id: 'a'.repeat(24),
        im: IM_ADMIN1,
        role: 'admin1',
        structureId: String(structure._id),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      loadConfig().JWT_SECRET
    );
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token invalide');
  });

  it('A6 : changement de mot de passe (mustChangePassword) puis accès rétabli', async () => {
    const agent = request.agent(app);
    const connexion = await agent.post('/api/auth/login').send({ im: IM_PROVISOIRE, password: MDP });
    expect(connexion.status).toBe(200);

    // Tant que le mot de passe provisoire n'est pas changé : tout est bloqué.
    const bloque = await agent.get('/api/auth/me');
    expect(bloque.status).toBe(403);
    expect(bloque.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const change = await agent.post('/api/auth/change-password').send({
      current: MDP,
      new: MDP_NOUVEAU,
      confirmation: MDP_NOUVEAU,
    });
    expect(change.status).toBe(200);
    expect(change.body.message).toBe('Mot de passe changé avec succès');

    const apres = await agent.get('/api/auth/me');
    expect(apres.status).toBe(200);
    expect(apres.body.im).toBe(IM_PROVISOIRE);
    expect(apres.body.mustChangePassword).toBe(false);

    // L'ancien mot de passe ne fonctionne plus, le nouveau oui.
    const ancien = await request(app)
      .post('/api/auth/login')
      .send({ im: IM_PROVISOIRE, password: MDP });
    expect(ancien.status).toBe(400);
    const neuf = await request(app)
      .post('/api/auth/login')
      .send({ im: IM_PROVISOIRE, password: MDP_NOUVEAU });
    expect(neuf.status).toBe(200);
  });

  it("A7 : admin1 — création (201), doublon d'IM (409), liste q+rôle, profil, désactivation (403), réinitialisation", async () => {
    const corps = {
      im: IM_NEUF,
      nom: 'Testeur',
      prenom: 'Nivo',
      direction: 'Direction des Régions Budget et des Finances',
      service: 'Service des rapports',
      role: 'client',
      structureId: String(structure._id),
    };

    // Création → 201 + mot de passe provisoire.
    const cree = await agentAdmin.post('/api/users').send(corps);
    expect(cree.status).toBe(201);
    expect(cree.body.id).toMatch(/^[0-9]+$/);
    expect(cree.body.provisionalPassword).toMatch(/^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/);
    const neufId = cree.body.id;

    // Doublon d'IM → 409.
    const doublon = await agentAdmin.post('/api/users').send(corps);
    expect(doublon.status).toBe(409);
    expect(doublon.body.message).toBe('Cet IM existe déjà.');

    // Liste avec q et filtre rôle (ET) ; structureId peuplé en { _id, label }.
    const liste = await agentAdmin.get('/api/users?role=client&q=Testeur');
    expect(liste.status).toBe(200);
    const trouve = liste.body.find((u) => u.id === neufId);
    expect(trouve).toBeDefined();
    expect(trouve.structureId).toBe(String(structure._id));
    expect(trouve.structureLabel).toBe(STRUCTURE_LABEL);
    const autres = await agentAdmin.get('/api/users?role=consultant');
    expect(autres.status).toBe(200);
    expect(autres.body.map((u) => u.id)).not.toContain(neufId);
    expect(liste.body.map((u) => u.id)).not.toContain(String(admin1._id));

    // Filtre invalide → 400 (message identique à l'avant).
    expect((await agentAdmin.get('/api/users?role=inconnu')).status).toBe(400);
    expect((await agentAdmin.get('/api/users?structure=abc')).status).toBe(400);

    // PATCH profil.
    const profil = await agentAdmin.patch(`/api/users/${neufId}/profil`).send({
      nom: 'Testeur',
      prenom: 'Nivo2',
      direction: 'Direction des Régions Budget et des Finances',
      service: 'Service des rapports',
      role: 'client',
      structureId: String(structure._id),
    });
    expect(profil.status).toBe(200);
    expect(profil.body).toEqual({ id: neufId, message: 'Profil mis à jour.' });
    const apresProfil = (await agentAdmin.get('/api/users?q=Nivo2')).body.find(
      (u) => u.id === neufId
    );
    expect(apresProfil.prenom).toBe('Nivo2');

    // Désactivation : le compte désactivé ne peut plus se connecter.
    const desactivation = await agentAdmin.post(`/api/users/${neufId}/desactiver`);
    expect(desactivation.status).toBe(200);
    expect(desactivation.body).toEqual({ id: neufId, message: 'Utilisateur désactivé.' });
    const agentNeuf = request.agent(app);
    const connexionDesactivee = await agentNeuf
      .post('/api/auth/login')
      .send({ im: IM_NEUF, password: cree.body.provisionalPassword });
    expect(connexionDesactivee.status).toBe(403);
    expect(connexionDesactivee.body.message).toMatch(/désactivé/i);

    // Réinitialisation : nouveau mot de passe provisoire renvoyé une fois.
    const reset = await agentAdmin.post(`/api/users/${neufId}/reinitialiser-mdp`);
    expect(reset.status).toBe(200);
    expect(reset.body.id).toBe(neufId);
    expect(reset.body.provisionalPassword).toMatch(/^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/);
    expect(reset.body.message).toBe('Mot de passe réinitialisé.');
  });

  it('A8 : GET /api/audit?q=<nom> renvoie userLabel et userRole de cet utilisateur', async () => {
    // Le client se connecte : une ligne login_success portée par SON id.
    const agentCible = request.agent(app);
    const connexion = await agentCible.post('/api/auth/login').send({ im: IM_CIBLE, password: MDP });
    expect(connexion.status).toBe(200);

    const audit = await agentAdmin.get('/api/audit?q=Rakoto&limit=100');
    expect(audit.status).toBe(200);
    expect(audit.headers['x-total-count']).toBeDefined();
    expect(parseInt(audit.headers['x-total-count'], 10)).toBe(audit.body.length);
    expect(audit.body.length).toBeGreaterThan(0);

    const ligne = audit.body.find((l) => l.userId === String(cible._id));
    expect(ligne).toBeDefined();
    expect(ligne.action).toBe('login_success');
    expect(ligne.userLabel).toBe('Fanja Rakoto');
    expect(ligne.userRole).toBe('client');
    expect(ligne.object).toBe('utilisateur');

    // L'admin1 est retrouvé par son propre nom (lignes qu'il a lui-même écrites).
    const auditAdmin = await agentAdmin.get('/api/audit?q=Ranaivo&limit=100');
    expect(auditAdmin.status).toBe(200);
    const ligneAdmin = auditAdmin.body.find(
      (l) => l.userId === String(admin1._id) && l.action === 'login_success'
    );
    expect(ligneAdmin).toBeDefined();
    expect(ligneAdmin.userLabel).toBe('Hery Ranaivo');
    expect(ligneAdmin.userRole).toBe('admin1');
  });
});

"use strict";

// Phase 7 — Suite de tests RBAC (supertest) : elle PROUVE la matrice des
// permissions de SPEC §1/§3/§8. Exécutée par `npm test` (seed de la base
// dédiée sigbd_test inclus dans le script). Jamais la base de dev.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

// Garde-fous AVANT l'import de l'app : NODE_ENV et base de test forcés.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

const { default: app } = await import('../src/server.js');

import Structure from '../src/models/Structure.js';
import Module from '../src/models/Module.js';
import Periode from '../src/models/Periode.js';
import Saisie from '../src/models/Saisie.js';

const PASSWORD = 'Test@2026';
const NEW_PASSWORD = 'Nouveau2026';

const ROLE_MSG = 'Accès refusé : rôle non autorisé';
const TRANSITION_MSG = "Cette transition n'est pas autorisée.";
const EDIT_MSG = 'Cette saisie ne peut plus être modifiée.';
const REJECT_MOTIF_MSG = 'Le motif de rejet est obligatoire.';

// Valeurs RH valides (module RH — mirroir du seed) pour soumettre un rapport
const RH_VALUES = {
  effectif: [
    { categorie: 'Catégorie A', grade: "Attaché d'administration", sexe: 'Homme', effectif: 4 },
    { categorie: 'Catégorie B', grade: 'Secrétaire de bureau', sexe: 'Femme', effectif: 6 },
    { categorie: 'Catégorie C', grade: "Agent d'exécution", sexe: 'Homme', effectif: 3 },
  ],
  mouvements: [{ type: 'Arrivée', nombre: 2 }, { type: 'Affectation', nombre: 1 }],
  besoins: 'Recrutement de deux agents administratifs pour le service des rapports.',
};

// Agents (cookies conservés entre les requêtes)
const agents = {};
let structs = [];
let saisies = [];
let modulesByCode = {};
let periodesByLabel = {};

async function login(im, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password });
  if (res.status !== 200) {
    throw new Error(`login ${im} → ${res.status} : ${JSON.stringify(res.body)}`);
  }
  return agent;
}

function structId(type, regionName) {
  const s = structs.find(
    (x) => x.type === type && x.regionId && x.regionId.name === regionName
  );
  if (!s) throw new Error(`structure ${type}/${regionName} introuvable dans le seed`);
  return String(s._id);
}

async function pick(moduleCode, sid, status) {
  const rows = await Saisie.find({ structureId: sid, status }).populate('moduleId');
  const s = rows.find((x) => x.moduleId && x.moduleId.code === moduleCode);
  if (!s) {
    throw new Error(
      `saisie introuvable dans le seed : ${moduleCode} / ${sid} / ${status}`
    );
  }
  return String(s._id);
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  structs = await Structure.find({}).populate('regionId');
  const mods = await Module.find({});
  modulesByCode = Object.fromEntries(mods.map((m) => [m.code, m]));
  const pers = await Periode.find({});
  periodesByLabel = Object.fromEntries(pers.map((p) => [p.label, p]));
  saisies = await Saisie.find({}).populate('moduleId').populate('structureId');
  if (saisies.length === 0 || structs.length === 0) {
    throw new Error('Base de test vide — `npm test` doit lancer le seed de sigbd_test.');
  }

  agents.client1 = await login('104562'); // client SRB – Analamanga
  agents.client2 = await login('112470'); // client SRSP – Analamanga
  agents.client3 = await login('115908'); // client CIRBF – Analamanga
  agents.admin2 = await login('108231'); // admin2 régional (Analamanga)
  agents.admin1 = await login('120344'); // admin1 central
  agents.dev = await login('123009'); // developpeur
  agents.consultant = await login('121775'); // consultant
  agents.forced = await login('125430'); // client mustChangePassword=true
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ---------------------------------------------------------------- interdits

describe('Phase 7 — la matrice des permissions : les appels interdits échouent', () => {
  it('client : ne valide jamais un rapport (403)', async () => {
    const s = await pick('RA', structId('SRB', 'Analamanga'), 'brouillon');
    const res = await agents.client1.post(`/api/saisies/${s}/valider`).send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ROLE_MSG);
  });

  it('client : ne rejette jamais un rapport (403)', async () => {
    const s = await pick('RA', structId('SRB', 'Analamanga'), 'brouillon');
    const res = await agents.client1
      .post(`/api/saisies/${s}/rejeter`)
      .send({ motif: 'test' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ROLE_MSG);
  });

  it('client : ne télécharge rien — collecte et export (403)', async () => {
    const list = await agents.client1.get('/api/collecte');
    expect(list.status).toBe(403);
    const exp = await agents.client1.get('/api/collecte/export?format=xlsx');
    expect(exp.status).toBe(403);
    expect(exp.body.message).toBe(ROLE_MSG);
  });

  it('client : lit uniquement sa structure (autre structure → 404)', async () => {
    const autre = await pick('RH', structId('SRSP', 'Analamanga'), 'exportee');
    const res = await agents.client1.get(`/api/saisies/${autre}`);
    expect(res.status).toBe(404);

    const list = await agents.client1.get('/api/saisies');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
    for (const row of list.body) {
      expect(String(row.structureId)).toBe(structId('SRB', 'Analamanga'));
    }
  });

  it("admin2 : ne crée jamais d'utilisateur (403)", async () => {
    const res = await agents.admin2.post('/api/users').send({
      im: '990000',
      nom: 'X',
      prenom: 'Y',
      direction: 'D',
      service: 'S',
      role: 'client',
      structureId: structId('SRB', 'Analamanga'),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });

  it("admin2 : ne lit pas une saisie d'une autre région (404)", async () => {
    const autre = await pick('RA', structId('SRB', 'Atsinanana'), 'exportee');
    const res = await agents.admin2.get(`/api/saisies/${autre}`);
    expect(res.status).toBe(404);
  });

  it("admin2 : ne voit jamais de brouillon (404 + liste sans brouillon)", async () => {
    const brouillon = await pick('RA', structId('SRB', 'Analamanga'), 'brouillon');
    const res = await agents.admin2.get(`/api/saisies/${brouillon}`);
    expect(res.status).toBe(404);

    const list = await agents.admin2.get('/api/saisies');
    expect(list.status).toBe(200);
    for (const row of list.body) {
      expect(row.status).not.toBe('brouillon');
      const sid = String(row.structureId);
      expect(
        sid === structId('SRB', 'Analamanga') ||
          sid === structId('SRSP', 'Analamanga') ||
          sid === structId('SRPE', 'Analamanga') ||
          sid === structId('CIRBF', 'Analamanga')
      ).toBe(true);
    }
  });

  it('admin1 : ne valide jamais (403)', async () => {
    const s = await pick('RA', structId('CIRBF', 'Analamanga'), 'soumise');
    const res = await agents.admin1.post(`/api/saisies/${s}/valider`).send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ROLE_MSG);
  });

  it('admin1 : ne rejette jamais (403)', async () => {
    const s = await pick('RA', structId('CIRBF', 'Analamanga'), 'soumise');
    const res = await agents.admin1
      .post(`/api/saisies/${s}/rejeter`)
      .send({ motif: 'test' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ROLE_MSG);
  });

  it('admin1 : n’exporte jamais (403)', async () => {
    const s = await pick('RMI', structId('SRB', 'Analamanga'), 'validee');
    const res = await agents.admin1.post(`/api/saisies/${s}/exporter`).send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ROLE_MSG);
  });

  it('admin1 : ne modifie jamais une saisie (403)', async () => {
    const s = await pick('RA', structId('SRB', 'Analamanga'), 'brouillon');
    const res = await agents.admin1
      .put(`/api/saisies/${s}`)
      .send({ values: { difficultes: 'test' } });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ROLE_MSG);
  });

  it('admin1 : ne modifie jamais un gabarit (403 sur POST et PUT /config)', async () => {
    const ra = modulesByCode.RA;
    const post = await agents.admin1.post('/api/config/modules').send({
      code: 'TEST',
      label: 'Test',
      periodicity: 'monthly',
      kind: 'event',
      structureTypes: ['SRB'],
      fields: [{ key: 'a', label: 'A', type: 'text' }],
    });
    expect(post.status).toBe(403);

    const put = await agents.admin1.put(`/api/config/modules/${ra._id}`).send({
      label: ra.label,
      periodicity: ra.periodicity,
      kind: ra.kind,
      structureTypes: ra.structureTypes,
      fields: ra.fields,
    });
    expect(put.status).toBe(403);
  });

  it('developpeur : ne lit aucune saisie (403 sur détail et liste)', async () => {
    const s = await pick('RH', structId('SRSP', 'Analamanga'), 'exportee');
    const detail = await agents.dev.get(`/api/saisies/${s}`);
    expect(detail.status).toBe(403);
    expect(detail.body.message).toBe(ROLE_MSG);

    const list = await agents.dev.get('/api/saisies');
    expect(list.status).toBe(403);
  });

  it("developpeur : ne crée jamais d'utilisateur (403)", async () => {
    const res = await agents.dev.post('/api/users').send({
      im: '990001',
      nom: 'X',
      prenom: 'Y',
      direction: 'D',
      service: 'S',
      role: 'client',
      structureId: structId('SRB', 'Analamanga'),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });

  it('consultant : ne télécharge rien (403 sur collecte et export)', async () => {
    const list = await agents.consultant.get('/api/collecte');
    expect(list.status).toBe(403);
    const exp = await agents.consultant.get('/api/collecte/export?format=pdf');
    expect(exp.status).toBe(403);
    expect(exp.body.message).toBe(ROLE_MSG);
  });

  it('consultant : n’écrit quoi que ce soit (403 partout)', async () => {
    const s = await pick('RH', structId('SRSP', 'Analamanga'), 'exportee');
    const calls = [
      () =>
        agents.consultant.post('/api/saisies').send({
          moduleId: modulesByCode.RA._id,
          periodeId: periodesByLabel['Octobre 2026']._id,
        }),
      () => agents.consultant.put(`/api/saisies/${s}`).send({ values: {} }),
      () => agents.consultant.post(`/api/saisies/${s}/soumettre`).send({}),
      () => agents.consultant.post(`/api/saisies/${s}/valider`).send({}),
      () => agents.consultant.post('/api/remarques').send({ context: 'x', text: 'y' }),
      () =>
        agents.consultant.post('/api/config/modules').send({
          code: 'X',
          label: 'X',
          periodicity: 'monthly',
          kind: 'event',
          structureTypes: ['SRB'],
          fields: [{ key: 'a', label: 'A', type: 'text' }],
        }),
      () => agents.consultant.post('/api/referentiels/directions').send({ value: 'X' }),
      () => agents.consultant.post('/api/users').send({ im: '990002' }),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(403);
    }
  });

  it('transition interdite : exportee → soumise (409)', async () => {
    const s = await pick('RH', structId('SRSP', 'Analamanga'), 'exportee');
    const res = await agents.client2.post(`/api/saisies/${s}/soumettre`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(TRANSITION_MSG);
  });

  it('transition interdite : brouillon → validee (409)', async () => {
    const s = await pick('RA', structId('SRB', 'Analamanga'), 'brouillon');
    const res = await agents.admin2.post(`/api/saisies/${s}/valider`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(TRANSITION_MSG);
  });

  it('transition interdite : rejetee → validee (409)', async () => {
    const s = await pick('RH', structId('SRB', 'Analamanga'), 'rejetee');
    const res = await agents.admin2.post(`/api/saisies/${s}/valider`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(TRANSITION_MSG);
  });

  it('transition interdite : validee → rejetee (409)', async () => {
    const s = await pick('RMI', structId('SRB', 'Analamanga'), 'validee');
    const res = await agents.admin2
      .post(`/api/saisies/${s}/rejeter`)
      .send({ motif: 'trop tard' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(TRANSITION_MSG);
  });

  it('rejet sans motif → 400 (motif obligatoire)', async () => {
    const s = await pick('RA', structId('CIRBF', 'Analamanga'), 'soumise');
    const sansMotif = await agents.admin2.post(`/api/saisies/${s}/rejeter`).send({});
    expect(sansMotif.status).toBe(400);
    expect(sansMotif.body.message).toBe(REJECT_MOTIF_MSG);

    const motifVide = await agents.admin2
      .post(`/api/saisies/${s}/rejeter`)
      .send({ motif: '   ' });
    expect(motifVide.status).toBe(400);
    expect(motifVide.body.message).toBe(REJECT_MOTIF_MSG);
  });

  it('soumission avec champs obligatoires manquants → 400', async () => {
    const create = await agents.client1.post('/api/saisies').send({
      moduleId: modulesByCode.RA._id,
      periodeId: periodesByLabel['Septembre 2026']._id,
    });
    expect(create.status).toBe(201);

    const res = await agents.client1
      .post(`/api/saisies/${create.body.id}/soumettre`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Le formulaire contient des erreurs.');
    expect(res.body.errors).toBeTruthy();
    expect(Object.keys(res.body.errors).length).toBeGreaterThan(0);
  });

  it("mise à jour d'une saisie soumise → 409", async () => {
    const s = await pick('RA', structId('CIRBF', 'Analamanga'), 'soumise');
    const res = await agents.client3
      .put(`/api/saisies/${s}`)
      .send({ values: { lieu: 'Antananarivo' } });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(EDIT_MSG);
  });

  it("suppression ou mise à jour d'une ligne d'audit → 404 (append-only)", async () => {
    const avant = await agents.admin1.get('/api/audit');
    expect(avant.status).toBe(200);
    const ligneId = avant.body[0] ? avant.body[0].id : '000000000000000000000000';

    const del = await agents.admin1.delete(`/api/audit/${ligneId}`);
    expect(del.status).toBe(404);
    const patch = await agents.admin1
      .patch(`/api/audit/${ligneId}`)
      .send({ action: 'pirate' });
    expect(patch.status).toBe(404);
    const delRoot = await agents.admin1.delete('/api/audit');
    expect(delRoot.status).toBe(404);

    const apres = await agents.admin1.get('/api/audit');
    expect(apres.status).toBe(200);
    expect(apres.body.length).toBe(avant.body.length);
  });
});

// ------------------------------------- mot de passe provisoire non changé

describe('Phase 7 — mustChangePassword : tout est bloqué sauf change-password et logout', () => {
  it('toute route sauf change-password et logout renvoie 403 PASSWORD_CHANGE_REQUIRED', async () => {
    // Les routes « tout sauf » échouent
    const saisis = await agents.forced.get('/api/saisies');
    expect(saisis.status).toBe(403);
    expect(saisis.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await agents.forced.get('/api/auth/me');
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const refresh = await agents.forced.post('/api/auth/refresh');
    expect(refresh.status).toBe(403);
    expect(refresh.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const collecte = await agents.forced.get('/api/collecte');
    expect(collecte.status).toBe(403);
    expect(collecte.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const audit = await agents.forced.get('/api/audit');
    expect(audit.status).toBe(403);

    // logout est autorisé
    const logout = await agents.forced.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    // reconnexion puis changement de mot de passe (autorise)
    agents.forced = await login('125430');
    const change = await agents.forced.post('/api/auth/change-password').send({
      current: PASSWORD,
      new: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
    });
    expect(change.status).toBe(200);

    // plus de blocage ensuite
    const apres = await agents.forced.get('/api/saisies');
    expect(apres.status).toBe(200);
  });
});

// -------------------------------------------------- actions autorisées

describe("Phase 7 — chaque action autorisée fonctionne pour le bon rôle", () => {
  it('client : crée, enregistre un brouillon et soumet', async () => {
    const create = await agents.client3.post('/api/saisies').send({
      moduleId: modulesByCode.RMI._id,
      periodeId: periodesByLabel['T3 2026']._id,
    });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('brouillon');

    const save = await agents.client3
      .put(`/api/saisies/${create.body.id}`)
      .send({ values: {} });
    expect(save.status).toBe(200);
    expect(save.body.message).toBe('Brouillon enregistré.');

    // brouillon → soumise : le client soumet ses propres saisies
    const brouillonRmi = await pick('RMI', structId('SRSP', 'Analamanga'), 'brouillon');
    const soumis = await agents.client2
      .post(`/api/saisies/${brouillonRmi}/soumettre`)
      .send({});
    expect(soumis.status).toBe(200);
    expect(soumis.body.status).toBe('soumise');
  });

  it('client : édite une saisie rejetée (rejetee → modification autorisée)', async () => {
    const s = await pick('RH', structId('SRB', 'Analamanga'), 'rejetee');
    const res = await agents.client1
      .put(`/api/saisies/${s}`)
      .send({ values: RH_VALUES });
    expect(res.status).toBe(200);

    // rejetee → soumise : transition autorisée pour le client
    const soumis = await agents.client1.post(`/api/saisies/${s}/soumettre`).send({});
    expect(soumis.status).toBe(200);
    expect(soumis.body.status).toBe('soumise');
  });

  it('admin2 : valide, rejette avec motif et exporte (sa région)', async () => {
    // soumise → validee
    const aValider = await pick('RA', structId('CIRBF', 'Analamanga'), 'soumise');
    const valider = await agents.admin2.post(`/api/saisies/${aValider}/valider`).send({});
    expect(valider.status).toBe(200);
    expect(valider.body.status).toBe('validee');

    // validee → exportee
    const exporter = await agents.admin2.post(`/api/saisies/${aValider}/exporter`).send({});
    expect(exporter.status).toBe(200);
    expect(exporter.body.status).toBe('exportee');

    // soumise → rejetee (motif obligatoire, saisi)
    const aRejeter = await pick('RMI', structId('SRSP', 'Analamanga'), 'soumise');
    const rejeter = await agents.admin2
      .post(`/api/saisies/${aRejeter}/rejeter`)
      .send({ motif: 'Merci de compléter la colonne modèle.' });
    expect(rejeter.status).toBe(200);
    expect(rejeter.body.status).toBe('rejetee');
  });

  it('admin2 : consulte sa région (liste, collecte, export) et envoie une remarque', async () => {
    const liste = await agents.admin2.get('/api/saisies');
    expect(liste.status).toBe(200);

    const collecte = await agents.admin2.get('/api/collecte');
    expect(collecte.status).toBe(200);

    const exp = await agents.admin2.get('/api/collecte/export?format=xlsx');
    expect(exp.status).toBe(200);

    const remarque = await agents.admin2
      .post('/api/remarques')
      .send({ context: 'Module RA — Octobre 2026', text: 'Bien reçu, merci.' });
    expect(remarque.status).toBe(201);
  });

  it('admin1 : utilisateurs (créer, modifier profil, réinitialiser, désactiver)', async () => {
    const structureId = structId('SRB', 'Analamanga');
    const created = await agents.admin1.post('/api/users').send({
      im: '991000',
      nom: 'Rakoto',
      prenom: 'Phase Sept',
      direction: 'Direction des Régions Budget et des Finances',
      service: 'Service des rapports',
      role: 'client',
      structureId,
    });
    expect(created.status).toBe(201);
    expect(created.body.provisionalPassword).toMatch(/^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/);
    const newId = created.body.id;

    const profil = await agents.admin1.patch(`/api/users/${newId}/profil`).send({
      nom: 'Rakoto',
      prenom: 'Phase Sept Modifié',
      direction: 'Direction des Régions Budget et des Finances',
      service: 'Service des rapports',
      role: 'client',
      structureId,
    });
    expect(profil.status).toBe(200);

    const reset = await agents.admin1.post(`/api/users/${newId}/reinitialiser-mdp`);
    expect(reset.status).toBe(200);
    expect(reset.body.provisionalPassword).toMatch(/-/);

    const desactive = await agents.admin1.post(`/api/users/${newId}/desactiver`);
    expect(desactive.status).toBe(200);

    const liste = await agents.admin1.get('/api/users');
    expect(liste.status).toBe(200);
  });

  it('admin1 : tableau de bord, collecte, historique, export, audit, remarques', async () => {
    expect((await agents.admin1.get('/api/dashboard')).status).toBe(200);
    expect((await agents.admin1.get('/api/saisies')).status).toBe(200);
    expect((await agents.admin1.get('/api/collecte')).status).toBe(200);
    expect((await agents.admin1.get('/api/collecte/historique')).status).toBe(200);
    expect((await agents.admin1.get('/api/collecte/export?format=xlsx')).status).toBe(200);
    expect((await agents.admin1.get('/api/collecte/export?format=pdf')).status).toBe(200);
    expect((await agents.admin1.get('/api/audit')).status).toBe(200);

    const remarque = await agents.admin1
      .post('/api/remarques')
      .send({ context: 'Collecte — T3 2026', text: 'Nombre de structures en retard ?' });
    expect(remarque.status).toBe(201);
    expect((await agents.admin1.get('/api/remarques/mes')).status).toBe(200);
  });

  it('developpeur : publie une version de gabarit, gère les listes et les remarques', async () => {
    // GET /modules : tous les modules, champs inclus
    const mods = await agents.dev.get('/api/modules');
    expect(mods.status).toBe(200);
    expect(mods.body.length).toBe(13);
    expect(Array.isArray(mods.body[0].fields)).toBe(true);

    // PUT /config/modules/:id → version N+1
    const ra = modulesByCode.RA;
    const put = await agents.dev.put(`/api/config/modules/${ra._id}`).send({
      label: ra.label,
      periodicity: ra.periodicity,
      kind: ra.kind,
      structureTypes: ra.structureTypes,
      fields: ra.fields,
    });
    expect(put.status).toBe(200);
    expect(put.body.version).toBe(ra.version + 1);

    // PATCH active : désactiver puis réactiver
    const off = await agents.dev
      .patch(`/api/config/modules/${ra._id}/active`)
      .send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.active).toBe(false);
    const on = await agents.dev
      .patch(`/api/config/modules/${ra._id}/active`)
      .send({ active: true });
    expect(on.status).toBe(200);
    expect(on.body.active).toBe(true);

    // Référentiels : créer puis renommer une valeur
    const nom = 'Direction des Tests Phase 7';
    const add = await agents.dev.post('/api/referentiels/directions').send({ value: nom });
    expect(add.status).toBe(201);
    const rename = await agents.dev
      .put('/api/referentiels/directions')
      .send({ value: nom, newValue: `${nom} v2` });
    expect(rename.status).toBe(200);
    expect(rename.body.value).toBe(`${nom} v2`);

    // Remarques : boîte de réception + changement d'état
    const liste = await agents.dev.get('/api/remarques');
    expect(liste.status).toBe(200);
    expect(liste.body.length).toBeGreaterThan(0);
    const etat = await agents.dev
      .patch(`/api/remarques/${liste.body[0].id}/etat`)
      .send({ etat: 'en_cours' });
    expect(etat.status).toBe(200);
    expect(etat.body.state).toBe('en_cours');

    // Journal d'audit en lecture
    expect((await agents.dev.get('/api/audit')).status).toBe(200);
  });

  it('consultant : consultation, rapport exporté et tableau de bord (lecture seule)', async () => {
    const consult = await agents.consultant.get('/api/consultation');
    expect(consult.status).toBe(200);
    expect(consult.body.length).toBeGreaterThan(0);
    for (const row of consult.body) {
      expect(['exportee', 'archivee']).toContain(row.status);
    }

    const exportee = await pick('RA', structId('SRB', 'Atsinanana'), 'exportee');
    const detail = await agents.consultant.get(`/api/saisies/${exportee}`);
    expect(detail.status).toBe(200);
    expect(detail.body.values).toBeTruthy();

    const liste = await agents.consultant.get('/api/saisies');
    expect(liste.status).toBe(200);
    for (const row of liste.body) {
      expect(['exportee', 'archivee']).toContain(row.status);
    }

    expect((await agents.consultant.get('/api/dashboard')).status).toBe(200);
    expect((await agents.consultant.get('/api/auth/me')).status).toBe(200);
  });
});

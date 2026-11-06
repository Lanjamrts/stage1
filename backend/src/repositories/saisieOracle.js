"use strict";

// Saisies sur Oracle (tables SAISIE + SAISIE_VALIDATION du schéma de
// l'étape 35). Aucune requête SQL construite par concaténation de texte
// utilisateur : uniquement des bindings, les listes passent par construireIn,
// transactions pour les opérations multi-tables.
// Sortie : { _id (chaîne), structureId, moduleId, moduleVersion, periodeId
// (chaîne ou null), eventDate (Date ou null), authorId, status, values
// (objet JS relu de VALEURS_JSON), validations[] (ordonnées par ID croissant
// = ordre d'insertion, comme le tableau Mongo), dates { created, submitted,
// exported }, createdAt, updatedAt }.
// Avec { avecLiens: true }, les quatre références deviennent l'objet lié
// complet reconstruit via listerParIds des dépôts (jamais un JOIN), l'utilisateur
// lié est privé de passwordHash, une référence introuvable devient null.

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';
import { construireIn } from './listeIn.js';
import { getStructureRepository } from './structureRepository.js';
import { getModuleRepository } from './moduleRepository.js';
import { getPeriodeRepository } from './periodeRepository.js';
import { getUtilisateurRepository } from './utilisateurRepository.js';

const COLONNES =
  'ID, STRUCTURE_ID, MODULE_ID, VERSION_MODULE, PERIODE_ID, DATE_EVENEMENT, AUTEUR_ID, ' +
  'STATUT, VALEURS_JSON, DATE_CREATION, DATE_SOUMISSION, DATE_EXPORT, CREATED_AT, UPDATED_AT';

const COLONNES_VALIDATION = 'SAISIE_ID, DECISION, MOTIF, ACTEUR_ID, ACTEUR_LABEL, DATE_DECISION';

// Liste blanche des champs modifiables : clé applicatif → colonne, TOUJOURS
// une constante interne (jamais le texte d'entrée). `dates` n'est pas une
// colonne : ses trois clés pilotent DATE_CREATION/DATE_SOUMISSION/DATE_EXPORT
// (fusion clé par clé). Toute autre clé lève une Error explicite.
const CHAMPS_MODIFIABLES = new Set(['values', 'status', 'moduleVersion', 'dates']);

const COLONNES_MODIFIABLES = {
  values: 'VALEURS_JSON',
  status: 'STATUT',
  moduleVersion: 'VERSION_MODULE',
};

const COLONNES_DATES = {
  created: 'DATE_CREATION',
  submitted: 'DATE_SOUMISSION',
  exported: 'DATE_EXPORT',
};

function verifierChamps(champs) {
  const inconnus = Object.keys(champs).filter((cle) => !CHAMPS_MODIFIABLES.has(cle));
  if (inconnus.length > 0) {
    throw new Error(`Champ non modifiable : ${inconnus.join(', ')}`);
  }
}

function enDate(valeur) {
  if (valeur == null) return null;
  if (valeur instanceof Date) return valeur;
  return new Date(valeur);
}

// VALEURS_JSON (type natif JSON Oracle 21c) : relu en objet JS parfois en
// chaîne ou Buffer selon le chemin node-oracledb — même méthode que
// moduleOracle.js. Écriture = JSON.stringify (liaison par chaîne).
function enObjet(valeur) {
  if (valeur == null) return null;
  if (typeof valeur === 'string') return JSON.parse(valeur);
  if (Buffer.isBuffer(valeur)) return JSON.parse(valeur.toString('utf8'));
  return valeur;
}

function versOracle(cle, valeur) {
  switch (cle) {
    case 'values':
      return JSON.stringify(valeur);
    case 'moduleVersion':
      return Number(valeur);
    default:
      return valeur;
  }
}

// Une entrée d'historique : 5 clés toujours présentes, actorId en chaîne,
// null quand absent (forme uniforme avec le dépôt Mongo).
function convertirValidation(ligne) {
  return {
    decision: ligne.DECISION,
    motif: ligne.MOTIF == null ? null : ligne.MOTIF,
    actorId: ligne.ACTEUR_ID == null ? null : String(ligne.ACTEUR_ID),
    actorLabel: ligne.ACTEUR_LABEL == null ? null : ligne.ACTEUR_LABEL,
    date: enDate(ligne.DATE_DECISION),
  };
}

function convertir(ligne, validations = []) {
  return {
    _id: String(ligne.ID),
    structureId: String(ligne.STRUCTURE_ID),
    moduleId: String(ligne.MODULE_ID),
    moduleVersion: Number(ligne.VERSION_MODULE),
    periodeId: ligne.PERIODE_ID == null ? null : String(ligne.PERIODE_ID),
    eventDate: enDate(ligne.DATE_EVENEMENT),
    authorId: String(ligne.AUTEUR_ID),
    status: ligne.STATUT,
    values: enObjet(ligne.VALEURS_JSON),
    validations,
    dates: {
      created: enDate(ligne.DATE_CREATION),
      submitted: enDate(ligne.DATE_SOUMISSION),
      exported: enDate(ligne.DATE_EXPORT),
    },
    createdAt: enDate(ligne.CREATED_AT),
    updatedAt: enDate(ligne.UPDATED_AT),
  };
}

// Historique de plusieurs saisies en une requête, ordonné par SAISIE_ID, ID
// (ID croissant par saisie = ordre d'insertion, comme le tableau Mongo).
async function lireValidations(source, saisieIds) {
  const parId = new Map(saisieIds.map((id) => [String(id), []]));
  if (saisieIds.length === 0) return parId;
  const { condition, valeurs } = construireIn('SAISIE_ID', saisieIds);
  const resultat = await source.raw(
    `SELECT ${COLONNES_VALIDATION} FROM SAISIE_VALIDATION WHERE ${condition} ORDER BY SAISIE_ID, ID`,
    valeurs
  );
  for (const ligne of resultat.rows || resultat) {
    parId.get(String(ligne.SAISIE_ID)).push(convertirValidation(ligne));
  }
  return parId;
}

async function lireParId(source, id) {
  const resultat = await source.raw(`SELECT ${COLONNES} FROM SAISIE WHERE ID = ?`, [Number(id)]);
  const lignes = resultat.rows || resultat;
  if (lignes.length === 0) return null;
  const validations = await lireValidations(source, [Number(lignes[0].ID)]);
  return convertir(lignes[0], validations.get(String(lignes[0].ID)));
}

function sansPasswordHash(utilisateur) {
  if (!utilisateur || typeof utilisateur !== 'object') return utilisateur;
  if (!('passwordHash' in utilisateur)) return utilisateur;
  const { passwordHash, ...reste } = utilisateur;
  return reste;
}

// Liens reconstruits avec listerParIds des quatre dépôts (aucun JOIN :
// chaque dépôt garne sa propre conversion) ; l'utilisateur lié est privé de
// passwordHash ; une référence introuvable devient null.
async function avecLiens(saisies) {
  if (saisies.length === 0) return saisies;
  const structureIds = [...new Set(saisies.map((s) => s.structureId))];
  const moduleIds = [...new Set(saisies.map((s) => s.moduleId))];
  const periodeIds = [...new Set(saisies.map((s) => s.periodeId).filter((id) => id != null))];
  const authorIds = [...new Set(saisies.map((s) => s.authorId))];
  const [structures, modules, periodes, utilisateurs] = await Promise.all([
    getStructureRepository().listerParIds(structureIds),
    getModuleRepository().listerParIds(moduleIds),
    getPeriodeRepository().listerParIds(periodeIds),
    getUtilisateurRepository().listerParIds(authorIds),
  ]);
  const parStructure = new Map(structures.map((o) => [String(o._id), o]));
  const parModule = new Map(modules.map((o) => [String(o._id), o]));
  const parPeriode = new Map(periodes.map((o) => [String(o._id), o]));
  const parUtilisateur = new Map(
    utilisateurs.map((u) => [String(u._id), sansPasswordHash(u)])
  );
  return saisies.map((s) => ({
    ...s,
    structureId: parStructure.get(s.structureId) ?? null,
    moduleId: parModule.get(s.moduleId) ?? null,
    periodeId: s.periodeId == null ? null : (parPeriode.get(s.periodeId) ?? null),
    authorId: parUtilisateur.get(s.authorId) ?? null,
  }));
}

function normaliserIds(liste) {
  if (!Array.isArray(liste)) return null;
  return [...new Set(liste.filter((id) => estIdValide(id)))];
}

function conditionsEgalite(champs, conditions, valeurs) {
  for (const [cle, colonne] of [
    ['structureId', 'STRUCTURE_ID'],
    ['moduleId', 'MODULE_ID'],
    ['periodeId', 'PERIODE_ID'],
  ]) {
    const valeur = champs[cle];
    if (valeur !== undefined && valeur !== null) {
      if (!estIdValide(valeur)) return false;
      conditions.push(`${colonne} = ?`);
      valeurs.push(Number(valeur));
    }
  }
  return true;
}

function conditionsFiltre(options) {
  const conditions = [];
  const valeurs = [];
  if (Array.isArray(options.statuts)) {
    if (options.statuts.length === 0) return { vide: true, conditions, valeurs };
    const { condition, valeurs: v } = construireIn('STATUT', options.statuts);
    conditions.push(condition);
    valeurs.push(...v);
  }
  if (Array.isArray(options.structureIds)) {
    const valides = normaliserIds(options.structureIds);
    if (valides.length === 0) return { vide: true, conditions, valeurs };
    const { condition, valeurs: v } = construireIn('STRUCTURE_ID', valides.map(Number));
    conditions.push(condition);
    valeurs.push(...v);
  }
  if (!conditionsEgalite(options, conditions, valeurs)) {
    return { vide: true, conditions: [], valeurs: [] };
  }
  if (Array.isArray(options.moduleIds)) {
    const valides = normaliserIds(options.moduleIds);
    if (valides.length === 0) return { vide: true, conditions, valeurs };
    const { condition, valeurs: v } = construireIn('MODULE_ID', valides.map(Number));
    conditions.push(condition);
    valeurs.push(...v);
  }
  if (Array.isArray(options.ids)) {
    const valides = normaliserIds(options.ids);
    if (valides.length === 0) return { vide: true, conditions, valeurs };
    const { condition, valeurs: v } = construireIn('ID', valides.map(Number));
    conditions.push(condition);
    valeurs.push(...v);
  }
  return { vide: false, conditions, valeurs };
}

export async function trouverParId(id, options = {}) {
  if (!estIdValide(id)) return null;
  const db = await getKnex();
  const saisie = await lireParId(db, id);
  if (!saisie) return null;
  if (options.avecLiens) return (await avecLiens([saisie]))[0];
  return saisie;
}

export async function trouverParCle({ structureId, moduleId, periodeId } = {}) {
  const conditions = [];
  const valeurs = [];
  if (!conditionsEgalite({ structureId, moduleId, periodeId }, conditions, valeurs)) {
    return null;
  }
  if (conditions.length === 0) return null;
  const db = await getKnex();
  const resultat = await db.raw(
    `SELECT ${COLONNES} FROM SAISIE WHERE ${conditions.join(' AND ')} ORDER BY ID FETCH FIRST 1 ROW ONLY`,
    valeurs
  );
  const lignes = resultat.rows || resultat;
  if (lignes.length === 0) return null;
  const validations = await lireValidations(db, [Number(lignes[0].ID)]);
  return convertir(lignes[0], validations.get(String(lignes[0].ID)));
}

// Relecture par la clé de l'index unique après INSERT (l'identité n'est pas
// exposée par knex raw) : NVL rapproche les saisies d'événement (PERIODE_ID
// NULL) ; l'ORDER BY ID DESC prend la ligne insérée en dernier.
async function reluParCle(trx, doc) {
  const resultat = await trx.raw(
    `SELECT ${COLONNES} FROM SAISIE WHERE STRUCTURE_ID = ? AND MODULE_ID = ? ` +
      'AND NVL(PERIODE_ID, -1) = NVL(?, -1) ORDER BY ID DESC FETCH FIRST 1 ROW ONLY',
    [
      Number(doc.structureId),
      Number(doc.moduleId),
      doc.periodeId == null ? null : Number(doc.periodeId),
    ]
  );
  const lignes = resultat.rows || resultat;
  if (lignes.length === 0) return null;
  const validations = await lireValidations(trx, [Number(lignes[0].ID)]);
  return convertir(lignes[0], validations.get(String(lignes[0].ID)));
}

async function insererDoc(trx, doc) {
  const dates = { created: new Date(), submitted: null, exported: null, ...(doc.dates || {}) };
  await trx.raw(
    'INSERT INTO SAISIE (STRUCTURE_ID, MODULE_ID, VERSION_MODULE, PERIODE_ID, DATE_EVENEMENT, ' +
      'AUTEUR_ID, STATUT, VALEURS_JSON, DATE_CREATION, DATE_SOUMISSION, DATE_EXPORT) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      Number(doc.structureId),
      Number(doc.moduleId),
      Number(doc.moduleVersion),
      doc.periodeId == null ? null : Number(doc.periodeId),
      doc.eventDate == null ? null : enDate(doc.eventDate),
      Number(doc.authorId),
      doc.status === undefined || doc.status === null ? 'brouillon' : doc.status,
      JSON.stringify(doc.values === undefined || doc.values === null ? {} : doc.values),
      enDate(dates.created),
      enDate(dates.submitted),
      enDate(dates.exported),
    ]
  );
}

export async function creer(doc) {
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      await insererDoc(trx, doc);
      return reluParCle(trx, doc);
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJour(id, champs = {}, validation) {
  verifierChamps(champs);
  if (!estIdValide(id)) return null;
  const db = await getKnex();
  // Une transaction : UPDATE et éventuelle ligne d'historique sont
  // atomiques (la validation est ajoutée dans la MÊME opération).
  return db.transaction(async (trx) => {
    const existant = await lireParId(trx, id);
    if (!existant) return null;
    const sets = [];
    const valeurs = [];
    for (const cle of Object.keys(champs)) {
      if (cle === 'dates') {
        const dates = champs.dates || {};
        for (const [date, colonne] of Object.entries(COLONNES_DATES)) {
          if (Object.hasOwn(dates, date)) {
            sets.push(`${colonne} = ?`);
            valeurs.push(enDate(dates[date]));
          }
        }
      } else {
        sets.push(`${COLONNES_MODIFIABLES[cle]} = ?`);
        valeurs.push(versOracle(cle, champs[cle]));
      }
    }
    // UPDATED_AT rafraîchi à chaque écriture (parité MongoDB) ; sans aucun
    // changement ni validation, rien n'est écrit (parité aussi).
    if (sets.length > 0 || validation) {
      await trx.raw(
        `UPDATE SAISIE SET${sets.length > 0 ? ` ${sets.join(', ')},` : ''} UPDATED_AT = SYSTIMESTAMP WHERE ID = ?`,
        [...valeurs, Number(id)]
      );
    }
    if (validation) {
      await trx.raw(
        'INSERT INTO SAISIE_VALIDATION (SAISIE_ID, DECISION, MOTIF, ACTEUR_ID, ACTEUR_LABEL, DATE_DECISION) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        [
          Number(id),
          validation.decision,
          validation.motif == null ? null : validation.motif,
          validation.actorId == null ? null : Number(validation.actorId),
          validation.actorLabel == null ? null : validation.actorLabel,
          validation.date == null ? new Date() : enDate(validation.date),
        ]
      );
    }
    return lireParId(trx, id);
  });
}

// Tri : 'majDesc' (défaut) = UPDATED_AT décroissant puis ID décroissant ;
// 'structureMajAsc' = STRUCTURE_ID croissant (ordre de création des
// structures en Oracle) puis UPDATED_AT croissant. Toute autre valeur →
// défaut (choix le plus simple, voir DECISIONS.md [P40]).
function triDe(tri) {
  return tri === 'structureMajAsc'
    ? ' ORDER BY STRUCTURE_ID, UPDATED_AT'
    : ' ORDER BY UPDATED_AT DESC, ID DESC';
}

export async function lister(options = {}) {
  const { vide, conditions, valeurs } = conditionsFiltre(options);
  if (vide) return [];
  const filtre = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  let sql = `SELECT ${COLONNES} FROM SAISIE${filtre}${triDe(options.tri)}`;
  const params = [...valeurs];
  if (options.limite !== undefined && options.limite !== null) {
    sql += ' FETCH FIRST ? ROWS ONLY';
    params.push(options.limite);
  }
  const db = await getKnex();
  const resultat = await db.raw(sql, params);
  const lignes = resultat.rows || resultat;
  const validations = await lireValidations(
    db,
    lignes.map((ligne) => Number(ligne.ID))
  );
  const saisies = lignes.map((ligne) =>
    convertir(ligne, validations.get(String(ligne.ID)))
  );
  return options.avecLiens ? avecLiens(saisies) : saisies;
}

export async function listerResume({ moduleId, periodeId } = {}) {
  const conditions = [];
  const valeurs = [];
  if (!conditionsEgalite({ moduleId, periodeId }, conditions, valeurs)) return [];
  const filtre = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const db = await getKnex();
  const resultat = await db.raw(
    `SELECT STRUCTURE_ID, MODULE_ID, PERIODE_ID, STATUT FROM SAISIE${filtre} ORDER BY ID`,
    valeurs
  );
  const lignes = resultat.rows || resultat;
  // Exactement les 4 champs du tableau de bord, sans _id, ordre de création.
  return lignes.map((ligne) => ({
    structureId: String(ligne.STRUCTURE_ID),
    moduleId: String(ligne.MODULE_ID),
    periodeId: ligne.PERIODE_ID == null ? null : String(ligne.PERIODE_ID),
    status: ligne.STATUT,
  }));
}

export async function existePourModule(moduleId) {
  if (!estIdValide(moduleId)) return false;
  const db = await getKnex();
  const resultat = await db.raw(
    'SELECT 1 AS UN FROM SAISIE WHERE MODULE_ID = ? FETCH FIRST 1 ROW ONLY',
    [Number(moduleId)]
  );
  const lignes = resultat.rows || resultat;
  return lignes.length > 0;
}

export async function archiverExportees(periodeIds) {
  const valides = normaliserIds(periodeIds);
  if (valides === null || valides.length === 0) return 0;
  const { condition, valeurs } = construireIn('PERIODE_ID', valides.map(Number));
  const db = await getKnex();
  // knex/oracledb ne expose pas rowsAffected sur un raw : le compte est pris
  // dans la transaction avant la mise à jour (comme debloquerExpires).
  return db.transaction(async (trx) => {
    const compte = await trx.raw(
      `SELECT COUNT(*) AS N FROM SAISIE WHERE STATUT = 'exportee' AND ${condition}`,
      [...valeurs]
    );
    const lignes = compte.rows || compte;
    const nombre = Number(lignes[0].N);
    if (nombre > 0) {
      await trx.raw(
        `UPDATE SAISIE SET STATUT = 'archivee', UPDATED_AT = SYSTIMESTAMP ` +
          `WHERE STATUT = 'exportee' AND ${condition}`,
        [...valeurs]
      );
    }
    return nombre;
  });
}

export async function insererPlusieurs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return;
  const db = await getKnex();
  try {
    await db.transaction(async (trx) => {
      for (const doc of docs) {
        await insererDoc(trx, doc);
      }
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  const db = await getKnex();
  // Les validations partent par ON DELETE CASCADE.
  await db.raw('DELETE FROM SAISIE');
}

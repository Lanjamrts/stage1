"use strict";

// Modules sur Oracle (tables MODULE_SIGBD + MODULE_PERIODICITE +
// MODULE_TYPE_STRUCTURE du schéma de l'étape 35).
// Aucune requête SQL construite par concaténation de texte utilisateur :
// uniquement des bindings, les listes passent par construireIn.
// Sortie : { _id (chaîne), code, label, periodicity, allowedPeriodicities[],
// kind, structureTypes[], version (nombre), active (booléen), fields (objet
// JS), createdAt, updatedAt }. Les deux tableaux sont reconstruits depuis les
// tables de jonction en ordre alphabétique (voir DECISIONS.md [P39]).

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';
import { construireIn } from './listeIn.js';

const COLONNES =
  'ID, CODE, LABEL, PERIODICITE, GENRE, VERSION_MODULE, ACTIVE, FIELDS_JSON, CREATED_AT, UPDATED_AT';

// Liste blanche des champs modifiables par mettreAJour : clé applicatif →
// colonne, TOUJOURS une constante interne (jamais le texte d'entrée). Les
// deux tableaux ne sont pas des colonnes : ils pilotent les tables de
// jonction. Toute autre clé lève une Error explicite.
const COLONNES_MODIFIABLES = {
  label: 'LABEL',
  periodicity: 'PERIODICITE',
  kind: 'GENRE',
  fields: 'FIELDS_JSON',
  version: 'VERSION_MODULE',
  active: 'ACTIVE',
  allowedPeriodicities: null, // table MODULE_PERIODICITE
  structureTypes: null, // table MODULE_TYPE_STRUCTURE
};

const TABLEAUX_MODIFIABLES = new Set(['allowedPeriodicities', 'structureTypes']);

function verifierChamps(champs) {
  const inconnus = Object.keys(champs).filter((cle) => !Object.hasOwn(COLONNES_MODIFIABLES, cle));
  if (inconnus.length > 0) {
    throw new Error(`Champ non modifiable : ${inconnus.join(', ')}`);
  }
}

function enDate(valeur) {
  if (valeur == null) return null;
  if (valeur instanceof Date) return valeur;
  return new Date(valeur);
}

// FIELDS_JSON (type natif JSON Oracle 21c) : relu en objet JS parfois en
// chaîne ou Buffer selon le chemin node-oracledb — même méthode que
// backend/tests/oracle-schema.test.js. Écriture = JSON.stringify (liaison par
// chaîne éprouvée jusqu'à 67 Ko, voir DECISIONS.md [P39]).
function enObjet(valeur) {
  if (valeur == null) return null;
  if (typeof valeur === 'string') return JSON.parse(valeur);
  if (Buffer.isBuffer(valeur)) return JSON.parse(valeur.toString('utf8'));
  return valeur;
}

function versOracle(cle, valeur) {
  switch (cle) {
    case 'fields':
      return JSON.stringify(valeur);
    case 'version':
      return Number(valeur);
    case 'active':
      return valeur ? 1 : 0;
    default:
      return valeur;
  }
}

function convertir(ligne, enfants) {
  return {
    _id: String(ligne.ID),
    code: ligne.CODE,
    label: ligne.LABEL,
    periodicity: ligne.PERIODICITE,
    allowedPeriodicities: enfants.allowedPeriodicities,
    kind: ligne.GENRE,
    structureTypes: enfants.structureTypes,
    version: Number(ligne.VERSION_MODULE),
    active: Number(ligne.ACTIVE) === 1,
    fields: enObjet(ligne.FIELDS_JSON),
    createdAt: enDate(ligne.CREATED_AT),
    updatedAt: enDate(ligne.UPDATED_AT),
  };
}

function convertirLignes(resultat) {
  const lignes = resultat.rows || resultat;
  return lignes.map((ligne) => convertir(ligne, { allowedPeriodicities: [], structureTypes: [] }));
}

async function requeter(sql, valeurs) {
  const db = await getKnex();
  return convertirLignes(await db.raw(sql, valeurs));
}

function dedup(valeurs) {
  return [...new Set(Array.isArray(valeurs) ? valeurs : [])];
}

// Les tableaux sont lus en ordre alphabétique (ORDER BY de la valeur) : les
// tests comparent sans tenir compte de l'ordre de ces deux tableaux.
async function lireEnfants(source, moduleId) {
  const periodicites = await source.raw(
    'SELECT PERIODICITE FROM MODULE_PERIODICITE WHERE MODULE_ID = ? ORDER BY PERIODICITE',
    [moduleId]
  );
  const types = await source.raw(
    'SELECT TYPE_STRUCTURE FROM MODULE_TYPE_STRUCTURE WHERE MODULE_ID = ? ORDER BY TYPE_STRUCTURE',
    [moduleId]
  );
  return {
    allowedPeriodicities: (periodicites.rows || periodicites).map((l) => l.PERIODICITE),
    structureTypes: (types.rows || types).map((l) => l.TYPE_STRUCTURE),
  };
}

async function lireEnfantsPlusieurs(source, moduleIds) {
  const parId = new Map(
    moduleIds.map((id) => [String(id), { allowedPeriodicities: [], structureTypes: [] }])
  );
  if (moduleIds.length === 0) return parId;
  const { condition, valeurs } = construireIn('MODULE_ID', moduleIds);
  const periodicites = await source.raw(
    `SELECT MODULE_ID, PERIODICITE FROM MODULE_PERIODICITE WHERE ${condition} ORDER BY MODULE_ID, PERIODICITE`,
    valeurs
  );
  for (const ligne of periodicites.rows || periodicites) {
    parId.get(String(ligne.MODULE_ID)).allowedPeriodicities.push(ligne.PERIODICITE);
  }
  const types = await source.raw(
    `SELECT MODULE_ID, TYPE_STRUCTURE FROM MODULE_TYPE_STRUCTURE WHERE ${condition} ORDER BY MODULE_ID, TYPE_STRUCTURE`,
    valeurs
  );
  for (const ligne of types.rows || types) {
    parId.get(String(ligne.MODULE_ID)).structureTypes.push(ligne.TYPE_STRUCTURE);
  }
  return parId;
}

async function lireParId(source, id) {
  const resultat = await source.raw(`SELECT ${COLONNES} FROM MODULE_SIGBD WHERE ID = ?`, [Number(id)]);
  const lignes = resultat.rows || resultat;
  if (lignes.length === 0) return null;
  return convertir(lignes[0], await lireEnfants(source, Number(id)));
}

async function lireParCode(source, code) {
  const resultat = await source.raw(`SELECT ${COLONNES} FROM MODULE_SIGBD WHERE CODE = ?`, [code]);
  const lignes = resultat.rows || resultat;
  if (lignes.length === 0) return null;
  return convertir(lignes[0], await lireEnfants(source, Number(lignes[0].ID)));
}

function conditionsFiltre({ actifs, typeStructure, codes } = {}) {
  const conditions = [];
  const valeurs = [];
  if (actifs !== undefined && actifs !== null) {
    conditions.push('ACTIVE = ?');
    valeurs.push(actifs === true ? 1 : 0);
  }
  if (typeStructure !== undefined && typeStructure !== null) {
    conditions.push(
      'EXISTS (SELECT 1 FROM MODULE_TYPE_STRUCTURE mts ' +
        'WHERE mts.MODULE_ID = MODULE_SIGBD.ID AND mts.TYPE_STRUCTURE = ?)'
    );
    valeurs.push(typeStructure);
  }
  if (Array.isArray(codes)) {
    const { condition, valeurs: v } = construireIn('CODE', codes);
    conditions.push(condition);
    valeurs.push(...v);
  }
  return { conditions, valeurs };
}

export async function lister(options = {}) {
  const { conditions, valeurs } = conditionsFiltre(options);
  const filtre = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const db = await getKnex();
  const resultat = await db.raw(`SELECT ${COLONNES} FROM MODULE_SIGBD${filtre} ORDER BY CODE`, valeurs);
  const lignes = resultat.rows || resultat;
  const enfants = await lireEnfantsPlusieurs(
    db,
    lignes.map((ligne) => Number(ligne.ID))
  );
  return lignes.map((ligne) => convertir(ligne, enfants.get(String(ligne.ID))));
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  const db = await getKnex();
  return lireParId(db, id);
}

// Ajout étape 40 : ids invalides et en double ignorés, [] pour une liste
// vide ou sans id valide, ordre de création (ID croissant), IN découpé,
// tableaux enfants reconstruits (format habituel du dépôt).
export async function listerParIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const valides = [...new Set(ids.filter((id) => estIdValide(id)))];
  if (valides.length === 0) return [];
  const { condition, valeurs } = construireIn('ID', valides.map(Number));
  const db = await getKnex();
  const resultat = await db.raw(`SELECT ${COLONNES} FROM MODULE_SIGBD WHERE ${condition} ORDER BY ID`, valeurs);
  const lignes = resultat.rows || resultat;
  const enfants = await lireEnfantsPlusieurs(
    db,
    lignes.map((ligne) => Number(ligne.ID))
  );
  return lignes.map((ligne) => convertir(ligne, enfants.get(String(ligne.ID))));
}

export async function trouverParCode(code) {
  const db = await getKnex();
  return lireParCode(db, code);
}

// Étape 42 : avec { conserverDates: true } (migration uniquement),
// CREATED_AT / UPDATED_AT du document sont écrits tels quels ; sans l'option,
// comportement inchangé (dates par défaut SYSTIMESTAMP).
async function insererDoc(trx, doc, { conserverDates = false } = {}) {
  if (conserverDates) {
    await trx.raw(
      'INSERT INTO MODULE_SIGBD (CODE, LABEL, PERIODICITE, GENRE, VERSION_MODULE, ACTIVE, FIELDS_JSON, CREATED_AT, UPDATED_AT) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        doc.code,
        doc.label,
        doc.periodicity,
        doc.kind,
        doc.version === undefined || doc.version === null ? 1 : Number(doc.version),
        doc.active === undefined || doc.active === null ? 1 : doc.active ? 1 : 0,
        JSON.stringify(doc.fields),
        enDate(doc.createdAt) || new Date(),
        enDate(doc.updatedAt) || new Date(),
      ]
    );
  } else {
    await trx.raw(
      'INSERT INTO MODULE_SIGBD (CODE, LABEL, PERIODICITE, GENRE, VERSION_MODULE, ACTIVE, FIELDS_JSON) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        doc.code,
        doc.label,
        doc.periodicity,
        doc.kind,
        doc.version === undefined || doc.version === null ? 1 : Number(doc.version),
        doc.active === undefined || doc.active === null ? 1 : doc.active ? 1 : 0,
        JSON.stringify(doc.fields),
      ]
    );
  }
  const ligne = await trx.raw('SELECT ID FROM MODULE_SIGBD WHERE CODE = ?', [doc.code]);
  const lignes = ligne.rows || ligne;
  const moduleId = Number(lignes[0].ID);
  for (const valeur of dedup(doc.allowedPeriodicities)) {
    await trx.raw('INSERT INTO MODULE_PERIODICITE (MODULE_ID, PERIODICITE) VALUES (?, ?)', [
      moduleId,
      valeur,
    ]);
  }
  for (const valeur of dedup(doc.structureTypes)) {
    await trx.raw('INSERT INTO MODULE_TYPE_STRUCTURE (MODULE_ID, TYPE_STRUCTURE) VALUES (?, ?)', [
      moduleId,
      valeur,
    ]);
  }
  return moduleId;
}

export async function creer(doc, options = {}) {
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      await insererDoc(trx, doc, options);
      return lireParCode(trx, doc.code);
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJour(id, champs = {}) {
  verifierChamps(champs);
  if (!estIdValide(id)) return null;
  const cles = Object.keys(champs);
  if (cles.length === 0) return trouverParId(id);
  const db = await getKnex();
  return db.transaction(async (trx) => {
    const existant = await lireParId(trx, id);
    if (!existant) return null;
    const scalaires = cles.filter((cle) => !TABLEAUX_MODIFIABLES.has(cle));
    const sets = scalaires.map((cle) => `${COLONNES_MODIFIABLES[cle]} = ?`);
    const valeurs = scalaires.map((cle) => versOracle(cle, champs[cle]));
    // Même sans colonne scalaire, UPDATED_AT est rafraîchi (parité MongoDB).
    await trx.raw(
      `UPDATE MODULE_SIGBD SET${sets.length > 0 ? ` ${sets.join(', ')},` : ''} UPDATED_AT = SYSTIMESTAMP WHERE ID = ?`,
      [...valeurs, Number(id)]
    );
    if (cles.includes('allowedPeriodicities')) {
      await trx.raw('DELETE FROM MODULE_PERIODICITE WHERE MODULE_ID = ?', [Number(id)]);
      for (const valeur of dedup(champs.allowedPeriodicities)) {
        await trx.raw('INSERT INTO MODULE_PERIODICITE (MODULE_ID, PERIODICITE) VALUES (?, ?)', [
          Number(id),
          valeur,
        ]);
      }
    }
    if (cles.includes('structureTypes')) {
      await trx.raw('DELETE FROM MODULE_TYPE_STRUCTURE WHERE MODULE_ID = ?', [Number(id)]);
      for (const valeur of dedup(champs.structureTypes)) {
        await trx.raw('INSERT INTO MODULE_TYPE_STRUCTURE (MODULE_ID, TYPE_STRUCTURE) VALUES (?, ?)', [
          Number(id),
          valeur,
        ]);
      }
    }
    return lireParId(trx, id);
  });
}

export async function supprimer(id) {
  if (!estIdValide(id)) return false;
  const db = await getKnex();
  // Pas de rowsAffected disponible : existence vérifiée dans la transaction.
  // Une FK saisie (SAISIE) fait échouer le DELETE : l'erreur remonte telle
  // quelle (la transaction est annulée).
  return db.transaction(async (trx) => {
    const existant = await lireParId(trx, id);
    if (!existant) return false;
    await trx.raw('DELETE FROM MODULE_SIGBD WHERE ID = ?', [Number(id)]);
    return true;
  });
}

export async function assurer(doc) {
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const existant = await lireParCode(trx, doc.code);
      if (existant) return { module: existant, cree: false };
      await insererDoc(trx, doc);
      return { module: await lireParCode(trx, doc.code), cree: true };
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJourFields(code, fields) {
  const db = await getKnex();
  const existant = await trouverParCode(code);
  if (!existant) return false;
  await db.raw('UPDATE MODULE_SIGBD SET FIELDS_JSON = ?, UPDATED_AT = SYSTIMESTAMP WHERE CODE = ?', [
    JSON.stringify(fields),
    code,
  ]);
  return true;
}

export async function completerPeriodicitesAutorisees(code, valeurs) {
  const db = await getKnex();
  return db.transaction(async (trx) => {
    const module = await lireParCode(trx, code);
    if (!module) return false;
    // « Aucune périodicité enregistrée » = aucune ligne enfant (voir
    // DECISIONS.md [P39] pour la limite connue).
    if (module.allowedPeriodicities.length > 0) return false;
    const nouvelles = dedup(valeurs);
    if (nouvelles.length === 0) return false;
    const ligne = await trx.raw('SELECT ID FROM MODULE_SIGBD WHERE CODE = ?', [code]);
    const lignes = ligne.rows || ligne;
    const moduleId = Number(lignes[0].ID);
    for (const valeur of nouvelles) {
      await trx.raw('INSERT INTO MODULE_PERIODICITE (MODULE_ID, PERIODICITE) VALUES (?, ?)', [
        moduleId,
        valeur,
      ]);
    }
    return true;
  });
}

export async function supprimerTout() {
  const db = await getKnex();
  // Les lignes enfants partent par ON DELETE CASCADE.
  await db.raw('DELETE FROM MODULE_SIGBD');
}

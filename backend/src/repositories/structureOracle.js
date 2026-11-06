"use strict";

// Structures sur Oracle (table STRUCTURE du schéma de l'étape 35).
// Aucune requête SQL construite par concaténation de texte utilisateur :
// uniquement des liaisons de paramètres, les listes passent par construireIn.
// Sortie : { _id (chaîne), code, label, type, regionId (chaîne ou null),
// active (booléen 0/1 → false/true), createdAt, updatedAt }.

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';
import { construireIn } from './listeIn.js';

const COLONNES = 'ID, CODE, LABEL, TYPE_STRUCTURE, REGION_ID, ACTIVE, CREATED_AT, UPDATED_AT';

function enDate(valeur) {
  if (valeur instanceof Date) return valeur;
  return valeur == null ? valeur : new Date(valeur);
}

function convertir(ligne) {
  return {
    _id: String(ligne.ID),
    code: ligne.CODE,
    label: ligne.LABEL,
    type: ligne.TYPE_STRUCTURE,
    regionId: ligne.REGION_ID == null ? null : String(ligne.REGION_ID),
    active: Number(ligne.ACTIVE) === 1,
    createdAt: enDate(ligne.CREATED_AT),
    updatedAt: enDate(ligne.UPDATED_AT),
  };
}

function convertirLignes(resultat) {
  const lignes = resultat.rows || resultat;
  return lignes.map(convertir);
}

async function requeter(sql, valeurs) {
  const db = await getKnex();
  return convertirLignes(await db.raw(sql, valeurs));
}

function conditionsFiltre(options) {
  const conditions = [];
  const valeurs = [];
  if (options.actives !== undefined && options.actives !== null) {
    conditions.push('ACTIVE = ?');
    valeurs.push(options.actives === true ? 1 : 0);
  }
  if (Array.isArray(options.types)) {
    const { condition, valeurs: v } = construireIn('TYPE_STRUCTURE', options.types);
    conditions.push(condition);
    valeurs.push(...v);
  }
  if (options.regionId !== undefined && options.regionId !== null) {
    conditions.push('REGION_ID = ?');
    valeurs.push(Number(options.regionId));
  }
  if (Array.isArray(options.regionIds)) {
    const { condition, valeurs: v } = construireIn('REGION_ID', options.regionIds);
    conditions.push(condition);
    valeurs.push(...v);
  }
  return { conditions, valeurs };
}

export async function lister(options = {}) {
  const { conditions, valeurs } = conditionsFiltre(options);
  const filtre = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const tri = options.trierParLabel === true ? ' ORDER BY LABEL, ID' : ' ORDER BY ID';
  return requeter(`SELECT ${COLONNES} FROM STRUCTURE${filtre}${tri}`, valeurs);
}

export async function trouverParType(type) {
  const lignes = await requeter(
    `SELECT ${COLONNES} FROM STRUCTURE WHERE TYPE_STRUCTURE = ? ORDER BY ID FETCH FIRST 1 ROW ONLY`,
    [type]
  );
  return lignes.length > 0 ? lignes[0] : null;
}

export async function trouverParCode(code) {
  const lignes = await requeter(`SELECT ${COLONNES} FROM STRUCTURE WHERE CODE = ?`, [code]);
  return lignes.length > 0 ? lignes[0] : null;
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  const lignes = await requeter(`SELECT ${COLONNES} FROM STRUCTURE WHERE ID = ?`, [Number(id)]);
  return lignes.length > 0 ? lignes[0] : null;
}

// Ajout étape 40 : ids invalides et en double ignorés, [] pour une liste
// vide ou sans id valide, ordre de création (ID croissant), IN découpé.
export async function listerParIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const valides = [...new Set(ids.filter((id) => estIdValide(id)))];
  if (valides.length === 0) return [];
  const { condition, valeurs } = construireIn('ID', valides.map(Number));
  return requeter(`SELECT ${COLONNES} FROM STRUCTURE WHERE ${condition} ORDER BY ID`, valeurs);
}

export async function listerParCodes(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const { condition, valeurs } = construireIn('CODE', codes);
  return requeter(`SELECT ${COLONNES} FROM STRUCTURE WHERE ${condition} ORDER BY ID`, valeurs);
}

async function lireStructure(trx, code) {
  const resultat = await trx.raw(`SELECT ${COLONNES} FROM STRUCTURE WHERE CODE = ?`, [code]);
  const lignes = resultat.rows || resultat;
  return lignes.length > 0 ? convertir(lignes[0]) : null;
}

export async function creerSiAbsent(doc) {
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const existante = await lireStructure(trx, doc.code);
      if (existante) return { structure: existante, cree: false };
      await trx.raw(
        'INSERT INTO STRUCTURE (CODE, LABEL, TYPE_STRUCTURE, REGION_ID, ACTIVE) VALUES (?, ?, ?, ?, ?)',
        [
          doc.code,
          doc.label,
          doc.type,
          doc.regionId == null ? null : Number(doc.regionId),
          doc.active === undefined || doc.active === null ? 1 : (doc.active ? 1 : 0),
        ]
      );
      return { structure: await lireStructure(trx, doc.code), cree: true };
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function insererPlusieurs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const creees = [];
      for (const doc of docs) {
        await trx.raw(
          'INSERT INTO STRUCTURE (CODE, LABEL, TYPE_STRUCTURE, REGION_ID, ACTIVE) VALUES (?, ?, ?, ?, ?)',
          [
            doc.code,
            doc.label,
            doc.type,
            doc.regionId == null ? null : Number(doc.regionId),
            doc.active === undefined || doc.active === null ? 1 : (doc.active ? 1 : 0),
          ]
        );
        creees.push(await lireStructure(trx, doc.code));
      }
      return creees;
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM STRUCTURE');
}

"use strict";

// Périodes sur Oracle (table PERIODE du schéma de l'étape 35).
// Aucune requête SQL construite par concaténation de texte utilisateur :
// uniquement des liaisons de paramètres (les clés sont des paires liées).
// Sortie : { _id (chaîne), label, start, end, deadline (objets Date),
// periodicity, createdAt, updatedAt }.

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';
import { construireIn } from './listeIn.js';

const COLONNES = 'ID, LABEL, DATE_DEBUT, DATE_FIN, DATE_LIMITE, PERIODICITE, CREATED_AT, UPDATED_AT';

// Tri commun : start décroissant, puis création décroissante (dégagement des égalités).
const TRI = ' ORDER BY DATE_DEBUT DESC, ID DESC';

function enDate(valeur) {
  if (valeur instanceof Date) return valeur;
  return valeur == null ? valeur : new Date(valeur);
}

function convertir(ligne) {
  return {
    _id: String(ligne.ID),
    label: ligne.LABEL,
    start: enDate(ligne.DATE_DEBUT),
    end: enDate(ligne.DATE_FIN),
    deadline: enDate(ligne.DATE_LIMITE),
    periodicity: ligne.PERIODICITE,
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

export async function lister() {
  return requeter(`SELECT ${COLONNES} FROM PERIODE${TRI}`, []);
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  const lignes = await requeter(`SELECT ${COLONNES} FROM PERIODE WHERE ID = ?`, [Number(id)]);
  return lignes.length > 0 ? lignes[0] : null;
}

// Ajout étape 40 : ids invalides et en double ignorés, [] pour une liste
// vide ou sans id valide, ordre de création (ID croissant), IN découpé.
export async function listerParIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const valides = [...new Set(ids.filter((id) => estIdValide(id)))];
  if (valides.length === 0) return [];
  const { condition, valeurs } = construireIn('ID', valides.map(Number));
  return requeter(`SELECT ${COLONNES} FROM PERIODE WHERE ${condition} ORDER BY ID`, valeurs);
}

export async function listerTerminees(avant) {
  return requeter(`SELECT ${COLONNES} FROM PERIODE WHERE DATE_FIN < ?${TRI}`, [avant]);
}

export async function listerParCles(cles) {
  if (!Array.isArray(cles) || cles.length === 0) return [];
  const conditions = [];
  const valeurs = [];
  for (const cle of cles) {
    conditions.push('(PERIODICITE = ? AND DATE_DEBUT = ?)');
    valeurs.push(cle.periodicity, cle.start);
  }
  return requeter(
    `SELECT ${COLONNES} FROM PERIODE WHERE (${conditions.join(' OR ')})${TRI}`,
    valeurs
  );
}

async function lireCle(trx, periodicity, start) {
  const resultat = await trx.raw(
    `SELECT ${COLONNES} FROM PERIODE WHERE PERIODICITE = ? AND DATE_DEBUT = ?`,
    [periodicity, start]
  );
  const lignes = resultat.rows || resultat;
  return lignes.length > 0 ? convertir(lignes[0]) : null;
}

const COLONNES_INSERT = 'LABEL, DATE_DEBUT, DATE_FIN, DATE_LIMITE, PERIODICITE';
const VALEURS_INSERT = '?, ?, ?, ?, ?';

function valeursInsert(doc) {
  return [doc.label, doc.start, doc.end, doc.deadline, doc.periodicity];
}

export async function creerSiAbsent(doc) {
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const existante = await lireCle(trx, doc.periodicity, doc.start);
      if (existante) return { periode: existante, cree: false };
      await trx.raw(`INSERT INTO PERIODE (${COLONNES_INSERT}) VALUES (${VALEURS_INSERT})`, valeursInsert(doc));
      return { periode: await lireCle(trx, doc.periodicity, doc.start), cree: true };
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

// Étape 42 : avec { conserverDates: true } (migration uniquement),
// CREATED_AT / UPDATED_AT du document sont écrits tels quels ; sans l'option,
// comportement inchangé (dates par défaut SYSTIMESTAMP).
export async function insererPlusieurs(docs, { conserverDates = false } = {}) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  const colonnes = conserverDates ? `${COLONNES_INSERT}, CREATED_AT, UPDATED_AT` : COLONNES_INSERT;
  const placeholders = conserverDates ? `${VALEURS_INSERT}, ?, ?` : VALEURS_INSERT;
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const creees = [];
      for (const doc of docs) {
        const valeurs = conserverDates
          ? [...valeursInsert(doc), enDate(doc.createdAt) || new Date(), enDate(doc.updatedAt) || new Date()]
          : valeursInsert(doc);
        await trx.raw(`INSERT INTO PERIODE (${colonnes}) VALUES (${placeholders})`, valeurs);
        creees.push(await lireCle(trx, doc.periodicity, doc.start));
      }
      return creees;
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM PERIODE');
}

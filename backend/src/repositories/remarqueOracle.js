"use strict";

// Remarques sur Oracle (table REMARQUE du schéma de l'étape 35). Aucune
// requête SQL construite par concaténation de texte utilisateur : uniquement
// des bindings, les listes passent par construireIn.
// Sortie : { _id (chaîne), authorId (chaîne), context, text, state,
// createdAt, updatedAt }. Avec { avecAuteur: true }, authorId est remplacé
// par l'utilisateur SANS passwordHash (ou null) reconstruit avec
// listerParIds du dépôt Utilisateur.

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { getUtilisateurRepository } from './utilisateurRepository.js';

const COLONNES = 'ID, AUTEUR_ID, CONTEXTE, TEXTE, ETAT, CREATED_AT, UPDATED_AT';

// Tri commun : createdAt décroissant, puis création décroissante (dégagement
// des égalités), identique au dépôt Mongo.
const TRI = ' ORDER BY CREATED_AT DESC, ID DESC';

function enDate(valeur) {
  if (valeur == null) return null;
  if (valeur instanceof Date) return valeur;
  return new Date(valeur);
}

function convertir(ligne) {
  return {
    _id: String(ligne.ID),
    authorId: String(ligne.AUTEUR_ID),
    context: ligne.CONTEXTE,
    text: ligne.TEXTE,
    state: ligne.ETAT,
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

function sansPasswordHash(utilisateur) {
  if (!utilisateur || typeof utilisateur !== 'object') return utilisateur;
  if (!('passwordHash' in utilisateur)) return utilisateur;
  const { passwordHash, ...reste } = utilisateur;
  return reste;
}

async function avecAuteurs(docs) {
  if (docs.length === 0) return docs;
  const ids = [...new Set(docs.map((doc) => doc.authorId))];
  const utilisateurs = await getUtilisateurRepository().listerParIds(ids);
  const parId = new Map(
    utilisateurs.map((u) => [String(u._id), sansPasswordHash(u)])
  );
  return docs.map((doc) => ({
    ...doc,
    authorId: parId.get(doc.authorId) ?? null,
  }));
}

// Étape 42 : avec { conserverDates: true } (migration uniquement),
// CREATED_AT / UPDATED_AT de la remarque sont écrits tels quels ; sans
// l'option, comportement inchangé (dates par défaut SYSTIMESTAMP).
export async function creer(
  { authorId, context, text, state, createdAt, updatedAt } = {},
  { conserverDates = false } = {}
) {
  const db = await getKnex();
  const base = [
    Number(authorId),
    context,
    text,
    state === undefined || state === null ? 'nouvelle' : state,
  ];
  if (conserverDates) {
    await db.raw(
      'INSERT INTO REMARQUE (AUTEUR_ID, CONTEXTE, TEXTE, ETAT, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?, ?, ?, ?)',
      [...base, enDate(createdAt) || new Date(), enDate(updatedAt) || new Date()]
    );
  } else {
    await db.raw('INSERT INTO REMARQUE (AUTEUR_ID, CONTEXTE, TEXTE, ETAT) VALUES (?, ?, ?, ?)', base);
  }
  // Pas de clé unique sur REMARQUE : relecture de la dernière ligne insérée
  // (monotone, l'identité est croissante).
  const lignes = await requeter(`SELECT ${COLONNES} FROM REMARQUE ORDER BY ID DESC FETCH FIRST 1 ROW ONLY`, []);
  return lignes.length > 0 ? lignes[0] : null;
}

export async function lister({ avecAuteur, limite } = {}) {
  let sql = `SELECT ${COLONNES} FROM REMARQUE${TRI}`;
  const valeurs = [];
  if (limite !== undefined && limite !== null) {
    sql += ' FETCH FIRST ? ROWS ONLY';
    valeurs.push(limite);
  }
  const docs = await requeter(sql, valeurs);
  return avecAuteur ? avecAuteurs(docs) : docs;
}

export async function listerParAuteur(authorId, { avecAuteur, limite } = {}) {
  if (!estIdValide(authorId)) return [];
  let sql = `SELECT ${COLONNES} FROM REMARQUE WHERE AUTEUR_ID = ?${TRI}`;
  const valeurs = [Number(authorId)];
  if (limite !== undefined && limite !== null) {
    sql += ' FETCH FIRST ? ROWS ONLY';
    valeurs.push(limite);
  }
  const docs = await requeter(sql, valeurs);
  return avecAuteur ? avecAuteurs(docs) : docs;
}

export async function changerEtat(id, etat) {
  if (!estIdValide(id)) return null;
  const db = await getKnex();
  // L'UPDATE ne renvoie pas le nombre de lignes (knex/oracledb) : la
  // relecture par id fait foi (absent → null).
  await db.raw('UPDATE REMARQUE SET ETAT = ?, UPDATED_AT = SYSTIMESTAMP WHERE ID = ?', [
    etat,
    Number(id),
  ]);
  const lignes = await requeter(`SELECT ${COLONNES} FROM REMARQUE WHERE ID = ?`, [Number(id)]);
  return lignes.length > 0 ? lignes[0] : null;
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM REMARQUE');
}

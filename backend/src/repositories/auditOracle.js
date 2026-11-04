"use strict";

// Journal d'audit sur Oracle (table JOURNAL_AUDIT du schéma de l'étape 35).
// Règle : aucune requête SQL n'est construite par concaténation de texte
// utilisateur — uniquement des liaisons de paramètres via knex/oracledb.

import { getKnex } from '../db/oracle.js';

// Oracle limite un IN à 1000 valeurs : découpe en paquets reliés par OR.
const TAILLE_PAQUET_IN = 900;

function placeholders(n) {
  return new Array(n).fill('?').join(', ');
}

// LIKE est sensible à la casse : on minuscule la valeur et la colonne.
// % _ \ sont des jokers : ils sont échappés (ESCAPE '\') pour être littéraux.
// La valeur est entourée de % pour un « contient » (équivalent de la regex
// sans ancrage utilisée côté MongoDB).
function valeurLike(texte) {
  const echappe = String(texte)
    .toLowerCase()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `%${echappe}%`;
}

function construireFiltres({ actions, depuis, jusqu, userRefsIn, objetContient } = {}) {
  const conditions = [];
  const valeurs = [];

  if (Array.isArray(actions)) {
    if (actions.length === 0) {
      conditions.push('1 = 0');
    } else {
      conditions.push(`ACTION IN (${placeholders(actions.length)})`);
      valeurs.push(...actions);
    }
  }

  if (depuis) {
    conditions.push('CREATED_AT >= ?');
    valeurs.push(depuis);
  }
  if (jusqu) {
    conditions.push('CREATED_AT <= ?');
    valeurs.push(jusqu);
  }

  // Groupe OU : objet contient le texte OU utilisateur membre de la liste.
  // Il est toujours placé en DERNIER dans le WHERE, donc ses valeurs suivent
  // celles des conditions ET (ordre des liaisons respecté).
  const alternatives = [];
  const valeursOu = [];

  if (objetContient) {
    alternatives.push(`LOWER(OBJET) LIKE ? ESCAPE '\\'`);
    valeursOu.push(valeurLike(objetContient));
  }
  if (Array.isArray(userRefsIn)) {
    if (userRefsIn.length === 0) {
      // Liste vide = condition fausse = aucune ligne (comme $in: []).
      alternatives.push('1 = 0');
    } else {
      for (let i = 0; i < userRefsIn.length; i += TAILLE_PAQUET_IN) {
        const paquet = userRefsIn.slice(i, i + TAILLE_PAQUET_IN);
        alternatives.push(`USER_REF IN (${placeholders(paquet.length)})`);
        valeursOu.push(...paquet);
      }
    }
  }
  if (alternatives.length > 0) {
    conditions.push(`(${alternatives.join(' OR ')})`);
    valeurs.push(...valeursOu);
  }

  return { where: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '', valeurs };
}

function convertir(ligne) {
  const createdAt = ligne.CREATED_AT instanceof Date ? ligne.CREATED_AT : new Date(ligne.CREATED_AT);
  return {
    id: String(ligne.ID),
    createdAt,
    action: ligne.ACTION,
    userRef: ligne.USER_REF,
    objet: ligne.OBJET,
    ip: ligne.IP,
  };
}

export async function ajouter({ userRef, action, objet, ip, createdAt }) {
  const db = await getKnex();
  await db.raw(
    'INSERT INTO JOURNAL_AUDIT (USER_REF, ACTION, OBJET, IP, CREATED_AT) VALUES (?, ?, ?, ?, ?)',
    [userRef, action, objet, ip, createdAt || new Date()]
  );
}

export async function lister({ actions, depuis, jusqu, userRefsIn, objetContient, page = 1, limit = 50 } = {}) {
  const { where, valeurs } = construireFiltres({ actions, depuis, jusqu, userRefsIn, objetContient });
  const db = await getKnex();

  const resultatTotal = await db.raw(`SELECT COUNT(*) AS N FROM JOURNAL_AUDIT${where}`, valeurs);
  const ligneTotal = (resultatTotal.rows || resultatTotal)[0] || {};
  const total = Number(ligneTotal.N ?? ligneTotal.n ?? 0);

  const resultat = await db.raw(
    `SELECT ID, USER_REF, ACTION, OBJET, IP, CREATED_AT FROM JOURNAL_AUDIT${where} ` +
      'ORDER BY CREATED_AT DESC, ID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY',
    [...valeurs, (page - 1) * limit, limit]
  );
  const lignesSql = resultat.rows || resultat;

  return { total, lignes: lignesSql.map(convertir) };
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM JOURNAL_AUDIT');
}

"use strict";

// Utilisateurs sur Oracle (table UTILISATEUR du schéma de l'étape 35).
// Aucune requête SQL construite par concaténation de texte utilisateur :
// uniquement des bindings, les listes passent par construireIn.
// Sortie : { _id (chaîne), im, nom, prenom, direction, service, passwordHash,
// role, structureId (chaîne), status, mustChangePassword (booléen),
// failedAttempts (nombre), lockedUntil (Date ou null), createdAt, updatedAt }.

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';
import { construireIn } from './listeIn.js';

const COLONNES =
  'ID, IM, NOM, PRENOM, DIRECTION, SERVICE, PASSWORD_HASH, ROLE_CODE, STRUCTURE_ID, STATUT, ' +
  'MUST_CHANGE_PASSWORD, FAILED_ATTEMPTS, LOCKED_UNTIL, CREATED_AT, UPDATED_AT';

// Liste blanche des champs modifiables : clé applicatif → colonne, TOUJOURS
// une constante interne (jamais le texte d'entrée). Toute autre clé lève une
// Error explicite.
const COLONNES_MODIFIABLES = {
  nom: 'NOM',
  prenom: 'PRENOM',
  direction: 'DIRECTION',
  service: 'SERVICE',
  role: 'ROLE_CODE',
  structureId: 'STRUCTURE_ID',
  passwordHash: 'PASSWORD_HASH',
  status: 'STATUT',
  mustChangePassword: 'MUST_CHANGE_PASSWORD',
  failedAttempts: 'FAILED_ATTEMPTS',
  lockedUntil: 'LOCKED_UNTIL',
};

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

// Conversion d'une valeur applicatif vers le type de colonne Oracle.
function versOracle(cle, valeur) {
  switch (cle) {
    case 'structureId':
      return valeur == null ? null : Number(valeur);
    case 'mustChangePassword':
      return valeur ? 1 : 0;
    case 'failedAttempts':
      return Number(valeur);
    case 'lockedUntil':
      return enDate(valeur);
    default:
      return valeur;
  }
}

function convertir(ligne) {
  return {
    _id: String(ligne.ID),
    im: ligne.IM,
    nom: ligne.NOM,
    prenom: ligne.PRENOM,
    direction: ligne.DIRECTION,
    service: ligne.SERVICE,
    passwordHash: ligne.PASSWORD_HASH,
    role: ligne.ROLE_CODE,
    structureId: String(ligne.STRUCTURE_ID),
    status: ligne.STATUT,
    mustChangePassword: Number(ligne.MUST_CHANGE_PASSWORD) === 1,
    failedAttempts: Number(ligne.FAILED_ATTEMPTS),
    lockedUntil: enDate(ligne.LOCKED_UNTIL),
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

// LIKE insensible à la casse, jokers % _ \ échappés (ESCAPE '\') : q est
// pris LITTÉRALEMENT, la valeur est entourée de % (« contient »).
function valeurLike(texte) {
  const echappe = String(texte)
    .toLowerCase()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `%${echappe}%`;
}

// Tri commun : nom, puis prenom, puis création (dégagement des égalités).
const TRI = ' ORDER BY NOM, PRENOM, ID';

const COLONNES_U = COLONNES.split(', ').map((colonne) => `u.${colonne}`).join(', ');

export async function listerAvecStructure({ role, status, structureId, q, limite } = {}) {
  const conditions = [];
  const valeurs = [];
  if (role) {
    conditions.push('u.ROLE_CODE = ?');
    valeurs.push(role);
  }
  if (status) {
    conditions.push('u.STATUT = ?');
    valeurs.push(status);
  }
  if (structureId) {
    conditions.push('u.STRUCTURE_ID = ?');
    valeurs.push(Number(structureId));
  }
  if (q !== undefined && q !== null && q !== '') {
    conditions.push(
      "(LOWER(u.IM) LIKE ? ESCAPE '\\' OR LOWER(u.NOM) LIKE ? ESCAPE '\\' OR LOWER(u.PRENOM) LIKE ? ESCAPE '\\')"
    );
    const motif = valeurLike(q);
    valeurs.push(motif, motif, motif);
  }
  const filtre = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const max = limite === undefined || limite === null ? 500 : limite;
  const db = await getKnex();
  const resultat = await db.raw(
    `SELECT ${COLONNES_U}, s.ID AS S_ID, s.LABEL AS S_LABEL ` +
      'FROM UTILISATEUR u LEFT JOIN STRUCTURE s ON s.ID = u.STRUCTURE_ID' +
      `${filtre} ORDER BY u.NOM, u.PRENOM, u.ID FETCH FIRST ? ROWS ONLY`,
    [...valeurs, max]
  );
  const lignes = resultat.rows || resultat;
  return lignes.map((ligne) => ({
    ...convertir(ligne),
    structureId: ligne.S_ID == null ? null : { _id: String(ligne.S_ID), label: ligne.S_LABEL },
  }));
}

export async function listerParRole(role) {
  return requeter(`SELECT ${COLONNES} FROM UTILISATEUR WHERE ROLE_CODE = ?${TRI}`, [role]);
}

export async function rechercher(q) {
  const motif = valeurLike(q == null ? '' : q);
  return requeter(
    `SELECT ${COLONNES} FROM UTILISATEUR ` +
      "WHERE (LOWER(IM) LIKE ? ESCAPE '\\' OR LOWER(NOM) LIKE ? ESCAPE '\\' OR LOWER(PRENOM) LIKE ? ESCAPE '\\')" +
      TRI,
    [motif, motif, motif]
  );
}

export async function trouverParRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const ids = refs.filter((ref) => estIdValide(ref)).map(Number);
  const ims = refs.filter((ref) => typeof ref === 'string');
  const alternatives = [];
  const valeurs = [];
  if (ids.length > 0) {
    const { condition, valeurs: v } = construireIn('ID', ids);
    alternatives.push(condition);
    valeurs.push(...v);
  } else {
    alternatives.push('1 = 0');
  }
  if (ims.length > 0) {
    const { condition, valeurs: v } = construireIn('IM', ims);
    alternatives.push(condition);
    valeurs.push(...v);
  } else {
    alternatives.push('1 = 0');
  }
  return requeter(
    `SELECT ${COLONNES} FROM UTILISATEUR WHERE (${alternatives.join(' OR ')}) ORDER BY ID`,
    valeurs
  );
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  const lignes = await requeter(`SELECT ${COLONNES} FROM UTILISATEUR WHERE ID = ?`, [Number(id)]);
  return lignes.length > 0 ? lignes[0] : null;
}

// Ajout étape 40 : ids invalides et en double ignorés, [] pour une liste
// vide ou sans id valide, ordre de création (ID croissant), IN découpé.
export async function listerParIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const valides = [...new Set(ids.filter((id) => estIdValide(id)))];
  if (valides.length === 0) return [];
  const { condition, valeurs } = construireIn('ID', valides.map(Number));
  return requeter(`SELECT ${COLONNES} FROM UTILISATEUR WHERE ${condition} ORDER BY ID`, valeurs);
}

export async function trouverParIm(im) {
  const lignes = await requeter(`SELECT ${COLONNES} FROM UTILISATEUR WHERE IM = ?`, [im]);
  return lignes.length > 0 ? lignes[0] : null;
}

export async function trouverPremierParRole(role) {
  const lignes = await requeter(
    `SELECT ${COLONNES} FROM UTILISATEUR WHERE ROLE_CODE = ? ORDER BY ID FETCH FIRST 1 ROW ONLY`,
    [role]
  );
  return lignes.length > 0 ? lignes[0] : null;
}

export async function creer(doc) {
  const db = await getKnex();
  try {
    await db.raw(
      'INSERT INTO UTILISATEUR (IM, NOM, PRENOM, DIRECTION, SERVICE, PASSWORD_HASH, ROLE_CODE, ' +
        'STRUCTURE_ID, STATUT, MUST_CHANGE_PASSWORD, FAILED_ATTEMPTS, LOCKED_UNTIL) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        doc.im,
        doc.nom,
        doc.prenom,
        doc.direction,
        doc.service,
        doc.passwordHash,
        doc.role,
        Number(doc.structureId),
        doc.status === undefined || doc.status === null ? 'actif' : doc.status,
        doc.mustChangePassword ? 1 : 0,
        doc.failedAttempts === undefined || doc.failedAttempts === null ? 0 : Number(doc.failedAttempts),
        doc.lockedUntil === undefined ? null : enDate(doc.lockedUntil),
      ]
    );
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
  return trouverParIm(doc.im);
}

export async function mettreAJour(id, champs = {}) {
  verifierChamps(champs);
  if (!estIdValide(id)) return null;
  const cles = Object.keys(champs);
  if (cles.length === 0) return trouverParId(id);
  const sets = cles.map((cle) => `${COLONNES_MODIFIABLES[cle]} = ?`);
  const valeurs = cles.map((cle) => versOracle(cle, champs[cle]));
  const db = await getKnex();
  // L'UPDATE ne renvoie pas le nombre de lignes (knex/oracledb) : la
  // relecture par id fait foi (absent → null).
  await db.raw(
    `UPDATE UTILISATEUR SET ${sets.join(', ')}, UPDATED_AT = SYSTIMESTAMP WHERE ID = ?`,
    [...valeurs, Number(id)]
  );
  return trouverParId(id);
}

export async function mettreAJourParIm(im, champs = {}) {
  verifierChamps(champs);
  const cles = Object.keys(champs);
  if (cles.length === 0) return;
  const sets = cles.map((cle) => `${COLONNES_MODIFIABLES[cle]} = ?`);
  const valeurs = cles.map((cle) => versOracle(cle, champs[cle]));
  const db = await getKnex();
  await db.raw(
    `UPDATE UTILISATEUR SET ${sets.join(', ')}, UPDATED_AT = SYSTIMESTAMP WHERE IM = ?`,
    [...valeurs, im]
  );
}

export async function debloquerExpires(maintenant) {
  const db = await getKnex();
  // knex/oracledb ne expose pas rowsAffected sur un raw : le compte est pris
  // dans la transaction avant la mise à jour.
  return db.transaction(async (trx) => {
    const compte = await trx.raw('SELECT COUNT(*) AS N FROM UTILISATEUR WHERE LOCKED_UNTIL <= ?', [
      maintenant,
    ]);
    const lignes = compte.rows || compte;
    const nombre = Number(lignes[0].N);
    if (nombre > 0) {
      await trx.raw(
        'UPDATE UTILISATEUR SET LOCKED_UNTIL = NULL, FAILED_ATTEMPTS = 0, UPDATED_AT = SYSTIMESTAMP ' +
          'WHERE LOCKED_UNTIL <= ?',
        [maintenant]
      );
    }
    return nombre;
  });
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM UTILISATEUR');
}

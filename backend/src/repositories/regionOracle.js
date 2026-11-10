"use strict";

// Régions sur Oracle (table REGION du schéma de l'étape 35).
// Règle : aucune requête SQL n'est construite par concaténation de texte
// utilisateur — uniquement des liaisons de paramètres via knex/oracledb.
// Sortie : objets simples { _id (chaîne), name, createdAt, updatedAt }.

import { getKnex } from '../db/oracle.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';
import { construireIn } from './listeIn.js';

const COLONNES = 'ID, NAME_REGION, CREATED_AT, UPDATED_AT';

function enDate(valeur) {
  if (valeur instanceof Date) return valeur;
  return valeur == null ? valeur : new Date(valeur);
}

function convertir(ligne) {
  return {
    _id: String(ligne.ID),
    name: ligne.NAME_REGION,
    createdAt: enDate(ligne.CREATED_AT),
    updatedAt: enDate(ligne.UPDATED_AT),
  };
}

async function requeter(sql, valeurs) {
  const db = await getKnex();
  const resultat = await db.raw(sql, valeurs);
  const lignes = resultat.rows || resultat;
  return lignes.map(convertir);
}

async function lireParNom(nom) {
  const db = await getKnex();
  const resultat = await db.raw(
    `SELECT ${COLONNES} FROM REGION WHERE NAME_REGION = ?`,
    [nom]
  );
  const lignes = resultat.rows || resultat;
  return lignes.length > 0 ? convertir(lignes[0]) : null;
}

export async function lister() {
  return requeter(`SELECT ${COLONNES} FROM REGION ORDER BY NAME_REGION`, []);
}

export async function listerParNoms(noms) {
  if (!Array.isArray(noms) || noms.length === 0) return [];
  const { condition, valeurs } = construireIn('NAME_REGION', noms);
  return requeter(`SELECT ${COLONNES} FROM REGION WHERE ${condition} ORDER BY ID`, valeurs);
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  const lignes = await requeter(`SELECT ${COLONNES} FROM REGION WHERE ID = ?`, [Number(id)]);
  return lignes.length > 0 ? lignes[0] : null;
}

export async function trouverParNom(nom) {
  return lireParNom(nom);
}

export async function assurer(nom) {
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const existe = await trx
        .raw(`SELECT ${COLONNES} FROM REGION WHERE NAME_REGION = ?`, [nom])
        .then((res) => {
          const lignes = res.rows || res;
          return lignes.length > 0 ? convertir(lignes[0]) : null;
        });
      if (existe) return { region: existe, cree: false };
      await trx.raw('INSERT INTO REGION (NAME_REGION) VALUES (?)', [nom]);
      const creee = await trx.raw(`SELECT ${COLONNES} FROM REGION WHERE NAME_REGION = ?`, [nom]);
      const lignes = creee.rows || creee;
      return { region: convertir(lignes[0]), cree: true };
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

// Étape 42 : avec { conserverDates: true } (migration uniquement), chaque
// élément peut être { name, createdAt, updatedAt } et les deux dates sont
// écrites telles quelles ; sans l'option, comportement inchangé (chaînes,
// dates par défaut SYSTIMESTAMP).
export async function insererPlusieurs(elements, { conserverDates = false } = {}) {
  if (!Array.isArray(elements) || elements.length === 0) return [];
  const db = await getKnex();
  try {
    return await db.transaction(async (trx) => {
      const creees = [];
      for (const element of elements) {
        const nom = typeof element === 'string' ? element : element.name;
        if (conserverDates && element && typeof element === 'object') {
          await trx.raw('INSERT INTO REGION (NAME_REGION, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?)', [
            nom,
            enDate(element.createdAt) || new Date(),
            enDate(element.updatedAt) || new Date(),
          ]);
        } else {
          await trx.raw('INSERT INTO REGION (NAME_REGION) VALUES (?)', [nom]);
        }
        const resultat = await trx.raw(`SELECT ${COLONNES} FROM REGION WHERE NAME_REGION = ?`, [nom]);
        const lignes = resultat.rows || resultat;
        creees.push(convertir(lignes[0]));
      }
      return creees;
    });
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM REGION');
}

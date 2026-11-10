"use strict";

// Profils sur Oracle (table PROFIL du schéma de l'étape 35).
// Règle : aucune requête SQL n'est construite par concaténation de texte
// utilisateur — uniquement des liaisons de paramètres via knex/oracledb.

import { getKnex } from '../db/oracle.js';

function convertir(ligne) {
  return { code: ligne.CODE, label: ligne.LABEL };
}

function enDate(valeur) {
  if (valeur == null) return null;
  if (valeur instanceof Date) return valeur;
  return new Date(valeur);
}

// Étape 42 : avec { conserverDates: true } (migration uniquement),
// CREATED_AT / UPDATED_AT du document sont écrits tels quels ; sans l'option,
// comportement inchangé (dates par défaut SYSTIMESTAMP).
export async function assurer({ code, label, createdAt, updatedAt }, { conserverDates = false } = {}) {
  const db = await getKnex();
  return db.transaction(async (trx) => {
    const resultat = await trx.raw('SELECT ID FROM PROFIL WHERE CODE = ?', [code]);
    const lignes = resultat.rows || resultat;
    if (lignes.length > 0) return false;
    if (conserverDates) {
      await trx.raw('INSERT INTO PROFIL (CODE, LABEL, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?, ?)', [
        code,
        label,
        enDate(createdAt) || new Date(),
        enDate(updatedAt) || new Date(),
      ]);
    } else {
      await trx.raw('INSERT INTO PROFIL (CODE, LABEL) VALUES (?, ?)', [code, label]);
    }
    return true;
  });
}

export async function trouverParCode(code) {
  const db = await getKnex();
  const resultat = await db.raw('SELECT CODE, LABEL FROM PROFIL WHERE CODE = ?', [code]);
  const lignes = resultat.rows || resultat;
  return lignes.length > 0 ? convertir(lignes[0]) : null;
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM PROFIL');
}

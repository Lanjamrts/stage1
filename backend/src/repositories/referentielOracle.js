"use strict";

// Référentiels sur Oracle (table REFERENTIEL du schéma de l'étape 35).
// Règle : aucune requête SQL n'est construite par concaténation de texte
// utilisateur — uniquement des liaisons de paramètres via knex/oracledb.
// Une chaîne vide est stockée NULL par Oracle (voulu) et relue ''.

import { getKnex } from '../db/oracle.js';

function convertir(ligne) {
  return {
    type: ligne.TYPE_REF,
    value: ligne.VALEUR,
    ministere: ligne.MINISTERE ?? '',
    regime: ligne.REGIME ?? '',
    acronyme: ligne.ACRONYME ?? '',
  };
}

// Chaîne vide ou absente → NULL à l'écriture (Oracle confond '' et NULL).
function versOracle(valeur) {
  return valeur ? valeur : null;
}

function enDate(valeur) {
  if (valeur == null) return null;
  if (valeur instanceof Date) return valeur;
  return new Date(valeur);
}

export async function lister(type) {
  const db = await getKnex();
  const resultat = await db.raw(
    'SELECT TYPE_REF, VALEUR, MINISTERE, REGIME, ACRONYME FROM REFERENTIEL WHERE TYPE_REF = ? ORDER BY VALEUR',
    [type]
  );
  const lignes = resultat.rows || resultat;
  return lignes.map(convertir);
}

export async function trouver(type, value) {
  const db = await getKnex();
  const resultat = await db.raw(
    'SELECT TYPE_REF, VALEUR, MINISTERE, REGIME, ACRONYME FROM REFERENTIEL WHERE TYPE_REF = ? AND VALEUR = ?',
    [type, value]
  );
  const lignes = resultat.rows || resultat;
  return lignes.length > 0 ? convertir(lignes[0]) : null;
}

export async function creer({ type, value }) {
  const db = await getKnex();
  await db.raw('INSERT INTO REFERENTIEL (TYPE_REF, VALEUR) VALUES (?, ?)', [type, value]);
  return { type, value, ministere: '', regime: '', acronyme: '' };
}

export async function renommer(type, ancienneValue, nouvelleValue) {
  const db = await getKnex();
  await db.raw(
    'UPDATE REFERENTIEL SET VALEUR = ?, UPDATED_AT = SYSTIMESTAMP WHERE TYPE_REF = ? AND VALEUR = ?',
    [nouvelleValue, type, ancienneValue]
  );
}

export async function assurer({ type, value }) {
  const db = await getKnex();
  return db.transaction(async (trx) => {
    const resultat = await trx.raw('SELECT ID FROM REFERENTIEL WHERE TYPE_REF = ? AND VALEUR = ?', [
      type,
      value,
    ]);
    const lignes = resultat.rows || resultat;
    if (lignes.length > 0) return false;
    await trx.raw('INSERT INTO REFERENTIEL (TYPE_REF, VALEUR) VALUES (?, ?)', [type, value]);
    return true;
  });
}

export async function assurerEpn({ value, ministere, regime, acronyme }) {
  const db = await getKnex();
  return db.transaction(async (trx) => {
    const resultat = await trx.raw('SELECT ID FROM REFERENTIEL WHERE TYPE_REF = ? AND VALEUR = ?', [
      'epn',
      value,
    ]);
    const lignes = resultat.rows || resultat;
    if (lignes.length > 0) {
      await trx.raw(
        'UPDATE REFERENTIEL SET MINISTERE = ?, REGIME = ?, ACRONYME = ?, UPDATED_AT = SYSTIMESTAMP ' +
          'WHERE TYPE_REF = ? AND VALEUR = ?',
        [versOracle(ministere), versOracle(regime), versOracle(acronyme), 'epn', value]
      );
      return false;
    }
    await trx.raw(
      'INSERT INTO REFERENTIEL (TYPE_REF, VALEUR, MINISTERE, REGIME, ACRONYME) VALUES (?, ?, ?, ?, ?)',
      ['epn', value, versOracle(ministere), versOracle(regime), versOracle(acronyme)]
    );
    return true;
  });
}

// Étape 42 : avec { conserverDates: true } (migration uniquement),
// CREATED_AT / UPDATED_AT de chaque élément sont écrits tels quels ; sans
// l'option, comportement inchangé (dates par défaut SYSTIMESTAMP).
export async function insererPlusieurs(elements, { conserverDates = false } = {}) {
  if (!elements || elements.length === 0) return;
  const db = await getKnex();
  await db.transaction(async (trx) => {
    for (const element of elements) {
      const valeurs = [
        element.type,
        element.value,
        versOracle(element.ministere),
        versOracle(element.regime),
        versOracle(element.acronyme),
      ];
      if (conserverDates) {
        await trx.raw(
          'INSERT INTO REFERENTIEL (TYPE_REF, VALEUR, MINISTERE, REGIME, ACRONYME, CREATED_AT, UPDATED_AT) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
          [...valeurs, enDate(element.createdAt) || new Date(), enDate(element.updatedAt) || new Date()]
        );
      } else {
        await trx.raw(
          'INSERT INTO REFERENTIEL (TYPE_REF, VALEUR, MINISTERE, REGIME, ACRONYME) VALUES (?, ?, ?, ?, ?)',
          valeurs
        );
      }
    }
  });
}

export async function supprimerTout() {
  const db = await getKnex();
  await db.raw('DELETE FROM REFERENTIEL');
}

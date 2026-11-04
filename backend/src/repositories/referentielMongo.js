"use strict";

// Référentiels sur MongoDB : logique Mongoose déplacée telle quelle depuis
// backend/src/routes/referentiels.js, backend/src/services/moduleMeta.js,
// backend/src/controllers/collecteController.js et backend/src/seed/common.js.
// Un élément est toujours restitué avec des chaînes ('' à la place de null).

import Referentiel from '../models/Referentiel.js';

function convertir(doc) {
  return {
    type: doc.type,
    value: doc.value,
    ministere: doc.ministere || '',
    regime: doc.regime || '',
    acronyme: doc.acronyme || '',
  };
}

export async function lister(type) {
  const rows = await Referentiel.find({ type }).sort({ value: 1 }).lean();
  return rows.map(convertir);
}

export async function trouver(type, value) {
  const doc = await Referentiel.findOne({ type, value }).lean();
  return doc ? convertir(doc) : null;
}

export async function creer({ type, value }) {
  const doc = await Referentiel.create({ type, value });
  return convertir(doc);
}

export async function renommer(type, ancienneValue, nouvelleValue) {
  const doc = await Referentiel.findOne({ type, value: ancienneValue });
  if (!doc) return;
  doc.value = nouvelleValue;
  await doc.save();
}

export async function assurer({ type, value }) {
  const existing = await Referentiel.findOne({ type, value }).lean();
  if (existing) return false;
  await Referentiel.create({ type, value });
  return true;
}

export async function assurerEpn({ value, ministere, regime, acronyme }) {
  const existing = await Referentiel.findOne({ type: 'epn', value }).lean();
  if (existing) {
    await Referentiel.updateOne(
      { type: 'epn', value },
      { $set: { ministere, regime, acronyme } }
    );
    return false;
  }
  await Referentiel.create({ type: 'epn', value, ministere, regime, acronyme });
  return true;
}

export async function insererPlusieurs(elements) {
  if (!elements || elements.length === 0) return;
  await Referentiel.insertMany(elements);
}

export async function supprimerTout() {
  await Referentiel.deleteMany({});
}

"use strict";

// Périodes sur MongoDB : documents lean tels quels (aucune conversion, l'_id
// reste un ObjectId, les dates restent des objets Date).

import Periode from '../models/Periode.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';

// Tri commun : start décroissant, puis création décroissante (dégagement des égalités).
const TRI = { start: -1, _id: -1 };

export async function lister() {
  return Periode.find({}).sort(TRI).lean();
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  return Periode.findById(id).lean();
}

export async function listerTerminees(avant) {
  return Periode.find({ end: { $lt: avant } }).sort(TRI).lean();
}

export async function listerParCles(cles) {
  if (!Array.isArray(cles) || cles.length === 0) return [];
  const filtre = {
    $or: cles.map((cle) => ({ periodicity: cle.periodicity, start: cle.start })),
  };
  return Periode.find(filtre).sort(TRI).lean();
}

export async function creerSiAbsent(doc) {
  const cle = { periodicity: doc.periodicity, start: doc.start };
  const existante = await Periode.findOne(cle).lean();
  if (existante) return { periode: existante, cree: false };
  try {
    const cree = await Periode.create({
      label: doc.label,
      start: doc.start,
      end: doc.end,
      deadline: doc.deadline,
      periodicity: doc.periodicity,
    });
    return { periode: cree.toObject(), cree: true };
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function insererPlusieurs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  try {
    const creees = await Periode.insertMany(docs);
    return creees.map((d) => d.toObject());
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  await Periode.deleteMany({});
}

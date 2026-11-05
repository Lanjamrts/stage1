"use strict";

// Régions sur MongoDB : documents lean tels quels (aucune conversion, l'_id
// reste un ObjectId et le champ __v éventuel est conservé).

import Region from '../models/Region.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';

export async function lister() {
  return Region.find({}).sort({ name: 1 }).lean();
}

export async function listerParNoms(noms) {
  if (!Array.isArray(noms) || noms.length === 0) return [];
  return Region.find({ name: { $in: noms } }).sort({ _id: 1 }).lean();
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  return Region.findById(id).lean();
}

export async function trouverParNom(nom) {
  return Region.findOne({ name: nom }).lean();
}

export async function assurer(nom) {
  const existante = await Region.findOne({ name: nom }).lean();
  if (existante) return { region: existante, cree: false };
  try {
    const doc = await Region.create({ name: nom });
    return { region: doc.toObject(), cree: true };
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function insererPlusieurs(noms) {
  if (!Array.isArray(noms) || noms.length === 0) return [];
  try {
    const docs = await Region.insertMany(noms.map((name) => ({ name })));
    return docs.map((d) => d.toObject());
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  await Region.deleteMany({});
}

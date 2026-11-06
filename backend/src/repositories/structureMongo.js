"use strict";

// Structures sur MongoDB : documents lean tels quels (aucune conversion,
// l'_id reste un ObjectId, regionId absent quand il n'est pas renseigné).

import Structure from '../models/Structure.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';

function construireFiltre(options = {}) {
  const clauses = [];
  if (options.actives !== undefined && options.actives !== null) {
    clauses.push({ active: options.actives });
  }
  if (Array.isArray(options.types)) {
    if (options.types.length === 0) return { vide: true, filtre: {} };
    clauses.push({ type: { $in: options.types } });
  }
  if (options.regionId !== undefined && options.regionId !== null) {
    clauses.push({ regionId: options.regionId });
  }
  if (Array.isArray(options.regionIds)) {
    if (options.regionIds.length === 0) return { vide: true, filtre: {} };
    clauses.push({ regionId: { $in: options.regionIds } });
  }
  if (clauses.length === 0) return { vide: false, filtre: {} };
  return { vide: false, filtre: clauses.length === 1 ? clauses[0] : { $and: clauses } };
}

export async function lister(options = {}) {
  const { vide, filtre } = construireFiltre(options);
  if (vide) return [];
  const tri = options.trierParLabel === true ? { label: 1, _id: 1 } : { _id: 1 };
  return Structure.find(filtre).sort(tri).lean();
}

export async function trouverParType(type) {
  const resultats = await Structure.find({ type }).sort({ _id: 1 }).limit(1).lean();
  return resultats.length > 0 ? resultats[0] : null;
}

export async function trouverParCode(code) {
  return Structure.findOne({ code }).lean();
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  return Structure.findById(id).lean();
}

// Ajout étape 40 : ids invalides et en double ignorés, [] pour une liste
// vide ou sans id valide, ordre de création (_id croissant).
export async function listerParIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const valides = [...new Set(ids.filter((id) => estIdValide(id)))];
  if (valides.length === 0) return [];
  return Structure.find({ _id: { $in: valides } }).sort({ _id: 1 }).lean();
}

export async function listerParCodes(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  return Structure.find({ code: { $in: codes } }).sort({ _id: 1 }).lean();
}

export async function creerSiAbsent(doc) {
  const existante = await Structure.findOne({ code: doc.code }).lean();
  if (existante) return { structure: existante, cree: false };
  try {
    const cree = await Structure.create({
      code: doc.code,
      label: doc.label,
      type: doc.type,
      regionId: doc.regionId,
      active: doc.active,
    });
    return { structure: cree.toObject(), cree: true };
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function insererPlusieurs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  try {
    const creees = await Structure.insertMany(docs);
    return creees.map((d) => d.toObject());
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  await Structure.deleteMany({});
}

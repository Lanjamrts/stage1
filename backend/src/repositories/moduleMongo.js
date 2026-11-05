"use strict";

// Modules sur MongoDB : documents lean tels quels (aucune conversion, l'_id
// reste un ObjectId, fields reste l'objet JS stocké tel quel).

import Module from '../models/Module.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';

// Liste blanche des champs modifiables par mettreAJour : tout autre champ
// lève une Error explicite.
const CHAMPS_MODIFIABLES = new Set([
  'label',
  'periodicity',
  'allowedPeriodicities',
  'kind',
  'structureTypes',
  'fields',
  'version',
  'active',
]);

function verifierChamps(champs) {
  const inconnus = Object.keys(champs).filter((cle) => !CHAMPS_MODIFIABLES.has(cle));
  if (inconnus.length > 0) {
    throw new Error(`Champ non modifiable : ${inconnus.join(', ')}`);
  }
}

function construireFiltre({ actifs, typeStructure, codes } = {}) {
  const clauses = [];
  if (actifs !== undefined && actifs !== null) {
    clauses.push({ active: actifs === true });
  }
  if (typeStructure !== undefined && typeStructure !== null) {
    clauses.push({ structureTypes: typeStructure });
  }
  if (Array.isArray(codes)) {
    if (codes.length === 0) return { vide: true, filtre: {} };
    clauses.push({ code: { $in: codes } });
  }
  if (clauses.length === 0) return { vide: false, filtre: {} };
  return { vide: false, filtre: clauses.length === 1 ? clauses[0] : { $and: clauses } };
}

export async function lister(options = {}) {
  const { vide, filtre } = construireFiltre(options);
  if (vide) return [];
  return Module.find(filtre).sort({ code: 1 }).lean();
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  return Module.findById(id).lean();
}

export async function trouverParCode(code) {
  return Module.findOne({ code }).lean();
}

export async function creer(doc) {
  try {
    const cree = await Module.create(doc);
    return cree.toObject();
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJour(id, champs = {}) {
  verifierChamps(champs);
  if (!estIdValide(id)) return null;
  if (Object.keys(champs).length === 0) return Module.findById(id).lean();
  // $set remplace entièrement les tableaux fournis (allowedPeriodicities,
  // structureTypes) : exactement le remplacement des lignes enfants Oracle.
  return Module.findOneAndUpdate({ _id: id }, { $set: champs }, { new: true }).lean();
}

export async function supprimer(id) {
  if (!estIdValide(id)) return false;
  const resultat = await Module.deleteOne({ _id: id });
  return resultat.deletedCount > 0;
}

export async function assurer(doc) {
  const existante = await Module.findOne({ code: doc.code }).lean();
  if (existante) return { module: existante, cree: false };
  try {
    const cree = await Module.create(doc);
    return { module: cree.toObject(), cree: true };
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJourFields(code, fields) {
  const resultat = await Module.updateOne({ code }, { $set: { fields } });
  return resultat.matchedCount > 0;
}

export async function completerPeriodicitesAutorisees(code, valeurs) {
  const module = await Module.findOne({ code }).lean();
  if (!module) return false;
  // « Aucune périodicité enregistrée » : champ absent (Mongoose remplit le
  // défaut [] : les deux se confondent, voir DECISIONS.md [P39]).
  const actuelles = module.allowedPeriodicities;
  if (actuelles != null && actuelles.length > 0) return false;
  const nouvelles = [...new Set(Array.isArray(valeurs) ? valeurs : [])];
  if (nouvelles.length === 0) return false;
  const resultat = await Module.updateOne({ code }, { $set: { allowedPeriodicities: nouvelles } });
  return resultat.matchedCount > 0;
}

export async function supprimerTout() {
  await Module.deleteMany({});
}

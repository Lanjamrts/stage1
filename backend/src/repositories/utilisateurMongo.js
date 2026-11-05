"use strict";

// Utilisateurs sur MongoDB : documents lean tels quels (aucune conversion,
// l'_id reste un ObjectId, structureId un ObjectId ou l'objet peuplé
// { _id, label } dans listerAvecStructure).

import Utilisateur from '../models/Utilisateur.js';
import Structure from '../models/Structure.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';

// Liste blanche des champs modifiables : tout autre champ lève une Error
// explicite (jamais de mise à jour silencieuse d'un champ inconnu).
const CHAMPS_MODIFIABLES = new Set([
  'nom',
  'prenom',
  'direction',
  'service',
  'role',
  'structureId',
  'passwordHash',
  'status',
  'mustChangePassword',
  'failedAttempts',
  'lockedUntil',
]);

function verifierChamps(champs) {
  const inconnus = Object.keys(champs).filter((cle) => !CHAMPS_MODIFIABLES.has(cle));
  if (inconnus.length > 0) {
    throw new Error(`Champ non modifiable : ${inconnus.join(', ')}`);
  }
}

// q est pris LITTÉRALEMENT : les métacaractères regex sont échappés (les
// jokers % et _ ne sont pas des métacaractères regex : littéraux d'office).
function echapperRegex(texte) {
  return String(texte).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function construireFiltre({ role, status, structureId, q } = {}) {
  const clauses = [];
  if (role) clauses.push({ role });
  if (status) clauses.push({ status });
  if (structureId) clauses.push({ structureId });
  if (q !== undefined && q !== null && q !== '') {
    const rx = new RegExp(echapperRegex(q), 'i');
    clauses.push({ $or: [{ im: rx }, { nom: rx }, { prenom: rx }] });
  }
  if (clauses.length === 0) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

// Tri commun : nom, puis prenom, puis création (dégagement des égalités).
const TRI = { nom: 1, prenom: 1, _id: 1 };

async function peuplerStructures(docs) {
  const ids = [...new Set(docs.map((d) => d.structureId).filter((v) => v != null).map(String))];
  const structures = ids.length > 0 ? await Structure.find({ _id: { $in: ids } }).select('label').lean() : [];
  const parId = new Map(structures.map((s) => [String(s._id), s]));
  return docs.map((d) => {
    if (d.structureId == null) return { ...d, structureId: null };
    const structure = parId.get(String(d.structureId));
    return { ...d, structureId: structure ? { _id: d.structureId, label: structure.label } : null };
  });
}

export async function listerAvecStructure({ role, status, structureId, q, limite } = {}) {
  const filtre = construireFiltre({ role, status, structureId, q });
  const max = limite === undefined || limite === null ? 500 : limite;
  const docs = await Utilisateur.find(filtre).sort(TRI).limit(max).lean();
  return peuplerStructures(docs);
}

export async function listerParRole(role) {
  return Utilisateur.find({ role }).sort(TRI).lean();
}

export async function rechercher(q) {
  const rx = new RegExp(echapperRegex(q == null ? '' : q), 'i');
  return Utilisateur.find({ $or: [{ im: rx }, { nom: rx }, { prenom: rx }] }).sort(TRI).lean();
}

export async function trouverParRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const ids = refs.filter((ref) => estIdValide(ref));
  const ims = refs.filter((ref) => typeof ref === 'string');
  const clauses = [];
  if (ids.length > 0) clauses.push({ _id: { $in: ids } });
  if (ims.length > 0) clauses.push({ im: { $in: ims } });
  if (clauses.length === 0) return [];
  return Utilisateur.find({ $or: clauses }).sort({ _id: 1 }).lean();
}

export async function trouverParId(id) {
  if (!estIdValide(id)) return null;
  return Utilisateur.findById(id).lean();
}

export async function trouverParIm(im) {
  return Utilisateur.findOne({ im }).lean();
}

export async function trouverPremierParRole(role) {
  return Utilisateur.findOne({ role }).sort({ _id: 1 }).lean();
}

export async function creer(doc) {
  try {
    const cree = await Utilisateur.create(doc);
    return cree.toObject();
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJour(id, champs = {}) {
  verifierChamps(champs);
  if (!estIdValide(id)) return null;
  if (Object.keys(champs).length === 0) return Utilisateur.findById(id).lean();
  return Utilisateur.findOneAndUpdate({ _id: id }, { $set: champs }, { new: true }).lean();
}

export async function mettreAJourParIm(im, champs = {}) {
  verifierChamps(champs);
  if (Object.keys(champs).length === 0) return;
  await Utilisateur.updateOne({ im }, { $set: champs });
}

export async function debloquerExpires(maintenant) {
  // $ne : null indispensable : $lte seul matche aussi les lockedUntil null
  // (bracketing de types MongoDB : null < date).
  const resultat = await Utilisateur.updateMany(
    { lockedUntil: { $ne: null, $lte: maintenant } },
    { $set: { lockedUntil: null, failedAttempts: 0 } }
  );
  return resultat.modifiedCount;
}

export async function supprimerTout() {
  await Utilisateur.deleteMany({});
}

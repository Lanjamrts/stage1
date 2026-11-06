"use strict";

// Remarques sur MongoDB : documents lean tels quels (l'_id et authorId
// restent des ObjectId). Avec { avecAuteur: true }, authorId est remplacé
// par l'utilisateur SANS passwordHash (ou null si l'utilisateur est absent).

import Remarque from '../models/Remarque.js';
import { estIdValide } from './ids.js';

// Tri commun : createdAt décroissant, puis création décroissante (dégagement
// des égalités).
const TRI = { createdAt: -1, _id: -1 };

function sansPasswordHash(utilisateur) {
  if (!utilisateur || typeof utilisateur !== 'object') return utilisateur;
  if (!('passwordHash' in utilisateur)) return utilisateur;
  const { passwordHash, ...reste } = utilisateur;
  return reste;
}

function postLecture(docs, avecAuteur) {
  if (!avecAuteur) return docs;
  return docs.map((doc) => ({
    ...doc,
    authorId: sansPasswordHash(doc.authorId),
  }));
}

function construireRequete(filtre, { avecAuteur, limite } = {}) {
  let requete = Remarque.find(filtre).sort(TRI);
  if (limite !== undefined && limite !== null) requete = requete.limit(limite);
  if (avecAuteur) requete = requete.populate('authorId');
  return requete;
}

export async function creer({ authorId, context, text, state } = {}) {
  const cree = await Remarque.create({
    authorId,
    context,
    text,
    state: state === undefined || state === null ? 'nouvelle' : state,
  });
  return cree.toObject();
}

export async function lister(options = {}) {
  const docs = await construireRequete({}, options).lean();
  return postLecture(docs, options.avecAuteur === true);
}

export async function listerParAuteur(authorId, options = {}) {
  if (!estIdValide(authorId)) return [];
  const docs = await construireRequete({ authorId }, options).lean();
  return postLecture(docs, options.avecAuteur === true);
}

export async function changerEtat(id, etat) {
  if (!estIdValide(id)) return null;
  const doc = await Remarque.findOneAndUpdate({ _id: id }, { $set: { state: etat } }, { new: true }).lean();
  return doc || null;
}

export async function supprimerTout() {
  await Remarque.deleteMany({});
}

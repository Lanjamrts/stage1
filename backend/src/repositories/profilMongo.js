"use strict";

// Profils sur MongoDB : logique Mongoose déplacée telle quelle depuis
// backend/src/seed/common.js et backend/src/scripts/create-admin.js.

import Profil from '../models/Profil.js';

export async function assurer({ code, label }) {
  const existing = await Profil.findOne({ code }).lean();
  if (existing) return false;
  await Profil.create({ code, label });
  return true;
}

export async function trouverParCode(code) {
  const doc = await Profil.findOne({ code }).lean();
  return doc ? { code: doc.code, label: doc.label } : null;
}

export async function supprimerTout() {
  await Profil.deleteMany({});
}

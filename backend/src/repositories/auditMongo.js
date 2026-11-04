"use strict";

// Journal d'audit sur MongoDB : logique Mongoose déplacée telle quelle depuis
// backend/src/controllers/auditController.js et backend/src/middleware/auth.js.

import JournalAudit from '../models/JournalAudit.js';

let indexesEnsured = false;
async function ensureIndexes() {
  if (indexesEnsured) return;
  try {
    await JournalAudit.collection.createIndex({ createdAt: -1 });
    await JournalAudit.collection.createIndex({ userId: 1, createdAt: -1 });
    indexesEnsured = true;
  } catch (e) {
    // Les index sont optionnels : l'absence ne doit pas bloquer la lecture.
  }
}

// Échappement des caractères spéciaux d'une expression régulière (identique à la
// recherche q du contrôleur).
function regexTexte(texte) {
  const escaped = texte.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

export async function ajouter({ userRef, action, objet, ip, createdAt }) {
  await ensureIndexes();
  await JournalAudit.create({
    userId: userRef,
    action,
    object: objet,
    ip,
    createdAt: createdAt || new Date(),
  });
}

export async function lister({ actions, depuis, jusqu, userRefsIn, objetContient, page = 1, limit = 50 } = {}) {
  await ensureIndexes();

  const filter = {};

  if (Array.isArray(actions)) {
    filter.action = { $in: actions };
  }

  if (depuis || jusqu) {
    filter.createdAt = {};
    if (depuis) filter.createdAt.$gte = depuis;
    if (jusqu) filter.createdAt.$lte = jusqu;
  }

  // Groupe OU : objet contient le texte ET/OU utilisateur membre de la liste.
  const orClauses = [];
  if (objetContient) {
    orClauses.push({ object: regexTexte(objetContient) });
  }
  if (Array.isArray(userRefsIn)) {
    orClauses.push({ userId: { $in: userRefsIn } });
  }
  if (orClauses.length > 0) {
    filter.$or = orClauses;
  }

  const total = await JournalAudit.countDocuments(filter);

  const rows = await JournalAudit.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    total,
    lignes: rows.map((r) => ({
      id: String(r._id),
      createdAt: r.createdAt,
      action: r.action,
      userRef: r.userId,
      objet: r.object,
      ip: r.ip,
    })),
  };
}

export async function supprimerTout() {
  await JournalAudit.deleteMany({});
}

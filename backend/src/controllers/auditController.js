"use strict";
import { z } from 'zod';

import JournalAudit from '../models/JournalAudit.js';
import Utilisateur from '../models/Utilisateur.js';

const ROLES = ['client', 'admin2', 'admin1', 'developpeur', 'consultant'];

// Actions de journal (SPEC §8) : valeur unique ou liste séparée par des virgules.
const ACTION_MAX = 10;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().min(1).max(64).optional(),
  userId: z.string().trim().min(1).max(64).optional(),
  action: z.string().trim().min(1).max(64).optional(),
  role: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  sinceMinutes: z.coerce.number().int().min(1).max(43200).optional(),
});

function startOfDay(value) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(value) {
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isObjectIdString(value) {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

// Intersection de plusieurs listes d'identifiants (filtres role/q/userId en ET).
function intersectIdLists(lists) {
  if (lists.length === 0) return [];
  let inter = [...new Set(lists[0])];
  for (let i = 1; i < lists.length; i++) {
    const current = new Set(lists[i]);
    inter = inter.filter((id) => current.has(id));
  }
  return inter;
}

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

// GET /api/audit (admin1, developpeur) : lecture seule, filtres, pagination (SPEC §8).
// Le corps reste un TABLEAU ; le total passe par l'en-tête X-Total-Count.
export async function listAudit(req, res) {
  await ensureIndexes();

  const parsed = querySchema.safeParse(req.query || {});
  if (!parsed.success) return res.status(400).json({ message: 'Filtre invalide.' });
  const { page, limit, q, userId, action, role, from, to, sinceMinutes } = parsed.data;

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }

  // Action : valeurs séparées par des virgules (max 10), filtre $in.
  if (action) {
    const values = action.split(',').map((v) => v.trim()).filter(Boolean);
    if (values.length === 0 || values.length > ACTION_MAX) {
      return res.status(400).json({ message: 'Filtre invalide.' });
    }
    for (const v of values) {
      if (v.length < 1 || v.length > 64) {
        return res.status(400).json({ message: 'Filtre invalide.' });
      }
    }
  }

  const filter = {};
  const userIdClauses = []; // listes d'identifiants (IDs et IM) à intersequer
  const orClauses = [];

  if (action) {
    const values = action.split(',').map((v) => v.trim()).filter(Boolean);
    filter.action = { $in: values };
  }

  // Plage de dates (granularité jour) et depuis N minutes.
  let gte, lte;
  if (from) {
    const start = startOfDay(from);
    if (!start) return res.status(400).json({ message: 'Date invalide.' });
    gte = start;
  }
  if (to) {
    const end = endOfDay(to);
    if (!end) return res.status(400).json({ message: 'Date invalide.' });
    lte = end;
  }
  if (sinceMinutes) {
    const since = new Date(Date.now() - sinceMinutes * 60000);
    if (!gte || since > gte) gte = since;
  }
  if (gte && lte && gte > lte) {
    return res.status(400).json({ message: 'Date invalide.' });
  }
  if (gte || lte) {
    filter.createdAt = {};
    if (gte) filter.createdAt.$gte = gte;
    if (lte) filter.createdAt.$lte = lte;
  }

  // Filtre rôle : résout les identifiants (ObjectId en texte ou IM) des utilisateurs du rôle.
  if (role) {
    const users = await Utilisateur.find({ role }).select('_id im').lean();
    userIdClauses.push(users.flatMap((u) => [String(u._id), u.im]));
  }

  // Recherche q : utilisateurs (nom/prénom/IM) ET lignes dont l'objet contient q.
  if (q) {
    const escaped = q.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    orClauses.push({ object: regex });
    const qUsers = await Utilisateur.find({
      $or: [{ nom: regex }, { prenom: regex }, { im: regex }],
    }).select('_id im').lean();
    userIdClauses.push(qUsers.flatMap((u) => [String(u._id), u.im]));
  }

  // Filtre utilisateur exact (identifiant tel que stocké : ObjectId texte ou IM brut).
  if (userId) {
    userIdClauses.push([userId]);
  }

  if (userIdClauses.length > 0) {
    const inter = intersectIdLists(userIdClauses);
    orClauses.push({ userId: { $in: inter } });
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

  // Utilisateurs référencés par la page courante seulement (pas tout le recueil).
  const pageUserIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const oids = pageUserIds.filter(isObjectIdString);
  const ims = pageUserIds.filter((id) => !isObjectIdString(id));
  const orUsers = [];
  if (oids.length) orUsers.push({ _id: { $in: oids } });
  if (ims.length) orUsers.push({ im: { $in: ims } });
  const users = orUsers.length
    ? await Utilisateur.find({ $or: orUsers }).select('im nom prenom role').lean()
    : [];

  const labelById = new Map(users.map((u) => [String(u._id), `${u.prenom} ${u.nom}`]));
  const labelByIm = new Map(users.map((u) => [u.im, `${u.prenom} ${u.nom}`]));
  const roleById = new Map(users.map((u) => [String(u._id), u.role]));
  const roleByIm = new Map(users.map((u) => [u.im, u.role]));

  res.set('X-Total-Count', String(total));
  res.set('Access-Control-Expose-Headers', 'X-Total-Count');
  return res.status(200).json(
    rows.map((r) => ({
      id: String(r._id),
      date: r.createdAt,
      action: r.action,
      userId: r.userId,
      userLabel:
        labelById.get(r.userId) ||
        labelByIm.get(r.userId) ||
        (r.userId ? `Inconnu (IM ${r.userId})` : '–'),
      userRole: roleById.get(r.userId) || roleByIm.get(r.userId) || null,
      object: r.object,
      ip: r.ip,
    }))
  );
}

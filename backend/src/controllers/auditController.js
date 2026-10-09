"use strict";
import { z } from 'zod';

import JournalAudit from '../models/JournalAudit.js';
import Utilisateur from '../models/Utilisateur.js';

const ROLES = ['client', 'admin2', 'admin1', 'developpeur', 'consultant'];

const querySchema = z.object({
  action: z.string().trim().min(1).max(64).optional(),
  role: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

function startOfDay(value) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(value) {
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/audit (admin1, developpeur) : lecture seule, filtres
// action, role, from, to (SPEC §8).
export async function listAudit(req, res) {
  const parsed = querySchema.safeParse(req.query || {});
  if (!parsed.success) return res.status(400).json({ message: 'Filtre invalide.' });
  const { action, role, from, to } = parsed.data;

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }

  const filter = {};
  if (action) filter.action = action;

  if (from || to) {
    filter.createdAt = {};
    if (from) {
      const start = startOfDay(from);
      if (!start) return res.status(400).json({ message: 'Date invalide.' });
      filter.createdAt.$gte = start;
    }
    if (to) {
      const end = endOfDay(to);
      if (!end) return res.status(400).json({ message: 'Date invalide.' });
      filter.createdAt.$lte = end;
    }
    if (from && to && startOfDay(from) > endOfDay(to)) {
      return res.status(400).json({ message: 'Date invalide.' });
    }
  }

  // Filtre rôle : les lignes stockent l'ObjectId (ou l'IM pour les échecs
  // de connexion) — on résout les identifiants des utilisateurs du rôle.
  if (role) {
    const users = await Utilisateur.find({ role }).select('im').lean();
    filter.userId = { $in: users.flatMap((u) => [String(u._id), u.im]) };
  }

  const rows = await JournalAudit.find(filter).sort({ createdAt: -1 }).limit(500).lean();

  // Libellé de l'utilisateur (ObjectId ou IM brut sinon) + profil.
  const allUsers = await Utilisateur.find({}).select('im nom prenom role').lean();
  const labelById = new Map(allUsers.map((u) => [String(u._id), `${u.prenom} ${u.nom}`]));
  const labelByIm = new Map(allUsers.map((u) => [u.im, `${u.prenom} ${u.nom}`]));
  const roleById = new Map(allUsers.map((u) => [String(u._id), u.role]));
  const roleByIm = new Map(allUsers.map((u) => [u.im, u.role]));

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

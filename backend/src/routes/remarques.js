import express from 'express';
import { z } from 'zod';

import Remarque from '../models/Remarque.js';
import { logAudit } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const NOT_FOUND = 'Ressource introuvable.';

const createSchema = z.object({
  context: z.string().trim().min(1, 'Le contexte est obligatoire.').max(200, 'Le contexte ne doit pas dépasser 200 caractères.'),
  text: z.string().trim().min(1, 'Le message est obligatoire.').max(2000, 'Le message ne doit pas dépasser 2000 caractères.'),
});

const etatSchema = z.object({
  etat: z.enum(['nouvelle', 'en_cours', 'traitee'], {
    errorMap: () => ({ message: 'État invalide.' }),
  }),
});

function serialize(r) {
  const o = r.toObject ? r.toObject() : { ...r };
  return {
    id: String(o._id),
    context: o.context,
    text: o.text,
    state: o.state,
    author: o.authorId && typeof o.authorId === 'object'
      ? `${o.authorId.prenom} ${o.authorId.nom}`
      : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

// POST /api/remarques (admin1, admin2) — SPEC §8
router.post(
  '/',
  requireRole(['admin1', 'admin2']),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const remarque = await Remarque.create({
      authorId: req.user._id,
      context: parsed.data.context,
      text: parsed.data.text,
      state: 'nouvelle',
    });
    await logAudit(req.user._id, 'remarque_create', `remarque:${remarque._id}`, req.ip);
    return res.status(201).json({ message: 'Remarque envoyée.', id: String(remarque._id) });
  })
);

// GET /api/remarques/mes (admin1, admin2) — ses propres remarques
router.get(
  '/mes',
  requireRole(['admin1', 'admin2']),
  asyncHandler(async (req, res) => {
    const docs = await Remarque.find({ authorId: req.user._id })
      .populate('authorId')
      .sort({ createdAt: -1 })
      .limit(200);
    return res.status(200).json(docs.map(serialize));
  })
);

// GET /api/remarques (developpeur) — boîte de réception (UI Phase 6)
router.get(
  '/',
  requireRole(['developpeur']),
  asyncHandler(async (req, res) => {
    const docs = await Remarque.find({}).populate('authorId').sort({ createdAt: -1 }).limit(500);
    return res.status(200).json(docs.map(serialize));
  })
);

// PATCH /api/remarques/:id/etat (developpeur) — nouvelle|en_cours|traitee
router.patch(
  '/:id/etat',
  requireRole(['developpeur']),
  asyncHandler(async (req, res) => {
    if (!OBJECT_ID.test(req.params.id)) {
      return res.status(404).json({ message: NOT_FOUND });
    }
    const parsed = etatSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const remarque = await Remarque.findByIdAndUpdate(
      req.params.id,
      { state: parsed.data.etat },
      { new: true }
    );
    if (!remarque) return res.status(404).json({ message: NOT_FOUND });
    await logAudit(req.user._id, 'remarque_state_change', `remarque:${remarque._id}`, req.ip);
    return res.status(200).json({ message: 'État mis à jour.', state: remarque.state });
  })
);

export default router;

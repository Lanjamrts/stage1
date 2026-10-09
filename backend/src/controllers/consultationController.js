"use strict";
import Saisie from '../models/Saisie.js';
import { serializeSaisie } from '../services/serializeSaisie.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// GET /api/consultation (SPEC §8 : consultant uniquement, JSON uniquement,
// exportee et archivee). Filtres module / periode comme la consultation admin2.
export async function listConsultation(req, res) {
  if (req.user.role !== 'consultant') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const clauses = [{ status: { $in: ['exportee', 'archivee'] } }];
  if (req.query.module) {
    if (!OBJECT_ID.test(req.query.module)) {
      return res.status(400).json({ message: 'Filtre invalide.' });
    }
    clauses.push({ moduleId: req.query.module });
  }
  if (req.query.periode) {
    if (!OBJECT_ID.test(req.query.periode)) {
      return res.status(400).json({ message: 'Filtre invalide.' });
    }
    clauses.push({ periodeId: req.query.periode });
  }

  const docs = await Saisie.find({ $and: clauses })
    .populate('moduleId')
    .populate('periodeId')
    .populate('authorId')
    .populate('structureId')
    .sort({ updatedAt: -1 })
    .limit(1000);

  return res
    .status(200)
    .json(docs.map((d) => serializeSaisie(d, req.user, { withFields: false })));
}

"use strict";
import { getSaisieRepository } from '../repositories/saisieRepository.js';
import { estIdValide } from '../repositories/ids.js';
import { serializeSaisie } from '../services/serializeSaisie.js';

// GET /api/consultation (SPEC §8 : consultant uniquement, JSON uniquement,
// exportee et archivee). Filtres module / periode comme la consultation admin2.
export async function listConsultation(req, res) {
  if (req.user.role !== 'consultant') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const options = { statuts: ['exportee', 'archivee'] };
  if (req.query.module) {
    if (!estIdValide(req.query.module)) {
      return res.status(400).json({ message: 'Filtre invalide.' });
    }
    options.moduleId = req.query.module;
  }
  if (req.query.periode) {
    if (!estIdValide(req.query.periode)) {
      return res.status(400).json({ message: 'Filtre invalide.' });
    }
    options.periodeId = req.query.periode;
  }

  const docs = await getSaisieRepository().lister({
    ...options,
    avecLiens: true,
    tri: 'majDesc',
    limite: 1000,
  });

  return res
    .status(200)
    .json(docs.map((d) => serializeSaisie(d, req.user, { withFields: false })));
}

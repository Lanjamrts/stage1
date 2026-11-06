import express from 'express';

import { getPeriodeRepository } from '../repositories/periodeRepository.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// GET /api/periodes — liste des périodes (choix dans la modale « Nouvelle saisie »).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Le dépôt trie déjà start décroissant.
    const periodes = await getPeriodeRepository().lister();
    return res.status(200).json(
      periodes.map((p) => ({
        id: String(p._id),
        label: p.label,
        start: p.start,
        end: p.end,
        deadline: p.deadline,
        periodicity: p.periodicity,
      }))
    );
  })
);

export default router;

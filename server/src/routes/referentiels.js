import express from 'express';

import Referentiel from '../models/Referentiel.js';
import Structure from '../models/Structure.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Types de listes servies en lecture (tous rôles authentifiés).
// 'structures' est un cas particulier : labels des structures actives
// (utilisé par le champ multiselect « structures » du module CRGP).
const REFERENTIAL_TYPES = ['directions', 'services', 'grades', 'epn', 'std', 'structures'];

// GET /api/referentiels/:type
router.get(
  '/:type',
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    if (!REFERENTIAL_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Type de liste invalide.' });
    }
    let values;
    if (type === 'structures') {
      const rows = await Structure.find({ active: true }).sort({ label: 1 }).lean();
      values = rows.map((s) => s.label);
    } else {
      const rows = await Referentiel.find({ type }).sort({ value: 1 }).lean();
      values = rows.map((r) => r.value);
    }
    return res.status(200).json({ type, values });
  })
);

export default router;

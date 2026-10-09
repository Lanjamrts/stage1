import express from 'express';

import Referentiel from '../models/Referentiel.js';
import Structure from '../models/Structure.js';
import Region from '../models/Region.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Types de listes servies en lecture (tous rôles authentifiés).
// 'structures' est un cas particulier : labels des structures actives
// (utilisé par le champ multiselect « structures » du module CRGP) ;
// avec ?full=1 : objets {id, label, type, region} (tiroir Utilisateurs et
// cases régions / types de la page Collecte — Phase 5).
const REFERENTIAL_TYPES = ['directions', 'services', 'grades', 'epn', 'std', 'structures'];

// GET /api/referentiels/:type
router.get(
  '/:type',
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    if (!REFERENTIAL_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Type de liste invalide.' });
    }
    if (type === 'structures') {
      const rows = await Structure.find({ active: true }).sort({ label: 1 }).lean();
      if (req.query.full === '1') {
        const regions = await Region.find({}).lean();
        const regionName = new Map(regions.map((r) => [String(r._id), r.name]));
        return res.status(200).json({
          type,
          items: rows.map((s) => ({
            id: String(s._id),
            label: s.label,
            type: s.type,
            region: s.regionId ? regionName.get(String(s.regionId)) || null : null,
          })),
        });
      }
      return res.status(200).json({ type, values: rows.map((s) => s.label) });
    }
    const rows = await Referentiel.find({ type }).sort({ value: 1 }).lean();
    return res.status(200).json({ type, values: rows.map((r) => r.value) });
  })
);

export default router;

import express from 'express';
import { z } from 'zod';

import Referentiel from '../models/Referentiel.js';
import Structure from '../models/Structure.js';
import Region from '../models/Region.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Types de listes servies en lecture (tous rôles authentifiés).
// 'structures' et 'regions' sont des cas particuliers (collections dédiées,
// lecture seule ici) ; 'structures' avec ?full=1 renvoie {id,label,type,region}
// (tiroir Utilisateurs, cases régions/types de la page Collecte — Phase 5).
const REFERENTIAL_TYPES = ['directions', 'services', 'grades', 'epn', 'std', 'ministeres', 'structures', 'regions'];

// Types modifiables par le developpeur (SPEC §8 : POST|PUT|PATCH).
// Régions, Structures et Périodes n'ont pas d'API d'écriture → lecture seule.
const EDITABLE_TYPES = ['directions', 'services', 'grades', 'epn', 'std'];

const valueSchema = z.object({
  value: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .trim()
    .min(1, 'Ce champ est obligatoire.')
    .max(200, 'Valeur trop longue.'),
});

const renameSchema = z.object({
  value: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .trim()
    .min(1, 'Ce champ est obligatoire.')
    .max(200, 'Valeur trop longue.'),
  newValue: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .trim()
    .min(1, 'Ce champ est obligatoire.')
    .max(200, 'Valeur trop longue.'),
});

// ------------------------------------------------------------------ lecture
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
    if (type === 'regions') {
      const rows = await Region.find({}).sort({ name: 1 }).lean();
      return res.status(200).json({ type, values: rows.map((r) => r.name) });
    }
    const rows = await Referentiel.find({ type }).sort({ value: 1 }).lean();
    if (type === 'epn') {
      return res.status(200).json({
        type,
        values: rows.map((r) => r.value),
        items: rows.map((r) => ({
          value: r.value,
          ministere: r.ministere || '',
          regime: r.regime || '',
          acronyme: r.acronyme || '',
        })),
      });
    }
    return res.status(200).json({ type, values: rows.map((r) => r.value) });
  })
);

// ------------------------------------------------------------------ écriture
// POST|PUT|PATCH /api/referentiels/:type — developpeur uniquement (SPEC §8).
router.use((req, res, next) => {
  const check = requireRole(['developpeur']);
  check(req, res, next);
});

function checkEditable(req, res) {
  const { type } = req.params;
  if (!EDITABLE_TYPES.includes(type)) {
    res.status(400).json({ message: 'Ce type de liste n\'est pas modifiable.' });
    return false;
  }
  return true;
}

// POST : ajoute une valeur
router.post(
  '/:type',
  asyncHandler(async (req, res) => {
    if (!checkEditable(req, res)) return undefined;
    const parsed = valueSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const { type } = req.params;
    const existing = await Referentiel.findOne({ type, value: parsed.data.value }).lean();
    if (existing) return res.status(409).json({ message: 'Cette valeur existe déjà.' });
    const doc = await Referentiel.create({ type, value: parsed.data.value });
    return res.status(201).json({ type, value: doc.value });
  })
);

// PUT / PATCH : renomme une valeur (mêmes deux corps de requête)
const renameHandler = asyncHandler(async (req, res) => {
  if (!checkEditable(req, res)) return undefined;
  const parsed = renameSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  const { type } = req.params;
  const { value, newValue } = parsed.data;
  const doc = await Referentiel.findOne({ type, value });
  if (!doc) return res.status(404).json({ message: 'Ressource introuvable.' });
  if (value !== newValue) {
    const dup = await Referentiel.findOne({ type, value: newValue }).lean();
    if (dup) return res.status(409).json({ message: 'Cette valeur existe déjà.' });
    doc.value = newValue;
    await doc.save();
  }
  return res.status(200).json({ type, value: doc.value });
});

router.put('/:type', renameHandler);
router.patch('/:type', renameHandler);

export default router;

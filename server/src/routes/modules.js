import express from 'express';

import Module from '../models/Module.js';
import Structure from '../models/Structure.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// GET /api/modules
// client : uniquement les modules autorisés pour le type de sa structure
// developpeur : tous (y compris inactifs — il gère les gabarits)
// autres rôles : modules actifs (métadonnées pour tableaux de bord)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    let filter = {};
    let withFields = false;

    if (user.role === 'client') {
      const structure = await Structure.findById(user.structureId).lean();
      if (!structure) return res.status(404).json({ message: 'Structure introuvable.' });
      filter = { active: true, structureTypes: structure.type };
      withFields = true; // le client remplit le formulaire
    } else if (user.role === 'developpeur') {
      filter = {};
      withFields = true;
    } else {
      filter = { active: true };
    }

    const modules = await Module.find(filter).sort({ code: 1 }).lean();
    return res.status(200).json(
      modules.map((m) => ({
        id: String(m._id),
        code: m.code,
        label: m.label,
        kind: m.kind,
        periodicity: m.periodicity,
        structureTypes: m.structureTypes,
        version: m.version,
        active: m.active,
        ...(withFields ? { fields: m.fields } : {}),
      }))
    );
  })
);

// GET /api/modules/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(404).json({ message: 'Module introuvable.' });
    }
    const m = await Module.findById(id).lean();
    if (!m) return res.status(404).json({ message: 'Module introuvable.' });

    const user = req.user;
    if (user.role === 'client') {
      const structure = await Structure.findById(user.structureId).lean();
      if (!structure || !m.structureTypes.includes(structure.type) || !m.active) {
        return res.status(404).json({ message: 'Module introuvable.' });
      }
    }
    if (user.role === 'consultant' && !m.active) {
      return res.status(404).json({ message: 'Module introuvable.' });
    }

    return res.status(200).json({
      id: String(m._id),
      code: m.code,
      label: m.label,
      kind: m.kind,
      periodicity: m.periodicity,
      structureTypes: m.structureTypes,
      version: m.version,
      active: m.active,
      fields: m.fields,
    });
  })
);

export default router;

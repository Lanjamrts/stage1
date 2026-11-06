import express from 'express';

import { getModuleRepository } from '../repositories/moduleRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { estIdValide } from '../repositories/ids.js';
import { MODULES } from '../seed/modules.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { acceptedPeriodicities } from '../utils/periodicity.js';

const BUILTIN_CODES = new Set(MODULES.map((m) => m.code));

const router = express.Router();

// GET /api/modules
// client : uniquement les modules autorisés pour le type de sa structure
// developpeur : tous (y compris inactifs — il gère les gabarits)
// autres rôles : modules actifs (métadonnées pour tableaux de bord)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    let options = {};
    let withFields = false;

    if (user.role === 'client') {
      const structure = await getStructureRepository().trouverParId(String(user.structureId));
      if (!structure) return res.status(404).json({ message: 'Structure introuvable.' });
      options = { actifs: true, typeStructure: structure.type };
      withFields = true; // le client remplit le formulaire
    } else if (user.role === 'developpeur') {
      options = {};
      withFields = true;
    } else {
      options = { actifs: true };
    }

    // Le dépôt trie déjà par code croissant.
    const modules = await getModuleRepository().lister(options);
    return res.status(200).json(
      modules.map((m) => ({
        id: String(m._id),
        code: m.code,
        label: m.label,
        kind: m.kind,
        periodicity: m.periodicity,
        allowedPeriodicities: acceptedPeriodicities(m),
        structureTypes: m.structureTypes,
        version: m.version,
        active: m.active,
        builtin: BUILTIN_CODES.has(m.code),
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
    if (!estIdValide(id)) {
      return res.status(404).json({ message: 'Module introuvable.' });
    }
    const m = await getModuleRepository().trouverParId(id);
    if (!m) return res.status(404).json({ message: 'Module introuvable.' });

    const user = req.user;
    if (user.role === 'client') {
      const structure = await getStructureRepository().trouverParId(String(user.structureId));
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
      allowedPeriodicities: acceptedPeriodicities(m),
      structureTypes: m.structureTypes,
      version: m.version,
      active: m.active,
      builtin: BUILTIN_CODES.has(m.code),
      fields: m.fields,
    });
  })
);

export default router;

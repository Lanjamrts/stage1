import express from 'express';

import {
  listSaisies,
  getSaisie,
  getHistorique,
  createSaisie,
  updateSaisie,
  soumettreSaisie,
  validerSaisie,
  rejeterSaisie,
  exporterSaisie,
} from '../controllers/saisieController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Liste et détail d'abord (avant /:id pour éviter les collisions de routes)
router.get('/', asyncHandler(listSaisies));
router.get('/:id/historique', asyncHandler(getHistorique));

// Création / édition / soumission (client)
router.post('/', asyncHandler(createSaisie));
router.put('/:id', asyncHandler(updateSaisie));
router.post('/:id/soumettre', asyncHandler(soumettreSaisie));

// Transitions admin2 (SPEC §2)
router.post('/:id/valider', asyncHandler(validerSaisie));
router.post('/:id/rejeter', asyncHandler(rejeterSaisie));
router.post('/:id/exporter', asyncHandler(exporterSaisie));

router.get('/:id', asyncHandler(getSaisie));

export default router;

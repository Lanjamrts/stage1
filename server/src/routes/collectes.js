import express from 'express';

import { listCollecte, exportCollecte } from '../controllers/collecteController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// GET /api/collecte (admin1 : toutes régions, admin2 : région forcée)
router.get('/', asyncHandler(listCollecte));

// GET /api/collecte/export?format=xlsx|pdf (uniquement exportee + archivee)
router.get('/export', asyncHandler(exportCollecte));

export default router;

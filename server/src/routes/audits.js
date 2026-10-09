import express from 'express';

import { listAudit } from '../controllers/auditController.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// GET /api/audit (SPEC §8 : admin1, developpeur ; lecture seule)
router.get('/', requireRole(['admin1', 'developpeur']), asyncHandler(listAudit));

export default router;

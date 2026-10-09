import express from 'express';

import { getDashboard } from '../controllers/dashboardController.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// GET /api/dashboard?module=&periode= (SPEC §8 : admin1 et consultant)
router.get('/', requireRole(['admin1', 'consultant']), asyncHandler(getDashboard));

export default router;

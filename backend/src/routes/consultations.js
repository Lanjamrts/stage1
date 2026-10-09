import express from 'express';

import { listConsultation } from '../controllers/consultationController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// GET /api/consultation (consultant uniquement, JSON uniquement)
router.get('/', asyncHandler(listConsultation));

export default router;

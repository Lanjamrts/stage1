import express from 'express';

import {
  listUsers,
  createUser,
  updateProfil,
  desactiverUser,
  reinitialiserMdp,
} from '../controllers/userController.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// API utilisateurs — admin1 uniquement (SPEC §8)
router.use(requireRole(['admin1']));

router.get('/', asyncHandler(listUsers));
router.post('/', asyncHandler(createUser));
router.patch('/:id/profil', asyncHandler(updateProfil));
router.post('/:id/desactiver', asyncHandler(desactiverUser));
router.post('/:id/reinitialiser-mdp', asyncHandler(reinitialiserMdp));

export default router;

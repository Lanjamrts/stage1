import express from 'express';
import rateLimit from 'express-rate-limit';

import { login, logout, me, changePassword, refresh } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const isTest = process.env.NODE_ENV === 'test';

// Rate limit spécifique pour login (désactivé en test).
// 20/5min : assez élevé pour que le verrouillage de compte (5 échecs) soit
// visible par l'utilisateur avant d'être limité par IP.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTest ? 100000 : 20,
  message: 'Trop de tentatives de connexion, veuillez réessayer plus tard.',
});

// Wrapper pour que les erreurs async renvoient une réponse 500 au lieu de planter
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/auth/login
router.post('/login', loginLimiter, asyncHandler(login));

// SPEC §5 : jusqu'au changement, toute autre route que change-password et
// logout renvoie 403 PASSWORD_CHANGE_REQUIRED (donc /me et /refresh sont
// stricts ; logout et change-password restent accessibles).
router.post('/logout', requireAuth({ allowPasswordChange: true }), asyncHandler(logout));

router.get('/me', requireAuth(), asyncHandler(me));

// POST /api/auth/refresh : prolongation glissante de la session
router.post('/refresh', requireAuth(), asyncHandler(refresh));

// POST /api/auth/change-password
router.post('/change-password', requireAuth({ allowPasswordChange: true }), asyncHandler(changePassword));

export default router;

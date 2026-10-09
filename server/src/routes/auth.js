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

// Toutes les routes ci-dessous nécessitent une authentification.
// allowPasswordChange : logout/me/change-password doivent rester accessibles
// même si mustChangePassword est vrai (voir SPEC §5).
router.use(requireAuth({ allowPasswordChange: true }));

// POST /api/auth/logout
router.post('/logout', asyncHandler(logout));

// POST /api/auth/me
router.get('/me', asyncHandler(me));

// POST /api/auth/refresh : prolongation glissante de la session
router.post('/refresh', asyncHandler(refresh));

// POST /api/auth/change-password
router.post('/change-password', asyncHandler(changePassword));

export default router;

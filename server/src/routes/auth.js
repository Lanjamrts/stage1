import express from 'express';
import rateLimit from 'express-rate-limit';

import { login, logout, me, changePassword } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const isTest = process.env.NODE_ENV === 'test';

// Rate limit spécifique pour login (désactivé en environnement de test)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTest ? 100000 : 5,
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

// GET /api/auth/me
router.get('/me', asyncHandler(me));

// POST /api/auth/change-password
router.post('/change-password', asyncHandler(changePassword));

export default router;

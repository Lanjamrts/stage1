import express from 'express';
import rateLimit from 'express-rate-limit';
import { getConfig } from '../config.js';

import { login, logout, me, changePassword, refresh } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const config = getConfig();

const router = express.Router();

// Rate limit spécifique pour login (désactivé en test).
// IP-wide limit is deliberately generous because offices share one IP; brute force on one account is stopped by the 5-failures account lock.
const loginLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: config.NODE_ENV === 'test' ? 100000 : config.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ code: 'RATE_LIMITED', message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' }),
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
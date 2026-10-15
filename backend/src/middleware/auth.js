"use strict";
import jwt from 'jsonwebtoken';
import UtilisateurModel from '../models/Utilisateur.js';
import { setSessionCookie } from '../services/auth.js';
import { getConfig } from '../config.js';

const { JWT_SECRET } = getConfig();

// Middleware : vérifier le token depuis le cookie httpOnly 'token'
// options.allowPasswordChange : autorise les routes logout/me/change-password
// quand mustChangePassword est vrai (les autres routes restent en 403).
export function requireAuth(options = {}) {
  const { allowPasswordChange = false } = options;
  return async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide' });
    }

    // Recharger l'utilisateur depuis la base pour vérifier le statut
    let utilisateur;
    try {
      utilisateur = await UtilisateurModel.findById(decoded.id);
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide' });
    }
    if (!utilisateur || utilisateur.status === 'desactive') {
      return res.status(403).json({ message: 'Ce compte est désactivé. Contactez votre administrateur.' });
    }

    // Vérifier si l'utilisateur doit changer son mot de passe
    if (utilisateur.mustChangePassword && !allowPasswordChange) {
      return res.status(403).json({ message: 'Changement de mot de passe requis', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    // Vérifier si le compte est verrouillé
    if (utilisateur.lockedUntil && utilisateur.lockedUntil > Date.now()) {
      return res.status(403).json({ message: 'Votre compte est temporairement verrouillé', code: 'ACCOUNT_LOCKED' });
    }

    // Expiration glissante (SPEC §5) : chaque requête authentifiée prolonge le
    // cookie et le JWT de SESSION_TIMEOUT_MINUTES (délai d'inactivité .env).
    setSessionCookie(res, utilisateur);

    req.user = utilisateur;
    next();
  };
}

// Middleware : vérifier le rôle autorisé
export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès refusé : rôle non autorisé', code: 'ROLE_FORBIDDEN' });
    }
    next();
  };
}

// Helper pour écrire les lignes d'audit
export async function logAudit(userId, action, object, ip) {
  try {
    await (await import('../models/JournalAudit.js')).default.create({
      userId: userId ? String(userId) : 'unknown',
      action,
      object,
      ip: ip || 'unknown',
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Erreur lors de l'écriture de la ligne d'audit:", error);
  }
}
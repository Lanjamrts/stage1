"use strict";
import jwt from 'jsonwebtoken';
import UtilisateurModel from '../models/Utilisateur.js';
import dotenv from 'dotenv';

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-sigbd-2026';

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
    const utilisateur = await UtilisateurModel.findById(decoded.id);
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

// Helper de périmètre : même structure (pour client)
export async function sameStructure(req, res, next) {
  // Pour une démo, supposer que req.user.structureId correspond à la structure de la ressource si elle est présente
  // Pourrait être implémenté via une vérification de chemin ou un middleware réutilisable.
  // Pour l'instant, permettre tout.
  next();
}

// Helper de périmètre : même région (pour admin2)
export async function sameRegion(req, res, next) {
  // Pourrait vérifier si la structure de la requête appartient à la même région
  next();
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

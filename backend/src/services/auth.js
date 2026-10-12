"use strict";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import UtilisateurModel from '../models/Utilisateur.js';
import { getConfig } from '../config.js';

const { JWT_SECRET, SESSION_TIMEOUT_MINUTES, NODE_ENV } = getConfig();
export { SESSION_TIMEOUT_MINUTES };
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

// Hashage de mot de passe
export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// Vérification de mot de passe
export async function comparePassword(password, passwordHash) {
  return await bcrypt.compare(password, passwordHash);
}

// Génération de token JWT
export function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      im: user.im,
      role: user.role,
      structureId: user.structureId,
      exp: Math.floor(Date.now() / 1000) + SESSION_TIMEOUT_MINUTES * 60,
    },
    JWT_SECRET
  );
}

// Pose le cookie de session httpOnly (durée = délai d'inactivité, configurable
// dans .env via SESSION_TIMEOUT_MINUTES). Utilisé par login, refresh et le
// glissement de session à chaque requête authentifiée.
export function setSessionCookie(res, user) {
  res.cookie('token', generateToken(user), {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: SESSION_TIMEOUT_MINUTES * 60 * 1000,
    secure: NODE_ENV === 'production',
  });
}

// Vérification du token (middleware d'authentification)
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Gestion des tentatives échouées et du verrouillage
export async function handleFailedAttempt(im) {
  const utilisateur = await UtilisateurModel.findOne({ im });
  if (!utilisateur) return;

  utilisateur.failedAttempts = (utilisateur.failedAttempts || 0) + 1;

  if (utilisateur.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    utilisateur.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
  }

  await utilisateur.save();
}

export async function resetFailedAttempts(im) {
  await UtilisateurModel.updateOne({ im }, { failedAttempts: 0, lockedUntil: null });
}

export function isAccountLocked(utilisateur) {
  return utilisateur.lockedUntil && utilisateur.lockedUntil > Date.now();
}

// Déblocage automatique si le temps est écoulé (appelée périodiquement)
export async function unlockExpiredAccounts() {
  const now = Date.now();
  await UtilisateurModel.updateMany(
    { lockedUntil: { $lte: new Date(now) } },
    { lockedUntil: null, failedAttempts: 0 }
  );
}

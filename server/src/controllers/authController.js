"use strict";
import bcrypt from 'bcrypt';
import UtilisateurModel from '../models/Utilisateur.js';
import { hashPassword, comparePassword, generateToken, handleFailedAttempt, resetFailedAttempts, isAccountLocked } from '../services/auth.js';
import { logAudit } from '../middleware/auth.js';

export async function login(req, res) {
  const { im, password } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;

  if (!im || !password) {
    await logAudit(null, 'login_failure', 'login', clientIP);
    return res.status(400).json({ message: 'Identifiant ou mot de passe incorrect.' });
  }

  const utilisateur = await UtilisateurModel.findOne({ im });
  if (!utilisateur) {
    await logAudit(im, 'login_failure', 'utilisateur', clientIP);
    return res.status(400).json({ message: 'Identifiant ou mot de passe incorrect.' });
  }

  if (utilisateur.status === 'desactive') {
    await logAudit(im, 'login_failure_desactive', 'utilisateur', clientIP);
    return res.status(403).json({ message: 'Ce compte est désactivé. Contactez votre administrateur.' });
  }

  if (isAccountLocked(utilisateur)) {
    await logAudit(im, 'login_lockout', 'utilisateur', clientIP);
    const lockedUntil = new Date(utilisateur.lockedUntil);
    return res.status(403).json({
      message: 'Votre compte est temporairement verrouillé. Réessayez après ' +
        new Date(utilisateur.lockedUntil.getTime() + 60000).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    });
  }

  const motDePasseCorrespond = await comparePassword(password, utilisateur.passwordHash);
  if (!motDePasseCorrespond) {
    await handleFailedAttempt(im);
    await logAudit(im, 'login_failure', 'utilisateur', clientIP);
    return res.status(400).json({ message: 'Identifiant ou mot de passe incorrect.' });
  }

  await resetFailedAttempts(im);
  const token = generateToken(utilisateur);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 30 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });

  await logAudit(utilisateur._id, 'login_success', 'utilisateur', clientIP);
  return res.status(200).json({ message: 'Connexion réussie', user: { im: utilisateur.im, role: utilisateur.role } });
}

export async function logout(req, res) {
  const utilisateur = req.user;
  const clientIP = req.ip || req.connection.remoteAddress;

  res.clearCookie('token');

  if (utilisateur) {
    await logAudit(utilisateur._id, 'logout', 'utilisateur', clientIP);
  }

  return res.status(200).json({ message: 'Déconnexion réussie' });
}

export async function me(req, res) {
  return res.status(200).json({
    im: req.user.im,
    nom: req.user.nom,
    prenom: req.user.prenom,
    role: req.user.role,
    structureId: req.user.structureId,
    direction: req.user.direction,
    service: req.user.service,
    mustChangePassword: req.user.mustChangePassword,
  });
}

function validatePassword(password) {
  if (password.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre majuscule';
  }
  if (!/[a-z]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre minuscule';
  }
  if (!/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un chiffre';
  }
  return null;
}

export async function changePassword(req, res) {
  const utilisateur = req.user;
  const { current, new: newPassword, confirmation } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;

  if (!current || !newPassword || !confirmation) {
    return res.status(400).json({ message: 'Les champs actuels, nouveaux et confirmation sont requis' });
  }

  if (newPassword !== confirmation) {
    return res.status(400).json({ message: 'Le nouveau mot de passe et la confirmation ne correspondent pas' });
  }

  const error = validatePassword(newPassword);
  if (error) {
    return res.status(400).json({ message: error });
  }

  const correspondance = await comparePassword(current, utilisateur.passwordHash);
  if (!correspondance) {
    return res.status(400).json({ message: 'Le mot de passe actuel est incorrect' });
  }

  // Le nouveau mot de passe doit être différent du mot de passe provisoire (actuel)
  if (await comparePassword(newPassword, utilisateur.passwordHash)) {
    return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent du mot de passe provisoire' });
  }

  const nouveauHash = await hashPassword(newPassword);
  await UtilisateurModel.updateOne({ _id: utilisateur._id }, { passwordHash: nouveauHash, mustChangePassword: false, failedAttempts: 0, lockedUntil: null });

  await logAudit(utilisateur._id, 'password_change', 'utilisateur', clientIP);
  return res.status(200).json({ message: 'Mot de passe changé avec succès' });
}

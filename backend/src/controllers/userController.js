"use strict";
import { z } from 'zod';
import { randomInt } from 'crypto';

import { hashPassword } from '../services/auth.js';
import { logAudit } from '../middleware/auth.js';
import { getUtilisateurRepository } from '../repositories/utilisateurRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { estIdValide } from '../repositories/ids.js';

const REQUIRED = 'Ce champ est obligatoire.';
const ROLES = ['client', 'admin2', 'admin1', 'developpeur', 'consultant'];

// Mot de passe provisoire au format Xxx-Xxx-Xxx (SPEC §5) : renvoyé UNE FOIS.
function generateProvisionalPassword() {
  const U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const L = 'abcdefghijklmnopqrstuvwxyz';
  const D = '23456789';
  const pick = (set) => set[randomInt(set.length)];
  return [0, 1, 2].map(() => `${pick(U)}${pick(L)}${pick(D)}`).join('-');
}

const profileFields = {
  nom: z.string({ required_error: REQUIRED }).trim().min(1, REQUIRED).max(100, 'Valeur trop longue.'),
  prenom: z.string({ required_error: REQUIRED }).trim().min(1, REQUIRED).max(100, 'Valeur trop longue.'),
  direction: z.string({ required_error: REQUIRED }).trim().min(1, REQUIRED).max(150, 'Valeur trop longue.'),
  service: z.string({ required_error: REQUIRED }).trim().min(1, REQUIRED).max(150, 'Valeur trop longue.'),
  role: z
    .string({ required_error: REQUIRED })
    .refine((v) => ROLES.includes(v), 'Rôle invalide.'),
  structureId: z
    .string({ required_error: REQUIRED })
    .refine(estIdValide, 'Structure invalide.'),
};

const createSchema = z.object({
  im: z
    .string({ required_error: REQUIRED })
    .trim()
    .min(1, REQUIRED)
    .max(32, 'Valeur trop longue.'),
  ...profileFields,
});

const profilSchema = z.object(profileFields);

function firstIssue(parsed) {
  return parsed.error.issues[0].message;
}

function serializeUser(u) {
  return {
    id: String(u._id),
    im: u.im,
    nom: u.nom,
    prenom: u.prenom,
    direction: u.direction,
    service: u.service,
    role: u.role,
    status: u.status,
    mustChangePassword: !!u.mustChangePassword,
    structureId: u.structureId ? String(u.structureId._id || u.structureId) : null,
    structureLabel:
      u.structureId && typeof u.structureId === 'object' ? u.structureId.label : null,
    createdAt: u.createdAt,
  };
}

// GET /api/users (admin1) : liste filtrable (rôle, statut, recherche, structure)
export async function listUsers(req, res) {
  const { role, status, q, structure } = req.query;
  if (role && !ROLES.includes(role)) return res.status(400).json({ message: 'Filtre invalide.' });
  if (status && !['actif', 'desactive'].includes(status)) {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  if (structure && !estIdValide(structure)) {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  const recherche = q && q.trim() ? q.trim() : undefined;

  const docs = await getUtilisateurRepository().listerAvecStructure({
    role,
    status,
    structureId: structure,
    q: recherche,
    limite: 500,
  });
  return res.status(200).json(docs.map(serializeUser));
}

// POST /api/users (admin1) : crée un compte avec mot de passe provisoire
export async function createUser(req, res) {
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed) });

  const data = parsed.data;
  const structure = await getStructureRepository().trouverParId(String(data.structureId));
  if (!structure) return res.status(400).json({ message: 'Structure inconnue.' });

  const existing = await getUtilisateurRepository().trouverParIm(data.im);
  if (existing) return res.status(409).json({ message: 'Cet IM existe déjà.' });

  const provisionalPassword = generateProvisionalPassword();
  let user;
  try {
    user = await getUtilisateurRepository().creer({
      im: data.im,
      nom: data.nom,
      prenom: data.prenom,
      direction: data.direction,
      service: data.service,
      role: data.role,
      structureId: data.structureId,
      passwordHash: await hashPassword(provisionalPassword),
      status: 'actif',
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    });
  } catch (error) {
    // Le dépôt normalise la violation d'unicité (code 11000 de MongoDB,
    // ORA-00001 d'Oracle) en une Error dont `code` vaut 'DOUBLON'.
    if (error && error.code === 'DOUBLON') {
      return res.status(409).json({ message: 'Cet IM existe déjà.' });
    }
    throw error;
  }

  await logAudit(req.user._id, 'user_create', `utilisateur:${user._id}`, req.ip);
  return res.status(201).json({
    id: String(user._id),
    im: user.im,
    provisionalPassword,
    message: 'Utilisateur créé.',
  });
}

// PATCH /api/users/:id/profil (admin1)
export async function updateProfil(req, res) {
  const id = req.params.id;
  if (!estIdValide(id)) return res.status(404).json({ message: 'Ressource introuvable.' });

  const parsed = profilSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed) });

  const data = parsed.data;
  const structure = await getStructureRepository().trouverParId(String(data.structureId));
  if (!structure) return res.status(400).json({ message: 'Structure inconnue.' });

  const user = await getUtilisateurRepository().trouverParId(id);
  if (!user) return res.status(404).json({ message: 'Ressource introuvable.' });

  await getUtilisateurRepository().mettreAJour(id, {
    nom: data.nom,
    prenom: data.prenom,
    direction: data.direction,
    service: data.service,
    role: data.role,
    structureId: data.structureId,
  });

  await logAudit(req.user._id, 'profil_change', `utilisateur:${user._id}`, req.ip);
  return res.status(200).json({ id: String(user._id), message: 'Profil mis à jour.' });
}

// POST /api/users/:id/desactiver (admin1)
export async function desactiverUser(req, res) {
  const id = req.params.id;
  if (!estIdValide(id)) return res.status(404).json({ message: 'Ressource introuvable.' });

  const user = await getUtilisateurRepository().trouverParId(id);
  if (!user) return res.status(404).json({ message: 'Ressource introuvable.' });

  if (user.status !== 'desactive') {
    await getUtilisateurRepository().mettreAJour(id, { status: 'desactive' });
    await logAudit(req.user._id, 'user_deactivate', `utilisateur:${user._id}`, req.ip);
  }
  return res.status(200).json({ id: String(user._id), message: 'Utilisateur désactivé.' });
}

// POST /api/users/:id/reinitialiser-mdp (admin1) : nouveau mot de passe
// provisoire renvoyé UNE FOIS.
export async function reinitialiserMdp(req, res) {
  const id = req.params.id;
  if (!estIdValide(id)) return res.status(404).json({ message: 'Ressource introuvable.' });

  const user = await getUtilisateurRepository().trouverParId(id);
  if (!user) return res.status(404).json({ message: 'Ressource introuvable.' });

  const provisionalPassword = generateProvisionalPassword();
  await getUtilisateurRepository().mettreAJour(id, {
    passwordHash: await hashPassword(provisionalPassword),
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
  });

  await logAudit(req.user._id, 'password_reset', `utilisateur:${user._id}`, req.ip);
  return res.status(200).json({
    id: String(user._id),
    provisionalPassword,
    message: 'Mot de passe réinitialisé.',
  });
}

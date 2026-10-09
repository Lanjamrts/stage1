"use strict";
import { z } from 'zod';
import { randomInt } from 'crypto';

import Utilisateur from '../models/Utilisateur.js';
import Structure from '../models/Structure.js';
import { hashPassword } from '../services/auth.js';
import { logAudit } from '../middleware/auth.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
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
    .regex(OBJECT_ID, 'Structure invalide.'),
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/users (admin1) : liste filtrable (rôle, statut, recherche, structure)
export async function listUsers(req, res) {
  const { role, status, q, structure } = req.query;
  const filter = {};
  if (role) {
    if (!ROLES.includes(role)) return res.status(400).json({ message: 'Filtre invalide.' });
    filter.role = role;
  }
  if (status) {
    if (!['actif', 'desactive'].includes(status)) {
      return res.status(400).json({ message: 'Filtre invalide.' });
    }
    filter.status = status;
  }
  if (structure) {
    if (!OBJECT_ID.test(structure)) return res.status(400).json({ message: 'Filtre invalide.' });
    filter.structureId = structure;
  }
  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ im: rx }, { nom: rx }, { prenom: rx }];
  }

  const docs = await Utilisateur.find(filter)
    .populate('structureId', 'label')
    .sort({ nom: 1, prenom: 1 })
    .limit(500)
    .lean();
  return res.status(200).json(docs.map(serializeUser));
}

// POST /api/users (admin1) : crée un compte avec mot de passe provisoire
export async function createUser(req, res) {
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed) });

  const data = parsed.data;
  const structure = await Structure.findById(data.structureId).lean();
  if (!structure) return res.status(400).json({ message: 'Structure inconnue.' });

  const existing = await Utilisateur.findOne({ im: data.im }).lean();
  if (existing) return res.status(409).json({ message: 'Cet IM existe déjà.' });

  const provisionalPassword = generateProvisionalPassword();
  let user;
  try {
    user = await Utilisateur.create({
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
    if (error && error.code === 11000) {
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
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: 'Ressource introuvable.' });

  const parsed = profilSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed) });

  const data = parsed.data;
  const structure = await Structure.findById(data.structureId).lean();
  if (!structure) return res.status(400).json({ message: 'Structure inconnue.' });

  const user = await Utilisateur.findById(id);
  if (!user) return res.status(404).json({ message: 'Ressource introuvable.' });

  user.nom = data.nom;
  user.prenom = data.prenom;
  user.direction = data.direction;
  user.service = data.service;
  user.role = data.role;
  user.structureId = data.structureId;
  await user.save();

  await logAudit(req.user._id, 'profil_change', `utilisateur:${user._id}`, req.ip);
  return res.status(200).json({ id: String(user._id), message: 'Profil mis à jour.' });
}

// POST /api/users/:id/desactiver (admin1)
export async function desactiverUser(req, res) {
  const id = req.params.id;
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: 'Ressource introuvable.' });

  const user = await Utilisateur.findById(id);
  if (!user) return res.status(404).json({ message: 'Ressource introuvable.' });

  if (user.status !== 'desactive') {
    user.status = 'desactive';
    await user.save();
    await logAudit(req.user._id, 'user_deactivate', `utilisateur:${user._id}`, req.ip);
  }
  return res.status(200).json({ id: String(user._id), message: 'Utilisateur désactivé.' });
}

// POST /api/users/:id/reinitialiser-mdp (admin1) : nouveau mot de passe
// provisoire renvoyé UNE FOIS.
export async function reinitialiserMdp(req, res) {
  const id = req.params.id;
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: 'Ressource introuvable.' });

  const user = await Utilisateur.findById(id);
  if (!user) return res.status(404).json({ message: 'Ressource introuvable.' });

  const provisionalPassword = generateProvisionalPassword();
  user.passwordHash = await hashPassword(provisionalPassword);
  user.mustChangePassword = true;
  user.failedAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  await logAudit(req.user._id, 'password_reset', `utilisateur:${user._id}`, req.ip);
  return res.status(200).json({
    id: String(user._id),
    provisionalPassword,
    message: 'Mot de passe réinitialisé.',
  });
}

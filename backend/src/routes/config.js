"use strict";
import express from 'express';
import { z } from 'zod';

import Module from '../models/Module.js';
import { requireRole, logAudit } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const NOT_FOUND = 'Ressource introuvable.';
const FIELD_KEY = /^[a-z][a-z0-9_]*$/i;
const FIELD_TYPES = [
  'text',
  'textarea',
  'integer',
  'decimal',
  'date',
  'select',
  'multiselect',
  'table',
  'auto',
];
const PERIODICITIES = ['monthly', 'quarterly'];
const KINDS = ['periodic', 'event'];
const STRUCTURE_TYPES = ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF', 'SSEBF', 'DGBF', 'CELLULE_INFO'];

// Contrôle récursif de la structure des champs (types connus).
function findFieldIssue(fields) {
  for (const f of fields || []) {
    if (!f || typeof f !== 'object') return 'Structure de champ invalide.';
    if (typeof f.key !== 'string' || !FIELD_KEY.test(f.key)) return 'Clé de champ invalide.';
    if (typeof f.type !== 'string' || !FIELD_TYPES.includes(f.type)) return 'Type de champ invalide.';
    if (f.type === 'table') {
      if (!Array.isArray(f.fields) || f.fields.length === 0) {
        return 'Un champ tableau doit contenir au moins un sous-champ.';
      }
      const sub = findFieldIssue(f.fields);
      if (sub) return sub;
    }
  }
  return null;
}

const shape = {
  label: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .trim()
    .min(1, 'Ce champ est obligatoire.')
    .max(150, 'Valeur trop longue.'),
  periodicity: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .refine((v) => PERIODICITIES.includes(v), 'Périodicité invalide.'),
  kind: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .refine((v) => KINDS.includes(v), 'Type de gabarit invalide.'),
  structureTypes: z
    .array(z.string(), { required_error: 'Ce champ est obligatoire.' })
    .min(1, 'Au moins un type de structure est requis.')
    .refine(
      (list) => list.every((t) => STRUCTURE_TYPES.includes(t)),
      'Type de structure invalide.'
    ),
  fields: z
    .array(z.record(z.any()), { required_error: 'Ce champ est obligatoire.' })
    .min(1, 'Le gabarit doit contenir au moins un champ.'),
};

const createSchema = z.object({
  code: z
    .string({ required_error: 'Ce champ est obligatoire.' })
    .trim()
    .min(1, 'Ce champ est obligatoire.')
    .max(16, 'Valeur trop longue.')
    .regex(FIELD_KEY, 'Code de gabarit invalide.'),
  ...shape,
});

const updateSchema = z.object(shape);

function firstIssue(parsed) {
  return parsed.error.issues[0].message;
}

// API config des gabarits — developpeur uniquement (SPEC §8).
// POST crée (version 1) ; PUT crée la version N+1 ; PATCH active/désactive.
const router = express.Router();
router.use(requireRole(['developpeur']));

// POST /api/config/modules
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed) });
    const data = parsed.data;
    const fieldIssue = findFieldIssue(data.fields);
    if (fieldIssue) return res.status(400).json({ message: fieldIssue });

    const existing = await Module.findOne({ code: data.code }).lean();
    if (existing) return res.status(409).json({ message: 'Ce code de gabarit existe déjà.' });

    const doc = await Module.create({
      code: data.code,
      label: data.label,
      periodicity: data.periodicity,
      kind: data.kind,
      structureTypes: data.structureTypes,
      fields: data.fields,
      version: 1,
      active: true,
    });
    await logAudit(req.user._id, 'module_publish', `module:${doc._id}`, req.ip);
    return res.status(201).json({ id: String(doc._id), code: doc.code, version: doc.version });
  })
);

// PUT /api/config/modules/:id — crée la version N+1 (SPEC §7)
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!OBJECT_ID.test(id)) return res.status(404).json({ message: NOT_FOUND });
    const doc = await Module.findById(id);
    if (!doc) return res.status(404).json({ message: NOT_FOUND });

    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed) });
    const data = parsed.data;
    const fieldIssue = findFieldIssue(data.fields);
    if (fieldIssue) return res.status(400).json({ message: fieldIssue });

    doc.label = data.label;
    doc.periodicity = data.periodicity;
    doc.kind = data.kind;
    doc.structureTypes = data.structureTypes;
    doc.fields = data.fields;
    doc.version = doc.version + 1; // version N+1 ; les saisies gardent leur version
    await doc.save();

    await logAudit(req.user._id, 'module_publish', `module:${doc._id}`, req.ip);
    return res.status(200).json({ id: String(doc._id), code: doc.code, version: doc.version });
  })
);

// PATCH /api/config/modules/:id/active — activer / désactiver
router.patch(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!OBJECT_ID.test(id)) return res.status(404).json({ message: NOT_FOUND });
    const active = req.body ? req.body.active : undefined;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ message: 'Ce champ est obligatoire.' });
    }
    const doc = await Module.findByIdAndUpdate(id, { active }, { new: true });
    if (!doc) return res.status(404).json({ message: NOT_FOUND });
    return res.status(200).json({ id: String(doc._id), active: doc.active });
  })
);

export default router;

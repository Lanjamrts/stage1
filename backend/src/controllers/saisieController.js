"use strict";
import { z } from 'zod';

import Module from '../models/Module.js';
import Saisie from '../models/Saisie.js';
import Periode from '../models/Periode.js';
import Structure from '../models/Structure.js';
import Region from '../models/Region.js';
import { logAudit } from '../middleware/auth.js';
import { structuresInScope, statusesInScope } from '../middleware/scope.js';
import { optionsForModule } from '../services/moduleMeta.js';
import { canTransition, TRANSITION_ERROR } from '../services/transitions.js';
import { serializeSaisie, entryActor } from '../services/serializeSaisie.js';
import { validateSubmit, validateDraft, computeAutos, STATUS_LABELS } from '../../../shared/rules.mjs';
import { acceptedPeriodicities } from '../utils/periodicity.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const NOT_FOUND = 'Ressource introuvable.';
const EDIT_FORBIDDEN = 'Cette saisie ne peut plus être modifiée.';
const REQUIRED_MSG = 'Ce champ est obligatoire.';

// ------------------------------------------------------------------ helpers

async function structureLabelAndRegion(user) {
  const structure = await Structure.findById(user.structureId).lean();
  if (!structure) return { structure: '', region: '' };
  let region = '';
  if (structure.regionId) {
    const r = await Region.findById(structure.regionId).lean();
    region = r ? r.name : '';
  }
  return { structure: structure.label || '', region };
}

function actorLabel(user) {
  return `${user.prenom} ${user.nom}`;
}

// Filtre de portée + statuts visibles pour la liste (SPEC §2 et §3).
async function scopeFilterFor(user) {
  const ids = await structuresInScope(user); // null = toutes, [] = aucune
  const filter = { status: { $in: statusesInScope(user.role) } };
  if (ids !== null) filter.structureId = { $in: ids };
  return filter;
}

// Id d'un champ potentiellement peuplé (ObjectId ou document)
const idOf = (v) => String((v && v._id) || v);

// Lecture d'une saisie selon le rôle (retourne null si hors périmètre → 404).
async function canReadSaisie(user, saisie) {
  switch (user.role) {
    case 'client':
      return idOf(saisie.structureId) === String(user.structureId);
    case 'admin2': {
      if (saisie.status === 'brouillon') return false; // jamais de brouillon
      const ids = await structuresInScope(user);
      if (ids === null) return true;
      return ids.map(String).includes(idOf(saisie.structureId));
    }
    case 'admin1':
      return true;
    case 'consultant':
      return ['exportee', 'archivee'].includes(saisie.status);
    default:
      return false; // developpeur : aucun accès aux rapports (403 géré avant)
  }
}

async function loadSaisieForRead(req, res) {
  const id = req.params.id;
  if (!OBJECT_ID.test(id)) {
    res.status(404).json({ message: NOT_FOUND });
    return null;
  }
  if (req.user.role === 'developpeur') {
    res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
    return null;
  }
  const saisie = await Saisie.findById(id)
    .populate('moduleId')
    .populate('periodeId')
    .populate('authorId')
    .populate('structureId');
  if (!saisie) {
    res.status(404).json({ message: NOT_FOUND });
    return null;
  }
  const ok = await canReadSaisie(req.user, saisie);
  if (!ok) {
    res.status(404).json({ message: NOT_FOUND });
    return null;
  }
  return saisie;
}

// ------------------------------------------------------------------ GET list

export async function listSaisies(req, res) {
  const user = req.user;
  if (user.role === 'developpeur') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }

  const filter = await scopeFilterFor(user);

  // Filtres optionnels (doivent rester dans le périmètre du rôle)
  const { status, module: moduleId, periode: periodeId } = req.query;
  if (status) {
    if (!filter.status.$in.includes(status)) return res.status(200).json([]);
    filter.status = status;
  }
  if (moduleId) {
    if (!OBJECT_ID.test(moduleId)) return res.status(400).json({ message: 'Module invalide.' });
    filter.moduleId = moduleId;
  }
  if (periodeId) {
    if (!OBJECT_ID.test(periodeId)) return res.status(400).json({ message: 'Période invalide.' });
    filter.periodeId = periodeId;
  }

  const docs = await Saisie.find(filter)
    .populate('moduleId')
    .populate('periodeId')
    .populate('authorId')
    .populate('structureId')
    .sort({ updatedAt: -1 })
    .limit(500);

  return res.status(200).json(docs.map((d) => serializeSaisie(d, user, { withFields: false })));
}

// ------------------------------------------------------------------ GET one

export async function getSaisie(req, res) {
  const saisie = await loadSaisieForRead(req, res);
  if (!saisie) return undefined;
  return res.status(200).json(serializeSaisie(saisie, req.user));
}

// -------------------------------------------------------------- GET historique

export async function getHistorique(req, res) {
  const saisie = await loadSaisieForRead(req, res);
  if (!saisie) return undefined;
  const s = saisie.toObject();
  const steps = [
    {
      decision: 'creee',
      decisionLabel: 'Créée',
      motif: null,
      actor: s.authorId ? `${s.authorId.prenom} ${s.authorId.nom}` : null,
      date: s.dates?.created || s.createdAt,
    },
    ...(s.validations || []).map((v) => ({
      decision: v.decision,
      decisionLabel: STATUS_LABELS[v.decision] || v.decision,
      motif: v.motif || null,
      actor: entryActor(v),
      date: v.date,
    })),
  ];
  return res.status(200).json(steps);
}

// ------------------------------------------------------------------ POST create

const createSchema = z.object({
  moduleId: z.string().regex(OBJECT_ID, 'Module invalide.'),
  periodeId: z.string().regex(OBJECT_ID, 'Période invalide.').optional().nullable(),
  eventDate: z.string().optional().nullable(),
});

export async function createSaisie(req, res) {
  const user = req.user;
  if (user.role !== 'client') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }

  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: 'Requête invalide.', errors: parsed.error.flatten().fieldErrors });
  }
  const { moduleId, periodeId, eventDate } = parsed.data;

  const moduleDoc = await Module.findById(moduleId);
  if (!moduleDoc || !moduleDoc.active) {
    return res.status(404).json({ message: 'Module introuvable.' });
  }
  const structure = await Structure.findById(user.structureId);
  if (!structure || !moduleDoc.structureTypes.includes(structure.type)) {
    return res.status(403).json({ message: 'Ce module n’est pas autorisé pour votre structure.' });
  }

  if (moduleDoc.kind === 'periodic') {
    if (!periodeId) return res.status(400).json({ message: REQUIRED_MSG });
    const periode = await Periode.findById(periodeId);
    if (!periode) return res.status(404).json({ message: 'Période introuvable.' });
    if (!acceptedPeriodicities(moduleDoc).includes(periode.periodicity)) {
      return res.status(400).json({ message: 'La période ne correspond pas à la périodicité du module.' });
    }
    const existing = await Saisie.findOne({
      structureId: user.structureId,
      moduleId: moduleDoc._id,
      periodeId: periode._id,
    });
    if (existing) {
      return res.status(409).json({
        message: 'Une saisie existe déjà pour cette période.',
        existingId: String(existing._id),
      });
    }
  } else {
    // Module d'événement : date d'événement obligatoire
    if (!eventDate) return res.status(400).json({ message: REQUIRED_MSG });
    if (Number.isNaN(new Date(eventDate).getTime())) {
      return res.status(400).json({ message: 'Ce champ doit être une date valide.' });
    }
  }

  const saisie = await Saisie.create({
    structureId: user.structureId,
    moduleId: moduleDoc._id,
    moduleVersion: moduleDoc.version,
    periodeId: moduleDoc.kind === 'periodic' ? periodeId : undefined,
    eventDate: moduleDoc.kind === 'event' ? new Date(eventDate) : undefined,
    authorId: user._id,
    status: 'brouillon',
    values: {},
    dates: { created: new Date(), submitted: null, exported: null },
  });

  await logAudit(user._id, 'saisie_create', `saisie:${saisie._id}`, req.ip);
  return res.status(201).json({ id: String(saisie._id), status: saisie.status });
}

// ------------------------------------------------------------------ PUT update (autosave)

const updateSchema = z.object({
  values: z.record(z.any()),
});

export async function updateSaisie(req, res) {
  const user = req.user;
  if (user.role !== 'client') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const saisie = await Saisie.findById(req.params.id);
  if (!saisie || String(saisie.structureId) !== String(user.structureId)) {
    return res.status(404).json({ message: NOT_FOUND });
  }
  if (!['brouillon', 'rejetee'].includes(saisie.status)) {
    return res.status(409).json({ message: EDIT_FORBIDDEN });
  }

  const parsed = updateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: 'Requête invalide.', errors: { values: 'Valeurs invalides.' } });
  }

  const moduleDoc = await Module.findById(saisie.moduleId);
  if (!moduleDoc) return res.status(404).json({ message: 'Module introuvable.' });

  const options = await optionsForModule(moduleDoc);
  const autos = await autosForUser(user, moduleDoc, parsed.data.values);
  const values = { ...parsed.data.values, ...autos };

  // Brouillon : contrôle des types seulement (pas d'obligation)
  const errors = validateDraft(moduleDoc.fields, values, { options, today: new Date() });
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Le formulaire contient des erreurs.', errors });
  }

  saisie.values = values;
  await saisie.save();
  await logAudit(user._id, 'saisie_update', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Brouillon enregistré.', savedAt: saisie.updatedAt });
}

async function autosForUser(user, moduleDoc, values) {
  const { structure, region } = await structureLabelAndRegion(user);
  return computeAutos(moduleDoc.fields, values, {
    structure,
    region,
    author: actorLabel(user),
  });
}

// ------------------------------------------------------------- POST soumettre

export async function soumettreSaisie(req, res) {
  const user = req.user;
  if (user.role !== 'client') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const saisie = await Saisie.findById(req.params.id);
  if (!saisie || String(saisie.structureId) !== String(user.structureId)) {
    return res.status(404).json({ message: NOT_FOUND });
  }
  if (!canTransition(saisie.status, 'soumise')) {
    return res.status(409).json({ message: TRANSITION_ERROR });
  }

  const moduleDoc = await Module.findById(saisie.moduleId);
  if (!moduleDoc) return res.status(404).json({ message: 'Module introuvable.' });

  const options = await optionsForModule(moduleDoc);
  const autos = await autosForUser(user, moduleDoc, saisie.values || {});
  const values = { ...(saisie.values || {}), ...autos };

  // Soumission : règles complètes (vérité finale côté serveur)
  const errors = validateSubmit(moduleDoc.fields, values, { options, today: new Date() });
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Le formulaire contient des erreurs.', errors });
  }

  saisie.values = values;
  saisie.status = 'soumise';
  saisie.moduleVersion = moduleDoc.version;
  saisie.validations.push({
    decision: 'soumise',
    actorId: user._id,
    actorLabel: actorLabel(user),
    date: new Date(),
  });
  saisie.dates.submitted = new Date();
  await saisie.save();

  await logAudit(user._id, 'saisie_submit', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Saisie soumise.', status: 'soumise' });
}

// --------------------------------------------------- transitions admin2 (Phase 4)

async function loadSaisieForTransition(req, res, from, to) {
  const user = req.user;
  if (user.role !== 'admin2') {
    res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
    return null;
  }
  const saisie = await Saisie.findById(req.params.id);
  if (!saisie) {
    res.status(404).json({ message: NOT_FOUND });
    return null;
  }
  const ids = await structuresInScope(user);
  if (ids !== null && !ids.map(String).includes(String(saisie.structureId))) {
    res.status(404).json({ message: NOT_FOUND }); // hors région
    return null;
  }
  if (saisie.status !== from || !canTransition(from, to)) {
    res.status(409).json({ message: TRANSITION_ERROR });
    return null;
  }
  return saisie;
}

export async function validerSaisie(req, res) {
  const saisie = await loadSaisieForTransition(req, res, 'soumise', 'validee');
  if (!saisie) return undefined;
  saisie.status = 'validee';
  saisie.validations.push({
    decision: 'validee',
    actorId: req.user._id,
    actorLabel: actorLabel(req.user),
    date: new Date(),
  });
  await saisie.save();
  await logAudit(req.user._id, 'saisie_validate', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Saisie validée.', status: 'validee' });
}

const rejectSchema = z.object({
  motif: z
    .string({ required_error: 'Le motif de rejet est obligatoire.' })
    .trim()
    .min(1, 'Le motif de rejet est obligatoire.')
    .max(500, 'Le motif ne doit pas dépasser 500 caractères.'),
});

export async function rejeterSaisie(req, res) {
  // Rôle + périmètre + transition d'abord (403/404/409), puis le motif (400)
  const saisie = await loadSaisieForTransition(req, res, 'soumise', 'rejetee');
  if (!saisie) return undefined;

  const parsed = rejectSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ message: issue.message });
  }

  saisie.status = 'rejetee';
  saisie.validations.push({
    decision: 'rejetee',
    motif: parsed.data.motif,
    actorId: req.user._id,
    actorLabel: actorLabel(req.user),
    date: new Date(),
  });
  await saisie.save();
  await logAudit(req.user._id, 'saisie_reject', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Saisie rejetée.', status: 'rejetee' });
}

export async function exporterSaisie(req, res) {
  const saisie = await loadSaisieForTransition(req, res, 'validee', 'exportee');
  if (!saisie) return undefined;
  saisie.status = 'exportee';
  saisie.validations.push({
    decision: 'exportee',
    actorId: req.user._id,
    actorLabel: actorLabel(req.user),
    date: new Date(),
  });
  saisie.dates.exported = new Date();
  await saisie.save();
  await logAudit(req.user._id, 'saisie_export', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Saisie exportée vers la base centrale.', status: 'exportee' });
}

"use strict";
import { z } from 'zod';

import { getModuleRepository } from '../repositories/moduleRepository.js';
import { getSaisieRepository } from '../repositories/saisieRepository.js';
import { getPeriodeRepository } from '../repositories/periodeRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { getRegionRepository } from '../repositories/regionRepository.js';
import { estIdValide } from '../repositories/ids.js';
import { logAudit } from '../middleware/auth.js';
import { structuresInScope, statusesInScope } from '../middleware/scope.js';
import { optionsForModule } from '../services/moduleMeta.js';
import { canTransition, TRANSITION_ERROR } from '../services/transitions.js';
import { serializeSaisie, entryActor } from '../services/serializeSaisie.js';
import { validateSubmit, validateDraft, computeAutos, STATUS_LABELS } from '../../../shared/rules.mjs';
import { acceptedPeriodicities } from '../utils/periodicity.js';

const NOT_FOUND = 'Ressource introuvable.';
const EDIT_FORBIDDEN = 'Cette saisie ne peut plus être modifiée.';
const REQUIRED_MSG = 'Ce champ est obligatoire.';

// ------------------------------------------------------------------ helpers

async function structureLabelAndRegion(user) {
  const structure = await getStructureRepository().trouverParId(String(user.structureId));
  if (!structure) return { structure: '', region: '' };
  let region = '';
  if (structure.regionId) {
    const r = await getRegionRepository().trouverParId(String(structure.regionId));
    region = r ? r.name : '';
  }
  return { structure: structure.label || '', region };
}

function actorLabel(user) {
  return `${user.prenom} ${user.nom}`;
}

// Options de portée + statuts visibles pour la liste (SPEC §2 et §3).
// Ce sont des OPTIONS du dépôt : { statuts, structureIds } ; structureIds
// absent = toutes (null), [] = aucune.
async function scopeFilterFor(user) {
  const ids = await structuresInScope(user); // null = toutes, [] = aucune
  const options = { statuts: statusesInScope(user.role) };
  if (ids !== null) options.structureIds = ids.map(String);
  return options;
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
  if (!estIdValide(id)) {
    res.status(404).json({ message: NOT_FOUND });
    return null;
  }
  if (req.user.role === 'developpeur') {
    res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
    return null;
  }
  const saisie = await getSaisieRepository().trouverParId(id, { avecLiens: true });
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

  const options = await scopeFilterFor(user);

  // Filtres optionnels (doivent rester dans le périmètre du rôle)
  const { status, module: moduleId, periode: periodeId } = req.query;
  if (status) {
    if (!options.statuts.includes(status)) return res.status(200).json([]);
    options.statuts = [status];
  }
  if (moduleId) {
    if (!estIdValide(moduleId)) return res.status(400).json({ message: 'Module invalide.' });
    options.moduleId = moduleId;
  }
  if (periodeId) {
    if (!estIdValide(periodeId)) return res.status(400).json({ message: 'Période invalide.' });
    options.periodeId = periodeId;
  }

  const docs = await getSaisieRepository().lister({
    ...options,
    avecLiens: true,
    tri: 'majDesc',
    limite: 500,
  });

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
  // La saisie du dépôt est déjà un objet simple (lean / conversion Oracle).
  const s = saisie;
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
  moduleId: z.string().refine(estIdValide, 'Module invalide.'),
  periodeId: z.string().refine(estIdValide, 'Période invalide.').optional().nullable(),
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

  const moduleDoc = await getModuleRepository().trouverParId(String(moduleId));
  if (!moduleDoc || !moduleDoc.active) {
    return res.status(404).json({ message: 'Module introuvable.' });
  }
  const structure = await getStructureRepository().trouverParId(String(user.structureId));
  if (!structure || !moduleDoc.structureTypes.includes(structure.type)) {
    return res.status(403).json({ message: 'Ce module n’est pas autorisé pour votre structure.' });
  }

  // Clé du contrôle d'unicité (module périodique seulement) : relue dans le
  // catch en cas de course (DOUBLON) entre deux requêtes simultanées.
  let cleExistante = null;
  if (moduleDoc.kind === 'periodic') {
    if (!periodeId) return res.status(400).json({ message: REQUIRED_MSG });
    const periode = await getPeriodeRepository().trouverParId(String(periodeId));
    if (!periode) return res.status(404).json({ message: 'Période introuvable.' });
    if (!acceptedPeriodicities(moduleDoc).includes(periode.periodicity)) {
      return res.status(400).json({ message: 'La période ne correspond pas à la périodicité du module.' });
    }
    cleExistante = {
      structureId: String(user.structureId),
      moduleId: String(moduleDoc._id),
      periodeId: String(periode._id),
    };
    const existing = await getSaisieRepository().trouverParCle(cleExistante);
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

  let saisie;
  try {
    saisie = await getSaisieRepository().creer({
      structureId: String(user.structureId),
      moduleId: String(moduleDoc._id),
      moduleVersion: moduleDoc.version,
      periodeId: moduleDoc.kind === 'periodic' ? String(periodeId) : undefined,
      eventDate: moduleDoc.kind === 'event' ? new Date(eventDate) : undefined,
      authorId: String(user._id),
      status: 'brouillon',
      values: {},
      dates: { created: new Date(), submitted: null, exported: null },
    });
  } catch (error) {
    // Violation d'unicité (11000 / ORA-00001) normalisée en 'DOUBLON' : la
    // même réponse 409, avec l'id relu par la clé.
    if (error && error.code === 'DOUBLON' && cleExistante) {
      const existing = await getSaisieRepository().trouverParCle(cleExistante);
      return res.status(409).json({
        message: 'Une saisie existe déjà pour cette période.',
        ...(existing ? { existingId: String(existing._id) } : {}),
      });
    }
    throw error;
  }

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
  const id = req.params.id;
  if (!estIdValide(id)) {
    return res.status(404).json({ message: NOT_FOUND });
  }
  const saisie = await getSaisieRepository().trouverParId(id);
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

  const moduleDoc = await getModuleRepository().trouverParId(String(saisie.moduleId));
  if (!moduleDoc) return res.status(404).json({ message: 'Module introuvable.' });

  const options = await optionsForModule(moduleDoc);
  const autos = await autosForUser(user, moduleDoc, parsed.data.values);
  const values = { ...parsed.data.values, ...autos };

  // Brouillon : contrôle des types seulement (pas d'obligation)
  const errors = validateDraft(moduleDoc.fields, values, { options, today: new Date() });
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Le formulaire contient des erreurs.', errors });
  }

  const maj = await getSaisieRepository().mettreAJour(id, { values });
  if (!maj) return res.status(404).json({ message: NOT_FOUND });
  await logAudit(user._id, 'saisie_update', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Brouillon enregistré.', savedAt: maj.updatedAt });
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
  const id = req.params.id;
  if (!estIdValide(id)) {
    return res.status(404).json({ message: NOT_FOUND });
  }
  const saisie = await getSaisieRepository().trouverParId(id);
  if (!saisie || String(saisie.structureId) !== String(user.structureId)) {
    return res.status(404).json({ message: NOT_FOUND });
  }
  if (!canTransition(saisie.status, 'soumise')) {
    return res.status(409).json({ message: TRANSITION_ERROR });
  }

  const moduleDoc = await getModuleRepository().trouverParId(String(saisie.moduleId));
  if (!moduleDoc) return res.status(404).json({ message: 'Module introuvable.' });

  const options = await optionsForModule(moduleDoc);
  const autos = await autosForUser(user, moduleDoc, saisie.values || {});
  const values = { ...(saisie.values || {}), ...autos };

  // Soumission : règles complètes (vérité finale côté serveur)
  const errors = validateSubmit(moduleDoc.fields, values, { options, today: new Date() });
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Le formulaire contient des erreurs.', errors });
  }

  const now = new Date();
  await getSaisieRepository().mettreAJour(
    id,
    {
      values,
      status: 'soumise',
      moduleVersion: moduleDoc.version,
      dates: { submitted: now },
    },
    {
      decision: 'soumise',
      actorId: String(user._id),
      actorLabel: actorLabel(user),
      date: now,
    }
  );

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
  const saisie = await getSaisieRepository().trouverParId(req.params.id);
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
  const now = new Date();
  await getSaisieRepository().mettreAJour(
    String(saisie._id),
    { status: 'validee' },
    {
      decision: 'validee',
      actorId: String(req.user._id),
      actorLabel: actorLabel(req.user),
      date: now,
    }
  );
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

  const now = new Date();
  await getSaisieRepository().mettreAJour(
    String(saisie._id),
    { status: 'rejetee' },
    {
      decision: 'rejetee',
      motif: parsed.data.motif,
      actorId: String(req.user._id),
      actorLabel: actorLabel(req.user),
      date: now,
    }
  );
  await logAudit(req.user._id, 'saisie_reject', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Saisie rejetée.', status: 'rejetee' });
}

export async function exporterSaisie(req, res) {
  const saisie = await loadSaisieForTransition(req, res, 'validee', 'exportee');
  if (!saisie) return undefined;
  const now = new Date();
  await getSaisieRepository().mettreAJour(
    String(saisie._id),
    { status: 'exportee', dates: { exported: now } },
    {
      decision: 'exportee',
      actorId: String(req.user._id),
      actorLabel: actorLabel(req.user),
      date: now,
    }
  );
  await logAudit(req.user._id, 'saisie_export', `saisie:${saisie._id}`, req.ip);
  return res.status(200).json({ message: 'Saisie exportée vers la base centrale.', status: 'exportee' });
}

"use strict";
import { STATUS_LABELS } from '../../../shared/rules.mjs';

// Libellé de l'acteur d'une entrée d'historique (actorLabel stocké, sinon
// l'acteur peuplé — jamais d'ObjectId brut affiché).
export function entryActor(v) {
  if (v.actorLabel) return v.actorLabel;
  if (v.actorId && typeof v.actorId === 'object' && v.actorId.prenom) {
    return `${v.actorId.prenom} ${v.actorId.nom}`;
  }
  return null;
}

// admin1 ne voit le CONTENU que si exportee ou archivee (métadonnées sinon).
export function serializeSaisie(doc, user, { withFields = true } = {}) {
  const s = doc.toObject ? doc.toObject() : { ...doc };
  const meta = {
    id: String(s._id),
    structureId: String(s.structureId?._id || s.structureId),
    structureLabel: s.structureId?.label || null,
    moduleId: String(s.moduleId?._id || s.moduleId),
    moduleCode: s.moduleId?.code || null,
    moduleLabel: s.moduleId?.label || null,
    moduleKind: s.moduleId?.kind || null,
    modulePeriodicity: s.moduleId?.periodicity || null,
    moduleVersion: s.moduleVersion,
    periodeId: s.periodeId ? String(s.periodeId._id || s.periodeId) : null,
    periodeLabel: s.periodeId?.label || null,
    periodeDeadline: s.periodeId?.deadline || null,
    eventDate: s.eventDate || null,
    authorId: String(s.authorId?._id || s.authorId),
    authorLabel: s.authorId ? `${s.authorId.prenom} ${s.authorId.nom}` : null,
    authorIm: s.authorId?.im || null,
    status: s.status,
    statusLabel: STATUS_LABELS[s.status] || s.status,
    validations: (s.validations || []).map((v) => ({
      decision: v.decision,
      decisionLabel: STATUS_LABELS[v.decision] || v.decision,
      motif: v.motif || null,
      actor: entryActor(v),
      date: v.date,
    })),
    dates: s.dates || {},
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    canEdit:
      user.role === 'client' &&
      String(s.structureId?._id || s.structureId) === String(user.structureId) &&
      ['brouillon', 'rejetee'].includes(s.status),
  };

  const canSeeContent = user.role !== 'admin1' || ['exportee', 'archivee'].includes(s.status);

  if (withFields && s.moduleId && typeof s.moduleId === 'object') {
    meta.module = {
      id: String(s.moduleId._id),
      code: s.moduleId.code,
      label: s.moduleId.label,
      kind: s.moduleId.kind,
      periodicity: s.moduleId.periodicity,
      structureTypes: s.moduleId.structureTypes,
      version: s.moduleId.version,
      fields: s.moduleId.fields,
    };
  }
  if (canSeeContent) meta.values = s.values || {};
  else meta.values = null; // admin1 : contenu masqué hors exportee/archivee
  return meta;
}

"use strict";
import PDFDocument from 'pdfkit';

import Saisie from '../models/Saisie.js';
import Structure from '../models/Structure.js';
import Region from '../models/Region.js';
import { logAudit } from '../middleware/auth.js';
import { structuresInScope, statusesInScope } from '../middleware/scope.js';
import { serializeSaisie } from '../services/serializeSaisie.js';
import { buildExportModel } from '../services/exportModel.js';
import { buildWorkbook } from '../services/exportXlsx.js';
import { renderPdf } from '../services/exportPdf.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const STRUCTURE_TYPES = ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF', 'SSEBF', 'DGBF', 'CELLULE_INFO'];

function parseIdList(value) {
  const ids = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.some((id) => !OBJECT_ID.test(id))) return null;
  return ids;
}

// Filtre commun liste/export (SPEC §8) :
// admin1 = toutes régions ; admin2 = région forcée depuis sa structure.
// Les conditions sont accumulées dans $and pour que le périmètre de l'admin2
// ne soit jamais remplacé par un filtre de requête.
// Filtres admin1 : regions[] (noms), types[] (types de structure),
// modules[] (ids), periode, structure, statut.
async function buildFilter(user, query, { ignoreStatut = false } = {}) {
  if (user.role !== 'admin1' && user.role !== 'admin2') return null; // 403
  const clauses = [];
  if (user.role === 'admin2') {
    const ids = await structuresInScope(user);
    clauses.push({ structureId: { $in: (ids || []).map(String) } });
    // admin2 ne voit jamais les brouillons
    clauses.push({ status: { $in: statusesInScope('admin2') } });
  }
  if (query.module) {
    if (!OBJECT_ID.test(query.module)) return 'invalid';
    clauses.push({ moduleId: query.module });
  }
  if (query.modules) {
    const ids = parseIdList(query.modules);
    if (!ids) return 'invalid';
    clauses.push({ moduleId: { $in: ids } });
  }
  if (query.periode) {
    if (!OBJECT_ID.test(query.periode)) return 'invalid';
    clauses.push({ periodeId: query.periode });
  }
  if (query.structure) {
    if (!OBJECT_ID.test(query.structure)) return 'invalid';
    clauses.push({ structureId: query.structure });
  }
  if (query.regions) {
    const names = String(query.regions)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const regionIds = await Region.find({ name: { $in: names } }).select('_id').lean();
    const structureIds = await Structure.find({
      regionId: { $in: regionIds.map((r) => r._id) },
    })
      .select('_id')
      .lean();
    clauses.push({ structureId: { $in: structureIds.map((s) => s._id) } });
  }
  if (query.types) {
    const types = String(query.types)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (types.length === 0 || types.some((t) => !STRUCTURE_TYPES.includes(t))) return 'invalid';
    const structureIds = await Structure.find({ type: { $in: types } }).select('_id').lean();
    clauses.push({ structureId: { $in: structureIds.map((s) => s._id) } });
  }
  if (query.statut && !ignoreStatut) clauses.push({ status: query.statut });
  return clauses.length ? { $and: clauses } : {};
}

const populateAll = (q) =>
  q
    .populate('moduleId')
    .populate('periodeId')
    .populate('authorId')
    .populate('structureId');

// GET /api/collecte
export async function listCollecte(req, res) {
  const filter = await buildFilter(req.user, req.query);
  if (filter === null) {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  if (filter === 'invalid') {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  const docs = await populateAll(Saisie.find(filter)).sort({ updatedAt: -1 }).limit(1000);
  return res
    .status(200)
    .json(docs.map((d) => serializeSaisie(d, req.user, { withFields: false })));
}

// GET /api/collecte/historique (admin1 : tous statuts, métadonnées uniquement)
export async function listHistorique(req, res) {
  if (req.user.role !== 'admin1') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const filter = await buildFilter(req.user, req.query);
  if (filter === 'invalid') {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  const docs = await populateAll(Saisie.find(filter || {}))
    .sort({ updatedAt: -1 })
    .limit(1000);
  return res.status(200).json(
    docs.map((d) => {
      const meta = serializeSaisie(d, req.user, { withFields: false });
      meta.values = null; // métadonnées uniquement
      return meta;
    })
  );
}

// ------------------------------------------------------------------ helpers export

// Collecte la liste à exporter : uniquement exportee et archivee (SPEC §8),
// avec les mêmes filtres que la liste (hors statut, forcé ci-dessous).
async function loadExportRows(user, query) {
  const filter = await buildFilter(user, query || {}, { ignoreStatut: true });
  if (filter === null || filter === 'invalid') return filter;
  const clauses = filter && filter.$and ? [...filter.$and] : [];
  clauses.push({ status: { $in: ['exportee', 'archivee'] } });
  const finalFilter = { $and: clauses };
  return populateAll(Saisie.find(finalFilter)).sort({ structureId: 1, updatedAt: 1 }).limit(5000);
}

// GET /api/collecte/export?format=xlsx|pdf
export async function exportCollecte(req, res) {
  const user = req.user;
  if (user.role !== 'admin1' && user.role !== 'admin2') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const format = req.query.format;
  if (!['xlsx', 'pdf'].includes(format)) {
    return res.status(400).json({ message: 'Format requis : xlsx ou pdf' });
  }

  const loaded = await loadExportRows(user, req.query);
  if (loaded === null) {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  if (loaded === 'invalid') {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  const docs = loaded;
  const rows = docs.map((d) => serializeSaisie(d, user, { withFields: true }));
  const stamp = new Date().toISOString().slice(0, 10);

  const filters = {
    regions: req.query.regions
      ? String(req.query.regions).split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    modules: req.query.module || req.query.modules
      ? [...new Set(rows.map((r) => r.moduleLabel).filter(Boolean))]
      : [],
  };
  const model = buildExportModel(rows, { filters, generatedAt: new Date() });

  if (format === 'xlsx') {
    const wb = buildWorkbook(model);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="sigbd-collecte-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sigbd-collecte-${stamp}.pdf"`);
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    doc.pipe(res);
    renderPdf(model, doc);
    doc.end();
  }

  await logAudit(user._id, format === 'xlsx' ? 'download_excel' : 'download_pdf', 'collecte', req.ip);
  return undefined;
}

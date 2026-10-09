"use strict";
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import Saisie from '../models/Saisie.js';
import { logAudit } from '../middleware/auth.js';
import { structuresInScope, statusesInScope } from '../middleware/scope.js';
import { serializeSaisie } from '../services/serializeSaisie.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Filtre commun liste/export (SPEC §8) :
// admin1 = toutes régions ; admin2 = région forcée depuis sa structure.
// Les conditions sont accumulées dans $and pour que le périmètre de l'admin2
// ne soit jamais remplacé par un filtre de requête.
async function buildFilter(user, query) {
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
  if (query.periode) {
    if (!OBJECT_ID.test(query.periode)) return 'invalid';
    clauses.push({ periodeId: query.periode });
  }
  if (query.structure) {
    if (!OBJECT_ID.test(query.structure)) return 'invalid';
    clauses.push({ structureId: query.structure });
  }
  if (query.statut) clauses.push({ status: query.statut });
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

// ------------------------------------------------------------------ helpers export

// Aplatit les valeurs : {a: {b: 1}, t: [{x: 2}]} → {'a.b': 1, 't.0.x': 2}
function flattenValues(values, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(values || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      v.forEach((row, i) => flattenValues(row, `${path}.${i}`, out));
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      flattenValues(v, path, out);
    } else {
      out[path] = v === null || v === undefined ? '' : v;
    }
  }
  return out;
}

// Carte des libellés : 'activites' → 'Activités', 'activites.intitule' → …
function labelMap(fields) {
  const map = {};
  for (const f of fields || []) {
    map[f.key] = f.label;
    for (const sub of f.fields || []) {
      map[`${f.key}.${sub.key}`] = `${f.label} · ${sub.label}`;
    }
  }
  return map;
}

function labelFor(map, path) {
  const stripped = path.split('.').filter((p) => !/^\d+$/.test(p)).join('.');
  return map[stripped] || path;
}

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('fr-FR');
}

function fmtDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString('fr-FR');
}

function periodCell(s) {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) return `Événement du ${fmtDate(s.eventDate)}`;
  return '';
}

// Collecte la liste à exporter : uniquement exportee et archivee (SPEC §8).
async function loadExportRows(user) {
  const filter = {};
  if (user.role === 'admin2') {
    const ids = await structuresInScope(user);
    filter.structureId = { $in: ids || [] };
  }
  filter.status = { $in: ['exportee', 'archivee'] };
  return populateAll(Saisie.find(filter)).sort({ structureId: 1, updatedAt: 1 }).limit(5000);
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

  const docs = await loadExportRows(user);
  const rows = docs.map((d) => serializeSaisie(d, user, { withFields: true }));
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const meta = wb.addWorksheet('Données');
    meta.columns = [
      { header: 'Structure', key: 'structure', width: 24 },
      { header: 'Code module', key: 'code', width: 12 },
      { header: 'Module', key: 'module', width: 34 },
      { header: 'Période / Événement', key: 'periode', width: 24 },
      { header: 'Statut', key: 'statut', width: 12 },
      { header: 'Auteur', key: 'auteur', width: 24 },
      { header: 'Créée le', key: 'creee', width: 14 },
      { header: 'Soumise le', key: 'soumise', width: 14 },
      { header: 'Exportée le', key: 'exportee', width: 14 },
    ];
    meta.getRow(1).font = { bold: true };
    for (const r of rows) {
      meta.addRow({
        structure: r.structureLabel || '',
        code: r.moduleCode || '',
        module: r.moduleLabel || '',
        periode: periodCell(r),
        statut: r.statusLabel,
        auteur: r.authorLabel || '',
        creee: fmtDateTime(r.dates && r.dates.created),
        soumise: fmtDateTime(r.dates && r.dates.submitted),
        exportee: fmtDateTime(r.dates && r.dates.exported),
      });
    }

    const vals = wb.addWorksheet('Valeurs');
    vals.columns = [
      { header: 'Structure', key: 'structure', width: 24 },
      { header: 'Module', key: 'module', width: 34 },
      { header: 'Période / Événement', key: 'periode', width: 24 },
      { header: 'Champ', key: 'champ', width: 42 },
      { header: 'Valeur', key: 'valeur', width: 46 },
    ];
    vals.getRow(1).font = { bold: true };
    for (const r of rows) {
      const map = labelMap((r.module && r.module.fields) || []);
      const flat = flattenValues(r.values);
      const entries = Object.entries(flat);
      if (entries.length === 0) {
        vals.addRow({
          structure: r.structureLabel || '',
          module: r.moduleLabel || '',
          periode: periodCell(r),
          champ: '',
          valeur: '',
        });
      }
      for (const [path, value] of entries) {
        vals.addRow({
          structure: r.structureLabel || '',
          module: r.moduleLabel || '',
          periode: periodCell(r),
          champ: labelFor(map, path),
          valeur: value instanceof Date ? fmtDate(value) : String(value),
        });
      }
    }

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
    const doc = new PDFDocument({ margin: 42, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('SIGBD — Données exportées vers la base centrale', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555555').text(`Date d'export : ${fmtDateTime(new Date())}`);
    doc.moveDown(0.6);

    rows.forEach((r, idx) => {
      if (idx > 0) doc.moveDown(0.8);
      doc.fontSize(12).fillColor('#0B2A4A').text(`${r.moduleCode} — ${r.moduleLabel}`);
      doc.fontSize(9).fillColor('#333333');
      doc.text(`Structure : ${r.structureLabel || ''}   ·   ${periodCell(r) || '—'}   ·   Statut : ${r.statusLabel}`);
      doc.text(`Auteur : ${r.authorLabel || '—'}   ·   Exportée le : ${fmtDateTime(r.dates && r.dates.exported)}`);
      doc.moveDown(0.2);

      const map = labelMap((r.module && r.module.fields) || []);
      const flat = flattenValues(r.values);
      for (const [path, value] of Object.entries(flat)) {
        const v = value instanceof Date ? fmtDate(value) : String(value);
        doc.fillColor('#1A2433').text(`${labelFor(map, path)} : ${v}`, { indent: 10 });
      }
      if (Object.keys(flat).length === 0) {
        doc.fillColor('#777777').text('Aucune valeur.', { indent: 10 });
      }
    });

    doc.end();
  }

  await logAudit(user._id, format === 'xlsx' ? 'download_excel' : 'download_pdf', 'collecte', req.ip);
  return undefined;
}

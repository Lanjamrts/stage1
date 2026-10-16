"use strict";
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmtDate, fmtDateTime } from './exportModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const EMBLEM_PATH = join(__dirname, '..', '..', 'assets', 'emblem.png');

const PAGE_MARGIN = 42;
const COLOR_HEADER = '#0B2A4A';
const COLOR_BORDER = '#D9D9D9';
const COLOR_ALT = '#F2F5F8';
const COLOR_GRAY = '#666666';
const COLOR_BODY = '#1A2433';

function sanitize(s) {
  return String(s == null ? '' : s).replace(/[\u202f\u00a0]/g, ' ');
}

function emblemFile() {
  if (!existsSync(EMBLEM_PATH)) {
    throw new Error(`Fichier introuvable : ${EMBLEM_PATH} — copiez frontend/public/emblem-128.png vers backend/assets/emblem.png`);
  }
  return EMBLEM_PATH;
}

function drawHeader(doc) {
  const width = doc.page.width;
  const x = PAGE_MARGIN;
  let y = doc.y;
  doc.image(emblemFile(), x, y, { width: 34 });
  y += 40;
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR_HEADER).text('SIGBD', x, y);
  y += 17;
  doc.font('Helvetica').fontSize(8.5).fillColor('#333333').text(
    sanitize('Ministère de l\'Économie et des Finances — DGBF / SSEBF'),
    x, y, { width: width - 2 * x }
  );
  y += 15;
  doc.lineWidth(0.5).strokeColor('#999999').moveTo(x, y).lineTo(width - x, y).stroke();
  doc.y = y + 16;
}

function ensureSpace(doc, needed) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining < needed) {
    doc.addPage();
    drawHeader(doc);
    return true;
  }
  return false;
}

function cellLines(doc, text, width, size) {
  return Math.max(1, Math.ceil(doc.widthOfString(String(text), { font: 'Helvetica', size }) / Math.max(width - 6, 10)));
}

function drawTableRow(doc, x, y, colWidths, cells, rowHeight, isHeader) {
  let cx = x;
  cells.forEach((cell, ci) => {
    const w = colWidths[ci];
    doc.rect(cx, y, w, rowHeight)
      .fill(isHeader ? COLOR_HEADER : '#FFFFFF')
      .stroke(COLOR_BORDER);
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
      .fillColor(isHeader ? '#FFFFFF' : COLOR_BODY)
      .text(sanitize(cell), cx + 4, y + 3, { width: w - 8 });
    cx += w;
  });
}

export function renderPdf(model, doc) {
  doc.font('Helvetica');
  drawHeader(doc); // page 1

  // ---------- sommaire page 1 ----------
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_BODY).text(sanitize('Collecte des données'));
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_BODY);
  doc.text(sanitize(`Date d'export : ${fmtDateTime(model.generatedAt)}`));
  doc.text(`Régions : ${sanitize(model.filters.regions.join(', ') || '—')}`);
  doc.text(`Modules : ${sanitize(model.filters.modules.join(', ') || '—')}`);
  doc.text(`Nombre de saisies : ${model.count}`);
  doc.moveDown(0.6);

  if (model.count === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#777777').text('Aucune donnée à exporter pour cette sélection.');
    drawFooters(doc, doc.bufferedPageRange().count, model.generatedAt);
    return;
  }

  const contentW = doc.page.width - 2 * PAGE_MARGIN;

  for (const mod of model.modules) {
    for (const s of mod.saisies) {
      // ---------- titre de bloc ----------
      ensureSpace(doc, 42);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_HEADER).text(sanitize(`${mod.code} — ${mod.label}`));
      doc.moveDown(0.2);

      // ---------- grille d'informations ----------
      const exported = s.dates.exported ? fmtDateTime(s.dates.exported) : '—';
      const infoRows = [
        ['Structure', s.structure, 'Statut', s.statut],
        ['Période / Événement', s.periode, 'Auteur', s.auteur || '—'],
        ['Exportée le', exported, '', ''],
      ];
      let y = doc.y;
      for (const [l1, v1, l2, v2] of infoRows) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333333').text(`${l1} :`, PAGE_MARGIN, y, { width: 140 });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BODY).text(sanitize(v1), PAGE_MARGIN + 150, y, { width: 130 });
        if (l2) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333333').text(`${l2} :`, PAGE_MARGIN + 300, y, { width: 140 });
          doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BODY).text(sanitize(v2), PAGE_MARGIN + 450, y, { width: 130 });
        }
        y += 13;
      }
      doc.y = y + 6;

      // ---------- champs scalaires (tableau deux colonnes) ----------
      const scalarFields = mod.fields;
      const labelW = 150;
      const valW = contentW - labelW;
      let rowIdx = 0;
      for (const f of scalarFields) {
        const raw = s.scalars[f.key];
        const display = raw === '' ? '—' : raw instanceof Date ? fmtDate(raw) : String(raw);
        const lines = cellLines(doc, display, valW - 10, 8.5);
        const needed = Math.max(14, lines * 10.5 + 6);
        ensureSpace(doc, needed + 4);
        const ry = doc.y;
        if (rowIdx % 2 === 1) {
          doc.rect(PAGE_MARGIN, ry, contentW, needed).fill(COLOR_ALT);
        }
        doc.rect(PAGE_MARGIN, ry, contentW, needed).stroke(COLOR_BORDER);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_GRAY).text(sanitize(f.label), PAGE_MARGIN, ry + 3, { width: labelW - 8 });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BODY).text(sanitize(display), PAGE_MARGIN + labelW + 4, ry + 3, { width: valW - 12 });
        doc.y = ry + needed;
        rowIdx += 1;
      }
      doc.moveDown(0.2);

      // ---------- champs de type table ----------
      for (const table of mod.tables) {
        const rows = s.tables[table.key] || [];
        if (rows.length === 0) continue;
        const colLabels = ['Structure', 'Période / Événement', ...table.fields.map((f) => f.label)];
        const nSub = table.fields.length;
        const subW = nSub > 0 ? (contentW - 130) / nSub : 0;
        const colWidths = [65, 70, ...Array(nSub).fill(subW)];
        let headerDrawn = false;
        let ty = doc.y;
        const headerH = 16;
        ensureSpace(doc, headerH + 14);
        ty = doc.y;
        drawTableRow(doc, PAGE_MARGIN, ty, colWidths, colLabels, headerH, true);
        headerDrawn = true;
        ty += headerH;
        for (const row of rows) {
          const cells = [s.structure, s.periode, ...table.fields.map((f) => row[f.key] === '' ? '—' : row[f.key])];
          let maxLines = 1;
          cells.forEach((cell, ci) => {
            maxLines = Math.max(maxLines, cellLines(doc, cell, colWidths[ci] - 8, 8));
          });
          const rowH = maxLines * 10.5 + 6;
          const newPage = ensureSpace(doc, rowH + 6);
          ty = doc.y;
          if (newPage) {
            drawTableRow(doc, PAGE_MARGIN, ty, colWidths, colLabels, headerH, true);
            headerDrawn = true;
            ty += headerH;
          }
          drawTableRow(doc, PAGE_MARGIN, ty, colWidths, cells, rowH, false);
          ty += rowH;
        }
        doc.y = ty + 8;
      }
    }
  }

  drawFooters(doc, doc.bufferedPageRange().count, model.generatedAt);
}

function drawFooters(doc, total, generatedAt) {
  const range = doc.bufferedPageRange();
  const left = sanitize(`Document généré par SIGBD le ${fmtDateTime(generatedAt)}`);
  const bottom = doc.page.height - 30;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    doc.text(left, PAGE_MARGIN, bottom, { width: 340, align: 'left' });
    doc.text(`Page ${i + 1} / ${total}`, PAGE_MARGIN, bottom, { width: doc.page.width - 2 * PAGE_MARGIN, align: 'right' });
  }
}

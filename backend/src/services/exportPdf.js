"use strict";
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fieldHeaderLabel,
  formatPdfCell,
  computeTableColumnWidths,
} from './exportModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const EMBLEM_PATH = join(__dirname, '..', '..', 'assets', 'emblem.png');

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 42;
const CONTENT_W = PAGE_WIDTH - 2 * PAGE_MARGIN;
const COLOR_HEADER = '#0B2A4A';
const COLOR_BORDER = '#D9D9D9';
const COLOR_ALT = '#F2F5F8';
const COLOR_GRAY = '#555555';
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

function wrapLines(doc, text, width, size) {
  return Math.max(1, Math.ceil(doc.widthOfString(String(text), { font: 'Helvetica', size }) / Math.max(width - 8, 10)));
}

function heightOfString(doc, text, width, size) {
  return doc.heightOfString(String(text), { font: 'Helvetica', size, width: Math.max(width - 8, 10) });
}

function drawCell(doc, x, y, w, h, text, size, opts = {}) {
  const { bold = false, color = COLOR_BODY, align = 'left', fill = false, fillColor = '#FFFFFF' } = opts;
  if (fill) {
    doc.rect(x, y, w, h).fill(fillColor).stroke(COLOR_BORDER);
  } else {
    doc.rect(x, y, w, h).stroke(COLOR_BORDER);
  }
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
  doc.text(sanitize(text), x + 4, y + 3, { width: w - 8, align, lineBreak: false });
}

function drawPage1Header(doc) {
  const width = doc.page.width;
  const y0 = doc.y;
  const logoH = 64;
  const logoW = 64;
  const logoX = (width - logoW) / 2;
  doc.image(emblemFile(), logoX, y0, { height: logoH });
  let y = y0 + logoH + 10;
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR_HEADER).text('SIGBD', 0, y, { width, align: 'center' });
  y += 26;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_GRAY).text(
    sanitize('Ministère de l\'Économie et des Finances — DGBF / SSEBF'),
    0, y, { width, align: 'center' }
  );
  y += 14;
  doc.lineWidth(0.75).strokeColor(COLOR_HEADER).moveTo(PAGE_MARGIN, y).lineTo(width - PAGE_MARGIN, y).stroke();
  doc.y = y + 14;
}

function drawCompactHeader(doc) {
  const width = doc.page.width;
  const x = PAGE_MARGIN;
  const y0 = doc.y;
  doc.image(emblemFile(), x, y0, { width: 24 });
  const textX = x + 24 + 10;
  const textY = y0 + (24 - 8) / 2;
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_GRAY).text(
    sanitize('SIGBD — Ministère de l\'Économie et des Finances — DGBF / SSEBF'),
    textX, textY, { width: width - x - textX, lineBreak: false }
  );
  const lineY = y0 + 24 + 6;
  doc.lineWidth(0.75).strokeColor(COLOR_HEADER).moveTo(x, lineY).lineTo(width - x, lineY).stroke();
  doc.y = lineY + 10;
}

function ensureSpace(doc, needed) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining < needed) {
    doc.addPage();
    return true;
  }
  return false;
}

function regionsDisplay(model) {
  if (model.filters.regions.length) return model.filters.regions.join(', ');
  if (model.regionsPresent.length) return `Toutes les régions (${model.regionsPresent.join(', ')})`;
  return '—';
}

function modulesDisplay(model) {
  if (model.filters.modules.length) return model.filters.modules.join(', ');
  if (model.modulesPresent.length) return `Tous les modules (${model.modulesPresent.join(', ')})`;
  return '—';
}

function drawInfoGrid(doc, s) {
  const exported = s.dates.exported ? fmtDateTime(s.dates.exported) : '—';
  const metaLabels = ['Structure', 'Période / Événement', 'Statut de la saisie', 'Auteur', 'Exportée le'];
  const infoValues = [s.structure, s.periode, s.statut, s.auteur || '—', exported];
  const labelW = 100;
  const valW = 130;
  const label2W = 100;
  const val2W = CONTENT_W - labelW - valW - label2W;
  const colWidths = [labelW, valW, label2W, val2W];
  const infoRows = [
    [metaLabels[0], infoValues[0], metaLabels[4], infoValues[4]],
    [metaLabels[1], infoValues[1], metaLabels[3], infoValues[3]],
    [metaLabels[2], infoValues[2], '', ''],
  ];
  const rowH = 16;
  const gridH = infoRows.length * rowH;
  ensureSpace(doc, gridH + 6);
  let gy = doc.y;
  infoRows.forEach((row, ri) => {
    const rowY = gy + ri * rowH;
    drawCell(doc, PAGE_MARGIN, rowY, colWidths[0], rowH, row[0], 8, { bold: true, color: '#333333' });
    drawCell(doc, PAGE_MARGIN + colWidths[0], rowY, colWidths[1], rowH, row[1], 8);
    drawCell(doc, PAGE_MARGIN + colWidths[0] + colWidths[1], rowY, colWidths[2], rowH, row[2], 8, { bold: true, color: '#333333' });
    drawCell(doc, PAGE_MARGIN + colWidths[0] + colWidths[1] + colWidths[2], rowY, colWidths[3], rowH, row[3], 8);
  });
  doc.y = gy + gridH + 6;
}

function drawScalarFields(doc, mod, s) {
  const scalarFields = mod.fields;
  const labelColW = 150;
  const valColW = CONTENT_W - labelColW;
  let rowIdx = 0;
  for (const f of scalarFields) {
    const raw = s.scalars[f.key];
    const display = raw === '' ? '—' : raw instanceof Date ? fmtDate(raw) : String(raw);
    const lines = wrapLines(doc, display, valColW - 10, 8.5);
    const needed = Math.max(14, lines * 10.5 + 6);
    ensureSpace(doc, needed + 4);
    const ry = doc.y;
    if (rowIdx % 2 === 1) {
      doc.rect(PAGE_MARGIN, ry, CONTENT_W, needed).fill(COLOR_ALT).stroke(COLOR_BORDER);
    } else {
      doc.rect(PAGE_MARGIN, ry, CONTENT_W, needed).stroke(COLOR_BORDER);
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_GRAY).text(sanitize(f.label), PAGE_MARGIN, ry + 3, { width: labelColW - 8, lineBreak: false });
    const isNumber = f.type === 'integer' || f.type === 'decimal';
    const numText = isNumber ? fmtNumber(display) : display;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BODY).text(sanitize(numText), PAGE_MARGIN + labelColW + 4, ry + 3, { width: valColW - 12, align: isNumber ? 'right' : 'left', lineBreak: false });
    doc.y = ry + needed;
    rowIdx += 1;
  }
  doc.moveDown(0.2);
}

function drawTableFiche(doc, table, rows, s, startY) {
  const nSub = table.fields.length;
  let ty = startY;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const ficheTitle = `Ligne ${ri + 1}`;
    const titleH = 12;
    ensureSpace(doc, titleH + 4);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_HEADER).text(ficheTitle, PAGE_MARGIN, ty, { lineBreak: false });
    doc.x = PAGE_MARGIN;
    ty += titleH + 2;

    const labelW = 120;
    const valW = CONTENT_W - labelW;
    let rowY = ty;
    for (const f of table.fields) {
      const cellH = 14;
      ensureSpace(doc, cellH + 2);
      drawCell(doc, PAGE_MARGIN, rowY, labelW, cellH, f.label, 8, { bold: true, color: '#333333' });
      const val = formatPdfCell(f, row[f.key]);
      drawCell(doc, PAGE_MARGIN + labelW, rowY, valW, cellH, val, 8);
      rowY += cellH + 1;
    }
    ty = rowY + 4;
  }
  return ty;
}

function drawTableGrid(doc, table, rows, s, startY, size) {
  const colLabels = table.fields.map((f) => fieldHeaderLabel(f.label));
  const nSub = table.fields.length;

  // Prepare cell values (formatted)
  const formattedRows = rows.map((row) =>
    table.fields.map((f) => formatPdfCell(f, row[f.key]))
  );

  const { widths, useFiches, minWidths } = computeTableColumnWidths(doc, colLabels, formattedRows, CONTENT_W, size);

  if (useFiches) {
    return drawTableFiche(doc, table, rows, s, startY);
  }

  let ty = startY;
  const headerH = Math.max(16, ...colLabels.map((l) => heightOfString(doc, l, widths[0] - 8, size))) + 6;
  ensureSpace(doc, headerH + 14);

  colLabels.forEach((label, ci) => {
    const x = PAGE_MARGIN + widths.slice(0, ci).reduce((a, b) => a + b, 0);
    drawCell(doc, x, ty, widths[ci], headerH, label, size, { bold: true, color: '#FFFFFF', fill: true, fillColor: COLOR_HEADER });
  });
  ty += headerH;

  for (const row of formattedRows) {
    let maxLines = 1;
    row.forEach((cell, ci) => {
      maxLines = Math.max(maxLines, wrapLines(doc, cell, widths[ci] - 8, size));
    });
    const rowH2 = maxLines * (size * 1.3 + 1) + 6;

    if (ensureSpace(doc, rowH2 + 6)) {
      ty = doc.y;
      colLabels.forEach((label, ci) => {
        const x = PAGE_MARGIN + widths.slice(0, ci).reduce((a, b) => a + b, 0);
        drawCell(doc, x, ty, widths[ci], headerH, label, size, { bold: true, color: '#FFFFFF', fill: true, fillColor: COLOR_HEADER });
      });
      ty += headerH;
    }

    const rowY = ty;
    row.forEach((cell, ci) => {
      const x = PAGE_MARGIN + widths.slice(0, ci).reduce((a, b) => a + b, 0);
      const f = table.fields[ci];
      const isNumber = f && (f.type === 'integer' || f.type === 'decimal');
      drawCell(doc, x, rowY, widths[ci], rowH2, cell, size, { align: isNumber ? 'right' : 'left' });
    });
    ty += rowH2;
  }

  return ty + 8;
}

export function renderPdf(model, doc) {
  doc.font('Helvetica');
  let totalPages = 1;
  doc.on('pageAdded', () => {
    totalPages += 1;
    drawCompactHeader(doc);
  });

  // ---------- page 1 : en-tête formel centré ----------
  drawPage1Header(doc);

  // ---------- sommaire page 1 ----------
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_BODY)
    .text(sanitize('Collecte des données'), PAGE_MARGIN, doc.y, { width: CONTENT_W });
  doc.x = PAGE_MARGIN;
  doc.moveDown(0.4);

  const infoLines = [
    `Date d'export : ${fmtDateTime(model.generatedAt)}`,
    `Régions : ${regionsDisplay(model)}`,
    `Modules : ${modulesDisplay(model)}`,
    `Nombre de saisies : ${model.count}`,
  ];
  infoLines.forEach((line) => {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_BODY)
      .text(sanitize(line), PAGE_MARGIN, doc.y, { width: CONTENT_W });
    doc.x = PAGE_MARGIN;
  });
  doc.moveDown(0.6);

  if (model.count === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#777777').text('Aucune donnée à exporter pour cette sélection.');
    drawFooters(doc, totalPages, model.generatedAt);
    return;
  }

  for (const mod of model.modules) {
    for (const s of mod.saisies) {
      // ---------- titre de bloc ----------
      ensureSpace(doc, 42);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_HEADER).text(sanitize(`${mod.code} — ${mod.label}`), PAGE_MARGIN, doc.y, { width: CONTENT_W });
      doc.x = PAGE_MARGIN;
      doc.moveDown(0.2);

      // ---------- grille d'informations ----------
      drawInfoGrid(doc, s);

      // ---------- champs scalaires ----------
      drawScalarFields(doc, mod, s);

      // ---------- champs de type table ----------
      for (const table of mod.tables) {
        const rows = s.tables[table.key] || [];
        if (rows.length === 0) continue;
        const size = 8;
        const headerEstimate = 24;
        ensureSpace(doc, headerEstimate + 14);
        const beforeY = doc.y;
        doc.y = drawTableGrid(doc, table, rows, s, doc.y, size);
      }
    }
  }

  drawFooters(doc, totalPages, model.generatedAt);
}

function drawFooters(doc, total, generatedAt) {
  const left = sanitize(`Document généré par SIGBD le ${fmtDateTime(generatedAt)}`);
  const bottom = doc.page.height - 26;
  try {
    doc.page.margins.bottom = 0;
  } catch (e) {
    // marges non accessibles ; on tente quand même
  }
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    doc.text(left, PAGE_MARGIN, bottom, { width: 260, lineBreak: false });
    doc.text(`Page ${i + 1} / ${total}`, PAGE_MARGIN, bottom, { width: PAGE_WIDTH - 2 * PAGE_MARGIN, align: 'right', lineBreak: false });
  }
  try {
    doc.page.margins.bottom = PAGE_MARGIN;
  } catch (e) {
    // restauration
  }
  doc.switchToPage(total > 0 ? total - 1 : 0);
}

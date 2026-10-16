"use strict";
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fieldHeaderLabel,
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
  const logoW = 64; // emblème carré
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
  doc.y = y + 14; // espace avant le titre
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
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_BODY).text(sanitize('Collecte des données'), { lineBreak: false });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_BODY);
  doc.text(sanitize(`Date d'export : ${fmtDateTime(model.generatedAt)}`));
  doc.text(`Régions : ${sanitize(regionsDisplay(model))}`);
  doc.text(`Modules : ${sanitize(modulesDisplay(model))}`);
  doc.text(`Nombre de saisies : ${model.count}`);
  doc.moveDown(0.6);

  if (model.count === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#777777').text('Aucune donnée à exporter pour cette sélection.');
    drawFooters(doc, totalPages, model.generatedAt);
    return;
  }

  const metaLabels = ['Structure', 'Période / Événement', 'Statut de la saisie', 'Auteur', 'Exportée le'];

  for (const mod of model.modules) {
    for (const s of mod.saisies) {
      // ---------- titre de bloc ----------
      ensureSpace(doc, 42);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_HEADER).text(sanitize(`${mod.code} — ${mod.label}`));
      doc.moveDown(0.2);

      // ---------- grille d'informations ----------
      const exported = s.dates.exported ? fmtDateTime(s.dates.exported) : '—';
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
        // cellule 1 : label
        drawCell(doc, PAGE_MARGIN, rowY, colWidths[0], rowH, row[0], 8, { bold: true, color: '#333333' });
        // cellule 2 : valeur
        drawCell(doc, PAGE_MARGIN + colWidths[0], rowY, colWidths[1], rowH, row[1], 8);
        // cellule 3 : label
        drawCell(doc, PAGE_MARGIN + colWidths[0] + colWidths[1], rowY, colWidths[2], rowH, row[2], 8, { bold: true, color: '#333333' });
        // cellule 4 : valeur
        drawCell(doc, PAGE_MARGIN + colWidths[0] + colWidths[1] + colWidths[2], rowY, colWidths[3], rowH, row[3], 8);
      });
      doc.y = gy + gridH + 6;

      // ---------- champs scalaires (tableau deux colonnes) ----------
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

      // ---------- champs de type table ----------
      for (const table of mod.tables) {
        const rows = s.tables[table.key] || [];
        if (rows.length === 0) continue;
        const colLabels = ['Structure', 'Période / Événement', ...table.fields.map((f) => fieldHeaderLabel(f.label))];
        const nSub = table.fields.length;
        const subW = nSub > 0 ? (CONTENT_W - 130) / nSub : 0;
        const colWidths = [65, 70, ...Array(nSub).fill(subW)];
        const headerH = 16;
        let ty = doc.y;
        ensureSpace(doc, headerH + 14);
        ty = doc.y;
        colLabels.forEach((label, ci) => {
          drawCell(doc, PAGE_MARGIN + colWidths.slice(0, ci).reduce((a, b) => a + b, 0), ty, colWidths[ci], headerH, label, 8, { bold: true, color: '#FFFFFF', fill: true, fillColor: COLOR_HEADER });
        });
        ty += headerH;
        for (const row of rows) {
          const cells = [s.structure, s.periode, ...table.fields.map((f) => row[f.key] === '' ? '—' : row[f.key])];
          let maxLines = 1;
          cells.forEach((cell, ci) => {
            maxLines = Math.max(maxLines, wrapLines(doc, cell, colWidths[ci] - 8, 8));
          });
          const rowH2 = maxLines * 10.5 + 6;
          if (ensureSpace(doc, rowH2 + 6)) {
            ty = doc.y;
            colLabels.forEach((label, ci) => {
              drawCell(doc, PAGE_MARGIN + colWidths.slice(0, ci).reduce((a, b) => a + b, 0), ty, colWidths[ci], headerH, label, 8, { bold: true, color: '#FFFFFF', fill: true, fillColor: COLOR_HEADER });
            });
            ty += headerH;
          }
          const rowY = ty;
          cells.forEach((cell, ci) => {
            const isNumber = table.fields[ci - 2] && (table.fields[ci - 2].type === 'integer' || table.fields[ci - 2].type === 'decimal');
            const txt = isNumber ? fmtNumber(cell) : cell;
            drawCell(doc, PAGE_MARGIN + colWidths.slice(0, ci).reduce((a, b) => a + b, 0), rowY, colWidths[ci], rowH2, txt, 8, { align: (ci >= 2 && isNumber) ? 'right' : 'left' });
          });
          ty += rowH2;
        }
        doc.y = ty + 8;
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

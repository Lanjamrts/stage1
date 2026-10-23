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
  isPlainNumberField,
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

// Bandeau visible sur chaque page d'aperçu : données d'exemple, rien de réel.
export const PREVIEW_BANNER = 'APERÇU – DONNÉES D’EXEMPLE';

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
  const { bold = false, color = COLOR_BODY, align = 'left', fill = false, fillColor = '#FFFFFF', centerVertical = false } = opts;
  if (fill) {
    doc.rect(x, y, w, h).fill(fillColor).stroke(COLOR_BORDER);
  } else {
    doc.rect(x, y, w, h).stroke(COLOR_BORDER);
  }
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
  const textH = doc.heightOfString(String(text), { font: bold ? 'Helvetica-Bold' : 'Helvetica', size });
  const textY = centerVertical ? y + (h - textH) / 2 : y + 3;
  doc.text(sanitize(text), x + 4, textY, { width: w - 8, align, lineBreak: false });
}

// Hauteur d'une ligne libellé/valeur : couvre le texte le plus long sur plusieurs lignes.
// Pure (prend le doc pour heightOfString), exportée pour les tests.
export function rowHeight(doc, label, value, labelW, valueW, size = 8.5, padding = 6) {
  const h1 = doc.heightOfString(String(label), { font: 'Helvetica', size, width: Math.max(labelW - 8, 10) });
  const h2 = doc.heightOfString(String(value), { font: 'Helvetica', size, width: Math.max(valueW - 8, 10) });
  return Math.max(h1, h2) + padding;
}

function drawPage1Header(doc, preview = false) {
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
  if (preview) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#B42318').text(sanitize(PREVIEW_BANNER), 0, y + 8, { width, align: 'center' });
    doc.y = y + 22;
  } else {
    doc.y = y + 14;
  }
}

function drawCompactHeader(doc, preview = false) {
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
  if (preview) {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#B42318').text(sanitize(PREVIEW_BANNER), x, lineY + 7, { width: width - 2 * x, align: 'center', lineBreak: false });
    doc.y = lineY + 17;
  } else {
    doc.y = lineY + 10;
  }
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
  const labelW = 100;
  const valW = CONTENT_W - labelW;
  const pairs = [
    ['Structure', s.structure],
    ['Période / Événement', s.periode],
    ['Statut de la saisie', s.statut],
    ['Auteur', s.auteur || '—'],
    ['Exportée le', exported],
  ];
  let gy = doc.y;
  pairs.forEach(([label, value], i) => {
    const isLast = i === pairs.length - 1;
    const h = rowHeight(doc, label, value, labelW, valW, 8, 6);
    const rowH = Math.max(h, 16);
    // cellule gauche : libellé + bordure complète
    drawCell(doc, PAGE_MARGIN, gy, labelW, rowH, label, 8, { bold: true, color: '#333333' });
    // cellule droite : valeur + bordure complète (sauf dernière où le côté droit n'a pas de bordure vide)
    if (isLast) {
      drawCell(doc, PAGE_MARGIN + labelW, gy, valW, rowH, value, 8);
    } else {
      drawCell(doc, PAGE_MARGIN + labelW, gy, valW, rowH, value, 8);
    }
    gy += rowH + 4;
  });
  doc.y = gy + 4;
}

function drawBlockTitle(doc, mod, suite = false) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_HEADER).text(sanitize(`${mod.code} — ${mod.label}${suite ? ' (suite)' : ''}`), PAGE_MARGIN, doc.y, { width: CONTENT_W });
  doc.x = PAGE_MARGIN;
  doc.moveDown(0.2);
}

// T3 : titre au-dessus d'un champ de type table.
function drawTableTitle(doc, table) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_HEADER).text(sanitize(table.label), PAGE_MARGIN, doc.y, { width: CONTENT_W, lineBreak: false });
  doc.x = PAGE_MARGIN;
  doc.y += 8; // 8 pt après le titre avant l'en-tête du tableau
}

function drawTableFiche(doc, table, rows, s, startY) {
  const labelW = 120;
  const valW = CONTENT_W - labelW;
  let ty = startY;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const ficheTitle = `Ligne ${ri + 1}`;
    const titleH = 12;
    ensureSpace(doc, titleH + 4);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_HEADER).text(ficheTitle, PAGE_MARGIN, ty, { lineBreak: false });
    doc.x = PAGE_MARGIN;
    ty += titleH + 2;

    let rowY = ty;
    for (const f of table.fields) {
      const cellH = rowHeight(doc, f.label, formatPdfCell(f, row[f.key]), labelW, valW, 8, 5);
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
    drawCell(doc, x, ty, widths[ci], headerH, label, size, { bold: true, color: '#FFFFFF', fill: true, fillColor: COLOR_HEADER, centerVertical: true });
  });
  ty += headerH;

  for (const row of formattedRows) {
    let maxLines = 1;
    row.forEach((cell, ci) => {
      maxLines = Math.max(maxLines, wrapLines(doc, cell, widths[ci] - 8, size));
    });
    const rowH2 = Math.max(maxLines * (size * 1.3 + 1) + 6, 16);

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
      const plain = isNumber && isPlainNumberField(f);
      drawCell(doc, x, rowY, widths[ci], rowH2, cell, size, { align: plain ? 'left' : (isNumber ? 'right' : 'left') });
    });
    ty += rowH2;
  }

  return ty + 8;
}

// Calcule la hauteur nécessaire pour le titre + grille d'infos + champs scalaires
// d'une saisie, avec les mêmes fonctions que le rendu (rowHeight / heightOfString).
export function saisieBlockHeight(doc, mod, s, epnDict = {}) {
  let h = 0;
  // titre du bloc (fontSize 11 + moveDown 0.2)
  h += 14;
  // grille d'informations
  const labelW = 100;
  const valW = CONTENT_W - labelW;
  const exported = s.dates.exported ? fmtDateTime(s.dates.exported) : '—';
  const pairs = [
    ['Structure', s.structure],
    ['Période / Événement', s.periode],
    ['Statut de la saisie', s.statut],
    ['Auteur', s.auteur || '—'],
    ['Exportée le', exported],
  ];
  pairs.forEach(([label, value]) => {
    const hh = rowHeight(doc, label, value, labelW, valW, 8, 6);
    h += Math.max(hh, 16) + 4;
  });
  h += 4; // doc.y = gy + 4
  // champs scalaires (y compris les deux lignes « Ministère de tutelle » / « Régime »
  // ajoutées après chaque champ EPN)
  const labelColW = Math.floor(CONTENT_W * 0.38);
  const valColW = CONTENT_W - labelColW;
  const size = 8.5;
  const padding = 5;
  mod.fields.forEach((f) => {
    const raw = s.scalars[f.key];
    const display = raw === '' ? '—' : raw instanceof Date ? fmtDate(raw) : String(raw);
    const hLabel = doc.heightOfString(sanitize(f.label), { font: 'Helvetica', size, width: labelColW - 2 * padding });
    const hValue = doc.heightOfString(sanitize(display), { font: 'Helvetica', size, width: valColW - 2 * padding });
    h += Math.max(hLabel, hValue) + 2 * padding;
    if (f.source === 'epn') {
      const info = epnDict[raw] || {};
      for (const [label, value] of [
        ['Ministère de tutelle', info.ministere || ''],
        ['Régime', info.regime || ''],
      ]) {
        const h2 = doc.heightOfString(label, { font: 'Helvetica', size, width: labelColW - 2 * padding });
        const h3 = doc.heightOfString(sanitize(value), { font: 'Helvetica', size, width: valColW - 2 * padding });
        h += Math.max(h2, h3) + 2 * padding;
      }
    }
  });
  h += 12; // espace final moveDown
  return h;
}

export function renderPdf(model, doc, { preview = false } = {}) {
  doc.font('Helvetica');
  doc.on('pageAdded', () => {
    drawCompactHeader(doc, preview);
  });

  // ---------- page 1 : en-tête formel centré ----------
  drawPage1Header(doc, preview);

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
    const total = doc.bufferedPageRange().count;
    drawFooters(doc, total, model.generatedAt);
    doc.flushPages();
    return total;
  }

  for (const mod of model.modules) {
    for (const s of mod.saisies) {
      // ---------- T4 : ne pas séparer une saisie de son contenu ----------
      // Si le bloc (titre + grille + champs scalaires) ne tient pas dans l'espace restant,
      // sauter de page AVANT le titre du bloc.
      const blockNeeded = saisieBlockHeight(doc, mod, s, model.epnDict || {});
      if (ensureSpace(doc, blockNeeded)) {
        // nouvelle page déjà dotée de l'en-tête compact via pageAdded
      }

      // ---------- titre de bloc ----------
      drawBlockTitle(doc, mod);

      // ---------- grille d'informations ----------
      drawInfoGrid(doc, s);

      // ---------- champs scalaires ----------
      drawScalarFields(doc, mod, s, model.epnDict || {});
      doc.moveDown(0.15); // espace vertical ≥ 10 pt avant le titre de tableau

      // ---------- champs de type table ----------
      for (const table of mod.tables) {
        const rows = s.tables[table.key] || [];
        if (rows.length === 0) continue;
        const size = 8;
        // T3 : titre de tableau, jamais seul en bas de page.
        const titleH = 14;
        const headerEstimate = 24;
        if (ensureSpace(doc, titleH + headerEstimate + 16)) {
          // nouvelle page déjà dotée de l'en-tête compact via pageAdded
        }
        drawTableTitle(doc, table);
        doc.y = drawTableGrid(doc, table, rows, s, doc.y, size);
      }
    }
  }

  // ---------- T1 : pieds de page après le contenu, une seule passe ----------
  const range = doc.bufferedPageRange();
  const total = range.count;
  drawFooters(doc, total, model.generatedAt);
  doc.flushPages();
  return total;
}

function drawScalarFields(doc, mod, s, epnDict = {}) {
  const scalarFields = mod.fields;
  const labelColW = Math.floor(CONTENT_W * 0.38); // 38 % de la largeur utile pour le libellé
  const valColW = CONTENT_W - labelColW;
  const size = 8.5;
  const padding = 5;
  let rowIdx = 0;
  let drewAny = false; // un champ scalaire a déjà été dessiné sur cette page
  for (const f of scalarFields) {
    const raw = s.scalars[f.key];
    const display = raw === '' ? '—' : raw instanceof Date ? fmtDate(raw) : String(raw);
    // Une entrée par ligne à dessiner : le champ lui-même, puis, pour un champ EPN,
    // « Ministère de tutelle » et « Régime » juste après.
    const entries = [
      { label: sanitize(f.label), value: sanitize(display) },
    ];
    if (f.source === 'epn') {
      const info = epnDict[raw] || {};
      entries.push({ label: 'Ministère de tutelle', value: sanitize(info.ministere || '') });
      entries.push({ label: 'Régime', value: sanitize(info.regime || '') });
    }
    for (const e of entries) {
      const label = e.label;
      const value = e.value;
      doc.font('Helvetica-Bold').fontSize(size);
      const hLabel = doc.heightOfString(label, { width: labelColW - 2 * padding });
      doc.font('Helvetica').fontSize(size);
      const hValue = doc.heightOfString(value, { width: valColW - 2 * padding });
      const needed = Math.max(hLabel, hValue) + 2 * padding;
      const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
      if (remaining < needed && drewAny) {
        // couper entre deux champs et répéter le titre du bloc en (suite)
        doc.addPage();
        drawBlockTitle(doc, mod, true);
        drewAny = false;
      }
      const ry = doc.y;
      if (rowIdx % 2 === 1) {
        doc.rect(PAGE_MARGIN, ry, CONTENT_W, needed).fill(COLOR_ALT).stroke(COLOR_BORDER);
      } else {
        doc.rect(PAGE_MARGIN, ry, CONTENT_W, needed).stroke(COLOR_BORDER);
      }
      const textY = ry + (needed - size * 1.2) / 2; // centrage vertical approximatif
      doc.font('Helvetica-Bold').fontSize(size).fillColor(COLOR_GRAY).text(label, PAGE_MARGIN + padding, textY, { width: labelColW - 2 * padding, lineBreak: true });
      const isNumber = f.type === 'integer' || f.type === 'decimal';
      const plain = isNumber && isPlainNumberField(f);
      const numText = plain ? String(display) : (isNumber ? fmtNumber(display) : value);
      const valAlign = plain ? 'left' : (isNumber ? 'right' : 'left');
      doc.font('Helvetica').fontSize(size).fillColor(COLOR_BODY).text(numText, PAGE_MARGIN + labelColW + padding, textY, { width: valColW - 2 * padding, align: valAlign, lineBreak: true });
      doc.y = ry + needed;
      rowIdx += 1;
      drewAny = true;
    }
  }
  doc.moveDown(12 / 7.2); // 12 pt d'espace avant le titre du tableau suivant
}

function drawFooters(doc, total, generatedAt) {
  const left = sanitize(`Document généré par SIGBD le ${fmtDateTime(generatedAt)}`);
  const bottom = PAGE_HEIGHT - 30;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    doc.text(left, PAGE_MARGIN, bottom, { width: 260, lineBreak: false });
    doc.text(`Page ${i + 1} / ${total}`, PAGE_MARGIN, bottom, { width: PAGE_WIDTH - 2 * PAGE_MARGIN, align: 'right', lineBreak: false });
    doc.page.margins.bottom = PAGE_MARGIN;
  }
  doc.switchToPage(range.start + Math.max(range.count - 1, 0));
}

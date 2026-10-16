"use strict";
import ExcelJS from 'exceljs';
import {
  fmtDate,
  fmtDateTime,
  toMadagascarUtcDate,
  toMadagascarDateOnly,
  fieldHeaderLabel,
  META_LABELS,
} from './exportModel.js';

const HEADER_BG = 'FF0B2A4A';
const HEADER_COLOR = 'FFFFFFFF';
const BORDER_COLOR = 'FFBFBFBF';
const MAX_SHEET = 31;
const INVALID_SHEET_CHARS = /[\[\]:*?\/\\]/g;
const MIN_WIDTH = 12;
const MAX_WIDTH = 45;

function baseCellStyle(cell) {
  cell.font = { name: 'Calibri', size: 11 };
  cell.alignment = { vertical: 'center' };
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  };
}

function styleHeaderRow(sheet, rowNum, firstCol, lastCol) {
  const row = sheet.getRow(rowNum);
  row.height = 22;
  for (let c = firstCol; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: HEADER_COLOR } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
      left: { style: 'thin', color: { argb: BORDER_COLOR } },
      right: { style: 'thin', color: { argb: BORDER_COLOR } },
    };
  }
}

function setupPage(sheet) {
  sheet.pageSetup.orientation = 'landscape';
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  sheet.pageSetup.printTitlesRow = '1:1';
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function cleanSheetName(name) {
  return String(name || '').replace(INVALID_SHEET_CHARS, ' ').trim();
}

function uniqueSheetName(wb, base) {
  let name = cleanSheetName(base).slice(0, MAX_SHEET) || 'Feuil1';
  let counter = 2;
  while (wb.getWorksheet(name)) {
    const suffix = ` (${counter})`;
    name = cleanSheetName(base).slice(0, MAX_SHEET - suffix.length) + suffix;
    counter += 1;
    if (counter > 100) break;
  }
  return name;
}

function shortTableLabel(label) {
  const s = String(label || 'Tableau');
  return s.length > 24 ? s.slice(0, 24) : s;
}

function textLength(v) {
  return String(v == null ? '' : v).length;
}

function clampWidth(w) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

// Écrit une valeur typée dans une cellule Excel.
function writeValue(cell, value, kind) {
  baseCellStyle(cell);
  if (value === null || value === undefined || value === '') {
    cell.value = '';
    return;
  }
  if (kind === 'datetime') {
    const d = toMadagascarUtcDate(value);
    cell.value = d;
    cell.numFmt = 'dd/mm/yyyy hh:mm';
    cell.alignment = { vertical: 'center', horizontal: 'center' };
    return;
  }
  if (kind === 'date') {
    const d = toMadagascarDateOnly(value);
    cell.value = d;
    cell.numFmt = 'dd/mm/yyyy';
    cell.alignment = { vertical: 'center', horizontal: 'center' };
    return;
  }
  if (kind === 'integer' || kind === 'decimal') {
    cell.value = typeof value === 'number' ? value : Number(value) || 0;
    cell.numFmt = kind === 'decimal' ? '#,##0.00' : '#,##0';
    cell.alignment = { vertical: 'center', horizontal: 'right' };
    return;
  }
  cell.value = String(value);
  cell.alignment = { vertical: 'top', wrapText: true };
}

function computeColumnWidths(headerCells, rowsCells) {
  // headerCells: [{text, kind}], rowsCells: array of [{text, kind}]
  const maxes = headerCells.map((h) => textLength(h.text));
  for (const row of rowsCells) {
    for (let i = 0; i < row.length; i++) {
      maxes[i] = Math.max(maxes[i], textLength(row[i].text));
    }
  }
  return maxes.map((m) => clampWidth(m + 2));
}

export function buildWorkbook(model) {
  const wb = new ExcelJS.Workbook();
  wb.created = model.generatedAt;
  wb.modified = model.generatedAt;
  wb.creator = 'SIGBD';

  const regionsLabel =
    model.filters.regions.length
      ? model.filters.regions.join(', ')
      : model.regionsPresent.length
        ? `Toutes les régions (${model.regionsPresent.join(', ')})`
        : '—';
  const modulesLabel =
    model.filters.modules.length
      ? model.filters.modules.join(', ')
      : model.modulesPresent.length
        ? `Tous les modules (${model.modulesPresent.join(', ')})`
        : '—';

  // ------------------------------------------------------------------ Synthèse
  const synth = wb.addWorksheet('Synthèse');
  setupPage(synth);

  const synthHeaders = [
    'Structure',
    'Code module',
    'Module',
    'Période / Événement',
    'Statut de la saisie',
    'Auteur',
    'Créée le',
    'Soumise le',
    'Exportée le',
  ];
  const synthWidths = [26, 12, 34, 24, 20, 24, 20, 20, 20];
  synth.columns = synthWidths.map((w) => ({ width: w }));

  synth.getCell('A1').value = 'SIGBD — Collecte des données';
  synth.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0B2A4A' } };
  synth.getCell('A2').value = 'Ministère de l\'Économie et des Finances — DGBF / SSEBF';
  synth.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: 'FF444444' } };
  synth.getCell('A3').value = `Date d'export : ${fmtDateTime(model.generatedAt)}`;
  synth.getCell('A3').font = { name: 'Calibri', size: 10 };
  synth.getCell('A4').value = `Régions : ${regionsLabel}`;
  synth.getCell('A4').font = { name: 'Calibri', size: 10 };
  synth.getCell('A5').value = `Modules : ${modulesLabel}`;
  synth.getCell('A5').font = { name: 'Calibri', size: 10 };
  synth.getCell('A6').value = `Nombre de saisies : ${model.count}`;
  synth.getCell('A6').font = { name: 'Calibri', size: 10, bold: true };

  const headerRowNum = 8;
  synthHeaders.forEach((h, i) => synth.getCell(headerRowNum, i + 1).value = h);
  styleHeaderRow(synth, headerRowNum, 1, synthHeaders.length);

  let rowNum = headerRowNum + 1;
  const synthDataRows = [];
  if (model.count === 0) {
    const msg = synth.getCell(rowNum, 1);
    msg.value = 'Aucune donnée à exporter pour cette sélection.';
    msg.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF777777' } };
  } else {
    for (const mod of model.modules) {
      for (const s of mod.saisies) {
        const cells = [
          { text: s.structure, kind: 'text' },
          { text: mod.code, kind: 'text' },
          { text: mod.label, kind: 'text' },
          { text: s.periode, kind: 'text' },
          { text: s.statut, kind: 'text' },
          { text: s.auteur, kind: 'text' },
          { text: s.dates.created, kind: 'datetime' },
          { text: s.dates.submitted, kind: 'datetime' },
          { text: s.dates.exported, kind: 'datetime' },
        ];
        synthDataRows.push(cells);
        cells.forEach((c, i) => writeValue(synth.getCell(rowNum, i + 1), c.text, c.kind));
        for (let c = 7; c <= 9; c++) {
          const cell = synth.getCell(rowNum, c);
          cell.alignment = { vertical: 'center', horizontal: 'center' };
        }
        rowNum += 1;
      }
    }
  }
  // Recaler les largeurs sur le contenu réel (header + données).
  const synthCells = synthHeaders.map((h, i) => ({ text: h, kind: i < 6 ? 'text' : 'datetime' }));
  const synthWidthsFinal = computeColumnWidths(synthCells, synthDataRows);
  synth.columns = synthWidthsFinal.map((w) => ({ width: w }));
  synth.autoFilter = `A${headerRowNum}:${colLetter(synthHeaders.length)}${headerRowNum}`;
  synth.views = [{ state: 'frozen', ySplit: 1, topLeftCell: `A${headerRowNum + 1}` }];

  // ------------------------------------------------------------- une feuille par module
  for (const mod of model.modules) {
    const sheetName = uniqueSheetName(wb, mod.code);
    const sheet = wb.addWorksheet(sheetName);
    setupPage(sheet);

    const metaHeaders = ['Structure', 'Période / Événement', 'Statut de la saisie', 'Auteur'];
    const fieldHeaders = mod.fields.map((f) => fieldHeaderLabel(f.label));
    const headers = [...metaHeaders, ...fieldHeaders];
    const colCount = headers.length;

    // Largeurs : contenu max + 2, borné.
    const dataRows = [];
    for (const s of mod.saisies) {
      const cells = [
        { text: s.structure, kind: 'text' },
        { text: s.periode, kind: 'text' },
        { text: s.statut, kind: 'text' },
        { text: s.auteur, kind: 'text' },
      ];
      mod.fields.forEach((f) => {
        const raw = s.scalars[f.key];
        cells.push({ text: raw === '' ? '' : raw instanceof Date ? fmtDate(raw) : String(raw), kind: f.type });
      });
      dataRows.push(cells);
    }
    const headerCells = headers.map((h) => ({ text: h, kind: 'text' }));
    const widths = computeColumnWidths(headerCells, dataRows);
    sheet.columns = widths.map((w) => ({ width: w }));

    headers.forEach((h, i) => sheet.getCell(1, i + 1).value = h);
    styleHeaderRow(sheet, 1, 1, colCount);

    let r = 2;
    for (const s of mod.saisies) {
      writeValue(sheet.getCell(r, 1), s.structure, 'text');
      writeValue(sheet.getCell(r, 2), s.periode, 'text');
      writeValue(sheet.getCell(r, 3), s.statut, 'text');
      writeValue(sheet.getCell(r, 4), s.auteur, 'text');
      mod.fields.forEach((f, ci) => {
        writeValue(sheet.getCell(r, 5 + ci), s.scalars[f.key], f.type);
      });
      r += 1;
    }
    sheet.autoFilter = `A1:${colLetter(colCount)}1`;
    sheet.views = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }];
  }

  // ------------------------------------------------------------- feuilles des tableaux
  for (const mod of model.modules) {
    for (const table of mod.tables) {
      const sheetName = uniqueSheetName(wb, `${mod.code} – ${shortTableLabel(table.label)}`);
      const sheet = wb.addWorksheet(sheetName);
      setupPage(sheet);

      const headers = ['Structure', 'Période / Événement', ...table.fields.map((f) => fieldHeaderLabel(f.label))];
      const colCount = headers.length;

      const dataRows = [];
      for (const s of mod.saisies) {
        const tableRows = s.tables[table.key] || [];
        for (const row of tableRows) {
          const cells = [
            { text: s.structure, kind: 'text' },
            { text: s.periode, kind: 'text' },
          ];
          table.fields.forEach((f) => {
            const raw = row[f.key];
            cells.push({ text: raw === '' ? '' : raw instanceof Date ? fmtDate(raw) : String(raw), kind: f.type });
          });
          dataRows.push(cells);
        }
      }
      const headerCells = headers.map((h) => ({ text: h, kind: 'text' }));
      const widths = computeColumnWidths(headerCells, dataRows);
      sheet.columns = widths.map((w) => ({ width: w }));

      headers.forEach((h, i) => sheet.getCell(1, i + 1).value = h);
      styleHeaderRow(sheet, 1, 1, colCount);

      let r = 2;
      for (const s of mod.saisies) {
        const rows = s.tables[table.key] || [];
        for (const row of rows) {
          writeValue(sheet.getCell(r, 1), s.structure, 'text');
          writeValue(sheet.getCell(r, 2), s.periode, 'text');
          table.fields.forEach((f, ci) => writeValue(sheet.getCell(r, 3 + ci), row[f.key], f.type));
          r += 1;
        }
      }
      sheet.autoFilter = `A1:${colLetter(colCount)}1`;
      sheet.views = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }];
    }
  }

  return wb;
}

"use strict";
import ExcelJS from 'exceljs';
import { fmtDateTime } from './exportModel.js';

const HEADER_BG = 'FF0B2A4A';
const HEADER_COLOR = 'FFFFFFFF';
const BORDER_COLOR = 'FFBFBFBF';
const ALT_ROW_BG = 'FFF2F5F8';
const MAX_SHEET = 31;
const INVALID_SHEET_CHARS = /[\[\]:*?\/\\]/g;

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

function writeValue(cell, value, kind) {
  baseCellStyle(cell);
  if (value === null || value === undefined || value === '') {
    cell.value = '';
    return;
  }
  if (value instanceof Date) {
    cell.value = value;
    cell.numFmt = 'dd/mm/yyyy';
    cell.alignment = { vertical: 'center', horizontal: 'center' };
    return;
  }
  if (typeof value === 'number') {
    cell.value = value;
    cell.numFmt = kind === 'decimal' ? '#,##0.00' : '#,##0';
    cell.alignment = { vertical: 'center', horizontal: 'right' };
    return;
  }
  cell.value = String(value);
  cell.alignment = { vertical: 'top', wrapText: true };
}

export function buildWorkbook(model) {
  const wb = new ExcelJS.Workbook();
  wb.created = model.generatedAt;
  wb.modified = model.generatedAt;
  wb.creator = 'SIGBD';

  // ------------------------------------------------------------------ Synthèse
  const synth = wb.addWorksheet('Synthèse');
  setupPage(synth);

  const synthWidths = [26, 12, 34, 24, 12, 24, 22, 22, 22];
  synth.columns = synthWidths.map((w) => ({ width: w }));

  synth.getCell('A1').value = 'SIGBD — Collecte des données';
  synth.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0B2A4A' } };
  synth.getCell('A2').value = 'Ministère de l\'Économie et des Finances — DGBF / SSEBF';
  synth.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: 'FF444444' } };
  synth.getCell('A3').value = `Date d'export : ${fmtDateTime(model.generatedAt)}`;
  synth.getCell('A3').font = { name: 'Calibri', size: 10 };
  synth.getCell('A4').value = `Régions : ${model.filters.regions.length ? model.filters.regions.join(', ') : '—'}`;
  synth.getCell('A4').font = { name: 'Calibri', size: 10 };
  synth.getCell('A5').value = `Modules : ${model.filters.modules.length ? model.filters.modules.join(', ') : '—'}`;
  synth.getCell('A5').font = { name: 'Calibri', size: 10 };
  synth.getCell('A6').value = `Nombre de saisies : ${model.count}`;
  synth.getCell('A6').font = { name: 'Calibri', size: 10, bold: true };

  const headerRowNum = 8;
  const synthHeaders = [
    'Structure', 'Code module', 'Module', 'Période / Événement', 'Statut', 'Auteur',
    'Créée le', 'Soumise le', 'Exportée le',
  ];
  synthHeaders.forEach((h, i) => synth.getCell(headerRowNum, i + 1).value = h);
  styleHeaderRow(synth, headerRowNum, 1, synthHeaders.length);

  let rowNum = headerRowNum + 1;
  if (model.count === 0) {
    const msg = synth.getCell(rowNum, 1);
    msg.value = 'Aucune donnée à exporter pour cette sélection.';
    msg.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF777777' } };
  } else {
    for (const mod of model.modules) {
      for (const s of mod.saisies) {
        const vals = [
          s.structure, mod.code, mod.label, s.periode, s.statut, s.auteur,
          s.dates.created, s.dates.submitted, s.dates.exported,
        ];
        vals.forEach((v, i) => writeValue(synth.getCell(rowNum, i + 1), v, 'text'));
        synth.getCell(rowNum, 7).numFmt = 'dd/mm/yyyy hh:mm';
        synth.getCell(rowNum, 8).numFmt = 'dd/mm/yyyy hh:mm';
        synth.getCell(rowNum, 9).numFmt = 'dd/mm/yyyy hh:mm';
        for (let c = 7; c <= 9; c++) {
          const cell = synth.getCell(rowNum, c);
          if (cell.value === '') cell.value = '';
          cell.alignment = { vertical: 'center', horizontal: 'center' };
        }
        rowNum += 1;
      }
    }
  }
  synth.autoFilter = `A${headerRowNum}:${colLetter(synthHeaders.length)}${headerRowNum}`;
  synth.views = [{ state: 'frozen', ySplit: 1, topLeftCell: `A${headerRowNum + 1}` }];

  // ------------------------------------------------------------- une feuille par module
  const used = new Set(['Synthèse']);
  for (const mod of model.modules) {
    const sheetName = uniqueSheetName(wb, mod.code);
    used.add(sheetName);
    const sheet = wb.addWorksheet(sheetName);
    setupPage(sheet);

    const headers = ['Structure', 'Période / Événement', 'Auteur', 'Statut', ...mod.fields.map((f) => f.label)];
    const colCount = headers.length;
    sheet.columns = headers.map((h, i) => ({ width: i < 4 ? 22 : Math.min(60, Math.max(14, String(h).length + 8)) }));
    headers.forEach((h, i) => sheet.getCell(1, i + 1).value = h);
    styleHeaderRow(sheet, 1, 1, colCount);

    let r = 2;
    for (const s of mod.saisies) {
      const base = [s.structure, s.periode, s.auteur, s.statut];
      base.forEach((v, i) => writeValue(sheet.getCell(r, i + 1), v, 'text'));
      mod.fields.forEach((f, ci) => writeValue(sheet.getCell(r, 5 + ci), s.scalars[f.key], f.type));
      r += 1;
    }
    sheet.autoFilter = `A1:${colLetter(colCount)}1`;
    sheet.views = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }];
  }

  // ------------------------------------------------------------- feuilles des tableaux
  for (const mod of model.modules) {
    for (const table of mod.tables) {
      const sheetName = uniqueSheetName(wb, `${mod.code} – ${shortTableLabel(table.label)}`);
      used.add(sheetName);
      const sheet = wb.addWorksheet(sheetName);
      setupPage(sheet);

      const headers = ['Structure', 'Période / Événement', ...table.fields.map((f) => f.label)];
      const colCount = headers.length;
      sheet.columns = headers.map((h, i) => ({ width: i < 2 ? 22 : Math.min(60, Math.max(14, String(h).length + 8)) }));
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

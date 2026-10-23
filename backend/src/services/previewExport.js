"use strict";

// Aperçu de l'export (développeur uniquement).
// Construit une seule ligne de saisie d'exemple à partir d'un gabarit en cours
// de modification, sans lire ni écrire aucune saisie en base.
// Aucune nouvelle dépendance : réutilise les pures de exportModel.js.

import { fmtDate } from './exportModel.js';

const EXAMPLE_DATE = new Date(Date.UTC(2025, 5, 15)); // 15/06/2025, date passée fixe

// Valeur fictive pour un champ scalaire, par type.
function scalarExample(f, epnValue) {
  switch (f.type) {
    case 'text':
    case 'textarea':
      return 'Exemple de texte';
    case 'integer':
      return 12;
    case 'decimal':
      return 1234.56;
    case 'date':
      return EXAMPLE_DATE;
    case 'select': {
      if (f.source === 'epn' && epnValue) return epnValue.value;
      if (f.options && f.options.length) return f.options[0];
      return 'Exemple';
    }
    case 'multiselect': {
      if (f.source === 'epn' && epnValue) return [epnValue.value];
      if (f.options && f.options.length >= 2) return f.options.slice(0, 2);
      if (f.options && f.options.length) return [f.options[0]];
      return ['Exemple'];
    }
    case 'auto':
      return 'Exemple';
    default:
      return '';
  }
}

// 3 lignes de tableau remplies sous-champ par sous-champ.
function tableExample(f, epnValue) {
  const rows = [];
  for (let i = 0; i < 3; i += 1) {
    const row = {};
    for (const sub of f.fields || []) {
      row[sub.key] = scalarExample(sub, epnValue);
    }
    rows.push(row);
  }
  return rows;
}

// Une ligne de saisie d'exemple au format attendu par buildExportModel.
export function buildExampleRow(module, epnValue) {
  const values = {};
  for (const f of module.fields || []) {
    if (f.type === 'table') {
      values[f.key] = tableExample(f, epnValue);
    } else {
      values[f.key] = scalarExample(f, epnValue);
    }
  }
  return {
    module: { fields: module.fields },
    moduleCode: module.code || 'EXEMPLE',
    moduleLabel: module.label || 'Exemple',
    structureLabel: 'SRB – Exemple',
    periodeLabel: 'Octobre 2026',
    authorLabel: 'Exemple',
    statusLabel: 'Exportée',
    dates: {
      created: new Date(Date.UTC(2026, 9, 1)),
      submitted: new Date(Date.UTC(2026, 9, 2)),
      exported: new Date(Date.UTC(2026, 9, 3)),
    },
    values,
  };
}

function expandColumns(fields) {
  const cols = [];
  for (const f of fields || []) {
    cols.push({ field: f, kind: 'main' });
    if (f && f.source === 'epn') {
      cols.push({ field: f, kind: 'ministere' });
      cols.push({ field: f, kind: 'regime' });
    }
  }
  return cols;
}

function headerForColumn(c) {
  if (c.kind === 'main') return String(c.field.label);
  if (c.kind === 'ministere') return 'Ministère de tutelle';
  return 'Régime';
}

// Valeur d'affichage (texte/nombre) d'une cellule pour le JSON des sheets.
function cellDisplay(c, s, epnDict) {
  const epnValue = s.scalars[c.field.key] == null ? '' : s.scalars[c.field.key];
  if (c.kind === 'ministere') return (epnDict[epnValue] || {}).ministere || '';
  if (c.kind === 'regime') return (epnDict[epnValue] || {}).regime || '';
  const v = epnValue === '' || epnValue === null || epnValue === undefined ? '' : epnValue;
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === 'number') return v;
  return String(v);
}

// Construit la structure JSON lisible par le site depuis le modèle d'export.
export function buildSheets(model) {
  const sheets = [];
  const epnDict = model.epnDict || {};

  // ------------------------------------------------------------------ Synthèse
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
  const synthRows = [['APERÇU – DONNÉES D’EXEMPLE']];
  for (const mod of model.modules) {
    for (const s of mod.saisies) {
      synthRows.push([
        s.structure,
        mod.code,
        mod.label,
        s.periode,
        s.statut,
        s.auteur,
        cellDisplay({ kind: 'main', field: { type: 'date' } }, { scalars: { __: s.dates.created } }, epnDict),
        cellDisplay({ kind: 'main', field: { type: 'date' } }, { scalars: { __: s.dates.submitted } }, epnDict),
        cellDisplay({ kind: 'main', field: { type: 'date' } }, { scalars: { __: s.dates.exported } }, epnDict),
      ]);
    }
  }
  if (synthRows.length === 1) synthRows.push(['—', '', '', '', '', '', '', '', '']);
  sheets.push({ name: 'Synthèse', columns: synthHeaders, rows: synthRows });

  // ------------------------------------------------------------- une feuille par module
  for (const mod of model.modules) {
    if (mod.fields.length === 0) continue;
    const expCols = expandColumns(mod.fields);
    const fieldHeaders = expCols.map((c) => headerForColumn(c));
    const headers = ['Structure', 'Période / Événement', 'Statut de la saisie', 'Auteur', ...fieldHeaders];
    const rows = [];
    for (const s of mod.saisies) {
      const row = [s.structure, s.periode, s.statut, s.auteur];
      for (const c of expCols) {
        row.push(cellDisplay(c, s, epnDict));
      }
      rows.push(row);
    }
    if (rows.length === 0) rows.push(['—', '', '', '', ...expCols.map(() => '')]);
    sheets.push({ name: mod.code || 'Module', columns: headers, rows });
  }

  // ------------------------------------------------------------- feuilles des tableaux
  for (const mod of model.modules) {
    for (const table of mod.tables) {
      const headers = ['Structure', 'Période / Événement', ...table.fields.map((f) => String(f.label))];
      const rows = [];
      for (const s of mod.saisies) {
        const tableRows = s.tables[table.key] || [];
        for (const row of tableRows) {
          const r = [s.structure, s.periode];
          for (const f of table.fields) {
            const v = row[f.key];
            if (v instanceof Date) r.push(fmtDate(v));
            else if (typeof v === 'number') r.push(v);
            else r.push(v == null ? '' : String(v));
          }
          rows.push(r);
        }
      }
      if (rows.length === 0) rows.push(['—', '', ...table.fields.map(() => '')]);
      sheets.push({
        name: `${mod.code} – ${table.label}`,
        columns: headers,
        rows,
      });
    }
  }

  return sheets;
}

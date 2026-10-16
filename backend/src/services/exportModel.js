"use strict";

// Modèle de données d'export pour les collectes (fonctions pures, sans base de données).
// Les types de champs, libellés et structure sont lus depuis backend/src/seed/modules.js.

const TZ = 'Indian/Antananarivo';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const numberFmt = new Intl.NumberFormat('fr-FR');

// Heure de Madagascar (UTC+3), indépendante du fuseau horaire du serveur.
export function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return dateFmt.format(date);
}

export function fmtDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return dateTimeFmt.format(date);
}

// Milliers avec espace ordinaire (\u202f et \u00a0 remplacés par ' ').
export function fmtNumber(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return numberFmt.format(num).replace(/[\u202f\u00a0]/g, ' ');
}

// Composantes calendaires/horaires d'un instant dans le fuseau de Madagascar.
export function madagascarComponents(d) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t) => {
    const p = parts.find((x) => x.type === t);
    return p ? Number(p.value) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

// Date Excel dont les composantes UTC calquent l'affichage Madagascar (date-heure).
export function toMadagascarUtcDate(d) {
  const c = madagascarComponents(d);
  if (!c) return d;
  return new Date(Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second));
}

// Date Excel dont les composantes UTC calquent la date calendaire Madagascar (date seule, minuit).
export function toMadagascarDateOnly(d) {
  const c = madagascarComponents(d);
  if (!c) return d;
  return new Date(Date.UTC(c.year, c.month - 1, c.day));
}

function isEmpty(v) {
  return v === null || v === undefined || v === '';
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function toDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v;
  if (isEmpty(v)) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d;
}

function typeScalar(field, value) {
  switch (field.type) {
    case 'integer':
    case 'decimal':
    case 'auto':
      return isEmpty(value) ? '' : toNumber(value);
    case 'date':
      return toDate(value);
    case 'text':
    case 'textarea':
    case 'select':
      return isEmpty(value) ? '' : String(value).trim();
    case 'multiselect': {
      if (isEmpty(value)) return '';
      const arr = Array.isArray(value) ? value : [value];
      return arr.map((v) => String(v).trim()).filter(Boolean).join(', ');
    }
    default:
      return '';
  }
}

function typeTableRow(field, row) {
  const out = {};
  for (const sub of field.fields || []) {
    out[sub.key] = typeScalar(sub, row && row[sub.key]);
  }
  return out;
}

function periodeCell(s) {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) return `Événement du ${fmtDate(s.eventDate)}`;
  return '';
}

function regionOf(structureLabel) {
  if (!structureLabel) return '';
  const parts = String(structureLabel).split(' – ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

// Colonnes méta communes (Synthèse, feuilles modules, grille PDF). 'Statut'
// est conservé car un champ de gabarit peut s'appeler « Statut » et doit alors
// devenir « Statut (champ) » pour ne pas confondre avec « Statut de la saisie ».
export const META_LABELS = [
  'Structure',
  'Code module',
  'Module',
  'Période / Événement',
  'Statut de la saisie',
  'Statut',
  'Auteur',
  'Exportée le',
];

// Libellé de colonne pour un champ du gabarit : '(champ)' en cas de collision méta.
export function fieldHeaderLabel(label) {
  if (META_LABELS.includes(String(label))) {
    return `${label} (champ)`;
  }
  return String(label);
}

// Formate une cellule de tableau PDF pour un champ donné (jamais de String(Date) brute).
export function formatPdfCell(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date) {
    if (field.type === 'date') return fmtDate(value);
    return fmtDateTime(value);
  }
  if (typeof value === 'number') {
    if (field.type === 'integer' || field.type === 'decimal') return fmtNumber(value);
    return String(value);
  }
  return String(value).trim();
}

// Calcule les largeurs de colonnes d'un tableau PDF (pure, prend un doc pour widthOfString).
// Retourne { widths, useFiches, minWidths }.
export function computeTableColumnWidths(doc, labels, rows, contentW, size = 8) {
  const n = labels.length;
  const minWidths = [];
  const avgLengths = [];

  for (let ci = 0; ci < n; ci++) {
    let maxWordW = doc.widthOfString(String(labels[ci]), { font: 'Helvetica', size });
    let totalLen = String(labels[ci]).length;
    let count = 1;

    for (const row of rows) {
      const cell = String(row[ci] == null ? '' : row[ci]);
      const words = cell.split(/\s+/);
      for (const w of words) {
        if (w.length === 0) continue;
        maxWordW = Math.max(maxWordW, doc.widthOfString(w, { font: 'Helvetica', size }));
      }
      totalLen += cell.length;
      count += 1;
    }

    minWidths.push(maxWordW + 8);
    avgLengths.push(totalLen / count);
  }

  const sumMin = minWidths.reduce((a, b) => a + b, 0);
  const useFiches = sumMin > contentW;

  let widths;
  if (useFiches) {
    widths = [...minWidths];
  } else {
    const sumAvg = avgLengths.reduce((a, b) => a + b, 0);
    const extra = contentW - sumMin;
    widths = minWidths.map((mw, i) => {
      const share = sumAvg > 0 ? extra * (avgLengths[i] / sumAvg) : extra / n;
      return mw + share;
    });
    let sum = widths.reduce((a, b) => a + b, 0);
    const diff = contentW - sum;
    widths[0] += diff;
  }

  return { widths, useFiches, minWidths };
}

// Construit le modèle d'export à partir de lignes sérialisées (serializeSaisie avec withFields).
export function buildExportModel(rows, { filters = {}, generatedAt = new Date() } = {}) {
  const modulesMap = new Map();
  const regionsPresent = new Set();
  const modulesPresent = new Set();

  for (const r of rows || []) {
    const module = r.module || {};
    const fields = module.fields || [];
    const code = r.moduleCode || '';
    const label = r.moduleLabel || '';

    if (r.structureLabel) regionsPresent.add(regionOf(r.structureLabel));
    if (label) modulesPresent.add(label);

    let mod = modulesMap.get(code);
    if (!mod) {
      mod = {
        code,
        label,
        fields: fields.filter((f) => f.type !== 'table'),
        tables: fields.filter((f) => f.type === 'table'),
        saisies: [],
      };
      modulesMap.set(code, mod);
    }

    const knownKeys = new Set();
    for (const f of mod.fields) knownKeys.add(f.key);
    for (const f of mod.tables) knownKeys.add(f.key);

    const saisie = {
      structure: r.structureLabel || '',
      periode: periodeCell(r),
      auteur: r.authorLabel || '',
      statut: r.statusLabel || '',
      dates: {
        created: r.dates && r.dates.created ? toDate(r.dates.created) : '',
        submitted: r.dates && r.dates.submitted ? toDate(r.dates.submitted) : '',
        exported: r.dates && r.dates.exported ? toDate(r.dates.exported) : '',
      },
      scalars: {},
      tables: {},
      autresChamps: [],
    };

    for (const f of mod.fields) {
      saisie.scalars[f.key] = typeScalar(f, r.values && r.values[f.key]);
    }
    for (const f of mod.tables) {
      const raw = r.values && r.values[f.key];
      saisie.tables[f.key] = Array.isArray(raw) ? raw.map((row) => typeTableRow(f, row)) : [];
    }

    if (r.values && typeof r.values === 'object') {
      for (const [k, v] of Object.entries(r.values)) {
        if (!knownKeys.has(k)) {
          saisie.autresChamps.push({ cle: k, valeur: typeScalar({ type: 'text' }, v) });
        }
      }
    }

    mod.saisies.push(saisie);
  }

  const modules = [...modulesMap.values()];
  const count = modules.reduce((sum, m) => sum + m.saisies.length, 0);

  return {
    generatedAt,
    filters: {
      regions: Array.isArray(filters.regions) ? filters.regions : [],
      modules: Array.isArray(filters.modules) ? filters.modules : [],
    },
    regionsPresent: [...regionsPresent],
    modulesPresent: [...modulesPresent],
    count,
    modules,
  };
}

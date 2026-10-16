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

// Construit le modèle d'export à partir de lignes sérialisées (serializeSaisie avec withFields).
export function buildExportModel(rows, { filters = {}, generatedAt = new Date() } = {}) {
  const modulesMap = new Map();

  for (const r of rows || []) {
    const module = r.module || {};
    const fields = module.fields || [];
    const code = r.moduleCode || '';
    const label = r.moduleLabel || '';

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
    count,
    modules,
  };
}

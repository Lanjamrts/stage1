// SIGBD — Règles de validation partagées navigateur / serveur.
// MÊMES règles des deux côtés (SPEC §7). Le navigateur affiche les messages
// instantanément, le serveur reste la vérité finale.
// Fichier ESM sans dépendances, importé par /backend (Node) et /frontend (Vite).

const REQUIRED = 'Ce champ est obligatoire.';

export function isEmptyValue(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function parseDateOnly(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function todayOnly(ctx) {
  const t = ctx.today ? parseDateOnly(ctx.today) : new Date();
  const base = t || new Date();
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

function resolveMax(max, ctx) {
  if (max === 'currentYear') return todayOnly(ctx).getFullYear();
  return max;
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function labelOf(field) {
  return field.label || field.key;
}

// Options d'un champ select/multiselect : soit field.options (liste littérale),
// soit field.source (liste de référence résolue par l'appelant via ctx.options).
function optionsOf(field, ctx) {
  if (Array.isArray(field.options) && field.options.length) return field.options;
  if (field.source && ctx.options && Array.isArray(ctx.options[field.source])) {
    return ctx.options[field.source];
  }
  return null;
}

// Validateur d'une liste de champs (module.fields) contre des valeurs.
// ctx : { today?, options?: {source: [valeurs]}, partial? }
// partial = true : on n'exige pas les champs obligatoires (brouillon),
// mais on contrôle les types des valeurs présentes.
// Retourne un objet d'erreurs indexé par chemin : 'champ' ou 'table.0.souschamp'.
export function validateForm(fields, values, ctx = {}) {
  const errors = {};
  const vals = values && typeof values === 'object' ? values : {};
  // ctx enrichi : afterField a besoin des valeurs voisines et des libellés
  const vctx = { ...ctx, peerValues: vals, fields: fields || [] };

  for (const field of fields || []) {
    if (field.type === 'auto') continue; // rempli par le serveur
    const path = field.key;
    const raw = vals[field.key];

    if (field.type === 'table') {
      const rows = Array.isArray(raw) ? raw : [];
      if (field.required && !ctx.partial) {
        if (rows.length === 0) {
          errors[path] = 'Ce tableau doit contenir au moins une ligne.';
          continue;
        }
      }
      if (rows.length === 0) continue;

      // Unicité par colonne (dans un même tableau)
      const seen = {};
      rows.forEach((row, i) => {
        const r = row && typeof row === 'object' ? row : {};
        for (const sub of field.fields || []) {
          const subPath = `${path}.${i}.${sub.key}`;
          const subRaw = r[sub.key];
          if (sub.required && !ctx.partial && isEmptyValue(subRaw)) {
            errors[subPath] = REQUIRED;
            continue;
          }
          if (isEmptyValue(subRaw)) continue;

          const typeErr = validateType(sub, subRaw, vctx);
          if (typeErr) {
            errors[subPath] = typeErr;
            continue;
          }
          if (sub.unique) {
            const k = sub.key;
            if (!seen[k]) seen[k] = new Set();
            const norm = String(subRaw).trim().toLowerCase();
            if (seen[k].has(norm)) {
              errors[subPath] = sub.uniqueMessage || 'Cette valeur existe déjà dans ce tableau.';
            } else {
              seen[k].add(norm);
            }
          }
        }
      });
      continue;
    }

    // Champ simple
    if (isEmptyValue(raw)) {
      if (field.required && !ctx.partial) errors[path] = REQUIRED;
      continue;
    }
    const err = validateType(field, raw, vctx);
    if (err) errors[path] = err;
  }

  return errors;
}

// Contrôle de type / règles d'une valeur non vide.
function validateType(field, raw, ctx) {
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const s = String(raw);
      if (field.maxLength && s.length > field.maxLength) {
        return `Ce champ ne doit pas dépasser ${field.maxLength} caractères.`;
      }
      return null;
    }
    case 'integer':
    case 'decimal': {
      const n = toNumber(raw);
      if (n === null) {
        return field.type === 'integer' ? 'Ce champ doit être un nombre entier.' : 'Ce champ doit être un nombre.';
      }
      if (field.type === 'integer' && !Number.isInteger(n)) return 'Ce champ doit être un nombre entier.';
      if (field.min !== undefined && n < field.min) {
        return `La valeur doit être supérieure ou égale à ${field.min}.`;
      }
      const max = field.max !== undefined ? resolveMax(field.max, ctx) : undefined;
      if (max !== undefined && n > max) {
        return `La valeur doit être inférieure ou égale à ${max}.`;
      }
      return null;
    }
    case 'date': {
      const d = parseDateOnly(raw);
      if (!d) return 'Ce champ doit être une date valide.';
      if (field.noFuture) {
        const t = todayOnly(ctx);
        if (d.getTime() > t.getTime()) return 'La date ne peut pas être dans le futur.';
      }
      if (field.afterField) {
        const other = parseDateOnly(ctx.peerValues ? ctx.peerValues[field.afterField] : null);
        if (other && d.getTime() < other.getTime()) {
          const peer = (ctx.fields || []).find((f) => f.key === field.afterField);
          return `La date doit être postérieure ou égale à ${peer ? labelOf(peer) : field.afterField}.`;
        }
      }
      return null;
    }
    case 'select': {
      const opts = optionsOf(field, ctx);
      if (opts && !opts.includes(String(raw))) return "Cette valeur n'est pas autorisée.";
      return null;
    }
    case 'multiselect': {
      const opts = optionsOf(field, ctx);
      const arr = Array.isArray(raw) ? raw : [raw];
      if (opts && arr.some((v) => !opts.includes(String(v)))) return "Cette valeur n'est pas autorisée.";
      return null;
    }
    default:
      return null;
  }
}

// Validation « soumission » : complète (required + types).
export function validateSubmit(fields, values, ctx = {}) {
  return validateForm(fields, values, { ...ctx, partial: false });
}

// Validation « brouillon » : types seulement, pas d'obligation.
export function validateDraft(fields, values, ctx = {}) {
  return validateForm(fields, values, { ...ctx, partial: true });
}

// Champs auto (lecture seule) remplis par le serveur / affichés par le client.
// field.auto : 'region' | 'structure' | 'author' | 'total'
// field.sum  : pour 'total', clés des champs à additionner.
export function computeAutos(fields, values, ctx = {}) {
  const out = {};
  for (const field of fields || []) {
    if (field.type !== 'auto') continue;
    if (field.auto === 'total') {
      const keys = Array.isArray(field.sum) ? field.sum : [];
      let total = 0;
      for (const k of keys) {
        const n = toNumber(values && values[k]);
        if (n !== null) total += n;
      }
      out[field.key] = total;
    } else if (field.auto === 'region') {
      out[field.key] = ctx.region || '';
    } else if (field.auto === 'structure') {
      out[field.key] = ctx.structure || '';
    } else if (field.auto === 'author') {
      out[field.key] = ctx.author || '';
    }
  }
  return out;
}

// Libellé français d'un statut de saisie.
export const STATUS_LABELS = {
  brouillon: 'Brouillon',
  soumise: 'Soumise',
  rejetee: 'Rejetée',
  validee: 'Validée',
  exportee: 'Exportée',
  archivee: 'Archivée',
};

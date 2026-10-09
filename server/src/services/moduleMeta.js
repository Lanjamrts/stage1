"use strict";

// Résolution des listes de référence utilisées par les champs select/multiselect
// (field.source : 'structures' | 'epn' | 'std' | 'directions' | 'services' | 'grades').
import Structure from '../models/Structure.js';
import Referentiel from '../models/Referentiel.js';

// Parcourt une liste de champs (avec sous-champs de tableaux) et retourne
// la liste des sources distinctes utilisées.
export function sourcesOf(fields) {
  const out = new Set();
  const walk = (list) => {
    for (const f of list || []) {
      if (f.source) out.add(f.source);
      if (Array.isArray(f.fields)) walk(f.fields);
    }
  };
  walk(fields);
  return [...out];
}

// Résout les sources en listes de libellés (tri alphabétique).
export async function resolveOptions(sources) {
  const out = {};
  for (const source of sources) {
    if (source === 'structures') {
      const rows = await Structure.find({ active: true }).sort({ label: 1 }).lean();
      out[source] = rows.map((s) => s.label);
    } else {
      const rows = await Referentiel.find({ type: source }).sort({ value: 1 }).lean();
      out[source] = rows.map((r) => r.value);
    }
  }
  return out;
}

// Options complètes pour un module donné.
export async function optionsForModule(moduleDoc) {
  return resolveOptions(sourcesOf(moduleDoc.fields));
}

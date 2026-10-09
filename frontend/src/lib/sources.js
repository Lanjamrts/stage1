// Sources de listes de référence utilisées par les champs select/multiselect
// (miroir de backend/src/services/moduleMeta.js — même structure que shared/rules)
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

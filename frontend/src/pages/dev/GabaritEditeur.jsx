import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../components/Common/Toast/Toast.jsx';
import DynamicForm from '../../components/Form/DynamicForm.jsx';
import { sourcesOf } from '../../lib/sources.js';

const FIELD_TYPES = [
  ['text', 'Texte court'],
  ['textarea', 'Texte long'],
  ['integer', 'Nombre entier'],
  ['decimal', 'Nombre décimal'],
  ['date', 'Date'],
  ['select', 'Liste (choix unique)'],
  ['multiselect', 'Listes (choix multiple)'],
  ['table', 'Tableau'],
  ['auto', 'Calculé (automatique)'],
];

const AUTO_KINDS = [
  ['total', 'Somme des champs'],
  ['region', 'Région (automatique)'],
  ['structure', 'Structure (automatique)'],
  ['author', 'Auteur (automatique)'],
];

const SOURCES = [
  ['', '— valeurs en dur —'],
  ['structures', 'Structures'],
  ['epn', 'EPN'],
  ['std', 'STD'],
  ['directions', 'Directions'],
  ['services', 'Services'],
  ['grades', 'Grades'],
];

const STRUCTURE_TYPES = [
  ['SRB', 'SRB'],
  ['SRSP', 'SRSP'],
  ['SRPE', 'SRPE'],
  ['CIRBF', 'CIRBF'],
  ['DRBF', 'DRBF'],
  ['SSEBF', 'SSEBF'],
  ['DGBF', 'DGBF'],
  ['CELLULE_INFO', 'Cellule informatique'],
];

const KEY_RE = /^[a-z][a-z0-9_]*$/i;

const inputCls =
  'w-full h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30';
const numCls = 'w-[110px] h-[36px] px-2 rounded-lg border border-[#D6DCE5] bg-white text-sm';

// Un champ du gabarit : clé, libellé, type, règles. Récursif pour les tableaux.
function FieldCard({ field, depth, onChange, onRemove }) {
  const patch = (p) => onChange({ ...field, ...p });

  const toggleRule = (name) => (e) => {
    if (e.target.checked) patch({ [name]: true });
    else {
      const next = { ...field };
      delete next[name];
      onChange(next);
    }
  };

  const subs = field.fields || [];

  const updateSub = (i, next) => {
    const arr = [...subs];
    arr[i] = next;
    patch({ fields: arr });
  };
  const addSub = () => {
    const i = subs.length + 1;
    patch({ fields: [...subs, { key: `champ_${i}`, label: `Champ ${i}`, type: 'text' }] });
  };
  const removeSub = (i) => patch({ fields: subs.filter((_, j) => j !== i) });

  return (
    <div
      className={`rounded-lg border border-[#E3E8EF] bg-[#FBFCFE] p-4 ${depth > 1 ? 'ml-4' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <div>
            <label className="block text-[12px] font-semibold text-[#0B2A4A] mb-1">
              Clé <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={field.key || ''}
              onChange={(e) => patch({ key: e.target.value })}
            />
            {field.key && !KEY_RE.test(field.key) && (
              <p className="text-xs text-[#B42318] mt-1">
                Lettres, chiffres et _ ; doit commencer par une lettre.
              </p>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#0B2A4A] mb-1">
              Libellé <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={field.label || ''}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#0B2A4A] mb-1">Type</label>
            <select
              className={inputCls}
              value={field.type || 'text'}
              onChange={(e) => {
                const next = { ...field, type: e.target.value };
                if (e.target.value !== 'select' && e.target.value !== 'multiselect') {
                  delete next.source;
                }
                onChange(next);
              }}
            >
              {FIELD_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="h-[32px] px-3 rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] text-xs font-semibold text-[#B42318] hover:bg-[#FDE7E5] shrink-0"
        >
          Retirer
        </button>
      </div>

      {/* Règles selon le type */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-3 text-sm">
        {field.type !== 'auto' && (
          <label className="inline-flex items-center gap-2 text-[#1A2433]">
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={toggleRule('required')}
              className="accent-[#1F5FA8]"
            />
            Obligatoire
          </label>
        )}

        {(field.type === 'text' || field.type === 'textarea') && (
          <label className="inline-flex items-center gap-2 text-[#1A2433]">
            Taille max
            <input
              type="number"
              className={numCls}
              value={field.maxLength ?? ''}
              onChange={(e) =>
                patch({ maxLength: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>
        )}

        {field.type === 'text' && (
          <label className="inline-flex items-center gap-2 text-[#1A2433]">
            <input
              type="checkbox"
              checked={!!field.unique}
              onChange={toggleRule('unique')}
              className="accent-[#1F5FA8]"
            />
            Valeur unique
          </label>
        )}

        {(field.type === 'integer' || field.type === 'decimal') && (
          <>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              Minimum
              <input
                type="number"
                className={numCls}
                value={field.min ?? ''}
                onChange={(e) =>
                  patch({ min: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              Maximum
              <input
                type="number"
                className={numCls}
                value={typeof field.max === 'number' ? field.max : ''}
                placeholder={field.max === 'currentYear' ? 'currentYear' : ''}
                onChange={(e) =>
                  patch({ max: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              <input
                type="checkbox"
                checked={field.max === 'currentYear'}
                onChange={(e) => patch({ max: e.target.checked ? 'currentYear' : undefined })}
                className="accent-[#1F5FA8]"
              />
              Maximum = année en cours
            </label>
          </>
        )}

        {field.type === 'date' && (
          <>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              <input
                type="checkbox"
                checked={!!field.noFuture}
                onChange={toggleRule('noFuture')}
                className="accent-[#1F5FA8]"
              />
              Pas de date future
            </label>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              Après le champ (clé)
              <input
                type="text"
                className={numCls}
                value={field.afterField || ''}
                onChange={(e) => patch({ afterField: e.target.value || undefined })}
              />
            </label>
          </>
        )}

        {(field.type === 'select' || field.type === 'multiselect') && (
          <>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              Source
              <select
                className={numCls}
                style={{ width: 'auto', minWidth: '170px' }}
                value={field.source || ''}
                onChange={(e) => {
                  if (e.target.value) patch({ source: e.target.value });
                  else {
                    const next = { ...field };
                    delete next.source;
                    onChange(next);
                  }
                }}
              >
                {SOURCES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {!field.source && (
              <label className="inline-flex items-center gap-2 text-[#1A2433] flex-1 min-w-[260px]">
                Valeurs (séparées par des virgules)
                <input
                  type="text"
                  className="flex-1 h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm"
                  value={(field.options || []).join(', ')}
                  onChange={(e) => {
                    const opts = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    patch({ options: opts.length ? opts : undefined });
                  }}
                />
              </label>
            )}
          </>
        )}

        {field.type === 'auto' && (
          <>
            <label className="inline-flex items-center gap-2 text-[#1A2433]">
              Calcul
              <select
                className={numCls}
                style={{ width: 'auto' }}
                value={field.auto || 'total'}
                onChange={(e) => patch({ auto: e.target.value })}
              >
                {AUTO_KINDS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {field.auto === 'total' && (
              <label className="inline-flex items-center gap-2 text-[#1A2433]">
                Somme de (clés, séparées par des virgules)
                <input
                  type="text"
                  className="w-[240px] h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm"
                  value={(field.sum || []).join(', ')}
                  onChange={(e) =>
                    patch({
                      sum: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            )}
          </>
        )}
      </div>

      {/* Sous-champs d'un tableau */}
      {field.type === 'table' && (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] font-semibold text-[#0B2A4A]">Sous-champs</p>
          {depth >= 3 && (
            <p className="text-xs text-[#5B6778]">Profondeur maximale atteinte (3 niveaux).</p>
          )}
          {subs.map((sub, i) => (
            <FieldCard
              key={i}
              field={sub}
              depth={depth + 1}
              onChange={(next) => updateSub(i, next)}
              onRemove={() => removeSub(i)}
            />
          ))}
          {subs.length === 0 && (
            <p className="text-xs text-[#B42318]">Un tableau doit contenir au moins un sous-champ.</p>
          )}
          {depth < 3 && (
            <button
              onClick={addSub}
              className="h-[32px] px-3 rounded-lg border border-[#D6DCE5] text-xs font-semibold text-[#1F5FA8] hover:bg-[#EBF3FC]"
            >
              + Ajouter un sous-champ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// « Éditeur de gabarit » (SPEC §4, developpeur) : métadonnées + champs +
// aperçu avec le moteur de gabarits, et publication d'une nouvelle version.
export default function GabaritEditeur() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [meta, setMeta] = useState(null); // {code,label,periodicity,kind,structureTypes,version,active}
  const [fields, setFields] = useState([]);
  const [initialFields, setInitialFields] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState({});

  const sources = useMemo(() => sourcesOf(fields), [fields]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(`/modules/${id}`)
      .then((m) => {
        if (cancelled) return;
        setMeta({
          code: m.code,
          label: m.label,
          periodicity: m.periodicity,
          kind: m.kind,
          structureTypes: m.structureTypes,
          active: m.active,
        });
        setVersion(m.version);
        setFields(m.fields || []);
        setInitialFields(m.fields || []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Options des sources de référence pour l'aperçu
  useEffect(() => {
    let cancelled = false;
    if (sources.length === 0) {
      setOptions({});
      return;
    }
    Promise.all(sources.map((s) => api(`/referentiels/${s}`).catch(() => ({ values: [] })))).then(
      (lists) => {
        if (cancelled) return;
        const map = {};
        sources.forEach((src, i) => {
          map[src] = lists[i].values;
        });
        setOptions(map);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [sources]);

  const setFieldAt = (i, next) =>
    setFields((list) => {
      const arr = [...list];
      arr[i] = next;
      return arr;
    });
  const removeFieldAt = (i) => setFields((list) => list.filter((_, j) => j !== i));
  const addField = () =>
    setFields((list) => [
      ...list,
      { key: `champ_${list.length + 1}`, label: `Champ ${list.length + 1}`, type: 'text' },
    ]);

  const validateDraft = () => {
    if (!meta || !meta.label.trim()) return 'Le libellé du gabarit est obligatoire.';
    if (fields.length === 0) return 'Le gabarit doit contenir au moins un champ.';
    const seen = new Set();
    let issue = null;
    const walk = (list, prefix) => {
      for (const f of list) {
        const k = String(f.key || '').trim();
        if (!k) {
          issue = 'Chaque champ doit avoir une clé.';
          return;
        }
        if (!KEY_RE.test(k)) return (issue = `Clé de champ invalide : « ${k} ».`);
        const full = prefix ? `${prefix}.${k}` : k;
        if (seen.has(full)) return (issue = `Clé de champ dupliquée : « ${full} ».`);
        seen.add(full);
        if (!String(f.label || '').trim()) return (issue = 'Chaque champ doit avoir un libellé.');
        if (f.type === 'table') {
          if (!f.fields || f.fields.length === 0)
            return (issue = `Le champ tableau « ${k} » doit contenir au moins un sous-champ.`);
          walk(f.fields, full);
        }
        if (issue) return;
      }
    };
    walk(fields, '');
    return issue;
  };

  const publish = async () => {
    const issue = validateDraft();
    if (issue) {
      addToast(issue, 'error');
      return;
    }
    setConfirmOpen(true);
  };

  const confirmPublish = async () => {
    setBusy(true);
    try {
      const res = await api(`/config/modules/${id}`, {
        method: 'PUT',
        body: {
          label: meta.label,
          periodicity: meta.periodicity,
          kind: meta.kind,
          structureTypes: meta.structureTypes,
          fields,
        },
      });
      setVersion(res.version);
      setInitialFields(fields);
      addToast(`Version ${res.version} publiée.`, 'success');
      setConfirmOpen(false);
    } catch (err) {
      addToast(err.message, 'error');
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // Diff de publication : champs ajoutés / modifiés / retirés (zip e_publication).
  const publishDiff = (() => {
    const before = new Map(initialFields.map((f) => [f.key, f]));
    const after = new Map(fields.map((f) => [f.key, f]));
    let added = 0;
    let modified = 0;
    let removed = 0;
    for (const [k, f] of after) {
      if (!before.has(k)) added += 1;
      else if (JSON.stringify(before.get(k)) !== JSON.stringify(f)) modified += 1;
    }
    for (const k of before.keys()) if (!after.has(k)) removed += 1;
    return { added, modified, removed };
  })();

  if (loading) return <div className="text-[#5B6778]">Chargement...</div>;

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
        <button
          onClick={() => navigate('/parametrage')}
          className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
        >
          Retour au paramétrage
        </button>
      </div>
    );
  }

  if (!meta) return null;

  const setMetaField = (name, value) => setMeta((m) => ({ ...m, [name]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#5B6778] mb-1">
            <button
              onClick={() => navigate('/parametrage')}
              className="text-[#1F5FA8] hover:underline"
            >
              Paramétrage
            </button>{' '}
            / {meta.label}
          </p>
          <button
            onClick={() => navigate('/parametrage')}
            className="text-sm font-semibold text-[#1F5FA8] hover:underline mb-2 inline-flex items-center gap-1"
          >
            <span aria-hidden="true">←</span> Retour à la liste
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-semibold text-[#0B2A4A]">{meta.label}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#B8D2EF] bg-[#EBF3FC] text-xs font-semibold text-[#1F5FA8]">
              Version {version}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                meta.active
                  ? 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]'
                  : 'bg-[#F5F7FA] border-[#E3E8EF] text-[#5B6778]'
              }`}
            >
              {meta.active ? 'Actif' : 'Inactif'}
            </span>
          </div>
        </div>
      </div>

      {/* Métadonnées */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
        <h2 className="text-[15px] font-semibold text-[#0B2A4A]">Informations générales</h2>
        <p className="text-xs text-[#5B6778] mb-4">Métadonnées module</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Code identifiant
            </label>
            <input type="text" className={inputCls} value={meta.code} disabled />
            <p className="text-xs text-[#8A94A6] mt-1">Identifiant pérenne généré par le système.</p>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Libellé du canevas <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={meta.label}
              maxLength={150}
              onChange={(e) => setMetaField('label', e.target.value)}
            />
            <p className="text-xs text-[#8A94A6] mt-1">Nom affiché aux structures exécutantes.</p>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Périodicité de transmission
            </label>
            <select
              className={inputCls}
              value={meta.periodicity}
              onChange={(e) => setMetaField('periodicity', e.target.value)}
            >
              <option value="monthly">Mensuelle</option>
              <option value="quarterly">Trimestrielle</option>
            </select>
            <p className="text-xs text-[#8A94A6] mt-1">
              Déclencheur calendaire pour les alertes de dépôt.
            </p>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">Type</label>
            <select
              className={inputCls}
              value={meta.kind}
              onChange={(e) => setMetaField('kind', e.target.value)}
            >
              <option value="periodic">Périodique</option>
              <option value="event">Événement</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Structures autorisées
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {STRUCTURE_TYPES.map(([code, label]) => (
                <label key={code} className="inline-flex items-center gap-2 text-sm text-[#1A2433]">
                  <input
                    type="checkbox"
                    className="accent-[#1F5FA8]"
                    checked={meta.structureTypes.includes(code)}
                    onChange={(e) =>
                      setMetaField(
                        'structureTypes',
                        e.target.checked
                          ? [...meta.structureTypes, code]
                          : meta.structureTypes.filter((c) => c !== code)
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-[#8A94A6] mt-1.5">
              Services déconcentrés habilités à la saisie.
            </p>
          </div>
        </div>
      </div>

      {/* Champs */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-[#0B2A4A]">Champs du canevas</h2>
          <button
            onClick={addField}
            className="h-[32px] px-3 rounded-lg border border-[#D6DCE5] text-xs font-semibold text-[#1F5FA8] hover:bg-[#EBF3FC]"
          >
            + Ajouter un champ
          </button>
        </div>
        <p className="text-xs text-[#5B6778] mb-3">
          Structure hiérarchique et règles de validation associées ·{' '}
          <span className="font-semibold text-[#0B2A4A]">{fields.length} éléments configurés</span>
        </p>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <FieldCard
              key={i}
              field={f}
              depth={1}
              onChange={(next) => setFieldAt(i, next)}
              onRemove={() => removeFieldAt(i)}
            />
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-[#5B6778]">
              Aucun champ. Le gabarit doit en contenir au moins un pour être publié.
            </p>
          )}
        </div>
      </div>

      {/* Aperçu */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-[#0B2A4A]">Aperçu du formulaire</h2>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-xs font-semibold text-[#5B6778]">
            Vue usager
          </span>
        </div>
        <p className="text-xs text-[#5B6778] mb-4">
          L'aperçu se met à jour à chaque modification.
        </p>
        <DynamicForm
          fields={fields}
          values={{}}
          errors={{}}
          onChange={() => {}}
          disabled
          options={options}
          autoCtx={{}}
        />
      </div>

      {/* Actions de publication */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={() => {
            setFields(initialFields);
            addToast('Modifications annulées.', 'success');
          }}
          disabled={busy}
          className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA] disabled:opacity-50"
        >
          Annuler les modifications
        </button>
        <button
          onClick={publish}
          disabled={busy}
          className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? 'Publication…' : `Publier la version ${version + 1}`}
        </button>
      </div>

      {/* Modale de publication (zip e_publication) */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[#0B2A4A]/40"
            onClick={busy ? undefined : () => setConfirmOpen(false)}
          />
          <div className="relative w-full max-w-[480px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6">
            <div className="flex items-center gap-2 mb-2 text-[#1F5FA8]">
              <span aria-hidden="true">ⓘ</span>
              <h2 className="text-[18px] font-semibold text-[#0B2A4A]">
                Publier la version {version + 1} ?
              </h2>
            </div>
            <p className="text-[15px] text-[#5B6778] leading-relaxed">
              Cette version s'appliquera aux nouvelles saisies du module « {meta.label} ».
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-2 py-3">
                <dt className="text-[12px] text-[#5B6778]">Champs ajoutés</dt>
                <dd className="text-[18px] font-semibold text-[#1E7B4F]">
                  {publishDiff.added}
                </dd>
              </div>
              <div className="rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-2 py-3">
                <dt className="text-[12px] text-[#5B6778]">Champs modifiés</dt>
                <dd className="text-[18px] font-semibold text-[#B7791F]">
                  {publishDiff.modified}
                </dd>
              </div>
              <div className="rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-2 py-3">
                <dt className="text-[12px] text-[#5B6778]">Champs retirés</dt>
                <dd className="text-[18px] font-semibold text-[#B42318]">
                  {publishDiff.removed}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-[#5B6778]">
              Les saisies déjà enregistrées gardent la version {version}. Cette action sera
              enregistrée dans le journal d'audit.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmPublish}
                className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy ? 'Publication…' : 'Publier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

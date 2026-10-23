import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../components/Common/Toast/Toast.jsx';
import Button from '../../components/Common/Button.jsx';
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
  const isCreation = !id || id === 'nouveau';
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
  const [epnItems, setEpnItems] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState('pdf');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewSheets, setPreviewSheets] = useState(null);
  const [activeSheetName, setActiveSheetName] = useState(null);
  const [codeError, setCodeError] = useState(null);
  const previewAbort = useRef(null);

  const sources = useMemo(() => sourcesOf(fields), [fields]);

  useEffect(() => {
    if (isCreation) {
      setMeta({
        code: '',
        label: '',
        periodicity: 'monthly',
        kind: 'event',
        structureTypes: [],
        active: true,
      });
      setFields([]);
      setInitialFields([]);
      setVersion(null);
      setLoading(false);
      setError(null);
      return;
    }
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
        if (sources.includes('epn')) {
          const epnList = lists[sources.indexOf('epn')];
          setEpnItems(Array.isArray(epnList.items) ? epnList.items : []);
        }
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
    if (isCreation) {
      if (!meta.code || !String(meta.code).trim()) return 'Le code du rapport est obligatoire.';
      if (!KEY_RE.test(String(meta.code).trim()))
        return 'Code de gabarit invalide (lettres, chiffres et _ ; doit commencer par une lettre).';
      if (String(meta.code).trim().length > 16) return 'Le code est trop long (16 caractères maximum).';
    }
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
    if (isCreation) {
      await createModule();
      return;
    }
    setConfirmOpen(true);
  };

  const createModule = async () => {
    setBusy(true);
    setCodeError(null);
    try {
      const res = await api('/config/modules', {
        method: 'POST',
        body: {
          code: String(meta.code).trim(),
          label: meta.label,
          periodicity: meta.periodicity,
          kind: meta.kind,
          structureTypes: meta.structureTypes,
          fields,
        },
      });
      addToast(`Rapport « ${res.code} » créé.`, 'success');
      navigate('/parametrage');
    } catch (err) {
      if (err.status === 409) {
        setCodeError(err.message || 'Ce code de gabarit existe déjà.');
      } else {
        addToast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
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

  const gabaritPayload = () => ({
    code: meta ? meta.code : '',
    label: meta ? meta.label : '',
    periodicity: meta ? meta.periodicity : 'monthly',
    kind: meta ? meta.kind : 'event',
    structureTypes: meta ? meta.structureTypes : [],
    fields,
  });

  // Génère l'aperçu pour le format donné. Annule toute requête précédente pour
  // éviter qu'une réponse périmée écrase l'état quand l'utilisateur change
  // d'onglet ou clique sur « Actualiser l'aperçu » rapidement.
  const refreshPreview = async (format) => {
    if (previewAbort.current) {
      previewAbort.current.abort();
    }
    const controller = new AbortController();
    previewAbort.current = controller;

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/config/modules/preview-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ gabarit: gabaritPayload(), format }),
      });
      if (!res.ok) {
        let msg = 'Erreur de génération de l’aperçu.';
        try {
          const d = await res.json();
          if (d.message) msg = d.message;
        } catch {}
        throw new Error(msg);
      }
      if (controller.signal.aborted) return;
      if (format === 'pdf') {
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPreviewPdfUrl(url);
        setPreviewSheets(null);
      } else {
        const data = await res.json();
        if (controller.signal.aborted) return;
        setPreviewSheets(data.sheets || []);
        setPreviewPdfUrl(null);
        if (data.sheets && data.sheets.length && !activeSheetName) {
          setActiveSheetName(data.sheets[0].name);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setPreviewError(err.message || 'Erreur de génération de l’aperçu.');
      setPreviewPdfUrl(null);
      setPreviewSheets(null);
    } finally {
      if (previewAbort.current === controller) previewAbort.current = null;
      setPreviewLoading(false);
    }
  };

  const openPreview = (format) => {
    setActiveSheetName(null);
    setPreviewTab(format);
    setPreviewOpen(true);
    refreshPreview(format);
  };

  useEffect(() => {
    return () => {
      if (previewAbort.current) previewAbort.current.abort();
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    };
  }, []);

  useEffect(() => {
    if (!previewOpen && previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
  }, [previewOpen]);

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
            / {meta.label || (isCreation ? 'Nouveau rapport' : '')}
          </p>
          <button
            onClick={() => navigate('/parametrage')}
            className="text-sm font-semibold text-[#1F5FA8] hover:underline mb-2 inline-flex items-center gap-1"
          >
            <span aria-hidden="true">←</span> Retour à la liste
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-semibold text-[#0B2A4A]">
              {meta.label || (isCreation ? 'Nouveau rapport' : '')}
            </h1>
            {!isCreation && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#B8D2EF] bg-[#EBF3FC] text-xs font-semibold text-[#1F5FA8]">
                Version {version}
              </span>
            )}
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
              Code identifiant <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={meta ? meta.code : ''}
              disabled={!isCreation}
              maxLength={16}
              onChange={(e) => {
                setMetaField('code', e.target.value);
                setCodeError(null);
              }}
            />
            {codeError && (
              <p className="text-xs text-[#B42318] mt-1">{codeError}</p>
            )}
            {!isCreation && meta && !KEY_RE.test(meta.code) && (
              <p className="text-xs text-[#B42318] mt-1">
                Lettres, chiffres et _ ; doit commencer par une lettre.
              </p>
            )}
            {!isCreation && (
              <p className="text-xs text-[#8A94A6] mt-1">Identifiant pérenne, non modifiable après création.</p>
            )}
            {isCreation && (
              <p className="text-xs text-[#8A94A6] mt-1">
                Identifiant pérenne du rapport ; ne peut plus être modifié après création.
              </p>
            )}
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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-xs font-semibold text-[#5B6778]">
              Vue usager
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openPreview('pdf')}
              disabled={previewLoading}
            >
              Aperçu de l'export
            </Button>
          </div>
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
          epnItems={epnItems}
          autoCtx={{}}
        />
      </div>

      {/* Actions de publication / création */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={() => {
            setFields(initialFields);
            setMeta((m) => ({ ...m, label: '', code: isCreation ? m.code : m.code }));
            addToast(isCreation ? 'Saisie annulée.' : 'Modifications annulées.', 'success');
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
          {busy ? (isCreation ? 'Création…' : 'Publication…') : isCreation ? 'Créer le rapport' : `Publier la version ${version + 1}`}
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

      {/* Panneau d'aperçu de l'export (PDF / Excel, sans téléchargement) */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[#0B2A4A]/40"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="relative w-full max-w-[720px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h2 className="text-[18px] font-semibold text-[#0B2A4A]">Aperçu de l'export</h2>
              <button
                onClick={() => setPreviewOpen(false)}
                className="h-[32px] px-3 rounded-lg border border-[#E3E8EF] text-xs font-semibold text-[#1A2433] hover:bg-[#F5F7FA] shrink-0"
              >
                Fermer
              </button>
            </div>
            <div className="flex gap-1 shrink-0 border-b border-[#E3E8EF] mb-3">
              <button
                onClick={() => openPreview('pdf')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 ${
                  previewTab === 'pdf'
                    ? 'border-[#1F5FA8] text-[#1F5FA8]'
                    : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
                } shrink-0`}
              >
                PDF
              </button>
              <button
                onClick={() => openPreview('sheets')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 ${
                  previewTab === 'sheets'
                    ? 'border-[#1F5FA8] text-[#1F5FA8]'
                    : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
                } shrink-0`}
              >
                Excel
              </button>
            </div>
            <div className="flex-1 overflow-y-auto mb-4 min-h-[300px]">
              {previewLoading && (
                <p className="text-[#5B6778] text-sm text-center pt-10">Génération de l’aperçu…</p>
              )}
              {previewError && !previewLoading && (
                <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
                  {previewError}
                </div>
              )}
              {previewTab === 'pdf' && !previewLoading && !previewError && previewPdfUrl && (
                <iframe
                  title="Aperçu PDF"
                  src={previewPdfUrl}
                  className="w-full h-[600px] rounded-lg border border-[#E3E8EF]"
                  sandbox="allow-same-origin allow-scripts"
                />
              )}
              {previewTab === 'sheets' && !previewLoading && !previewError && previewSheets && (
                <>
                  {previewSheets.length === 0 && (
                    <p className="text-[#5B6778] text-sm text-center pt-10">Aucune feuille à afficher.</p>
                  )}
                  {previewSheets.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex gap-1 overflow-x-auto mb-3 shrink-0">
                        {previewSheets.map((s) => (
                          <button
                            key={s.name}
                            onClick={() => setActiveSheetName(s.name)}
                            className={`px-3 py-1.5 text-xs font-semibold border rounded-lg ${
                              activeSheetName === s.name
                                ? 'bg-[#EBF3FC] border-[#1F5FA8] text-[#1F5FA8]'
                                : 'border-[#D6DCE5] bg-white text-[#1A2433] hover:bg-[#F5F7FA]'
                            } shrink-0`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                      {activeSheetName && (
                        <div className="overflow-x-auto border border-[#E3E8EF] rounded-lg">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-[#F5F7FA] text-left">
                                {(previewSheets.find((s) => s.name === activeSheetName)?.columns || []).map((c) => (
                                  <th key={c} className="px-3 py-2 font-semibold text-[#0B2A4A] border-b border-[#E3E8EF]">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(previewSheets.find((s) => s.name === activeSheetName)?.rows || []).map((row, ri) => (
                                <tr key={ri} className="border-b border-[#E3E8EF]">
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 py-2 border-r border-[#E3E8EF] last:border-0 text-[#1A2433]">
                                      {cell == null ? '' : cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="text-xs text-[#5B6778] mt-2">
                            Représentation de la structure de l’Excel (le style exact n’est pas montré).
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {previewTab === 'pdf' && !previewLoading && !previewError && !previewPdfUrl && (
                <p className="text-[#5B6778] text-sm text-center pt-10">Aucun aperçu PDF disponible.</p>
              )}
              {previewTab === 'sheets' && !previewLoading && !previewError && !previewSheets && (
                <p className="text-[#5B6778] text-sm text-center pt-10">Aucun aperçu Excel disponible.</p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refreshPreview(previewTab)}
                disabled={previewLoading}
              >
                Actualiser l'aperçu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

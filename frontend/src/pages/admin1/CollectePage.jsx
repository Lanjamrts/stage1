import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import Button from '../../components/Common/Button.jsx';

const MAX_EXPORT_IDS = 300;

const periodCell = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  return '—';
};

// « Collecte et téléchargement » (SPEC §4) : cases régions et modules ->
// résultats -> téléchargement ; onglet « Historique des soumissions ».
// Aucun bouton valider / rejeter.
export default function CollectePage() {
  const [tab, setTab] = useState('resultats');
  const [items, setItems] = useState([]); // structures actives {id,label,type,region}
  const [rows, setRows] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [regions, setRegions] = useState([]); // noms cochés
  const [selectedModules, setSelectedModules] = useState([]); // ids cochés
  const [selectedIds, setSelectedIds] = useState([]); // ids de saisies cochés
  const [allModules, setAllModules] = useState([]);
  const headerCheckboxRef = useRef(null);

  const allRegions = useMemo(
    () => [...new Set(items.map((i) => i.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [items]
  );
  useEffect(() => {
    api('/referentiels/structures?full=1')
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
    api('/modules')
      .then((m) => setAllModules(m || []))
      .catch(() => setAllModules([]));
  }, []);

  // Quand les filtres changent, on retire de la sélection les ids qui ne sont
  // plus affichés.
  useEffect(() => {
    const displayed = new Set(rows.map((s) => s.id));
    setSelectedIds((prev) => prev.filter((id) => displayed.has(id)));
  }, [rows]);

  // Etat indéterminé de la case « Tout sélectionner ».
  useEffect(() => {
    const cb = headerCheckboxRef.current;
    if (!cb) return;
    if (rows.length === 0) {
      cb.indeterminate = false;
      cb.checked = false;
      return;
    }
    if (selectedIds.length === 0) {
      cb.indeterminate = false;
      cb.checked = false;
    } else if (selectedIds.length === rows.length) {
      cb.indeterminate = false;
      cb.checked = true;
    } else {
      cb.indeterminate = true;
      cb.checked = false;
    }
  }, [rows, selectedIds]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (regions.length) p.set('regions', regions.join(','));
    if (selectedModules.length) p.set('modules', selectedModules.join(','));
    return p.toString();
  }, [regions, selectedModules]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = qs ? `?${qs}` : '';
    Promise.all([api(`/collecte${q}`), api(`/collecte/historique${q}`)])
      .then(([res, hist]) => {
        if (!cancelled) {
          setRows(res);
          setHistorique(hist);
          setError(null);
        }
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
  }, [qs]);

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const toggleRow = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleAll = () => {
    if (rows.length > 0 && selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((s) => s.id));
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const hasSelection = selectedIds.length > 0;
  const selCount = hasSelection ? selectedIds.length : 0;
  const tooMany = selCount > MAX_EXPORT_IDS;
  const downloadDisabled =
    (hasSelection ? tooMany : rows.length === 0);

  const exportHref = (format) => {
    const p = new URLSearchParams({ format });
    if (regions.length) p.set('regions', regions.join(','));
    if (selectedModules.length) p.set('modules', selectedModules.join(','));
    if (hasSelection) p.set('ids', selectedIds.join(','));
    return `/api/collecte/export?${p.toString()}`;
  };

  const downloadLabel = (format) => {
    const n = hasSelection ? selCount : rows.length;
    const en = format === 'xlsx' ? 'Excel' : 'PDF';
    return hasSelection
      ? `Télécharger la sélection (${n}) en ${en}`
      : `Télécharger tout (${n}) en ${en}`;
  };

  const hasFilters = regions.length > 0 || selectedModules.length > 0;
  const regionOf = (s) => (s.structureLabel || '').split(' – ').slice(-1)[0] || '—';
  const boxCls =
    'bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-5';
  const labelCls = 'flex items-center gap-2 text-sm text-[#1A2433] py-1 cursor-pointer';

  const downloadLink = (format) => {
    const disabled = downloadDisabled;
    const cls =
      'inline-flex items-center h-[40px] px-5 rounded-lg text-sm font-semibold' +
      (disabled
        ? ' opacity-50 cursor-not-allowed'
        : format === 'xlsx'
          ? ' bg-[#1E7B4F] hover:bg-[#186641] text-white'
          : ' bg-[#B42318] hover:bg-[#9B1E14] text-white');
    return (
      <a
        key={format}
        href={disabled ? undefined : exportHref(format)}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
        aria-disabled={disabled}
        className={cls}
      >
        {downloadLabel(format)}
      </a>
    );
  };

  const renderResults = (list, colSpan) => (
    <div className="overflow-x-auto">
      {hasSelection && (
        <div className="px-5 py-3 flex items-center gap-2 border-b border-[#E3E8EF] bg-[#F5F7FA]">
          <span className="font-semibold text-[#0B2A4A]">
            {selCount} sélectionnée(s)
          </span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              clearSelection();
            }}
            className="text-[#1F5FA8] text-sm hover:underline"
          >
            Tout désélectionner
          </a>
          {tooMany && (
            <span className="ml-auto text-sm text-[#B42318] font-medium">
              300 saisies maximum par téléchargement.
            </span>
          )}
        </div>
      )}
      <div className="px-5 py-4 border-b border-[#E3E8EF] flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Données exportées</h2>
        <p className="text-sm text-[#5B6778]">
          <span className="font-semibold text-[#0B2A4A]">{list.length}</span>{' '}
          {list.length > 1 ? 'enregistrements' : 'enregistrement'}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F5F7FA] text-left">
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                className="accent-[#1F5FA8]"
                onChange={toggleAll}
                aria-label="Tout sélectionner"
              />
            </th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période / Événement</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Auteur</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Mise à jour</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colSpan} className="px-5 py-8 text-center text-[#5B6778]">
                Chargement...
              </td>
            </tr>
          )}
          {!loading && list.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-5 py-10 text-center text-[#5B6778]">
                Aucune saisie ne correspond à ces filtres.
              </td>
            </tr>
          )}
          {!loading &&
            list.map((s) => (
              <tr key={s.id} className="border-t border-[#E3E8EF]">
                <td className="px-5 py-3">
                  <input
                    type="checkbox"
                    className="accent-[#1F5FA8]"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleRow(s.id)}
                    aria-label={`Sélectionner ${s.structureLabel || s.id}`}
                  />
                </td>
                <td className="px-5 py-3 text-[#1A2433]">{s.structureLabel || '—'}</td>
                <td className="px-5 py-3">
                  <span className="font-semibold text-[#0B2A4A]">{s.moduleCode}</span>{' '}
                  <span className="text-[#1A2433]">{s.moduleLabel}</span>
                </td>
                <td className="px-5 py-3 text-[#5B6778]">{periodCell(s)}</td>
                <td className="px-5 py-3 text-[#5B6778]">{s.authorLabel || '—'}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.updatedAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderHistorique = () => (
    <div className="overflow-x-auto">
      <div className="px-5 py-4 border-b border-[#E3E8EF] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Historique des soumissions</h2>
          <p className="text-xs text-[#5B6778] mt-0.5">Affichage complet</p>
        </div>
        <p className="text-sm text-[#5B6778]">
          <span className="font-semibold text-[#0B2A4A]">{historique.length}</span>{' '}
          {historique.length > 1 ? 'soumissions' : 'soumission'}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F5F7FA] text-left">
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Date de soumission</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Région</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-[#5B6778]">
                Chargement...
              </td>
            </tr>
          )}
          {!loading && historique.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-10 text-center text-[#5B6778]">
                Aucune saisie ne correspond à ces filtres.
              </td>
            </tr>
          )}
          {!loading &&
            historique.map((s) => (
              <tr key={s.id} className="border-t border-[#E3E8EF]">
                <td className="px-5 py-3 text-[#5B6778]">
                  {s.dates && s.dates.submitted
                    ? new Date(s.dates.submitted).toLocaleDateString('fr-FR')
                    : '—'}
                </td>
                <td className="px-5 py-3 text-[#5B6778]">{regionOf(s)}</td>
                <td className="px-5 py-3 text-[#1A2433]">{s.structureLabel || '—'}</td>
                <td className="px-5 py-3">
                  <span className="font-semibold text-[#0B2A4A]">{s.moduleCode}</span>{' '}
                  <span className="text-[#1A2433]">{s.moduleLabel}</span>
                </td>
                <td className="px-5 py-3 text-[#5B6778]">{periodCell(s)}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={s.status} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="px-5 py-3 text-xs text-[#5B6778] border-t border-[#E3E8EF]">
        Le contenu d'un rapport n'est consultable qu'après son export vers la base.
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A]">
            Collecte et téléchargement
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            Filtrez par région et par module, puis téléchargez les résultats.
          </p>
        </div>
        {tab === 'resultats' && (
          <div className="flex items-center gap-3">
            {downloadLink('xlsx')}
            {downloadLink('pdf')}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 border-b border-[#E3E8EF]">
        {[
          { key: 'resultats', label: 'Résultats' },
          { key: 'historique', label: 'Historique des soumissions' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[#1F5FA8] text-[#1F5FA8]'
                : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cases régions et modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={boxCls}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-[#0B2A4A]">Régions</h2>
            <div className="flex gap-3 text-xs font-semibold">
              <button
                onClick={() => setRegions(allRegions)}
                className="text-[#1F5FA8] hover:underline"
              >
                Tout cocher
              </button>
              <button onClick={() => setRegions([])} className="text-[#5B6778] hover:underline">
                Tout décocher
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            {allRegions.map((r) => (
              <label key={r} className={labelCls}>
                <input
                  type="checkbox"
                  className="accent-[#1F5FA8]"
                  checked={regions.includes(r)}
                  onChange={() => toggle(regions, setRegions, r)}
                />
                {r}
              </label>
            ))}
          </div>
        </div>

        <div className={boxCls}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-[#0B2A4A]">Modules</h2>
            <div className="flex gap-3 text-xs font-semibold">
              <button
                onClick={() => setSelectedModules(allModules.map((m) => m.id))}
                className="text-[#1F5FA8] hover:underline"
              >
                Tout cocher
              </button>
              <button
                onClick={() => setSelectedModules([])}
                className="text-[#5B6778] hover:underline"
              >
                Tout décocher
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            {allModules.map((m) => (
              <label key={m.id} className={labelCls}>
                <input
                  type="checkbox"
                  className="accent-[#1F5FA8]"
                  checked={selectedModules.includes(m.id)}
                  onChange={() => toggle(selectedModules, setSelectedModules, m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#5B6778]">
          {regions.length > 0 && (
            <span className="rounded-full border border-[#E3E8EF] bg-[#F5F7FA] px-3 py-1">
              Régions : {regions.join(', ')}
            </span>
          )}
          {selectedModules.length > 0 && (
            <span className="rounded-full border border-[#E3E8EF] bg-[#F5F7FA] px-3 py-1">
              Modules :{' '}
              {allModules
                .filter((m) => selectedModules.includes(m.id))
                .map((m) => m.label)
                .join(', ')}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setRegions([]);
              setSelectedModules([]);
            }}
          >
            <span aria-hidden="true">↺</span> Réinitialiser les filtres
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        {tab === 'resultats' ? renderResults(rows, 7) : renderHistorique()}
      </div>
    </div>
  );
}

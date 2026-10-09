import React, { useEffect, useMemo, useState } from 'react';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';

const periodCell = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  return '—';
};

// Libellés lisibles des types de structure (cases « types »).
const TYPE_LABELS = {
  SRB: 'SRB',
  SRSP: 'SRSP',
  SRPE: 'SRPE',
  CIRBF: 'CIRBF',
  DRBF: 'DRBF',
  SSEBF: 'SSEBF',
  DGBF: 'DGBF',
  CELLULE_INFO: 'Cellule informatique',
};

// « Collecte et téléchargement » (SPEC §4) : cases régions et types ->
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
  const [types, setTypes] = useState([]); // codes cochés

  const allRegions = useMemo(
    () => [...new Set(items.map((i) => i.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [items]
  );
  const allTypes = useMemo(
    () => [...new Set(items.map((i) => i.type))].sort((a, b) => a.localeCompare(b)),
    [items]
  );

  useEffect(() => {
    api('/referentiels/structures?full=1')
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (regions.length) p.set('regions', regions.join(','));
    if (types.length) p.set('types', types.join(','));
    return p.toString();
  }, [regions, types]);

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

  const exportHref = (format) => {
    const p = new URLSearchParams({ format });
    if (regions.length) p.set('regions', regions.join(','));
    if (types.length) p.set('types', types.join(','));
    return `/api/collecte/export?${p.toString()}`;
  };

  const hasFilters = regions.length > 0 || types.length > 0;
  const boxCls =
    'bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-5';
  const labelCls = 'flex items-center gap-2 text-sm text-[#1A2433] py-1 cursor-pointer';

  const renderResults = (list, colSpan) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F5F7FA] text-left">
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
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F5F7FA] text-left">
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période / Événement</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Auteur</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Créée le</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Soumise le</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Mise à jour</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={8} className="px-5 py-8 text-center text-[#5B6778]">
                Chargement...
              </td>
            </tr>
          )}
          {!loading && historique.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-[#5B6778]">
                Aucune saisie ne correspond à ces filtres.
              </td>
            </tr>
          )}
          {!loading &&
            historique.map((s) => (
              <tr key={s.id} className="border-t border-[#E3E8EF]">
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
                <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.createdAt)}</td>
                <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.dates && s.dates.submitted)}</td>
                <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.updatedAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>
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
            Filtrez par région et par type de structure, puis téléchargez les résultats.
          </p>
        </div>
        {tab === 'resultats' && (
          <div className="flex items-center gap-3">
            <a
              href={exportHref('xlsx')}
              className="inline-flex items-center h-[40px] px-5 rounded-lg bg-[#1E7B4F] hover:bg-[#186641] text-white text-sm font-semibold"
            >
              Télécharger en Excel (.xlsx)
            </a>
            <a
              href={exportHref('pdf')}
              className="inline-flex items-center h-[40px] px-5 rounded-lg bg-[#B42318] hover:bg-[#9B1E14] text-white text-sm font-semibold"
            >
              Télécharger en PDF
            </a>
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

      {/* Cases régions et types */}
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
            <h2 className="text-[15px] font-semibold text-[#0B2A4A]">Types de structure</h2>
            <div className="flex gap-3 text-xs font-semibold">
              <button onClick={() => setTypes(allTypes)} className="text-[#1F5FA8] hover:underline">
                Tout cocher
              </button>
              <button onClick={() => setTypes([])} className="text-[#5B6778] hover:underline">
                Tout décocher
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            {allTypes.map((t) => (
              <label key={t} className={labelCls}>
                <input
                  type="checkbox"
                  className="accent-[#1F5FA8]"
                  checked={types.includes(t)}
                  onChange={() => toggle(types, setTypes, t)}
                />
                {TYPE_LABELS[t] || t}
              </label>
            ))}
          </div>
        </div>
      </div>

      {hasFilters && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-[#5B6778]">
            {regions.length} région{regions.length > 1 ? 's' : ''} et {types.length} type
            {types.length > 1 ? 's' : ''} sélectionné{types.length > 1 ? 's' : ''}.
          </p>
          <button
            onClick={() => {
              setRegions([]);
              setTypes([]);
            }}
            className="h-[32px] px-3 rounded-lg border border-[#E3E8EF] text-xs font-medium hover:bg-[#F5F7FA]"
          >
            Tout réinitialiser
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        {tab === 'resultats' ? renderResults(rows, 6) : renderHistorique()}
      </div>
    </div>
  );
}

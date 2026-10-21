import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatDate, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import ConfirmModal from '../../components/Common/Modal/ConfirmModal.jsx';
import Button from '../../components/Common/Button.jsx';
import { useToast } from '../../components/Common/Toast/Toast.jsx';
import useMe from '../../lib/useMe.js';

// Onglets de « Données saisies » (SPEC §4) — libellés exacts, ordre exact.
const TABS = [
  { key: 'soumise', label: 'À examiner' },
  { key: 'validee', label: 'Validées' },
  { key: 'rejetee', label: 'Rejetées' },
  { key: 'exportee', label: 'Exportées' },
  { key: '', label: 'Toutes' },
];

const PAGE_SIZES = [10, 25, 50];

const periodCell = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) {
    return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  }
  return '—';
};

export default function DonneesSaisies() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { me } = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saisies, setSaisies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ structure: '', module: '', periode: '' });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [exportTarget, setExportTarget] = useState(null); // saisie à exporter
  const [busy, setBusy] = useState(false);

  const activeTab = searchParams.get('onglet') ?? 'soumise';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api('/saisies')
      .then((data) => {
        if (!cancelled) {
          setSaisies(data);
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
  }, []);

  const setTab = (key) => {
    const next = new URLSearchParams();
    if (key) next.set('onglet', key);
    setSearchParams(next);
    setPage(1);
  };

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  // Options de filtres déduites des données de la région
  const filterOptions = useMemo(() => {
    const structures = [...new Set(saisies.map((s) => s.structureLabel).filter(Boolean))].sort();
    const modules = [
      ...new Map(saisies.map((s) => [s.moduleId, s.moduleLabel])).entries(),
    ].map(([id, label]) => ({ id, label }));
    const periodes = [...new Set(saisies.map(periodCell))].sort();
    return { structures, modules, periodes };
  }, [saisies]);

  const counts = useMemo(
    () => ({
      soumise: saisies.filter((s) => s.status === 'soumise').length,
      validee: saisies.filter((s) => s.status === 'validee').length,
      rejetee: saisies.filter((s) => s.status === 'rejetee').length,
      exportee: saisies.filter((s) => s.status === 'exportee').length,
      all: saisies.length,
    }),
    [saisies]
  );

  const tabCount = (key) => (key ? counts[key] : counts.all);

  const filtered = useMemo(
    () =>
      saisies.filter(
        (s) =>
          (!activeTab || s.status === activeTab) &&
          (!filters.structure || s.structureLabel === filters.structure) &&
          (!filters.module || s.moduleId === filters.module) &&
          (!filters.periode || periodCell(s) === filters.periode)
      ),
    [saisies, activeTab, filters]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const region = me && me.structureLabel ? me.structureLabel.split(' – ').slice(-1)[0] : '';
  const hasFilters = !!(filters.structure || filters.module || filters.periode);

  const actionCell = (s) => {
    if (s.status === 'soumise') {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/donnees-saisies/${s.id}`)}
        >
          Examiner
        </Button>
      );
    }
    if (s.status === 'validee') {
      return (
        <Button
          variant="success"
          size="sm"
          onClick={() => setExportTarget(s)}
        >
          Exporter
        </Button>
      );
    }
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/donnees-saisies/${s.id}`)}
      >
        Consulter
      </Button>
    );
  };

  const confirmExport = async () => {
    if (!exportTarget) return;
    setBusy(true);
    try {
      await api(`/saisies/${exportTarget.id}/exporter`, { method: 'POST' });
      addToast('Saisie exportée vers la base centrale.', 'success');
      setExportTarget(null);
      const data = await api('/saisies');
      setSaisies(data);
    } catch (err) {
      addToast(err.message, 'error');
      setExportTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Données saisies</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Données transmises par les agents de votre région{region ? ` : ${region}` : ''}.
        </p>
      </div>

      {/* Onglets avec compteurs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E3E8EF]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-[#1F5FA8] text-[#1F5FA8]'
                : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
            }`}
          >
            {t.label}
            <span
              className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold ${
                activeTab === t.key ? 'bg-[#EBF3FC] text-[#1F5FA8]' : 'bg-[#F5F7FA] text-[#5B6778]'
              }`}
            >
              {tabCount(t.key)}
            </span>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[200px]"
          value={filters.structure}
          onChange={(e) => setFilter('structure', e.target.value)}
        >
          <option value="">Toutes les structures</option>
          {filterOptions.structures.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[200px]"
          value={filters.module}
          onChange={(e) => setFilter('module', e.target.value)}
        >
          <option value="">Tous les modules</option>
          {filterOptions.modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[180px]"
          value={filters.periode}
          onChange={(e) => setFilter('periode', e.target.value)}
        >
          <option value="">Toutes les périodes</option>
          {filterOptions.periodes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => setFilters({ structure: '', module: '', periode: '' })}
        >
          <span aria-hidden="true">↺</span> Réinitialiser les filtres
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Auteur</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Date de soumission</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[#5B6778]">
                    Chargement...
                  </td>
                </tr>
              )}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#5B6778]">
                    {hasFilters || activeTab
                      ? 'Aucune saisie ne correspond à ces critères.'
                      : 'Aucune saisie.'}
                  </td>
                </tr>
              )}
              {!loading &&
                pageRows.map((s) => (
                  <tr key={s.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3 text-[#1A2433]">{s.structureLabel || '—'}</td>
                    <td className="px-5 py-3 text-[#1A2433]">{s.authorLabel || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[#0B2A4A]">{s.moduleCode}</span>{' '}
                      <span className="text-[#1A2433]">{s.moduleLabel}</span>
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{periodCell(s)}</td>
                    <td className="px-5 py-3 text-[#5B6778]">
                      {s.dates && s.dates.submitted ? formatDate(s.dates.submitted) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3">{actionCell(s)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E3E8EF] px-5 py-3 text-sm text-[#5B6778]">
          <div className="flex items-center gap-2">
            <span>Affichage</span>
            <select
              className="h-[32px] px-2 rounded-lg border border-[#D6DCE5] bg-white text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} par page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="w-8 h-8 rounded-lg border border-[#E3E8EF] disabled:opacity-40 hover:bg-[#F5F7FA]"
              aria-label="Page précédente"
            >
              ‹
            </button>
            <span>
              Page {currentPage} sur {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="w-8 h-8 rounded-lg border border-[#E3E8EF] disabled:opacity-40 hover:bg-[#F5F7FA]"
              aria-label="Page suivante"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!exportTarget}
        title="Exporter vers la base ?"
        message="La saisie sera publiée dans la base centrale (statut « Exportée ») et ne pourra plus être modifiée."
        confirmLabel="Exporter vers la base"
        busy={busy}
        onCancel={() => setExportTarget(null)}
        onConfirm={confirmExport}
      />
    </div>
  );
}

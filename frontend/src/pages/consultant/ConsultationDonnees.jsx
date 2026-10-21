import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import Button from '../../components/Common/Button.jsx';

const periodCell = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  return '—';
};

// « Consultation des données » (SPEC §4) : table de consultation en lecture
// seule — PAS de bouton de téléchargement, PAS de bouton d'action.
// Un clic sur une ligne ouvre la page rapport en lecture seule.
export default function ConsultationDonnees() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ module: '', periode: '', region: '', statut: '' });

  useEffect(() => {
    api('/modules').then(setModules).catch(() => setModules([]));
    api('/periodes').then(setPeriodes).catch(() => setPeriodes([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.module) qs.set('module', filters.module);
    if (filters.periode) qs.set('periode', filters.periode);
    const q = qs.toString();
    api(`/consultation${q ? `?${q}` : ''}`)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
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
  }, [filters]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const regionOf = (s) => (s.structureLabel || '').split(' – ').slice(-1)[0] || '';
  const allRegions = [...new Set(rows.map(regionOf).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr')
  );
  // Région et statut : filtrés côté navigateur (l'API expose module + période).
  const visibleRows = rows.filter(
    (s) =>
      (!filters.region || regionOf(s) === filters.region) &&
      (!filters.statut || s.status === filters.statut)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] flex items-center gap-3">
          Consultation des données
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#D7C4F0] bg-[#F3ECFB] text-xs font-semibold text-[#6B3FA0]">
            Lecture seule
          </span>
        </h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Consultez les données validées et enregistrées dans la base, pour toutes les régions.
        </p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[180px]"
          value={filters.region}
          onChange={(e) => setFilter('region', e.target.value)}
        >
          <option value="">Toutes les régions</option>
          {allRegions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[220px]"
          value={filters.module}
          onChange={(e) => setFilter('module', e.target.value)}
        >
          <option value="">Tous les modules</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.label}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[180px]"
          value={filters.periode}
          onChange={(e) => setFilter('periode', e.target.value)}
        >
          <option value="">Toutes les périodes</option>
          {periodes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[150px]"
          value={filters.statut}
          onChange={(e) => setFilter('statut', e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="exportee">Exportée</option>
          <option value="archivee">Archivée</option>
        </select>
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => setFilters({ module: '', periode: '', region: '', statut: '' })}
        >
          <span aria-hidden="true">↺</span> Réinitialiser les filtres
        </Button>
      </div>

      {!loading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#5B6778]">
          <p>
            <span className="font-semibold text-[#0B2A4A]">{visibleRows.length}</span>{' '}
            {visibleRows.length > 1 ? 'enregistrements' : 'enregistrement'} • Base consolidée DGBF
          </p>
        </div>
      )}

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
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Région</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Date d'export</th>
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
              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucun rapport disponible.
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/consultation-donnees/${s.id}`)}
                    className="border-t border-[#E3E8EF] cursor-pointer hover:bg-[#F5F7FA]"
                  >
                    <td className="px-5 py-3 text-[#5B6778]">{regionOf(s) || '—'}</td>
                    <td className="px-5 py-3 text-[#1A2433]">{s.structureLabel || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[#0B2A4A]">{s.moduleCode}</span>{' '}
                      <span className="text-[#1A2433]">{s.moduleLabel}</span>
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{periodCell(s)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">
                      {formatDateTime(s.dates && s.dates.exported)}
                    </td>
                    <td className="px-5 py-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/consultation-donnees/${s.id}`);
                        }}
                      >
                        Consulter
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 border-t border-[#E3E8EF] text-xs text-[#5B6778]">
          Seules les données validées et enregistrées dans la base sont consultables.
        </p>
      </div>
    </div>
  );
}

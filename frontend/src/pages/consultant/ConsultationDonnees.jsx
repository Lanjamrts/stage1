import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';

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
  const [filters, setFilters] = useState({ module: '', periode: '' });

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
          Rapports exportés et archivés, toutes régions. Cliquez sur une ligne pour ouvrir le
          rapport.
        </p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
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
        {(filters.module || filters.periode) && (
          <button
            onClick={() => setFilters({ module: '', periode: '' })}
            className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
          >
            Réinitialiser
          </button>
        )}
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
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période / Événement</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Exportée le</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#5B6778]">
                    Chargement...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucun rapport disponible.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/consultation-donnees/${s.id}`)}
                    className="border-t border-[#E3E8EF] cursor-pointer hover:bg-[#F5F7FA]"
                  >
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
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

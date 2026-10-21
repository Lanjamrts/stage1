import React, { useEffect, useState } from 'react';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import Button from '../../components/Common/Button.jsx';

const periodCell = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) {
    return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  }
  return '—';
};

// « Consultation et téléchargement » (SPEC §4) : consultation de la région
// avec filtres + téléchargements Excel / PDF.
export default function Consultation() {
  const [rows, setRows] = useState([]);
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ module: '', periode: '', statut: '' });

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
    if (filters.statut) qs.set('statut', filters.statut);
    const q = qs.toString();
    api(`/collecte${q ? `?${q}` : ''}`)
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

  const exportHref = (format) => {
    const qs = new URLSearchParams({ format });
    if (filters.module) qs.set('module', filters.module);
    if (filters.periode) qs.set('periode', filters.periode);
    if (filters.statut) qs.set('statut', filters.statut);
    return `/api/collecte/export?${qs.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A]">
            Consultation et téléchargement
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            Rapports des structures de votre région (hors brouillons).
          </p>
        </div>
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
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[160px]"
          value={filters.statut}
          onChange={(e) => setFilter('statut', e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="soumise">Soumise</option>
          <option value="rejetee">Rejetée</option>
          <option value="validee">Validée</option>
          <option value="exportee">Exportée</option>
          <option value="archivee">Archivée</option>
        </select>
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => setFilters({ module: '', periode: '', statut: '' })}
        >
          <span aria-hidden="true">↺</span> Réinitialiser les filtres
        </Button>
      </div>

      {!loading && !error && (
        <p className="text-sm text-[#5B6778]">
          <span className="font-semibold text-[#0B2A4A]">{rows.length}</span>{' '}
          {rows.length > 1 ? 'enregistrements trouvés' : 'enregistrement trouvé'} pour ces
          critères
        </p>
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
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période / Événement</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Auteur</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Exportée le</th>
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
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucun rapport ne correspond à ces filtres.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((s) => (
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

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';

// Onglets de « Données saisies » (SPEC §4) — libellés exacts, ordre exact.
const TABS = [
  { key: 'soumise', label: 'À examiner' },
  { key: 'validee', label: 'Validées' },
  { key: 'rejetee', label: 'Rejetées' },
  { key: 'exportee', label: 'Exportées' },
  { key: '', label: 'Toutes' },
];

const periodCell = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) {
    return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  }
  return '—';
};

export default function DonneesSaisies() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saisies, setSaisies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const activeTab = searchParams.get('onglet') ?? 'soumise';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = activeTab ? `?status=${activeTab}` : '';
    api(`/saisies${qs}`)
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
  }, [activeTab]);

  const setTab = (key) => {
    const next = new URLSearchParams();
    if (key) next.set('onglet', key);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Données saisies</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Rapports des structures de votre région, à examiner et suivre.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 border-b border-[#E3E8EF]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-[#1F5FA8] text-[#1F5FA8]'
                : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
            }`}
          >
            {t.label}
          </button>
        ))}
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
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Dernière mise à jour</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
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
              {!loading && saisies.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucune saisie dans cet onglet.
                  </td>
                </tr>
              )}
              {!loading &&
                saisies.map((s) => (
                  <tr key={s.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3 text-[#1A2433]">{s.structureLabel || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[#0B2A4A]">{s.moduleCode}</span>{' '}
                      <span className="text-[#1A2433]">{s.moduleLabel}</span>
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{periodCell(s)}</td>
                    <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.updatedAt)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => navigate(`/donnees-saisies/${s.id}`)}
                        className="h-[32px] px-3 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-[13px] font-semibold"
                      >
                        Examiner
                      </button>
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

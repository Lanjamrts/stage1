import React, { useEffect, useState } from 'react';
import { api, formatDate, formatTime } from '../../api.js';

// Tableau de bord Admin 1 (SPEC §4) : taux par région, retards,
// taux de rejet, structures en retard. Aucun bouton d'action.
// En mode lecture seule (consultant, SPEC §4) : pilule « Lecture seule ».
export default function Admin1Dashboard({ readOnly = false }) {
  const [data, setData] = useState(null);
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ module: '', periode: '' });
  const [updatedAt, setUpdatedAt] = useState(null);

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
    api(`/dashboard${q ? `?${q}` : ''}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
          setUpdatedAt(new Date().toISOString());
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

  const totals = data && data.totals;
  const rejetCount = totals
    ? Math.round((totals.tauxRejet / 100) * (totals.soumises || 0))
    : 0;
  const cards = totals
    ? [
        {
          label: 'Taux de soumission',
          value: `${totals.tauxSoumission} %`,
          sub: `${totals.soumises} soumissions reçues sur ${totals.attendues} attendues`,
          color: 'text-[#1F5FA8]',
        },
        {
          label: 'Soumissions reçues',
          value: `${totals.soumises}`,
          sub: `sur les ${totals.attendues} attendues`,
          color: 'text-[#0B2A4A]',
        },
        {
          label: 'En retard',
          value: totals.enRetard,
          sub: 'échéance dépassée, rien reçu',
          color: 'text-[#B7791F]',
        },
        {
          label: 'Taux de rejet',
          value: `${totals.tauxRejet} %`,
          sub: `${rejetCount} rejetée${rejetCount > 1 ? 's' : ''} sur ${totals.soumises} soumises`,
          color: 'text-[#B42318]',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] flex items-center gap-3">
          Tableau de bord
          {readOnly && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#D7C4F0] bg-[#F3ECFB] text-xs font-semibold text-[#6B3FA0]">
              Lecture seule
            </span>
          )}
        </h1>
        <p className="text-sm text-[#5B6778] mt-1">Suivi des soumissions par région.</p>
        {updatedAt && (
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Mise à jour le {formatDate(updatedAt)} à {formatTime(updatedAt)}
          </p>
        )}
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
            <span aria-hidden="true">↺</span> Réinitialiser les filtres
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {loading && !data && <div className="text-[#5B6778]">Chargement...</div>}

      {data && (
        <>
          {/* 4 compteurs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <div
                key={c.label}
                className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-5"
              >
                <p className="text-[13px] font-semibold text-[#5B6778]">{c.label}</p>
                <p className={`text-[28px] font-semibold mt-1 ${c.color}`}>{c.value}</p>
                <p className="text-xs text-[#8A94A6] mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Taux par région */}
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E3E8EF]">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Détail par région</h2>
              <p className="text-xs text-[#5B6778] mt-1">
                Taux de soumission et de rejet, avec les structures en retard.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F7FA] text-left">
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Région</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Attendues</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Soumises</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">En retard</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">
                      Taux de soumission
                    </th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Taux de rejet</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-[#5B6778]">
                        Aucune région.
                      </td>
                    </tr>
                  )}
                  {data.regions.map((r) => (
                    <tr key={r.region} className="border-t border-[#E3E8EF]">
                      <td className="px-5 py-3 text-[#1A2433] font-medium">{r.region}</td>
                      <td className="px-5 py-3 text-[#1A2433]">{r.attendues}</td>
                      <td className="px-5 py-3 text-[#1A2433]">{r.soumises}</td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            r.enRetard > 0 ? 'font-semibold text-[#B7791F]' : 'text-[#5B6778]'
                          }
                        >
                          {r.enRetard}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#1F5FA8] font-semibold">
                        {r.tauxSoumission} %
                      </td>
                      <td className="px-5 py-3 text-[#B42318] font-semibold">{r.tauxRejet} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Structures en retard */}
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E3E8EF]">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Structures en retard</h2>
              <p className="text-xs text-[#5B6778] mt-1">
                Structures n'ayant pas transmis leurs données à l'échéance fixée.
              </p>
            </div>
            {data.structuresEnRetard.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[#5B6778]">
                Aucune structure en retard.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F7FA] text-left">
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Région</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Échéance</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Retard</th>
                  </tr>
                </thead>
                <tbody>
                  {data.structuresEnRetard.flatMap((s) =>
                    (s.items && s.items.length > 0
                      ? s.items
                      : [{ module: '—', echeance: null, retardJours: null }]
                    ).map((item, idx) => (
                      <tr
                        key={`${s.structure}-${idx}`}
                        className="border-t border-[#E3E8EF]"
                      >
                        <td className="px-5 py-3 text-[#1A2433]">{s.structure}</td>
                        <td className="px-5 py-3 text-[#5B6778]">{s.region || '—'}</td>
                        <td className="px-5 py-3 text-[#1A2433]">{item.module}</td>
                        <td className="px-5 py-3 text-[#5B6778]">
                          {item.echeance
                            ? new Date(item.echeance).toLocaleDateString('fr-FR')
                            : '—'}
                        </td>
                        <td className="px-5 py-3 font-semibold text-[#B7791F]">
                          {item.retardJours != null ? `${item.retardJours} jour${item.retardJours > 1 ? 's' : ''}` : s.nb}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8]">
        Ce tableau de bord compte les soumissions par statut. Le contenu d'un rapport n'est
        consultable qu'après son export vers la base.
      </div>
    </div>
  );
}

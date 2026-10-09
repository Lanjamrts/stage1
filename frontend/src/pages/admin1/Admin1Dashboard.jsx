import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Tableau de bord Admin 1 (SPEC §4) : taux par région, retards,
// taux de rejet, structures en retard. Aucun bouton d'action.
export default function Admin1Dashboard() {
  const [data, setData] = useState(null);
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
    api(`/dashboard${q ? `?${q}` : ''}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
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

  const totals = data && data.totals;
  const cards = totals
    ? [
        { label: 'Taux de soumission', value: `${totals.tauxSoumission} %`, color: 'text-[#1F5FA8]' },
        {
          label: 'Soumises reçues',
          value: `${totals.soumises} / ${totals.attendues}`,
          color: 'text-[#0B2A4A]',
        },
        { label: 'En retard', value: totals.enRetard, color: 'text-[#B7791F]' },
        { label: 'Taux de rejet', value: `${totals.tauxRejet} %`, color: 'text-[#B42318]' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Tableau de bord</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Taux de soumission, retards et taux de rejet par région.
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
              </div>
            ))}
          </div>

          {/* Taux par région */}
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E3E8EF]">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Taux par région</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F7FA] text-left">
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Région</th>
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structures</th>
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
                      <td className="px-5 py-3 text-[#5B6778]">{r.structures}</td>
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
                    <th className="px-5 py-3 font-semibold text-[#0B2A4A]">
                      Saisies en retard
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.structuresEnRetard.map((s) => (
                    <tr key={s.structure} className="border-t border-[#E3E8EF]">
                      <td className="px-5 py-3 text-[#1A2433]">{s.structure}</td>
                      <td className="px-5 py-3 text-[#5B6778]">{s.region || '—'}</td>
                      <td className="px-5 py-3 font-semibold text-[#B7791F]">{s.nb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

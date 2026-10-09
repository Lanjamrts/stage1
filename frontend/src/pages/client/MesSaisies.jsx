import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';

const STATUS_OPTIONS = [
  ['', 'Tous les statuts'],
  ['brouillon', 'Brouillon'],
  ['soumise', 'Soumise'],
  ['rejetee', 'Rejetée'],
  ['validee', 'Validée'],
  ['exportee', 'Exportée'],
  ['archivee', 'Archivée'],
];

// « Mes saisies » (SPEC §4) : filtres, tableau, détail avec historique.
export default function MesSaisies() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saisies, setSaisies] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const statut = searchParams.get('statut') || '';
  const moduleId = searchParams.get('module') || '';

  useEffect(() => {
    api('/modules').then(setModules).catch(() => setModules([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams();
    if (statut) query.set('status', statut);
    if (moduleId) query.set('module', moduleId);
    const qs = query.toString();
    api(`/saisies${qs ? `?${qs}` : ''}`)
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
  }, [statut, moduleId]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const periodCell = (s) => {
    if (s.periodeLabel) return s.periodeLabel;
    if (s.eventDate) {
      return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
    }
    return '—';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Mes saisies</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Toutes les saisies de votre structure, quel que soit leur statut.
        </p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[180px]"
          value={statut}
          onChange={(e) => setParam('statut', e.target.value)}
        >
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[220px]"
          value={moduleId}
          onChange={(e) => setParam('module', e.target.value)}
        >
          <option value="">Tous les modules</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.label}
            </option>
          ))}
        </select>
        {(statut || moduleId) && (
          <button
            onClick={() => setSearchParams({})}
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

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période / Événement</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Dernière mise à jour</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
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
              {!loading && saisies.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <p className="text-[#5B6778] text-[15px]">
                      Aucune saisie pour le moment.
                    </p>
                    <p className="text-[#8A94A6] text-sm mt-1">
                      Créez une saisie depuis le tableau de bord.
                    </p>
                    <button
                      onClick={() => navigate('/')}
                      className="mt-4 h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
                    >
                      Aller au tableau de bord
                    </button>
                  </td>
                </tr>
              )}
              {!loading &&
                saisies.map((s) => (
                  <tr key={s.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[#0B2A4A]">{s.moduleCode}</span>{' '}
                      <span className="text-[#1A2433]">{s.moduleLabel}</span>
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{periodCell(s)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.updatedAt)}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => navigate(`/mes-saisies/${s.id}`)}
                        className="h-[32px] px-3 rounded-lg border border-[#D6DCE5] text-[13px] font-semibold text-[#1A2433] hover:bg-[#F5F7FA]"
                      >
                        {s.status === 'brouillon' || s.status === 'rejetee' ? 'Ouvrir' : 'Consulter'}
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

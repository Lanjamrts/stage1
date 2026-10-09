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
  const [periodes, setPeriodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const statut = searchParams.get('statut') || '';
  const moduleId = searchParams.get('module') || '';
  const periodeId = searchParams.get('periode') || '';
  const hasFilters = !!(statut || moduleId || periodeId);

  useEffect(() => {
    api('/modules').then(setModules).catch(() => setModules([]));
    api('/periodes').then(setPeriodes).catch(() => setPeriodes([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams();
    if (statut) query.set('status', statut);
    if (moduleId) query.set('module', moduleId);
    if (periodeId) query.set('periode', periodeId);
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
  }, [statut, moduleId, periodeId]);

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

  const actionLabel = (status) => {
    if (status === 'brouillon') return 'Continuer';
    if (status === 'rejetee') return 'Corriger';
    return 'Consulter';
  };

  const filterSelect =
    'h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[180px]';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#5B6778]">
            Répertoire des déclarations
          </p>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-0.5">Mes saisies</h1>
          <p className="text-sm text-[#5B6778] mt-1">
            Retrouvez toutes vos saisies et leur état d'avancement.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-[#EBF3FC] border border-[#B8D2EF] px-3 py-1 text-[13px] font-semibold text-[#1F5FA8]">
          {saisies.length} saisie{saisies.length > 1 ? 's' : ''} enregistrée{saisies.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Filtres (ordre zip : Module, Période, Statut) */}
      <div className="flex flex-wrap gap-3">
        <select
          className={filterSelect + ' min-w-[220px]'}
          value={moduleId}
          onChange={(e) => setParam('module', e.target.value)}
          aria-label="Module"
        >
          <option value="">Tous les modules</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.label}
            </option>
          ))}
        </select>
        <select
          className={filterSelect}
          value={periodeId}
          onChange={(e) => setParam('periode', e.target.value)}
          aria-label="Période"
        >
          <option value="">Toutes les périodes</option>
          {periodes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className={filterSelect}
          value={statut}
          onChange={(e) => setParam('statut', e.target.value)}
          aria-label="Statut du dossier"
        >
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => setSearchParams({})}
            className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
          >
            Réinitialiser les filtres
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
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Date de soumission</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Dernière modification</th>
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
                  <td colSpan={6} className="px-5 py-10 text-center">
                    {hasFilters ? (
                      <>
                        <p className="text-[#5B6778] text-[15px]">Aucun résultat pour ces filtres.</p>
                        <p className="text-[#8A94A6] text-sm mt-1">
                          Modifiez ou réinitialisez les filtres pour afficher vos saisies.
                        </p>
                        <button
                          onClick={() => setSearchParams({})}
                          className="mt-4 h-[40px] px-5 rounded-lg border border-[#E3E8EF] text-sm font-semibold hover:bg-[#F5F7FA]"
                        >
                          Réinitialiser les filtres
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[#5B6778] text-[15px]">
                          Vous n'avez encore aucune saisie
                        </p>
                        <p className="text-[#8A94A6] text-sm mt-1">
                          Vos saisies apparaîtront ici dès que vous aurez commencé un module.
                        </p>
                        <button
                          onClick={() => navigate('/')}
                          className="mt-4 h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
                        >
                          Aller au tableau de bord
                        </button>
                      </>
                    )}
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
                    <td className="px-5 py-3 text-[#5B6778]">
                      {s.dates && s.dates.submitted ? formatDateTime(s.dates.submitted) : '—'}
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{formatDateTime(s.updatedAt)}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => navigate(`/mes-saisies/${s.id}`)}
                        className="h-[32px] px-3 rounded-lg border border-[#D6DCE5] text-[13px] font-semibold text-[#1A2433] hover:bg-[#F5F7FA]"
                      >
                        {actionLabel(s.status)}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[12px] text-[#8A94A6]">
        Règle de conformité et intégrité administrative — un rapport soumis est en lecture seule
        jusqu'à la décision de l'administrateur régional.
      </p>
    </div>
  );
}

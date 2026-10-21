import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatDateTime, formatTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import Button from '../../components/Common/Button.jsx';

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
  const [syncAt, setSyncAt] = useState(null);

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
          setSyncAt(new Date());
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

  // État « aucun résultat » (zip d3) : récapitulatif des filtres appliqués.
  const appliedChips = [];
  if (moduleId) {
    const m = modules.find((x) => x.id === moduleId);
    appliedChips.push({ key: 'module', label: `Module : ${m ? m.label : moduleId}` });
  }
  if (periodeId) {
    const p = periodes.find((x) => x.id === periodeId);
    appliedChips.push({ key: 'periode', label: `Période : ${p ? p.label : periodeId}` });
  }
  if (statut) {
    const opt = STATUS_OPTIONS.find(([v]) => v === statut);
    appliedChips.push({ key: 'statut', label: `Statut : ${opt ? opt[1] : statut}` });
  }

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
        <span className="text-sm text-[#5B6778]">
          <span aria-hidden>🕘</span> Dernière synchronisation :{' '}
          {syncAt ? `Aujourd'hui à ${formatTime(syncAt)}` : '—'}
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
          <Button
            variant="secondary"
            onClick={() => setSearchParams({})}
          >
            Réinitialiser les filtres
          </Button>
        )}
      </div>

      {/* Filtres appliqués + compteur (zip d3) */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#5B6778] font-medium">Filtres appliqués :</span>
          {appliedChips.map((c) => (
            <button
              key={c.key}
              onClick={() => setParam(c.key, '')}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D6DCE5] bg-[#F5F7FA] px-3 py-1 text-[13px] text-[#1A2433] hover:bg-[#E3E8EF]"
              title="Retirer ce filtre"
            >
              {c.label} <span aria-hidden>×</span>
            </button>
          ))}
          <span className="text-[#5B6778] ml-1">
            {saisies.length} enregistrement{saisies.length > 1 ? 's' : ''} trouvé
            {saisies.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

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
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                          <Button
                            variant="secondary"
                            onClick={() => setSearchParams({})}
                          >
                            Réinitialiser les filtres
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => navigate('/')}
                          >
                            Créer une nouvelle saisie
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[#5B6778] text-[15px]">
                          Vous n'avez encore aucune saisie
                        </p>
                        <p className="text-[#8A94A6] text-sm mt-1">
                          Vos saisies apparaîtront ici dès que vous aurez commencé un module
                          budgétaire ou complété un bordereau régional.
                        </p>
                        <Button
                          variant="primary"
                          className="mt-4"
                          onClick={() => navigate('/')}
                        >
                          Aller au tableau de bord
                        </Button>
                        <p className="text-[13px] text-[#8A94A6] mt-5">
                          <span className="font-semibold text-[#5B6778]">Aide à la complétion</span>{' '}
                          — Besoin d'accompagnement pour démarrer une saisie de dotation ?
                          Contactez le délégué régional DGBF.
                        </p>
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/mes-saisies/${s.id}`)}
                      >
                        {actionLabel(s.status)}
                      </Button>
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

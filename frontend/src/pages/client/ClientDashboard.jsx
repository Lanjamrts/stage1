import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, formatDate, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';

const PERIODICITY_LABELS = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  event: 'Événement',
};

// Tableau de bord Client (SPEC §4) : alertes, 4 compteurs, avancement, échéances, activité.
// Le tableau « Mes modules » a migré dans le menu latéral « Modules » (Étape 32).
export default function ClientDashboard() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [saisies, setSaisies] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [m, p, s, u] = await Promise.all([
        api('/modules'),
        api('/periodes'),
        api('/saisies'),
        fetch('/api/auth/me', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
      ]);
      setModules(m);
      setPeriodes(p);
      setSaisies(s);
      setMe(u);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date();

  const currentPeriod = (periodicity) => {
    const list = periodes.filter((p) => p.periodicity === periodicity);
    const started = list
      .filter((p) => new Date(p.start) <= today)
      .sort((a, b) => new Date(b.start) - new Date(a.start));
    return started[0] || list.sort((a, b) => new Date(b.start) - new Date(a.start))[0] || null;
  };

  // Rapports attendus : modules périodiques ayant une période en cours.
  const expected = useMemo(() => {
    return modules
      .filter((m) => m.kind === 'periodic')
      .map((m) => {
        const p = currentPeriod(m.periodicity);
        const s = p ? saisies.find((x) => x.moduleId === m.id && x.periodeId === p.id) : null;
        return { module: m, periode: p, saisie: s };
      })
      .filter((r) => r.periode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, saisies, periodes]);

  const remis = (saisie) => !!saisie && saisie.status !== 'brouillon'; // soumise ou au-delà

  // 4 compteurs (zip : En retard, Brouillons, Soumises, Rejetées)
  const lateCount = expected.filter((r) => !r.saisie && new Date(r.periode.deadline) < today).length;
  const counters = [
    { label: 'En retard', value: lateCount, color: 'text-[#B7791F]' },
    { label: 'Brouillons', value: saisies.filter((s) => s.status === 'brouillon').length, color: 'text-[#5B6778]' },
    { label: 'Soumises', value: saisies.filter((s) => s.status === 'soumise').length, color: 'text-[#1F5FA8]' },
    { label: 'Rejetées', value: saisies.filter((s) => s.status === 'rejetee').length, color: 'text-[#B42318]' },
  ];

  // Alertes
  const rejetees = saisies.filter((s) => s.status === 'rejetee');
  const missing = expected.filter((r) => !r.saisie && new Date(r.periode.deadline) < today);
  const upcoming = expected.filter(
    (r) => !r.saisie && new Date(r.periode.deadline) >= today && (new Date(r.periode.deadline) - today) / 86400000 <= 7,
  );

  const openSaisie = (saisieId) => navigate(`/mes-saisies/${saisieId}`);

  if (loading) {
    return <div className="text-[#5B6778]">Chargement...</div>;
  }

  // a) Avancement de la période en cours
  const totalAttendus = expected.length;
  const remises = expected.filter((r) => remis(r.saisie)).length;
  const pct = totalAttendus > 0 ? Math.round((remises / totalAttendus) * 100) : 0;

  // b) Prochaines échéances (attendus non remis, échéance croissante, 5 max)
  const echeances = expected
    .filter((r) => !remis(r.saisie))
    .sort((a, b) => new Date(a.periode.deadline) - new Date(b.periode.deadline))
    .slice(0, 5);

  // c) Activité récente (5 dernières saisies modifiées)
  const activite = [...saisies]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">
          {me ? `Bonjour, ${me.prenom} ${me.nom}` : 'Tableau de bord'}
        </h1>
        <p className="text-sm text-[#5B6778] mt-1">
          {me && me.structureLabel ? `${me.structureLabel}` : ''}
          {me && me.structureLabel ? ' · ' : ''}Suivi de vos saisies par module et par période.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {saisies.length === 0 && !error && (
        <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3">
          <p className="text-sm font-semibold text-[#1F5FA8]">Bienvenue sur SIGBD.</p>
          <p className="text-sm text-[#5B6778] mt-0.5">
            Vous n'avez encore aucune saisie. Choisissez un module dans le menu Modules pour commencer.
          </p>
        </div>
      )}

      {/* Alertes */}
      <div className="space-y-2">
        {rejetees.length > 0 && (
          <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#B42318] font-medium">
                {rejetees.length === 1
                  ? 'Un rapport a été rejeté.'
                  : `${rejetees.length} rapports ont été rejetés.`}
              </p>
              <button
                onClick={() => navigate('/mes-saisies?statut=rejetee')}
                className="text-sm font-semibold text-[#B42318] underline whitespace-nowrap ml-4"
              >
                Corriger
              </button>
            </div>
            <p className="text-sm text-[#B42318]/90 mt-0.5">
              {rejetees.map((s, i) => {
                const mod = modules.find((m) => m.id === s.moduleId);
                return (
                  <span key={i}>
                    {i > 0 && ' · '}
                    <Link to={`/modules/${mod ? mod.code : ''}`}>
                      {mod ? mod.label : s.moduleCode}
                    </Link>
                  </span>
                );
              })}
              {rejetees.length > 1 && (
                <span className="ml-2">. Consultez le motif et corrigez votre saisie.</span>
              )}
              {rejetees.length === 1 && (
                <span className="ml-2">. Consultez le motif et corrigez votre saisie.</span>
              )}
            </p>
          </div>
        )}
        {missing.length > 0 && (
          <div className="rounded-lg border border-[#F8D7A4] bg-[#FEF6E7] px-4 py-3 text-sm text-[#B7791F] font-medium">
            {missing.length} rapport{missing.length > 1 ? 's sont' : ' est'} en retard.{' '}
            <span className="font-normal">
              {missing.map((r, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <Link to={`/modules/${r.module.code}`}>
                    {r.module.label} – {r.periode.label}
                  </Link>
                </span>
              ))}
            </span>
            .
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8] font-medium">
            {upcoming.length} échéance{upcoming.length > 1 ? 's' : ''} dans les 7 prochains jours :{' '}
            {upcoming.map((r, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <Link to={`/modules/${r.module.code}`}>{r.module.code}</Link>
              </span>
            ))}.
          </div>
        )}
        {rejetees.length === 0 && missing.length === 0 && upcoming.length === 0 && (
          <div className="rounded-lg border border-[#B7E3C8] bg-[#EBF7EE] px-4 py-3 text-sm text-[#1E7B4F] font-medium">
            Aucune alerte pour le moment.
          </div>
        )}
      </div>

      {/* 4 compteurs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {counters.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-[#E3E8EF] p-5 shadow-sm">
            <p className="text-[13px] font-semibold text-[#5B6778] uppercase tracking-wide">{c.label}</p>
            <p className={`text-[28px] font-semibold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* a) Avancement de la période en cours */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E8EF]">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Avancement de la période en cours</h2>
          <p className="text-sm text-[#5B6778] mt-0.5">
            Rapports attendus remis (statut soumise ou au-delà) sur le total des rapports attendus.
          </p>
        </div>
        <div className="px-5 py-4">
          {totalAttendus === 0 ? (
            <p className="text-sm text-[#5B6778]">Aucun rapport attendu.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#5B6778]">Avancement</span>
                <span className="font-semibold text-[#0B2A4A]">{remises} sur {totalAttendus} rapports remis</span>
              </div>
              <div className="w-full bg-[#E3E8EF] rounded-full h-3 overflow-hidden">
                <div
                  role="progressbar"
                  aria-valuenow={remises}
                  aria-valuemin={0}
                  aria-valuemax={totalAttendus}
                  className="h-full bg-[#1F5FA8]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* b) Prochaines échéances & c) Activité récente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E3E8EF]">
            <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Prochaines échéances</h2>
          </div>
          <div className="px-5 py-4">
            {echeances.length === 0 ? (
              <p className="text-sm text-[#5B6778]">Aucune échéance à venir.</p>
            ) : (
              <ul className="space-y-3">
                {echeances.map((r) => {
                  const deadline = new Date(r.periode.deadline);
                  const diff = Math.floor((deadline - today) / 86400000);
                  const retard = Math.floor((today - deadline) / 86400000);
                  return (
                    <li key={r.module.id} className="border-b border-[#E3E8EF] pb-2 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <Link to={`/modules/${r.module.code}`} className="font-semibold text-[#0B2A4A]">
                          {r.module.code}
                        </Link>
                        <span className="text-sm text-[#5B6778]">{r.periode.label}</span>
                      </div>
                      <div className="text-sm text-[#5B6778]">
                        Échéance {formatDate(r.periode.deadline)}{' '}
                        {diff < 0 ? `· En retard de ${retard} jour${retard > 1 ? 's' : ''}` : `· ${diff} jour${diff > 1 ? 's' : ''} restant${diff > 1 ? 's' : ''}`}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E3E8EF]">
            <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Activité récente</h2>
          </div>
          <div className="px-5 py-4">
            {activite.length === 0 ? (
              <p className="text-sm text-[#5B6778]">Aucune activité pour le moment.</p>
            ) : (
              <ul className="space-y-3">
                {activite.map((s) => {
                  const mod = modules.find((m) => m.id === s.moduleId);
                  return (
                    <li key={s.id} className="border-b border-[#E3E8EF] pb-2 last:border-b-0 cursor-pointer hover:bg-[#F5F7FA]" onClick={() => openSaisie(s.id)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#0B2A4A]">
                            {mod ? `${mod.code} — ${mod.label}` : s.moduleCode}
                          </p>
                          <StatusBadge status={s.status} />
                        </div>
                        <p className="text-sm text-[#5B6778]">
                          {formatDateTime(s.updatedAt || s.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatDate } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import NouvelleSaisieModal from '../../components/Form/NouvelleSaisieModal.jsx';

const PERIODICITY_LABELS = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  event: 'Événement',
};

// Tableau de bord Client (SPEC §4) : alertes, 4 compteurs, tableau des modules.
export default function ClientDashboard() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [saisies, setSaisies] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalModule, setModalModule] = useState(null);

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

  const rows = useMemo(() => {
    return modules
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((m) => {
        if (m.kind === 'periodic') {
          const p = currentPeriod(m.periodicity);
          const saisie = p
            ? saisies.find((s) => s.moduleId === m.id && s.periodeId === p.id)
            : null;
          return { module: m, periode: p, saisie, isEvent: false };
        }
        const mine = saisies
          .filter((s) => s.moduleId === m.id)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return { module: m, periode: null, saisie: mine[0] || null, isEvent: true };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, saisies, periodes]);

  const lateOf = (r) => {
    if (!r.periode || r.saisie) return null;
    const days = Math.floor((today - new Date(r.periode.deadline)) / 86400000);
    return days > 0 ? days : null;
  };

  // 4 compteurs (zip : En retard, Brouillons, Soumises, Rejetées)
  const lateCount = rows.filter((r) => lateOf(r)).length;
  const counters = [
    { label: 'En retard', value: lateCount, color: 'text-[#B7791F]' },
    { label: 'Brouillons', value: saisies.filter((s) => s.status === 'brouillon').length, color: 'text-[#5B6778]' },
    { label: 'Soumises', value: saisies.filter((s) => s.status === 'soumise').length, color: 'text-[#1F5FA8]' },
    { label: 'Rejetées', value: saisies.filter((s) => s.status === 'rejetee').length, color: 'text-[#B42318]' },
  ];

  // Alertes
  const rejetees = saisies.filter((s) => s.status === 'rejetee');
  const rejeteeDetail = rejetees
    .slice(0, 3)
    .map((s) => {
      const mod = modules.find((m) => m.id === s.moduleId);
      const per = periodes.find((p) => p.id === s.periodeId);
      return `${mod ? mod.label : s.moduleCode}${per ? ` – ${per.label}` : ''}`;
    })
    .join(' · ');
  const missing = rows.filter((r) => !r.isEvent && !r.saisie && r.periode && new Date(r.periode.deadline) < today);
  const missingDetail = missing
    .slice(0, 4)
    .map((r) => `${r.module.label} – ${r.periode.label}`)
    .join(' · ');
  const upcoming = rows.filter(
    (r) =>
      !r.isEvent &&
      !r.saisie &&
      r.periode &&
      new Date(r.periode.deadline) >= today &&
      (new Date(r.periode.deadline) - today) / 86400000 <= 7
  );

  const openSaisie = (saisieId) => navigate(`/mes-saisies/${saisieId}`);

  if (loading) {
    return <div className="text-[#5B6778]">Chargement...</div>;
  }

  const actionFor = (r) => {
    if (r.saisie) {
      if (r.saisie.status === 'brouillon') return { label: 'Continuer', primary: false };
      if (r.saisie.status === 'rejetee') return { label: 'Corriger', primary: false };
      return { label: 'Consulter', primary: false };
    }
    if (r.isEvent) return { label: 'Nouvelle saisie', primary: true };
    return { label: 'Saisir', primary: true };
  };

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
            Vous n'avez encore aucune saisie. Choisissez un module ci-dessous pour commencer.
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
              {rejeteeDetail}. Consultez le motif et corrigez votre saisie.
            </p>
          </div>
        )}
        {missing.length > 0 && (
          <div className="rounded-lg border border-[#F8D7A4] bg-[#FEF6E7] px-4 py-3 text-sm text-[#B7791F] font-medium">
            {missing.length} rapport{missing.length > 1 ? 's sont' : ' est'} en retard.{' '}
            <span className="font-normal">{missingDetail}.</span>
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8] font-medium">
            {upcoming.length} échéance{upcoming.length > 1 ? 's' : ''} dans les 7 prochains jours :{' '}
            {upcoming.map((r) => r.module.code).join(', ')}.
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

      {/* Tableau des modules */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E8EF]">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Mes modules</h2>
          <p className="text-sm text-[#5B6778] mt-0.5">
            Choisissez le module que vous souhaitez renseigner.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Périodicité</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période et échéance</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A] min-w-[260px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#5B6778]">
                    Aucun module disponible pour votre structure.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const late = lateOf(r);
                const action = actionFor(r);
                const nbEvent = saisies.filter((s) => s.moduleId === r.module.id).length;
                return (
                  <tr key={r.module.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[#0B2A4A]">{r.module.code}</span>{' '}
                      <span className="text-[#1A2433]">{r.module.label}</span>
                      {r.isEvent && r.saisie && (
                        <p className="text-[12px] text-[#5B6778] mt-0.5">
                          {nbEvent} saisie{nbEvent > 1 ? 's' : ''} enregistrée{nbEvent > 1 ? 's' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">
                      {r.isEvent
                        ? PERIODICITY_LABELS.event
                        : PERIODICITY_LABELS[r.module.periodicity] || '—'}
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">
                      {r.isEvent || !r.periode ? (
                        '—'
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {r.periode.label} · échéance {formatDate(r.periode.deadline)}
                          </span>
                          {late && (
                            <span className="inline-flex items-center rounded-full bg-[#FEF6E7] border border-[#F8D7A4] px-2 py-0.5 text-[11px] font-semibold text-[#B7791F]">
                              En retard de {late} jour{late > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {r.saisie ? (
                        <StatusBadge status={r.saisie.status} />
                      ) : (
                        <span className="text-[#8A94A6]">Aucune saisie</span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {r.isEvent && r.saisie ? (
                        <div className="flex flex-nowrap items-center gap-2">
                          <button
                            onClick={() => openSaisie(r.saisie.id)}
                            className="h-[32px] px-3 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 border border-[#D6DCE5] text-[#1A2433] hover:bg-[#F5F7FA]"
                          >
                            {action.label}
                          </button>
                          <button
                            onClick={() => setModalModule(r.module)}
                            className="h-[32px] px-3 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 bg-[#1F5FA8] hover:bg-[#174C87] text-white"
                          >
                            Nouvelle saisie
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            r.saisie ? openSaisie(r.saisie.id) : setModalModule(r.module)
                          }
                          className={`h-[32px] px-3 rounded-lg text-[13px] font-semibold ${
                            action.primary
                              ? 'bg-[#1F5FA8] hover:bg-[#174C87] text-white'
                              : 'border border-[#D6DCE5] text-[#1A2433] hover:bg-[#F5F7FA]'
                          }`}
                        >
                          {action.label}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <NouvelleSaisieModal
        module={modalModule}
        periodes={periodes}
        isOpen={!!modalModule}
        onClose={() => setModalModule(null)}
        onCreated={(id) => {
          setModalModule(null);
          navigate(`/mes-saisies/${id}`);
        }}
      />
    </div>
  );
}

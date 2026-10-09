import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatDate } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import NouvelleSaisieModal from '../../components/Form/NouvelleSaisieModal.jsx';

// Tableau de bord Client (SPEC §4) : alertes, 4 compteurs, tableau des modules.
export default function ClientDashboard() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [saisies, setSaisies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalModule, setModalModule] = useState(null);

  const load = async () => {
    try {
      const [m, p, s] = await Promise.all([
        api('/modules'),
        api('/periodes'),
        api('/saisies'),
      ]);
      setModules(m);
      setPeriodes(p);
      setSaisies(s);
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

  // 4 compteurs
  const counters = [
    { label: 'Total saisies', value: saisies.length, color: 'text-[#0B2A4A]' },
    { label: 'Brouillons', value: saisies.filter((s) => s.status === 'brouillon').length, color: 'text-[#5B6778]' },
    { label: 'Soumises', value: saisies.filter((s) => s.status === 'soumise').length, color: 'text-[#1F5FA8]' },
    { label: 'Rejetées', value: saisies.filter((s) => s.status === 'rejetee').length, color: 'text-[#B42318]' },
  ];

  // Alertes
  const rejetees = saisies.filter((s) => s.status === 'rejetee');
  const missing = rows.filter(
    (r) => !r.isEvent && !r.saisie && r.periode && new Date(r.periode.deadline) < today
  );
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Tableau de bord</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Suivi de vos saisies par module et par période.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {/* Alertes */}
      <div className="space-y-2">
        {rejetees.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3">
            <p className="text-sm text-[#B42318] font-medium">
              {rejetees.length} saisie{rejetees.length > 1 ? 's ont été rejetées' : ' a été rejetée'} et
              doit{rejetees.length > 1 ? 'ent' : ''} être corrigée{rejetees.length > 1 ? 's' : ''}.
            </p>
            <button
              onClick={() => navigate('/mes-saisies?statut=rejetee')}
              className="text-sm font-semibold text-[#B42318] underline whitespace-nowrap ml-4"
            >
              Corriger
            </button>
          </div>
        )}
        {missing.length > 0 && (
          <div className="rounded-lg border border-[#F8D7A4] bg-[#FEF6E7] px-4 py-3 text-sm text-[#B7791F] font-medium">
            {missing.length} échéance{missing.length > 1 ? 's sont' : ' est'} dépassée
            {missing.length > 1 ? 's' : ''} sans saisie : {missing.map((r) => r.module.code).join(', ')}.
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
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Modules de saisie</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Échéance</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Actions</th>
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
              {rows.map((r) => (
                <tr key={r.module.id} className="border-t border-[#E3E8EF]">
                  <td className="px-5 py-3">
                    <span className="font-semibold text-[#0B2A4A]">{r.module.code}</span>{' '}
                    <span className="text-[#1A2433]">{r.module.label}</span>
                  </td>
                  <td className="px-5 py-3 text-[#5B6778]">
                    {r.isEvent ? 'Événement' : r.periode ? r.periode.label : '—'}
                  </td>
                  <td className="px-5 py-3 text-[#5B6778]">
                    {r.isEvent || !r.periode ? '—' : formatDate(r.periode.deadline)}
                  </td>
                  <td className="px-5 py-3">
                    {r.saisie ? <StatusBadge status={r.saisie.status} /> : <span className="text-[#8A94A6]">Aucune saisie</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {r.saisie && (
                        <button
                          onClick={() => openSaisie(r.saisie.id)}
                          className="h-[32px] px-3 rounded-lg border border-[#D6DCE5] text-[13px] font-semibold text-[#1A2433] hover:bg-[#F5F7FA]"
                        >
                          {r.saisie.status === 'brouillon' || r.saisie.status === 'rejetee'
                            ? 'Reprendre'
                            : 'Consulter'}
                        </button>
                      )}
                      {(!r.isEvent && !r.saisie) || r.isEvent ? (
                        <button
                          onClick={() => setModalModule(r.module)}
                          className="h-[32px] px-3 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-[13px] font-semibold"
                        >
                          Nouvelle saisie
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
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

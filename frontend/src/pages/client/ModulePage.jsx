import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, formatDate, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import NouvelleSaisieModal from '../../components/Form/NouvelleSaisieModal.jsx';
import Button from '../../components/Common/Button.jsx';

const PERIODICITY_LABELS = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  event: 'Événement',
};

// Carte « Période en cours » : même logique d'action que le tableau de bord client.
const actionFor = (saisie, isEvent) => {
  if (saisie) {
    if (saisie.status === 'brouillon') return { label: 'Continuer', open: false };
    if (saisie.status === 'rejetee') return { label: 'Corriger', open: false };
    return { label: 'Consulter', open: false };
  }
  if (isEvent) return { label: 'Nouvelle saisie', open: true };
  return { label: 'Saisir', open: true };
};

// Nombre de jours de retard d'une échéance passée (null sinon).
const joursRetard = (deadline) => {
  if (!deadline) return null;
  const days = Math.floor((new Date() - new Date(deadline)) / 86400000);
  return days > 0 ? days : null;
};

export default function ModulePage() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [saisies, setSaisies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [modalModule, setModalModule] = useState(null);

  const today = new Date();

  const currentPeriod = (periodicity) => {
    const list = periodes.filter((p) => p.periodicity === periodicity);
    const started = list
      .filter((p) => new Date(p.start) <= today)
      .sort((a, b) => new Date(b.start) - new Date(a.start));
      return started[0] || list.sort((a, b) => new Date(b.start) - new Date(a.start))[0] || null;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [m, p, s] = await Promise.all([
          api('/modules'),
          api('/periodes'),
          api('/saisies'),
        ]);
        if (!cancelled) {
          setModules(m);
          setPeriodes(p);
          setSaisies(s);
          setError(null);
          const module = m.find((x) => x.code === code);
          if (!module) setNotFound(true);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Impossible de charger le module.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) return <div className="text-[#5B6778]">Chargement...</div>;

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Retour au tableau de bord
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          Module introuvable.
        </div>
        <p className="text-sm text-[#5B6778]">
          Ce module n'existe pas ou n'est pas accessible pour votre structure.
        </p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Retour au tableau de bord
        </Button>
      </div>
    );
  }

  const module = modules.find((m) => m.code === code);
  const isEvent = module.kind === 'event';
  const periode = isEvent ? null : currentPeriod(module.periodicity);
  const saisie =
    isEvent
      ? saisies
          .filter((s) => s.moduleId === module.id)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
      : periode
        ? saisies.find((s) => s.moduleId === module.id && s.periodeId === periode.id) || null
        : null;

  const moduleSaisies = useMemo(
    () =>
      [...saisies]
        .filter((s) => s.moduleId === module.id)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)),
    [saisies, module.id],
  );

  const action = actionFor(saisie, isEvent);
  const late = joursRetard(periode ? periode.deadline : null);

  const rejet =
    saisie && saisie.status === 'rejetee'
      ? [...(saisie.validations || [])].reverse().find((v) => v.decision === 'rejetee')
      : null;

  const openSaisie = (id) => navigate(`/mes-saisies/${id}`);
  const openModal = () => setModalModule(module);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-[#1F5FA8] hover:underline">
            ← Retour au tableau de bord
          </Link>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-1">
            {module.code} — {module.label}
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            Périodicité : {PERIODICITY_LABELS[module.periodicity] || '—'}
            {isEvent ? ' · module d\'événement' : ''}
          </p>
        </div>
        {saisie && (
          <StatusBadge status={saisie.status} />
        )}
      </div>

      {/* Carte « Période en cours » (modules périodiques) */}
      {!isEvent && (
        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E3E8EF]">
            <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Période en cours</h2>
            <p className="text-sm text-[#5B6778] mt-0.5">
              {periode ? periode.label : 'Aucune période configurée'}
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-[#0B2A4A]">
                  {periode ? periode.label : '—'}
                </p>
                {periode && (
                  <p className="text-sm text-[#5B6778] mt-0.5">
                    Échéance {formatDate(periode.deadline)}{late ? ` · ` : ''}
                  </p>
                )}
                {late && (
                  <span className="inline-flex items-center rounded-full bg-[#FEF6E7] border border-[#F8D7A4] px-2 py-0.5 text-[11px] font-semibold text-[#B7791F]">
                    En retard de {late} jour{late > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {saisie ? <StatusBadge status={saisie.status} /> : <span className="text-[#8A94A6]">Aucune saisie</span>}
                <Button
                  variant={action.open ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={action.open ? openModal : () => openSaisie(saisie.id)}
                >
                  {action.label}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEvent && (
        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E3E8EF]">
            <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Module d'événement</h2>
            <p className="text-sm text-[#5B6778] mt-0.5">
              Créez une saisie en indiquant la date de référence de l'événement.
            </p>
          </div>
          <div className="px-5 py-4">
            <Button variant="primary" size="sm" onClick={openModal}>
              Nouvelle saisie
            </Button>
          </div>
        </div>
      )}

      {/* Bannière de rejet */}
      {rejet && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#B42318]">Rapport rejeté</p>
              <p className="text-sm text-[#1A2433] mt-1 font-semibold">Motif du rejet</p>
              <p className="text-sm text-[#1A2433]">{rejet.motif}</p>
              <p className="text-xs text-[#5B6778] mt-1">
                Rejeté par {rejet.actor || 'administrateur régional'} le {formatDateTime(rejet.date)}
              </p>
            </div>
            <Button variant="dangerSolid" onClick={() => openSaisie(saisie.id)}>
              Corriger
            </Button>
          </div>
        </div>
      )}

      {/* Historique des saisies */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E8EF]">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Historique des saisies</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Période / Événement</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Dernière modification</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
              </tr>
            </thead>
            <tbody>
              {moduleSaisies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucune saisie pour ce module.
                  </td>
                </tr>
              )}
              {moduleSaisies.map((s) => {
                const periodLabel = s.periodeLabel
                  ? s.periodeLabel
                  : s.eventDate
                    ? `Événement du ${formatDate(s.eventDate)}`
                    : '—';
                return (
                  <tr
                    key={s.id}
                    className="border-t border-[#E3E8EF] hover:bg-[#F5F7FA] cursor-pointer"
                    onClick={() => openSaisie(s.id)}
                  >
                    <td className="px-5 py-3 text-[#5B6778]">{periodLabel}</td>
                    <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-5 py-3 text-[#5B6778]">
                      {formatDateTime(s.updatedAt || s.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <Button variant="secondary" size="sm" onClick={(e) => {
                        e.stopPropagation();
                        openSaisie(s.id);
                      }}>
                        Ouvrir
                      </Button>
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

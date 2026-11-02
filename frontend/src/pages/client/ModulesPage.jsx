import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, formatDate } from '../../api.js';
import { buildRows, lateOf, actionFor, PERIODICITY_LABELS, estRemis } from '../../lib/clientModules.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import NouvelleSaisieModal from '../../components/Form/NouvelleSaisieModal.jsx';
import Button from '../../components/Common/Button.jsx';

// Filtres rapides disponibles sur la page « Modules ».
const FILTRES = [
  { key: 'tous', label: 'Tous' },
  { key: 'afaire', label: 'À faire' },
  { key: 'enretard', label: 'En retard' },
  { key: 'rejetes', label: 'Rejetés' },
  { key: 'remis', label: 'Remis' },
];

const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function ModulesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modules, setModules] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [saisies, setSaisies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalModule, setModalModule] = useState(null);

  const today = new Date();

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
      setError(err.message || 'Impossible de charger les modules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="text-[#5B6778]">Chargement...</div>;
  }

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

  const filtre = searchParams.get('filtre') || 'tous';
  const q = (searchParams.get('q') || '').trim();

  const rows = useMemo(() => buildRows(modules, saisies, periodes, today), [modules, saisies, periodes]);

  const qNorm = stripAccents(q.toLowerCase());
  const filtreRows = useMemo(() => {
    return rows.filter((r) => {
      // Recherche texte (code ou libellé, insensible à la casse et aux accents).
      const texte = stripAccents(`${r.module.code} ${r.module.label}`.toLowerCase());
      const matchQ = !qNorm || texte.includes(qNorm);
      if (!matchQ) return false;

      // Filtre rapide.
      if (filtre === 'tous') return true;
      if (filtre === 'afaire') return !r.saisie || r.saisie.status === 'brouillon';
      if (filtre === 'enretard') {
        return !r.isEvent && !r.saisie && r.periode && lateOf(r, today) != null;
      }
      if (filtre === 'rejetes') return !!r.saisie && r.saisie.status === 'rejetee';
      if (filtre === 'remis') return estRemis(r.saisie);
      return true;
    });
  }, [rows, filtre, qNorm, today]);

  const openSaisie = (saisieId) => navigate(`/mes-saisies/${saisieId}`);
  const openModal = (m) => setModalModule(m);
  const setFiltre = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('filtre', key);
    setSearchParams(next);
  };
  const setQ = (value) => {
    const next = new URLSearchParams(searchParams);
    next.set('q', value);
    setSearchParams(next);
  };

  const countBy = (key) => {
    if (key === 'tous') return rows.length;
    if (key === 'afaire') return rows.filter((r) => !r.saisie || r.saisie.status === 'brouillon').length;
    if (key === 'enretard') return rows.filter((r) => !r.isEvent && !r.saisie && r.periode && lateOf(r, today) != null).length;
    if (key === 'rejetes') return rows.filter((r) => !!r.saisie && r.saisie.status === 'rejetee').length;
    if (key === 'remis') return rows.filter((r) => estRemis(r.saisie)).length;
    return 0;
  };

  const isFiltreActive = (key) => filtre === key;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Modules</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Choisissez le rapport que vous souhaitez renseigner.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {/* Recherche + filtres rapides */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative flex-1 max-w-[320px]">
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-[#5B6778] mb-1">
            Rechercher un module
          </label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code ou libellé…"
            className="w-full h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm"
            aria-label="Rechercher un module"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTRES.map((f) => {
            const active = isFiltreActive(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltre(f.key)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  active
                    ? 'bg-[#1F5FA8] border-[#1F5FA8] text-white'
                    : 'border-[#D6DCE5] bg-white text-[#1A2433] hover:bg-[#F5F7FA]'
                }`}
              >
                {f.label} ({countBy(f.key)})
              </button>
            );
          })}
        </div>
      </div>

      {/* Tableau des modules */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
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
              {filtreRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#5B6778]">
                    Aucun module ne correspond à votre recherche.
                  </td>
                </tr>
              )}
              {filtreRows.map((r) => {
                const late = lateOf(r, today);
                const action = actionFor(r);
                const nbEvent = saisies.filter((s) => s.moduleId === r.module.id).length;
                return (
                  <tr key={r.module.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3">
                      <Link
                        to={`/modules/${r.module.code}`}
                        className="font-semibold text-[#0B2A4A] hover:underline"
                      >
                        {r.module.code}
                      </Link>{' '}
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openSaisie(r.saisie.id)}
                          >
                            {action.label}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openModal(r.module)}
                          >
                            Nouvelle saisie
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant={action.primary ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() =>
                            r.saisie ? openSaisie(r.saisie.id) : openModal(r.module)
                          }
                        >
                          {action.label}
                        </Button>
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

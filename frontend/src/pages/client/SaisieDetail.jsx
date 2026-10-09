import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateTime, formatDate, formatTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import DynamicForm from '../../components/Form/DynamicForm.jsx';
import ConfirmModal from '../../components/Common/Modal/ConfirmModal.jsx';
import { useToast } from '../../components/Common/Toast/Toast.jsx';
import { sourcesOf } from '../../lib/sources.js';
import { validateSubmit } from '../../../../shared/rules.mjs';

const STEP_STYLES = {
  creee: { color: 'bg-[#8A94A6]', label: 'Créée' },
  soumise: { color: 'bg-[#1F5FA8]', label: 'Soumise' },
  rejetee: { color: 'bg-[#B42318]', label: 'Rejetée' },
  validee: { color: 'bg-[#1E7B4F]', label: 'Validée' },
  exportee: { color: 'bg-[#0E7490]', label: 'Exportée' },
};

const NOMINATION_CODES = ['NOS', 'NPR', 'NCA'];

// Détail d'une saisie : formulaire dynamique (édition + autosave + soumission)
// ou lecture seule, bannière de rejet, historique des étapes.
export default function SaisieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [saisie, setSaisie] = useState(null);
  const [steps, setSteps] = useState([]);
  const [options, setOptions] = useState({});
  const [priorExports, setPriorExports] = useState([]);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/saisies/${id}`);
      setSaisie(data);
      setValues(data.values || {});
      setErrors({});
      setLoadError(null);

      const [h] = await Promise.all([api(`/saisies/${id}/historique`).catch(() => [])]);
      setSteps(h);

      // Options des listes de référence du module
      const sources = sourcesOf((data.module && data.module.fields) || []);
      if (sources.length > 0) {
        const lists = await Promise.all(
          sources.map((s) => api(`/referentiels/${s}`).catch(() => ({ values: [] })))
        );
        const map = {};
        sources.forEach((src, i) => {
          map[src] = lists[i].values;
        });
        setOptions(map);
      } else {
        setOptions({});
      }

      // Carte « Historique des changements » (nominations)
      if (data.module && NOMINATION_CODES.includes(data.module.code)) {
        const prior = await api(
          `/saisies?module=${data.moduleId}&status=exportee`
        ).catch(() => []);
        setPriorExports(prior);
      } else {
        setPriorExports([]);
      }
      dirtyRef.current = false;
      setSavedAt(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const autoCtx = useMemo(() => {
    // Libellés connus côté client pour les champs auto
    const stored = (saisie && saisie.values) || {};
    return {
      structure: (saisie && saisie.structureLabel) || '',
      region: stored.region || '',
      author: (saisie && saisie.authorLabel) || '',
    };
  }, [saisie]);

  const canEdit = !!saisie && !!saisie.canEdit;

  // Autosave du brouillon (debounce 1,5 s)
  const saveNow = async () => {
    if (!saisie || !canEdit) return { ok: true };
    if (savingRef.current) return { ok: true };
    savingRef.current = true;
    try {
      await api(`/saisies/${saisie.id}`, { method: 'PUT', body: { values } });
      setSavedAt(new Date().toISOString());
      setSaveError(null);
      setErrors({});
      return { ok: true };
    } catch (err) {
      if (err.status === 400 && err.data && err.data.errors) {
        setErrors(err.data.errors);
        setSaveError('Certaines valeurs ne sont pas valides.');
      } else {
        setSaveError(err.message);
      }
      return { ok: false, err };
    } finally {
      savingRef.current = false;
    }
  };

  useEffect(() => {
    if (!dirtyRef.current || !canEdit) return;
    const timer = setTimeout(saveNow, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, canEdit]);

  const onChangeValues = (next) => {
    dirtyRef.current = true;
    setValues(next);
  };

  const submit = async () => {
    setBusy(true);
    try {
      // 1. Enregistrer l'état courant (vérité serveur)
      const saved = await saveNow();
      if (!saved.ok) {
        addToast('Le formulaire contient des erreurs.', 'error');
        setConfirmOpen(false);
        return;
      }
      // 2. Validation complète navigateur (le serveur revalide)
      const clientErrors = validateSubmit((saisie.module && saisie.module.fields) || [], values, {
        options,
        today: new Date(),
      });
      if (Object.keys(clientErrors).length > 0) {
        setErrors(clientErrors);
        addToast('Le formulaire contient des erreurs.', 'error');
        setConfirmOpen(false);
        return;
      }
      // 3. Soumission
      await api(`/saisies/${saisie.id}/soumettre`, { method: 'POST' });
      addToast('Saisie soumise avec succès.', 'success');
      setConfirmOpen(false);
      await load();
    } catch (err) {
      if (err.status === 400 && err.data && err.data.errors) {
        setErrors(err.data.errors);
        addToast('Le formulaire contient des erreurs.', 'error');
      } else {
        addToast(err.message, 'error');
      }
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-[#5B6778]">Chargement...</div>;

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {loadError}
        </div>
        <button
          onClick={() => navigate('/mes-saisies')}
          className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
        >
          Retour à mes saisies
        </button>
      </div>
    );
  }

  const rejet =
    saisie.status === 'rejetee'
      ? [...(saisie.validations || [])].reverse().find((v) => v.decision === 'rejetee')
      : null;

  const periodLabel = saisie.periodeLabel
    ? saisie.periodeLabel
    : saisie.eventDate
    ? `Événement du ${formatDate(saisie.eventDate)}`
    : '—';

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/mes-saisies" className="text-sm text-[#1F5FA8] hover:underline">
            ← Mes saisies
          </Link>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-1">
            {saisie.moduleCode} — {saisie.moduleLabel}
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            {periodLabel} · Version {saisie.moduleVersion} · Créée le{' '}
            {formatDateTime(saisie.dates && saisie.dates.created)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={saisie.status} />
          {canEdit && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
            >
              {saisie.status === 'rejetee' ? 'Soumettre' : 'Soumettre'}
            </button>
          )}
        </div>
      </div>

      {/* Bannière de rejet */}
      {rejet && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#B42318]">
                Saisie rejetée{rejet.actor ? ` par ${rejet.actor}` : ''}
              </p>
              <p className="text-sm text-[#1A2433] mt-1">Motif : {rejet.motif}</p>
            </div>
            {canEdit && (
              <button
                onClick={() => setConfirmOpen(true)}
                className="h-[36px] px-4 rounded-lg bg-[#B42318] hover:bg-[#9B1E14] text-white text-sm font-semibold whitespace-nowrap"
              >
                Corriger et resoumettre
              </button>
            )}
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-4 py-3 text-sm text-[#5B6778]">
          Cette saisie est en lecture seule (statut « {saisie.statusLabel} »).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Formulaire</h2>
              {canEdit && (
                <span className="text-xs text-[#5B6778]">
                  {saveError ? (
                    <span className="text-[#B42318] font-semibold">{saveError}</span>
                  ) : savedAt ? (
                    <>Enregistré à {formatTime(savedAt)}</>
                  ) : (
                    'Enregistrement automatique'
                  )}
                </span>
              )}
            </div>
            <DynamicForm
              fields={(saisie.module && saisie.module.fields) || []}
              values={values}
              errors={errors}
              onChange={onChangeValues}
              disabled={!canEdit}
              options={options}
              autoCtx={autoCtx}
            />
          </div>

          {/* Historique des changements (nominations modules 6, 7, 8) */}
          {NOMINATION_CODES.includes(saisie.moduleCode) && (
            <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A] mb-4">
                Historique des changements
              </h2>
              {priorExports.length === 0 ? (
                <p className="text-sm text-[#5B6778]">
                  Aucune saisie exportée antérieure pour cette structure et ce module.
                </p>
              ) : (
                <ul className="space-y-3">
                  {priorExports.map((p) => (
                    <li key={p.id} className="rounded-lg border border-[#E3E8EF] px-4 py-3 text-sm">
                      <span className="font-semibold text-[#0B2A4A]">
                        {p.values && p.values.ref_arrete ? p.values.ref_arrete : 'Arrêté'}
                      </span>
                      <span className="text-[#5B6778]">
                        {' '}
                        ·{' '}
                        {p.values && p.values.date_prise_fonction
                          ? formatDate(p.values.date_prise_fonction)
                          : p.values && p.values.date_arrete
                          ? formatDate(p.values.date_arrete)
                          : p.eventDate
                          ? formatDate(p.eventDate)
                          : '—'}
                      </span>
                      <div className="text-[#5B6778] text-xs mt-1">
                        Exportée le {formatDateTime(p.dates && p.dates.exported)} ·{' '}
                        {p.values && p.values.statut ? p.values.statut : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Historique des étapes */}
        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6 h-fit">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A] mb-4">Historique des étapes</h2>
          <ol className="space-y-4">
            {steps.map((step, i) => {
              const style = STEP_STYLES[step.decision] || STEP_STYLES.creee;
              return (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-3 h-3 rounded-full mt-1.5 ${style.color}`} />
                    {i < steps.length - 1 && <span className="w-px flex-1 bg-[#E3E8EF] mt-1" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold text-[#0B2A4A]">
                      {step.decisionLabel}
                    </p>
                    <p className="text-xs text-[#5B6778]">
                      {formatDateTime(step.date)}
                      {step.actor ? ` · ${step.actor}` : ''}
                    </p>
                    {step.motif && (
                      <p className="text-xs text-[#B42318] mt-1">Motif : {step.motif}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Soumettre cette saisie ?"
        message={
          saisie.status === 'rejetee'
            ? 'La saisie corrigée sera renvoyée au service de validation régional. Elle ne pourra plus être modifiée tant qu’elle n’a pas été réexaminée.'
            : 'Une fois soumise, la saisie ne pourra plus être modifiée. Elle sera transmise au service de validation régional.'
        }
        confirmLabel="Soumettre"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submit}
      />
    </div>
  );
}

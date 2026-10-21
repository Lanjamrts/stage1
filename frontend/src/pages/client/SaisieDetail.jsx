import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateTime, formatDate, formatTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import DynamicForm from '../../components/Form/DynamicForm.jsx';
import ConfirmModal from '../../components/Common/Modal/ConfirmModal.jsx';
import Button from '../../components/Common/Button.jsx';
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
  const [submitErrorCount, setSubmitErrorCount] = useState(0);
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
      setSubmitErrorCount(0);
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
        setSubmitErrorCount(Object.keys(clientErrors).length);
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
        setSubmitErrorCount(Object.keys(err.data.errors).length);
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
        <Button
          variant="secondary"
          onClick={() => navigate('/mes-saisies')}
        >
          Retour à mes saisies
        </Button>
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
            Retour à mes saisies
          </Link>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-1">
            {saisie.moduleCode} — {saisie.moduleLabel}
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            {periodLabel}
            {saisie.structureLabel ? ` · ${saisie.structureLabel}` : ''}
          </p>
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Version {saisie.moduleVersion} · Créée le{' '}
            {formatDateTime(saisie.dates && saisie.dates.created)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={saisie.status} />
          {canEdit && saisie.status === 'brouillon' && (
            <Button
              variant="primary"
              onClick={() => setConfirmOpen(true)}
            >
              Soumettre
            </Button>
          )}
        </div>
      </div>

      {/* Bannière de rejet */}
      {rejet && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#B42318]">Rapport rejeté</p>
              <p className="text-sm text-[#1A2433] mt-1 font-semibold">Motif du rejet</p>
              <p className="text-sm text-[#1A2433]">{rejet.motif}</p>
              <p className="text-xs text-[#5B6778] mt-1">
                Rejeté par {rejet.actor || 'administrateur régional'} (administrateur régional) le{' '}
                {formatDateTime(rejet.date)}
              </p>
            </div>
            {canEdit && (
              <Button
                variant="dangerSolid"
                onClick={() => setConfirmOpen(true)}
                className="whitespace-nowrap"
              >
                Corriger et resoumettre
              </Button>
            )}
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-4 py-3 text-sm text-[#5B6778]">
          {saisie.status === 'soumise' && saisie.dates && saisie.dates.submitted ? (
            <>
              <p>
                Ce rapport a été soumis le {formatDateTime(saisie.dates.submitted)}. Il est en
                attente de validation par l'administrateur régional.
              </p>
              <p className="mt-1 text-[#8A94A6]">
                Mode consultation en lecture seule — aucune modification n'est permise.
              </p>
            </>
          ) : (
            <p>Cette saisie est en lecture seule. Elle ne peut plus être modifiée.</p>
          )}
        </div>
      )}

      {submitErrorCount > 0 && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          <p className="font-semibold">Le rapport ne peut pas être soumis.</p>
          <p>
            Corrigez {submitErrorCount} champ{submitErrorCount > 1 ? 's' : ''} signalé
            {submitErrorCount > 1 ? 's' : ''} en rouge.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">
                {canEdit ? 'Formulaire' : 'Contenu du rapport'}
              </h2>
              {canEdit && (
                <span className="text-xs text-[#5B6778]">
                  {saveError ? (
                    <span className="text-[#B42318] font-semibold">{saveError}</span>
                  ) : savedAt ? (
                    <>Brouillon enregistré à {formatTime(savedAt)}</>
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
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Historique des étapes</h2>
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#EBF3FC] text-[12px] font-semibold text-[#1F5FA8]">
              {steps.length}
            </span>
          </div>
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
        title={saisie.status === 'rejetee' ? 'Soumettre à nouveau ce rapport ?' : 'Soumettre ce rapport ?'}
        message={
          saisie.status === 'rejetee'
            ? 'Votre rapport corrigé sera de nouveau transmis à administrateur régional pour validation.'
            : 'Une fois soumis, vous ne pourrez plus le modifier, sauf s’il est rejeté par l’administrateur régional.'
        }
        confirmLabel="Confirmer la soumission"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submit}
      />
    </div>
  );
}

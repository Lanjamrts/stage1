import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateTime, formatDate } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import DynamicForm from '../../components/Form/DynamicForm.jsx';
import ConfirmModal from '../../components/Common/Modal/ConfirmModal.jsx';
import Button from '../../components/Common/Button.jsx';
import { useToast } from '../../components/Common/Toast/Toast.jsx';

const STEP_STYLES = {
  creee: { color: 'bg-[#8A94A6]', label: 'Créée' },
  soumise: { color: 'bg-[#1F5FA8]', label: 'Soumise' },
  rejetee: { color: 'bg-[#B42318]', label: 'Rejetée' },
  validee: { color: 'bg-[#1E7B4F]', label: 'Validée' },
  exportee: { color: 'bg-[#0E7490]', label: 'Exportée' },
};

// Modale de rejet : motif OBLIGATOIRE (1 à 500 caractères) — SPEC §2.
function RejectModal({ isOpen, busy, onCancel, onConfirm }) {
  const [motif, setMotif] = useState('');
  useEffect(() => {
    if (isOpen) setMotif('');
  }, [isOpen]);

  if (!isOpen) return null;
  const tooLong = motif.length > 500;
  const empty = motif.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#0B2A4A]/40" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-[480px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6">
        <h2 className="text-[18px] font-semibold text-[#0B2A4A] mb-2 flex items-center gap-2">
          <span aria-hidden="true">⚠</span> Rejeter ce rapport ?
        </h2>
        <p className="text-sm text-[#5B6778] mb-4">
          Indiquez le motif du rejet. Il sera visible du service qui a saisi le rapport.
        </p>
        <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
          Motif du rejet <span className="text-[#B42318]">*</span>
        </label>
        <textarea
          className={`w-full min-h-[110px] px-3 py-2 rounded-lg border text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30 ${
            tooLong || empty ? 'border-[#B42318]' : 'border-[#D6DCE5]'
          }`}
          value={motif}
          maxLength={520}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. : Le champ obligatoire « indicateurs » est vide."
        />
        <p className={`text-xs mt-1 text-right ${tooLong ? 'text-[#B42318]' : 'text-[#5B6778]'}`}>
          {motif.length} / 500
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="dangerSolid"
            disabled={busy || empty || tooLong}
            onClick={() => onConfirm(motif.trim())}
          >
            {busy ? 'Envoi…' : 'Confirmer le rejet'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Page de revue admin2 : contenu en lecture seule + Valider / Rejeter / Exporter.
export default function RevueSaisie() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [saisie, setSaisie] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'valider' | 'exporter' | null
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [data, h] = await Promise.all([
        api(`/saisies/${id}`),
        api(`/saisies/${id}/historique`).catch(() => []),
      ]);
      setSaisie(data);
      setSteps(h);
      setLoadError(null);
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

  const runAction = async (action) => {
    setBusy(true);
    try {
      if (action === 'valider') {
        await api(`/saisies/${id}/valider`, { method: 'POST' });
        addToast('Validation enregistrée.', 'success');
      } else if (action === 'exporter') {
        await api(`/saisies/${id}/exporter`, { method: 'POST' });
        addToast('Saisie exportée vers la base centrale.', 'success');
      }
      setConfirm(null);
      setRejectOpen(false);
      await load();
    } catch (err) {
      addToast(err.message, 'error');
      setConfirm(null);
      setRejectOpen(false);
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
          onClick={() => navigate('/donnees-saisies')}
        >
          Retour à « Données saisies »
        </Button>
      </div>
    );
  }

  const periodLabel = saisie.periodeLabel
    ? saisie.periodeLabel
    : saisie.eventDate
    ? `Événement du ${formatDate(saisie.eventDate)}`
    : '—';
  const lastRejet = [...(saisie.validations || [])].reverse().find((v) => v.decision === 'rejetee');
  const lastValide = [...(saisie.validations || [])].reverse().find((v) => v.decision === 'validee');
  const region = (saisie.structureLabel || '').split(' – ').slice(-1)[0] || '—';

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/donnees-saisies" className="text-sm text-[#1F5FA8] hover:underline inline-flex items-center gap-1">
            <span aria-hidden="true">←</span> Retour aux données saisies
          </Link>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-1">
            {saisie.moduleCode} — {saisie.moduleLabel}
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            {periodLabel}
            {saisie.structureLabel ? ` · ${saisie.structureLabel}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={saisie.status} />
        </div>
      </div>

      {/* Bandeaux d'état */}
      {saisie.status === 'soumise' && (
        <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8]">
          Ce rapport est en lecture seule. Vous pouvez le valider ou le rejeter.
        </div>
      )}
      {saisie.status === 'validee' && lastValide && (
        <div className="rounded-lg border border-[#B7E3C8] bg-[#EBF7EE] px-4 py-3 text-sm text-[#1E7B4F]">
          <p className="font-semibold">Rapport validé.</p>
          <p>
            Validé le {formatDateTime(lastValide.date)}. Il peut maintenant être exporté vers la
            base.
          </p>
        </div>
      )}
      {saisie.status === 'rejetee' && lastRejet && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          <p className="font-semibold">Rapport rejeté.</p>
          <p className="font-semibold mt-1">Motif du rejet</p>
          <p>{lastRejet.motif}</p>
          <p className="text-xs mt-1 text-[#5B6778]">
            Rejeté par {lastRejet.actor || 'administrateur régional'} le{' '}
            {formatDateTime(lastRejet.date)}
          </p>
        </div>
      )}
      {saisie.status === 'exportee' && (
        <div className="rounded-lg border border-[#B7E3C8] bg-[#EBF7EE] px-4 py-3 text-sm text-[#1E7B4F]">
          Cette saisie a été exportée vers la base centrale.
        </div>
      )}
      {saisie.status === 'archivee' && (
        <div className="rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-4 py-3 text-sm text-[#5B6778]">
          Cette saisie est archivée (lecture seule).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contenu en lecture seule */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Contenu du rapport</h2>
              <span className="text-xs text-[#5B6778]">Lecture seule</span>
            </div>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5 rounded-lg border border-[#E3E8EF] bg-[#F5F7FA] px-4 py-3 text-sm">
              <div>
                <dt className="text-[12px] font-semibold text-[#5B6778]">Région</dt>
                <dd className="text-[#1A2433] font-medium">{region}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-[#5B6778]">Structure</dt>
                <dd className="text-[#1A2433] font-medium">{saisie.structureLabel || '—'}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-[#5B6778]">Rédacteur</dt>
                <dd className="text-[#1A2433] font-medium">{saisie.authorLabel || '—'}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-[#5B6778]">Période</dt>
                <dd className="text-[#1A2433] font-medium">{periodLabel}</dd>
              </div>
            </dl>
            <DynamicForm
              fields={(saisie.module && saisie.module.fields) || []}
              values={saisie.values || {}}
              errors={{}}
              onChange={() => {}}
              disabled
              options={{}}
              autoCtx={{
                structure: saisie.structureLabel || '',
                author: saisie.authorLabel || '',
              }}
            />
          </div>
        </div>

        <div className="space-y-6">
        {/* Décision */}
        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6 h-fit">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A] mb-4">Décision</h2>
          <p className="text-[13px] font-semibold text-[#5B6778]">
            {saisie.status === 'soumise' ? 'Statut actuel' : 'Statut'}
          </p>
          <div className="mt-1 mb-4">
            <StatusBadge status={saisie.status} />
          </div>
          {saisie.status === 'soumise' && saisie.dates && saisie.dates.submitted && (
            <p className="text-sm text-[#5B6778] mb-4">
              Soumise par {saisie.authorLabel || '—'} le{' '}
              {formatDateTime(saisie.dates.submitted)}
            </p>
          )}
          {saisie.status === 'validee' && lastValide && (
            <p className="text-sm text-[#5B6778] mb-4">
              Validé par {lastValide.actor || '—'} le {formatDateTime(lastValide.date)}
            </p>
          )}
          {saisie.status === 'soumise' && (
            <div className="space-y-3">
              <Button
                variant="success"
                onClick={() => setConfirm('valider')}
                className="w-full gap-2"
              >
                <span aria-hidden="true">✓</span> Valider
              </Button>
              <Button
                variant="dangerSolid"
                onClick={() => setRejectOpen(true)}
                className="w-full gap-2"
              >
                <span aria-hidden="true">✕</span> Rejeter
              </Button>
              <p className="text-xs text-[#5B6778]">
                En cas de rejet, un motif est obligatoire. Il sera visible du service qui a saisi
                le rapport.
              </p>
            </div>
          )}
          {saisie.status === 'validee' && (
            <Button
              variant="primary"
              onClick={() => setConfirm('exporter')}
              className="w-full gap-2"
            >
              <span aria-hidden="true">⬆</span> Exporter vers la base
            </Button>
          )}
        </div>

        {/* Historique */}
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
                    <p className="text-sm font-semibold text-[#0B2A4A]">{step.decisionLabel}</p>
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
      </div>

      <ConfirmModal
        isOpen={confirm === 'valider'}
        title="Valider ce rapport ?"
        message="Le rapport sera marqué comme validé. Vous pourrez ensuite l'exporter vers la base."
        confirmLabel="Confirmer la validation"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => runAction('valider')}
      />
      <ConfirmModal
        isOpen={confirm === 'exporter'}
        title="Exporter vers la base ?"
        message="La saisie sera publiée dans la base centrale (statut « Exportée ») et ne pourra plus être modifiée."
        confirmLabel="Exporter vers la base"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => runAction('exporter')}
      />
      <RejectModal
        isOpen={rejectOpen}
        busy={busy}
        onCancel={() => setRejectOpen(false)}
        onConfirm={(motif) => {
          (async () => {
            setBusy(true);
            try {
              await api(`/saisies/${id}/rejeter`, { method: 'POST', body: { motif } });
              addToast('Rejet enregistré.', 'success');
              setRejectOpen(false);
              await load();
            } catch (err) {
              addToast(err.message, 'error');
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </div>
  );
}

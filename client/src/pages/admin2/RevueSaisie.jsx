import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateTime, formatDate } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import DynamicForm from '../../components/Form/DynamicForm.jsx';
import ConfirmModal from '../../components/Common/Modal/ConfirmModal.jsx';
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
        <h2 className="text-[18px] font-semibold text-[#0B2A4A] mb-2">Rejeter la saisie</h2>
        <p className="text-sm text-[#5B6778] mb-4">
          Le motif est obligatoire : il sera affiché au client pour corriger la saisie.
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
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy || empty || tooLong}
            onClick={() => onConfirm(motif.trim())}
            className="h-[40px] px-5 rounded-lg bg-[#B42318] hover:bg-[#9B1E14] text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Confirmer le rejet'}
          </button>
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
        addToast('Saisie validée avec succès.', 'success');
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
        <button
          onClick={() => navigate('/donnees-saisies')}
          className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
        >
          Retour à « Données saisies »
        </button>
      </div>
    );
  }

  const periodLabel = saisie.periodeLabel
    ? saisie.periodeLabel
    : saisie.eventDate
    ? `Événement du ${formatDate(saisie.eventDate)}`
    : '—';
  const lastRejet = [...(saisie.validations || [])].reverse().find((v) => v.decision === 'rejetee');

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/donnees-saisies" className="text-sm text-[#1F5FA8] hover:underline">
            ← Données saisies
          </Link>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-1">
            {saisie.moduleCode} — {saisie.moduleLabel}
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            {saisie.structureLabel || '—'} · {periodLabel} · Soumise par {saisie.authorLabel || '—'}{' '}
            le {formatDateTime(saisie.dates && saisie.dates.submitted)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={saisie.status} />
          {saisie.status === 'soumise' && (
            <>
              <button
                onClick={() => setConfirm('valider')}
                className="h-[40px] px-5 rounded-lg bg-[#1E7B4F] hover:bg-[#186641] text-white text-sm font-semibold"
              >
                Valider
              </button>
              <button
                onClick={() => setRejectOpen(true)}
                className="h-[40px] px-5 rounded-lg bg-[#B42318] hover:bg-[#9B1E14] text-white text-sm font-semibold"
              >
                Rejeter
              </button>
            </>
          )}
          {saisie.status === 'validee' && (
            <button
              onClick={() => setConfirm('exporter')}
              className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
            >
              Exporter vers la base
            </button>
          )}
        </div>
      </div>

      {/* Bandeaux d'état */}
      {saisie.status === 'rejetee' && lastRejet && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          Rejetée{lastRejet.actor ? ` par ${lastRejet.actor}` : ''} : {lastRejet.motif}
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
      {saisie.status === 'soumise' && (
        <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8]">
          Saisie soumise : examinez le contenu puis validez ou rejetez avec un motif.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contenu en lecture seule */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Contenu de la saisie</h2>
              <span className="text-xs text-[#5B6778]">Lecture seule</span>
            </div>
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

        {/* Historique */}
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

      <ConfirmModal
        isOpen={confirm === 'valider'}
        title="Valider cette saisie ?"
        message="La saisie passera au statut « Validée » et pourra ensuite être exportée vers la base centrale."
        confirmLabel="Valider"
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
              addToast('Saisie rejetée.', 'success');
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

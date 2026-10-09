import React, { useState, useEffect } from 'react';
import { api } from '../../api.js';

// Modale « Nouvelle saisie » (SPEC §4) : choisir la période (module périodique)
// ou la date d'événement (module d'événement), puis créer le brouillon.
export default function NouvelleSaisieModal({ module, periodes, isOpen, onClose, onCreated }) {
  const [periodeId, setPeriodeId] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [error, setError] = useState(null);
  const [existingId, setExistingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const isPeriodic = module?.kind === 'periodic';

  // Périodes de la périodicité du module (plus récente en premier)
  const modulePeriodes = (periodes || [])
    .filter((p) => (isPeriodic ? p.periodicity === module.periodicity : true))
    .sort((a, b) => new Date(b.start) - new Date(a.start));

  // Période par défaut = période courante (start <= aujourd'hui la plus récente)
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setExistingId(null);
    setEventDate('');
    const today = new Date();
    const current =
      modulePeriodes.find((p) => new Date(p.start) <= today) || modulePeriodes[0] || null;
    setPeriodeId(current ? current.id : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, module?.id]);

  if (!isOpen || !module) return null;

  const submit = async () => {
    setError(null);
    setExistingId(null);
    if (isPeriodic && !periodeId) {
      setError('Ce champ est obligatoire.');
      return;
    }
    if (!isPeriodic && !eventDate) {
      setError('Ce champ est obligatoire.');
      return;
    }
    if (!isPeriodic && Number.isNaN(new Date(eventDate).getTime())) {
      setError('Ce champ doit être une date valide.');
      return;
    }

    setBusy(true);
    try {
      const body = { moduleId: module.id };
      if (isPeriodic) body.periodeId = periodeId;
      else body.eventDate = eventDate;
      const created = await api('/saisies', { method: 'POST', body });
      onCreated(created.id);
    } catch (err) {
      if (err.status === 409 && err.data && err.data.existingId) {
        setError(err.data.message);
        setExistingId(err.data.existingId);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#0B2A4A]/40" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-[480px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6">
        <h2 className="text-[18px] font-semibold text-[#0B2A4A] mb-1">Nouvelle saisie</h2>
        <p className="text-sm text-[#5B6778] mb-5">
          {module.label} <span className="text-[#8A94A6]">· v{module.version}</span>
        </p>

        {isPeriodic ? (
          <div className="mb-4">
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Période <span className="text-[#B42318]">*</span>
            </label>
            <select
              className="w-full h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-[15px]"
              value={periodeId}
              onChange={(e) => setPeriodeId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {modulePeriodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (échéance {new Date(p.deadline).toLocaleDateString('fr-FR')})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Date d'événement <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="date"
              className="w-full h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-[15px]"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
          >
            Annuler
          </button>
          {existingId ? (
            <button
              type="button"
              onClick={() => onCreated(existingId)}
              className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
            >
              Continuer la saisie existante
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold disabled:opacity-60"
            >
              {busy ? 'Création…' : 'Créer le brouillon'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

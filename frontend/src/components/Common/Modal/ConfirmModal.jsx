import React from 'react';
import Button from '../Button.jsx';

// Modale de confirmation générique (design SIGBD)
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  busy = false,
  extra = null,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#0B2A4A]/40" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-[440px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6">
        <h2 className="text-[18px] font-semibold text-[#0B2A4A] mb-2">{title}</h2>
        {message && <p className="text-[15px] text-[#5B6778] leading-relaxed">{message}</p>}
        {extra}
        <div className="flex justify-end gap-3 mt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'dangerSolid' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Veuillez patienter…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

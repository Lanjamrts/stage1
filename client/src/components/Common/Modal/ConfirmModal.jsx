import React from 'react';

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
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-[#1A2433] text-sm font-medium hover:bg-[#F5F7FA] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-[40px] px-5 rounded-lg text-white text-sm font-semibold disabled:opacity-60 ${
              danger ? 'bg-[#B42318] hover:bg-[#9B1E14]' : 'bg-[#1F5FA8] hover:bg-[#174C87]'
            }`}
          >
            {busy ? 'Veuillez patienter…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

// Tiroir latéral (drawer) — design SIGBD (tiroir d'ajout de la page
// Utilisateurs, SPEC §4).
export default function Drawer({ isOpen, title, onClose, busy = false, children, footer = null }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[#0B2A4A]/40" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-[480px] h-full bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E3E8EF]">
          <h2 className="text-[18px] font-semibold text-[#0B2A4A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className="w-8 h-8 rounded-lg text-[#5B6778] hover:bg-[#F5F7FA] text-lg leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[#E3E8EF]">{footer}</div>}
      </div>
    </div>
  );
}

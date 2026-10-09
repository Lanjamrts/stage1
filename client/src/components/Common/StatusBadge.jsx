import React from 'react';

// Pastille d'état du rapport — libellés français exacts (SPEC §2)
const STYLES = {
  brouillon: 'bg-[#F5F7FA] border-[#E3E8EF] text-[#5B6778]',
  soumise: 'bg-[#EBF3FC] border-[#B8D2EF] text-[#1F5FA8]',
  rejetee: 'bg-[#FEF3F2] border-[#F6C7C3] text-[#B42318]',
  validee: 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]',
  exportee: 'bg-[#E6F4FA] border-[#B7DDec] text-[#0E7490]',
  archivee: 'bg-[#F1F3F7] border-[#D6DCE5] text-[#5B6778]',
};

const LABELS = {
  brouillon: 'Brouillon',
  soumise: 'Soumise',
  rejetee: 'Rejetée',
  validee: 'Validée',
  exportee: 'Exportée',
  archivee: 'Archivée',
};

export default function StatusBadge({ status }) {
  const cls = STYLES[status] || STYLES.brouillon;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${cls}`}
    >
      {LABELS[status] || status}
    </span>
  );
}

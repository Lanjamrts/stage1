"use client";
import React from 'react';
import Button from '../Common/Button.jsx';

export function Pagination({
  page,
  limit,
  total,
  onChangePage,
  onChangeLimit,
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 text-sm border-t border-[#E3E8EF] bg-[#F5F7FA] px-5 py-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[#5B6778]">Lignes par page</span>
        <select
          value={String(limit)}
          onChange={(e) => onChangeLimit(Number(e.target.value))}
          className="h-[32px] px-2 rounded border border-[#D6DCE5] bg-white text-sm"
        >
          [25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChangePage(page - 1)}
          disabled={page <= 1}
        >
          Pr\u00e9c\u00e9dent
        </Button>
        <span className="font-semibold text-[#0B2A4A]">
          Page {page} sur {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChangePage(page + 1)}
          disabled={page >= totalPages}
        >
          Suivant
        </Button>
        <span className="text-[#5B6778]">
          \u00b7 {total} {total > 1 ? 'événements' : 'événement'}
        </span>
      </div>
    </div>
  );
}

"use client";
import React from 'react';
import { PERIOD_SHORTCUTS, RESULTAT_OPTIONS, ACTION_LABELS } from './helpers.js';
import Button from '../Common/Button.jsx';

export function Toolbar({
  period,
  from,
  to,
  q,
  action,
  role,
  resultat,
  onPeriodChange,
  onFromChange,
  onToChange,
  onQChange,
  onActionChange,
  onRoleChange,
  onResultatChange,
  onReset,
  hasFilters,
}) {

  return (
    <div
      className="sticky top-16 z-20 flex flex-col lg:flex-row gap-3 items-start lg:items-center pb-3 mb-2 bg-white border-b border-[#E3E8EF] shadow-sm"
    >
      {/* Période */}
      <div className="flex flex-wrap gap-2 items-end">
        <span className="text-sm font-semibold text-[#0B2A4A]">Période</span>
        {PERIOD_SHORTCUTS.map((p) => (
          <Button
            key={p.label}
            variant="secondary"
            size="sm"
            onClick={() => onPeriodChange(p.label)}
            className={
              period === p.label
                ? 'bg-[#1F5FA8] text-white'
                : 'border border-[#D6DCE5] bg-white text-[#1A2433] hover:bg-[#F5F7FA]'
            }
            aria-pressed={period === p.label}
          >
            {p.label}
          </Button>
        ))}
        <div className="flex items-end gap-2">
          <label className="text-sm text-[#5B6778] sr-only">Du</label>
          <input
            type="date"
            value={from || ''}
            onChange={(e) => {
              onFromChange(e.target.value);
            }}
            className="h-[36px] px-2 rounded border border-[#D6DCE5] bg-white text-sm"
            aria-label="Du"
          />
          <label className="text-sm text-[#5B6778] sr-only">Au</label>
          <input
            type="date"
            value={to || ''}
            onChange={(e) => {
              onToChange(e.target.value);
            }}
            className="h-[36px] px-2 rounded border border-[#D6DCE5] bg-white text-sm"
            aria-label="Au"
          />
        </div>
      </div>

      {/* Recherche */}
      <div className="flex w-full lg:w-auto gap-2 items-end">
        <input
          type="search"
          value={q}
          onChange={onQChange}
          placeholder="Utilisateur ou objet…"
          aria-label="Recherche (utilisateur ou objet)"
          className="flex-1 min-w-[200px] h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm"
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-end">
          <select
            value={action || ''}
            onChange={(e) => {
              onActionChange(e.target.value);
            }}
          className="h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[200px]"
          aria-label="Action"
        >
          <option value="">Toutes les actions</option>
          {Object.keys(ACTION_LABELS).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          value={role || ''}
          onChange={onRoleChange}
          className="h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[170px]"
          aria-label="Profil"
        >
          <option value="">Tous les profils</option>
        </select>
        <select
          value={resultat || ''}
          onChange={(e) => {
            onResultatChange(e.target.value);
          }}
          className="h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[140px]"
          aria-label="Résultat"
        >
          {RESULTAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {(hasFilters || q || period || from || to) && (
        <Button variant="secondary" size="sm" onClick={onReset}>
          <span aria-hidden="true">↺</span> Réinitialiser les filtres
        </Button>
      )}
    </div>
  );
}

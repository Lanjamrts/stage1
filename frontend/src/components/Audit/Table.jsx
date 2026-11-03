"use client";
import React from 'react';
import { formatDateTimeTZ, formatDayLabelTZ, dayKeyTZ, actionCategory, ACTION_LIBELLE, formatIp } from './helpers.js';
import { ROLE_LABELS } from '../../menus.js';

// Ligne du journal cliquable et accessible.
function AuditRow({ row, selectedId, onSelect }) {
  const cat = actionCategory(row.action);
  const ip = formatIp(row.ip);
  const isAnomaly = cat === 'anomaly';
  return (
    <tr
      role="row"
      aria-selected={selectedId === row.id}
      tabIndex={0}
      data-id={row.id}
      className={`border-t border-[#E3E8EF] transition-colors ${
        selectedId === row.id
          ? 'bg-[#EBF3FC]'
          : isAnomaly
          ? 'bg-[#FEF3F2]'
          : ''
      }`}
      onClick={() => onSelect(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(row);
      }}
    >
      <td className="px-5 py-3 text-[#5B6778] whitespace-nowrap">
        {formatDateTimeTZ(row.date)}
      </td>
      <td className="px-5 py-3">
        <span className={`inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
          cat === 'anomaly'
            ? 'border-[#F6C7C3] bg-[#FEF3F2] text-[#B42318]'
            : cat === 'orange'
            ? 'border-[#F3D9A4] bg-[#FFF7E8] text-[#B7791F]'
            : 'border-[#E3E8EF] bg-[#F5F7FA] text-[#5B6778]'
        }`}>
          <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${
            cat === 'anomaly' ? 'bg-[#B42318]' : cat === 'orange' ? 'bg-[#B7791F]' : 'bg-[#94A3B8]'
          }`} />
          {ACTION_LIBELLE(row.action)}
        </span>
      </td>
      <td className="px-5 py-3 text-[#1A2433]">{row.userLabel}</td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-xs font-semibold text-[#5B6778]">
          {row.userRole ? (ROLE_LABELS[row.userRole] || row.userRole) : '–'}
        </span>
      </td>
      <td className="px-5 py-3 font-mono text-xs text-[#5B6778]">{row.object}</td>
      <td className="px-5 py-3 text-[#5B6778]" title={ip.title}>
        {ip.display}
      </td>
    </tr>
  );
}

function DaySeparator({ label }) {
  return (
    <tr>
      <td colSpan={6} className="px-5 py-3 text-xs font-semibold text-[#5B6778] bg-[#F5F7FA]">
        {label}
      </td>
    </tr>
  );
}

export function AuditTable({
  rows,
  loading,
  error,
  onSelect,
  selectedId,
  rowRefs,
}) {
  if (loading) {
    return (
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td colSpan={6} className="px-5 py-8 text-center text-[#5B6778]">
              Chargement…
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  if (rows.length === 0) {
    return (
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td colSpan={6} className="px-5 py-10 text-center text-[#5B6778]">
              Aucune entr\u00e9e ne correspond \u00e0 ces filtres.
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-white shadow-sm border-b border-[#E3E8EF]">
          <tr className="text-left">
            <th className="px-5 py-3 font-semibold text-[#0B2A4A] sticky left-0 bg-white">Date et heure</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Utilisateur</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Profil</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Objet</th>
            <th className="px-5 py-3 font-semibold text-[#0B2A4A] sticky right-0 bg-white">Adresse</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row, index) => {
            const key = dayKeyTZ(row.date);
            const previous = index === 0 ? null : dayKeyTZ(rows[index - 1].date);
            const nodes = [];
            if (key && key !== previous) {
              nodes.push(<DaySeparator key="sep" label={formatDayLabelTZ(row.date)} />);
            }
            nodes.push(
              <AuditRow
                key={row.id}
                row={row}
                selectedId={selectedId}
                onSelect={onSelect}
                ref={(el) => {
                  if (el) rowRefs.current[row.id] = el;
                }}
              />
            );
            return nodes;
          })}
        </tbody>
      </table>
    </div>
  );
}

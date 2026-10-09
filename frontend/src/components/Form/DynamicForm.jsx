import React from 'react';
import { computeAutos } from '../../../../shared/rules.mjs';

// Moteur de gabarits : tous les formulaires sont générés depuis modules.fields
// (SPEC §7). Aucun formulaire en dur. Les mêmes règles que le serveur sont
// appliquées ici via shared/rules.mjs (affichage instantané des messages).

const INPUT =
  'w-full h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-[15px] text-[#1A2433] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30 focus:border-[#1F5FA8] ' +
  'disabled:bg-[#F5F7FA] disabled:text-[#5B6778]';
const INPUT_ERR = 'border-[#B42318] focus:border-[#B42318] focus:ring-[#B42318]/30';

function FieldLabel({ field }) {
  return (
    <span className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
      {field.label}
      {field.required && <span className="text-[#B42318]"> *</span>}
    </span>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="text-xs text-[#B42318] mt-1 font-medium">{message}</p>;
}

export default function DynamicForm({
  fields,
  values,
  errors = {},
  onChange,
  disabled = false,
  options = {},
  autoCtx = {},
}) {
  const val = values || {};

  const setValue = (key, v) => {
    onChange({ ...val, [key]: v });
  };

  const renderSimple = (f) => {
    const err = errors[f.key];
    const raw = val[f.key];

    if (f.type === 'select') {
      const opts = f.options || (f.source ? options[f.source] || [] : []);
      return (
        <div key={f.key}>
          <FieldLabel field={f} />
          <select
            className={`${INPUT} ${err ? INPUT_ERR : ''}`}
            value={raw ?? ''}
            disabled={disabled}
            onChange={(e) => setValue(f.key, e.target.value)}
          >
            <option value="">-- Sélectionner --</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <FieldError message={err} />
        </div>
      );
    }

    if (f.type === 'multiselect') {
      const opts = f.options || (f.source ? options[f.source] || [] : []);
      const selected = Array.isArray(raw) ? raw : [];
      return (
        <div key={f.key}>
          <FieldLabel field={f} />
          <div
            className={`rounded-lg border ${err ? 'border-[#B42318]' : 'border-[#D6DCE5]'} p-3 max-h-[220px] overflow-y-auto bg-white`}
          >
            {opts.length === 0 && <p className="text-sm text-[#5B6778]">Aucune valeur disponible.</p>}
            {opts.map((o) => (
              <label key={o} className="flex items-center gap-2 py-1 text-sm text-[#1A2433]">
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, o]
                      : selected.filter((x) => x !== o);
                    setValue(f.key, next);
                  }}
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <FieldError message={err} />
        </div>
      );
    }

    if (f.type === 'textarea') {
      return (
        <div key={f.key}>
          <FieldLabel field={f} />
          <textarea
            className={`${INPUT} h-auto min-h-[96px] py-2 ${err ? INPUT_ERR : ''}`}
            value={raw ?? ''}
            disabled={disabled}
            maxLength={f.maxLength}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
          {f.maxLength && (
            <p className="text-xs text-[#5B6778] mt-1 text-right">
              {String(raw ?? '').length} / {f.maxLength}
            </p>
          )}
          <FieldError message={err} />
        </div>
      );
    }

    if (f.type === 'date') {
      return (
        <div key={f.key}>
          <FieldLabel field={f} />
          <input
            type="date"
            className={`${INPUT} ${err ? INPUT_ERR : ''}`}
            value={raw ?? ''}
            disabled={disabled}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
          <FieldError message={err} />
        </div>
      );
    }

    if (f.type === 'integer' || f.type === 'decimal') {
      return (
        <div key={f.key}>
          <FieldLabel field={f} />
          <input
            type="number"
            step={f.type === 'integer' ? 1 : 'any'}
            className={`${INPUT} ${err ? INPUT_ERR : ''}`}
            value={raw ?? ''}
            disabled={disabled}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
          <FieldError message={err} />
        </div>
      );
    }

    // text (et défaut)
    return (
      <div key={f.key}>
        <FieldLabel field={f} />
        <input
          type="text"
          className={`${INPUT} ${err ? INPUT_ERR : ''}`}
          value={raw ?? ''}
          disabled={disabled}
          maxLength={f.maxLength}
          onChange={(e) => setValue(f.key, e.target.value)}
        />
        <FieldError message={err} />
      </div>
    );
  };

  const renderTable = (f) => {
    const rows = Array.isArray(val[f.key]) ? val[f.key] : [];
    const err = errors[f.key];
    const subfields = f.fields || [];

    const setRow = (i, subKey, v) => {
      const next = rows.map((r, idx) => (idx === i ? { ...r, [subKey]: v } : r));
      setValue(f.key, next);
    };

    return (
      <div key={f.key} className="col-span-full">
        <div className="flex items-center justify-between mb-2">
          <FieldLabel field={f} />
          {!disabled && (
            <button
              type="button"
              onClick={() => setValue(f.key, [...rows, {}])}
              className="text-sm font-semibold text-[#1F5FA8] hover:text-[#174C87]"
            >
              + Ajouter une ligne
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-[#D6DCE5] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                {subfields.map((s) => (
                  <th key={s.key} className="px-3 py-2 font-semibold text-[#0B2A4A] whitespace-nowrap">
                    {s.label}
                    {s.required && <span className="text-[#B42318]"> *</span>}
                  </th>
                ))}
                {!disabled && <th className="px-2 py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={subfields.length + 1} className="px-3 py-4 text-[#5B6778] text-center">
                    Aucune ligne pour l'instant.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-[#E3E8EF] align-top">
                  {subfields.map((s) => {
                    const path = `${f.key}.${i}.${s.key}`;
                    const cellErr = errors[path];
                    return (
                      <td key={s.key} className="px-3 py-2 min-w-[140px]">
                        {s.type === 'select' ? (
                          <select
                            className={`${INPUT} ${cellErr ? INPUT_ERR : ''}`}
                            value={row[s.key] ?? ''}
                            disabled={disabled}
                            onChange={(e) => setRow(i, s.key, e.target.value)}
                          >
                            <option value="">-- Sélectionner --</option>
                            {(s.options || []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : s.type === 'date' ? (
                          <input
                            type="date"
                            className={`${INPUT} ${cellErr ? INPUT_ERR : ''}`}
                            value={row[s.key] ?? ''}
                            disabled={disabled}
                            onChange={(e) => setRow(i, s.key, e.target.value)}
                          />
                        ) : s.type === 'integer' || s.type === 'decimal' ? (
                          <input
                            type="number"
                            step={s.type === 'integer' ? 1 : 'any'}
                            className={`${INPUT} ${cellErr ? INPUT_ERR : ''}`}
                            value={row[s.key] ?? ''}
                            disabled={disabled}
                            onChange={(e) => setRow(i, s.key, e.target.value)}
                          />
                        ) : s.type === 'textarea' ? (
                          <textarea
                            className={`${INPUT} h-auto min-h-[64px] py-2 ${cellErr ? INPUT_ERR : ''}`}
                            value={row[s.key] ?? ''}
                            disabled={disabled}
                            onChange={(e) => setRow(i, s.key, e.target.value)}
                          />
                        ) : (
                          <input
                            type="text"
                            className={`${INPUT} ${cellErr ? INPUT_ERR : ''}`}
                            value={row[s.key] ?? ''}
                            disabled={disabled}
                            maxLength={s.maxLength}
                            onChange={(e) => setRow(i, s.key, e.target.value)}
                          />
                        )}
                        <FieldError message={cellErr} />
                      </td>
                    );
                  })}
                  {!disabled && (
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        title="Supprimer la ligne"
                        onClick={() => setValue(f.key, rows.filter((_, idx) => idx !== i))}
                        className="w-7 h-7 rounded-md text-[#B42318] hover:bg-[#FEF3F2] font-bold"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FieldError message={err} />
      </div>
    );
  };

  const autos = computeAutos(fields, val, autoCtx);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
      {(fields || []).map((f) => {
        if (f.type === 'auto') {
          const v = autos[f.key];
          return (
            <div key={f.key}>
              <span className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">{f.label}</span>
              <input type="text" className={`${INPUT} bg-[#F5F7FA]`} value={v ?? ''} readOnly disabled />
            </div>
          );
        }
        if (f.type === 'table') return renderTable(f);
        return renderSimple(f);
      })}
    </div>
  );
}

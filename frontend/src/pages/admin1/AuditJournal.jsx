import React, { useEffect, useState } from 'react';
import { api, formatDateTime } from '../../api.js';
import { ROLE_LABELS } from '../../menus.js';
import Button from '../../components/Common/Button.jsx';

const ROLES = ['client', 'admin2', 'admin1', 'developpeur', 'consultant'];

// Libellés français des actions d'audit.
const ACTION_LABELS = {
  login_success: 'Connexion réussie',
  login_failure: 'Connexion échouée',
  login_failure_desactive: 'Connexion (compte désactivé)',
  login_lockout: 'Compte verrouillé',
  logout: 'Déconnexion',
  password_change: 'Changement de mot de passe',
  password_reset: 'Réinitialisation de mot de passe',
  user_create: "Création d'utilisateur",
  profil_change: 'Modification de profil',
  user_deactivate: 'Désactivation',
  saisie_create: 'Création de saisie',
  saisie_update: 'Modification de saisie',
  saisie_submit: 'Soumission de saisie',
  saisie_validate: 'Validation de saisie',
  saisie_reject: 'Rejet de saisie',
  saisie_export: 'Export vers la base',
  download_excel: 'Téléchargement Excel',
  download_pdf: 'Téléchargement PDF',
  remarque_create: 'Création de remarque',
  remarque_state_change: "Changement d'état de remarque",
  module_publish: 'Publication de gabarit',
};

// « Journal d'audit » (SPEC §4) : filtres, lecture seule —
// partagé admin1 / développeur, AUCUN bouton d'action.
export default function AuditJournal() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ action: '', role: '', from: '', to: '' });
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.action) qs.set('action', filters.action);
    if (filters.role) qs.set('role', filters.role);
    if (filters.from) qs.set('from', filters.from);
    if (filters.to) qs.set('to', filters.to);
    const q = qs.toString();
    api(`/audit${q ? `?${q}` : ''}`)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const actionLabel = (a) => ACTION_LABELS[a] || a;
  const needle = q.trim().toLowerCase();
  const visibleRows = needle
    ? rows.filter((r) =>
        [r.userLabel, actionLabel(r.action), r.object]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] flex items-center gap-3">
          Journal d'audit
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-xs font-semibold text-[#5B6778]">
            <span aria-hidden="true">🔒</span> Lecture seule
          </span>
        </h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Historique automatique des connexions et des actions sensibles. Les lignes ne peuvent être
          ni modifiées ni supprimées.
        </p>
      </div>

      <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8]">
        Les données du journal sont conservées pendant 12 mois minimum.
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[220px]"
          placeholder="Recherche libre (utilisateur, objet...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[230px]"
          value={filters.action}
          onChange={(e) => setFilter('action', e.target.value)}
        >
          <option value="">Toutes les actions</option>
          {Object.keys(ACTION_LABELS).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[170px]"
          value={filters.role}
          onChange={(e) => setFilter('role', e.target.value)}
        >
          <option value="">Tous les profils</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-[#5B6778]">
          Du
          <input
            type="date"
            className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm"
            value={filters.from}
            onChange={(e) => setFilter('from', e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#5B6778]">
          Au
          <input
            type="date"
            className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm"
            value={filters.to}
            onChange={(e) => setFilter('to', e.target.value)}
          />
        </label>
        {(filters.action || filters.role || filters.from || filters.to) && (
          <Button
            variant="secondary"
            onClick={() => setFilters({ action: '', role: '', from: '', to: '' })}
          >
            <span aria-hidden="true">↺</span> Réinitialiser les filtres
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5B6778]">
          <span className="font-semibold text-[#0B2A4A]">{visibleRows.length}</span>{' '}
          {visibleRows.length > 1 ? 'événements' : 'événement'}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] px-2.5 py-0.5 text-xs font-semibold text-[#5B6778]">
          Journal immuable certifié DGBF
        </span>
      </div>

      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Date et heure</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Utilisateur</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Profil</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Objet</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Adresse</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-[#5B6778]">
                    Chargement...
                  </td>
                </tr>
              )}
              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucune entrée ne correspond à ces filtres.
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((r) => (
                  <tr key={r.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3 text-[#5B6778] whitespace-nowrap">
                      {formatDateTime(r.date)}
                    </td>
                    <td className="px-5 py-3 text-[#1A2433]">{r.userLabel}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-xs font-semibold text-[#5B6778]">
                        {r.userRole ? ROLE_LABELS[r.userRole] || r.userRole : '–'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-[#0B2A4A]">
                      {actionLabel(r.action)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[#5B6778]">{r.object}</td>
                    <td className="px-5 py-3 text-[#5B6778]">{r.ip}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

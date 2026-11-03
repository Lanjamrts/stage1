"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { formatDateTimeTZ, formatIp, TZ_LABEL, ACTION_LIBELLE } from './helpers.js';

export function DetailPanel({ isOpen, row, onClose }) {
  const [userActions, setUserActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevFocusRef = useRef(null);

  // Dernières actions de cet utilisateur (lecture seule, aucun lien vers les saisies).
  useEffect(() => {
    if (!isOpen || !row) return;
    setActionsLoading(true);
    setUserActions([]);
    fetch(`/api/audit?userId=${encodeURIComponent(row.userId)}&limit=5`, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Impossible de charger les actions de l\'utilisateur.');
        return res.json();
      })
      .then((data) => {
        setUserActions(Array.isArray(data) ? data : []);
      })
      .catch(() => setUserActions([]))
      .finally(() => setActionsLoading(false));
  }, [isOpen, row]);

  // Ouverture : focus sur le bouton Fermer ; fermeture : retour du focus sur la ligne.
  useEffect(() => {
    if (!isOpen) {
      if (prevFocusRef.current) prevFocusRef.current.focus();
      return;
    }
    prevFocusRef.current = document.activeElement;
    if (closeBtnRef.current) closeBtnRef.current.focus();
    return () => {
      if (prevFocusRef.current) prevFocusRef.current.focus();
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll(
            'button, [href], input, select, textarea, details, audio, video, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (nodes.length === 0) return;
        const idx = nodes.indexOf(document.activeElement);
        let next;
        if (e.shiftKey) next = idx <= 0 ? nodes[nodes.length - 1] : nodes[idx - 1];
        else next = idx >= nodes.length - 1 ? nodes[0] : nodes[idx + 1];
        if (next) {
          e.preventDefault();
          next.focus();
        }
      }
    },
    [onClose]
  );

  const ip = formatIp(row.ip);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[#0B2A4A]/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="D\u00e9tail de l'\u00e9v\u00e9nement d'audit"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={`fixed top-0 right-0 bottom-0 bg-white shadow-2xl z-50 flex flex-col md:w-[480px] md:top-16 md:bottom-auto h-full md:h-auto max-h-full`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E3E8EF] flex-shrink-0">
          <h2 className="text-[18px] font-semibold text-[#0B2A4A]">D\u00e9tail de l'\u00e9v\u00e9nement</h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-lg text-[#5B6778] hover:bg-[#F5F7FA] text-lg leading-none flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" ref={panelRef}>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">Date et heure</p>
            <p className="text-[#1A2433]">
              {formatDateTimeTZ(row.date)} <span className="text-[#5B6778] text-xs">{TZ_LABEL}</span>
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">Action</p>
            <p className="text-[#1A2433]">{ACTION_LIBELLE(row.action)}</p>
            <p className="text-xs text-[#5B6778] font-mono">{row.action}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">Utilisateur</p>
            <p className="text-[#1A2433]">{row.userLabel}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">Profil</p>
            <p className="text-[#1A2433]">{row.userRole || '–'}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">Objet</p>
            <p className="text-[#1A2433] font-mono text-xs break-all">{row.object}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">Adresse</p>
            <p className="text-[#1A2433]">{ip.display}</p>
            <p className="text-xs text-[#5B6778] font-mono break-all" title={ip.title}>
              Adresse brute : {ip.title}
            </p>
          </div>
          <div className="pt-2 border-t border-[#E3E8EF] space-y-2">
            <p className="text-xs font-semibold text-[#5B6778] uppercase">
              Derni\u00e8res actions de cet utilisateur
            </p>
            {actionsLoading ? (
              <p className="text-[#5B6778] text-sm">Chargement…</p>
            ) : userActions.length === 0 ? (
              <p className="text-[#5B6778] text-sm">Aucune autre action r\u00e9cente.</p>
            ) : (
              <ul className="space-y-2 text-sm text-[#5B6778]">
                {userActions.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 border-b border-[#E3E8EF] pb-2 last:border-0">
                    <span className="text-[#1A2433]">{formatDateTimeTZ(a.date)}</span>
                    <span className="font-mono text-xs">{ACTION_LIBELLE(a.action)} ({a.action})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E3E8EF] flex-shrink-0">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </div>
      </div>
    </>
  );
}

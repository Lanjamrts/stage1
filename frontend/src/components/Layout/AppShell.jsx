"use client";
import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useToast } from '../Common/Toast/Toast.jsx';
import ExpiryWarningModal from '../Common/Modal/ExpiryWarningModal.jsx';
import { ROLE_MENUS, ROLE_LABELS } from '../../menus.js';
import Logo from '../Common/Logo.jsx';

export default function AppShell({ children }) {
  const [user, setUser] = useState(null);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const showExpiryModalRef = useRef(false);
  const navigate = useNavigate();
  const { addToast } = useToast();

  useEffect(() => {
    showExpiryModalRef.current = showExpiryModal;
  }, [showExpiryModal]);

  // Récupérer les données utilisateur depuis /api/auth/me
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Erreur de chargement de l\'utilisateur', err);
      }
    }
    fetchUser();
  }, []);

  // Détecter l'expiration de la session : délai d'inactivité renvoyé par /auth/me
  // (SESSION_TIMEOUT_MINUTES, 30 par défaut), avertissement 5 minutes avant.
  useEffect(() => {
    const minutes = (user && user.sessionTimeoutMinutes) || 30;
    let timeoutId;
    const resetTimer = () => {
      if (showExpiryModalRef.current) return; // ne pas reprogrammer pendant l'avertissement
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowExpiryModal(true);
        setTimeLeft(60);
      }, Math.max(minutes - 5, 1) * 60 * 1000);
    };
    const events = ['click', 'keydown', 'scroll'];
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetTimer));
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user]);

  // Confirmer = prolonger la session (expiration glissante)
  const handleModalConfirm = async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setShowExpiryModal(false);
        addToast('Session prolongée.', 'success');
        window.location.reload();
        return;
      }
    } catch (err) {}
    // La session n'a pas pu être prolongée : elle a expiré
    setShowExpiryModal(false);
    navigate('/session-expiree');
  };

  // Compte à rebours terminé : la session expire
  const handleModalExpire = async () => {
    setShowExpiryModal(false);
    navigate('/session-expiree');
  };

  const handleModalCancel = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    setShowExpiryModal(false);
    addToast('Vous avez été déconnecté.', 'error');
    navigate('/login');
  };

  // Menu du rôle : libellés et ordre exacts de la SPEC §4
  const menuItems = ROLE_MENUS[user?.role] || [];

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1A2433]">
      {/* Bandeau institutionnel 4px */}
      <div className="w-full h-1 flex z-50">
        <div className="w-1/2 h-full bg-[#B42318]"></div>
        <div className="w-1/2 h-full bg-[#1E7B4F]"></div>
      </div>

      {/* TopBar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-[#E3E8EF] z-30 flex items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={40} className="shrink-0" />
          <div className="min-w-0 text-sm text-[#5B6778] truncate">
            {user ? `${user.prenom} ${user.nom} · ${user.structureLabel || ''}` : 'Non connecté'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {user && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#F5F7FA] text-[#5B6778] border border-[#E3E8EF]">
              {ROLE_LABELS[user.role] || user.role}
            </span>
          )}
          <button
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
              navigate('/login');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#B42318] hover:bg-[#FDECEA] font-medium text-xs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
            Se déconnecter
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="fixed top-1 left-0 bottom-0 w-[240px] bg-[#0B2A4A] z-20 flex flex-col justify-between py-6 px-4 shadow-sm">
        <div>
          <div className="mb-6 h-12" aria-hidden="true" />
          <nav className="flex flex-col gap-1.5">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                    ? 'bg-[#1F5FA8] text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="px-2 pt-4 border-t border-white/10">
          <div className="font-label-sm text-label-sm text-white/60 tracking-wider uppercase">DGBF · SSEBF</div>
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="pl-[240px] pt-16 min-h-screen">
        <div className="p-6 md:p-8">
          {children}
        </div>
      </main>

      {/* Modale d'avertissement d'expiration */}
      <ExpiryWarningModal
        isOpen={showExpiryModal}
        onConfirm={handleModalConfirm}
        onExpire={handleModalExpire}
        onCancel={handleModalCancel}
        timeLeft={timeLeft}
      />
    </div>
  );
}

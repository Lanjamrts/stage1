"use client";
import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useToast } from '../Common/Toast/Toast.jsx';
import ExpiryWarningModal from '../Common/Modal/ExpiryWarningModal.jsx';

export default function AppShell({ children }) {
  const [user, setUser] = useState(null);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const navigate = useNavigate();
  const { addToast } = useToast();

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

  // Détecter l'expiration de la session : timeout d'inactivité de 30 minutes
  useEffect(() => {
    let timeoutId;
    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowExpiryModal(true);
        setTimeLeft(60);
      }, 25 * 60 * 1000); // 25 minutes (avant les 30 min)
    };
    const events = ['click', 'keydown', 'scroll'];
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetTimer));
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleModalConfirm = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
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

  const menuItems = [
    { label: 'Tableau de bord', path: '/', icon: '📊' },
    { label: 'Mes saisies', path: '/mes-saisies', icon: '📝' },
    { label: 'Données saisies', path: '/donnees-saisies', icon: '📂' },
    { label: 'Consultation et téléchargement', path: '/consultation', icon: '🔍' },
    { label: 'Remarques', path: '/remarques', icon: '💬' },
    { label: 'Collecte et téléchargement', path: '/collecte', icon: '📈' },
    { label: 'Journal d\'audit', path: '/audit', icon: '📋' },
    { label: 'Utilisateurs', path: '/utilisateurs', icon: '👥' },
    { label: 'Paramétrage', path: '/parametrage', icon: '⚙️' },
    { label: 'Consultation des données', path: '/consultation-donnees', icon: '📊' },
  ];

  // Filtrer les menus en fonction du rôle (simplifié)
  const filteredMenuItems = menuItems.filter((item) => {
    if (!user) return false;
    if (user.role === 'client' && ['Tableau de bord', 'Mes saisies'].includes(item.label)) return true;
    if (user.role === 'admin2' && ['Données saisies', 'Consultation et téléchargement', 'Remarques'].includes(item.label)) return true;
    if (user.role === 'admin1' && ['Tableau de bord', 'Utilisateurs', 'Collecte et téléchargement', 'Journal d\'audit', 'Remarques'].includes(item.label)) return true;
    if (user.role === 'developpeur' && ['Paramétrage', 'Remarques', 'Journal d\'audit'].includes(item.label)) return true;
    if (user.role === 'consultant' && ['Tableau de bord', 'Consultation des données'].includes(item.label)) return true;
    return false;
  });

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1A2433]">
      {/* Bandeau institutionnel 4px */}
      <div className="w-full h-1 flex z-50">
        <div className="w-1/2 h-full bg-[#B42318]"></div>
        <div className="w-1/2 h-full bg-[#1E7B4F]"></div>
      </div>

      {/* TopBar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-[#E3E8EF] z-30 flex items-center justify-between px-6">
        <div className="text-sm text-[#5B6778]">
          {user ? `${user.prenom} ${user.nom} · ${user.structureId}` : 'Non connecté'}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#F5F7FA] text-[#5B6778] border border-[#E3E8EF]">
              {user.role}
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
          <div className="flex items-center gap-3 px-2 py-1 mb-6">
            <img src="/emblem.png" alt="Ministère de l'Économie et des Finances" className="h-10 w-auto" />
            <span className="font-semibold text-lg tracking-tight text-white">SIGBD</span>
          </div>
          <nav className="flex flex-col gap-1.5">
            {filteredMenuItems.map((item) => (
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
        onCancel={handleModalCancel}
        timeLeft={timeLeft}
      />
    </div>
  );
}

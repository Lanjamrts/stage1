"use client";
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Common/Toast/Toast.jsx';
import AuthGuard from './components/Auth/AuthGuard.jsx';
import RoleGuard from './components/Auth/RoleGuard.jsx';
import LoginPage from './components/Auth/LoginPage.jsx';
import ChangePasswordPage from './components/Auth/ChangePasswordPage.jsx';
import AppShell from './components/Layout/AppShell.jsx';
import AccessDenied from './pages/AccessDenied.jsx';
import SessionExpired from './pages/SessionExpired.jsx';
import { ROUTE_ROLES } from './menus.js';

// Page d'ébauche (remplacée phase par phase par les vraies pages)
const PlaceholderPage = ({ title }) => (
  <div className="bg-white rounded-xl border border-[#E3E8EF] p-6 shadow-sm">
    <h1 className="text-[20px] font-semibold text-[#0B2A4A]">{title}</h1>
    <p className="text-[#5B6778] mt-2">Contenu de cette page (à implémenter)</p>
  </div>
);

// Routes protégées par rôle, rendues dans l'AppShell
const PROTECTED_ROUTES = [
  { path: '/', title: 'Tableau de bord' },
  { path: '/mes-saisies', title: 'Mes saisies' },
  { path: '/donnees-saisies', title: 'Données saisies' },
  { path: '/consultation', title: 'Consultation et téléchargement' },
  { path: '/remarques', title: 'Remarques' },
  { path: '/collecte', title: 'Collecte et téléchargement' },
  { path: '/audit', title: "Journal d'audit" },
  { path: '/utilisateurs', title: 'Utilisateurs' },
  { path: '/parametrage', title: 'Paramétrage' },
  { path: '/consultation-donnees', title: 'Consultation des données' },
];

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          {/* Routes publiques */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/session-expiree" element={<SessionExpired />} />
          <Route path="/access-refuse" element={<AccessDenied />} />

          {/* Changement de mot de passe (authentifié, mot de passe provisoire autorisé) */}
          <Route
            path="/change-password"
            element={
              <AuthGuard>
                <ChangePasswordPage />
              </AuthGuard>
            }
          />

          {/* Routes protégées par rôle */}
          {PROTECTED_ROUTES.map((r) => (
            <Route
              key={r.path}
              path={r.path}
              element={
                <RoleGuard roles={ROUTE_ROLES[r.path]}>
                  <AppShell>
                    <PlaceholderPage title={r.title} />
                  </AppShell>
                </RoleGuard>
              }
            />
          ))}

          {/* Route inconnue */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

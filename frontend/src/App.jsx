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
import HomePage from './pages/HomePage.jsx';
import MesSaisies from './pages/client/MesSaisies.jsx';
import SaisieDetail from './pages/client/SaisieDetail.jsx';
import DonneesSaisies from './pages/admin2/DonneesSaisies.jsx';
import RevueSaisie from './pages/admin2/RevueSaisie.jsx';
import Consultation from './pages/admin2/Consultation.jsx';
import RemarquesPage from './pages/RemarquesPage.jsx';
import Admin1Dashboard from './pages/admin1/Admin1Dashboard.jsx';
import Utilisateurs from './pages/admin1/Utilisateurs.jsx';
import CollectePage from './pages/admin1/CollectePage.jsx';
import AuditJournal from './pages/admin1/AuditJournal.jsx';
import ConsultationDonnees from './pages/consultant/ConsultationDonnees.jsx';
import ConsultationRapport from './pages/consultant/ConsultationRapport.jsx';
import Parametrage from './pages/dev/Parametrage.jsx';
import GabaritEditeur from './pages/dev/GabaritEditeur.jsx';
import { ROUTE_ROLES } from './menus.js';

// Routes protégées par rôle, rendues dans l'AppShell
const PROTECTED_ROUTES = [
  { path: '/', element: <HomePage /> },
  { path: '/mes-saisies', element: <MesSaisies /> },
  { path: '/mes-saisies/:id', element: <SaisieDetail /> },
  { path: '/donnees-saisies', element: <DonneesSaisies /> },
  { path: '/donnees-saisies/:id', element: <RevueSaisie /> },
  { path: '/consultation', element: <Consultation /> },
  { path: '/remarques', element: <RemarquesPage /> },
  { path: '/collecte', element: <CollectePage /> },
  { path: '/audit', element: <AuditJournal /> },
  { path: '/utilisateurs', element: <Utilisateurs /> },
  { path: '/parametrage', element: <Parametrage /> },
  { path: '/parametrage/nouveau', element: <GabaritEditeur /> },
  { path: '/parametrage/:id', element: <GabaritEditeur /> },
  { path: '/consultation-donnees', element: <ConsultationDonnees /> },
  { path: '/consultation-donnees/:id', element: <ConsultationRapport /> },
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
                    {r.element}
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

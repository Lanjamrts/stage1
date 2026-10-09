"use client";
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Common/Toast/Toast.jsx';
import AuthGuard from './components/Auth/AuthGuard.jsx';
import LoginPage from './components/Auth/LoginPage.jsx';
import ChangePasswordPage from './components/Auth/ChangePasswordPage.jsx';
import ExpiryWarningModal from './components/Common/Modal/ExpiryWarningModal.jsx';
import AppShell from './components/Layout/AppShell.jsx';

// Pages placeholder pour les autres routes
const PlaceholderPage = ({ title }) => (
  <div className="bg-white rounded-xl border border-[#E3E8EF] p-6 shadow-sm">
    <h1 className="text-[20px] font-semibold text-[#0B2A4A]">{title}</h1>
    <p className="text-[#5B6778] mt-2">Contenu de cette page (à implémenter)</p>
  </div>
);

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          {/* Routes publiques */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/session-expiree" element={<PlaceholderPage title="Session expirée" />} />
          <Route path="/access-refuse" element={<PlaceholderPage title="Accès refusé" />} />

          {/* Routes protégées */}
          <Route
            path="/"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Tableau de bord" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/mes-saisies"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Mes saisies" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/donnees-saisies"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Données saisies" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/consultation"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Consultation et téléchargement" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/remarques"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Remarques" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/collecte"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Collecte et téléchargement" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/audit"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Journal d'audit" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/utilisateurs"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Utilisateurs" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/parametrage"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Paramétrage" />
                </AppShell>
              </AuthGuard>
            }
          />
          <Route
            path="/consultation-donnees"
            element={
              <AuthGuard>
                <AppShell>
                  <PlaceholderPage title="Consultation des données" />
                </AppShell>
              </AuthGuard>
            }
          />

          {/* Route pour le changement de mot de passe (peut être accédée même sans authentification ? mais AuthGuard force la redirection) */}
          <Route
            path="/change-password"
            element={
              <AuthGuard>
                <ChangePasswordPage />
              </AuthGuard>
            }
          />

          {/* Redirection de la route racine */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

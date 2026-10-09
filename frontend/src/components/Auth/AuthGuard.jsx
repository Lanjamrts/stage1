"use client";
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function AuthGuard({ children }) {
  const [authState, setAuthState] = useState('loading'); // loading, authenticated, unauthenticated, passwordChangeRequired
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (!response.ok) {
          // si 401/403, traiter comme non authentifié
          setAuthState('unauthenticated');
          return;
        }
        const data = await response.json();
        if (data.mustChangePassword) {
          setAuthState('passwordChangeRequired');
          return;
        }
        setAuthState('authenticated');
      } catch (error) {
        setAuthState('unauthenticated');
      }
    };

    checkAuth();
  }, [location.pathname]);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-[#5B6778]">Vérification de l'authentification...</div>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    // Stocker le chemin d'origine pour la redirection après connexion
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (authState === 'passwordChangeRequired') {
    // Rediriger vers la page de changement de mot de passe sauf si nous y sommes déjà
    if (location.pathname === '/change-password') {
      return <>{children}</>;
    }
    return <Navigate to="/change-password" replace />;
  }

  // Authentifié
  return <>{children}</>;
}

"use client";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANDING_BY_ROLE } from '../../menus.js';

export default function LoginPage() {
  const [im, setIm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ im, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Afficher des messages d'erreur spécifiques pour certains codes d'état
        if (response.status === 400 && data.message.includes('Identifiant ou mot de passe incorrect')) {
          setError("L'identifiant (IM) ou le mot de passe est incorrect. Veuillez réessayer.");
        } else if (response.status === 403 && data.message.includes('verrouillé')) {
          setError('Votre compte est temporairement verrouillé. Veuillez contacter votre administrateur ou réessayer plus tard.');
        } else {
          setError(data.message || 'Erreur de connexion');
        }
        return;
      }

      // Connexion réussie, rediriger vers la page d'accueil du rôle (SPEC §4)
      navigate(LANDING_BY_ROLE[data.user.role] || '/');
    } catch (err) {
      setError('Une erreur est survenue lors de la tentative de connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[440px] bg-white rounded-[12px] border border-[#E3E8EF] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-10">
        <h1 className="text-[28px] font-semibold text-[#0B2A4A] leading-tight tracking-tight mb-2">
          Connexion
        </h1>
        <p className="text-[15px] text-[#5B6778] mb-8">
          Accédez à votre espace avec votre identifiant (IM).
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="im" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
              Identifiant (IM)
            </label>
            <div className="relative">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-[#5B6778]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <input
                id="im"
                type="text"
                value={im}
                onChange={(e) => setIm(e.target.value)}
                placeholder="Votre numéro d'immatriculation"
                className="w-full h-[44px] pl-11 pr-3.5 bg-white border border-[#E3E8EF] rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-[#5B6778]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full h-[44px] pl-11 pr-11 bg-white border border-[#E3E8EF] rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-[#FEF3F2] border border-[#B42318] rounded-lg p-3 text-[13px] text-[#B42318]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[44px] bg-[#1F5FA8] hover:bg-[#174C87] text-white text-[15px] font-semibold rounded-[8px] transition-colors flex items-center justify-center"
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-[#5B6778]">
          Mot de passe oublié ou compte bloqué ? Contactez votre administrateur.
        </p>
      </div>
    </div>
  );
}

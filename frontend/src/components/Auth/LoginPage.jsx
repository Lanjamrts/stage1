"use client";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANDING_BY_ROLE } from '../../menus.js';
import Logo from '../Common/Logo.jsx';

export default function LoginPage() {
  const [im, setIm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // {kind, message, detail?}
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const blocked = error && (error.kind === 'locked' || error.kind === 'disabled');

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
        if (response.status === 400 && data.message.includes('Identifiant ou mot de passe incorrect')) {
          setError({
            kind: 'credentials',
            message: 'Identifiant ou mot de passe incorrect.',
            detail: 'Vérifiez vos informations et réessayez.',
          });
        } else if (response.status === 403 && data.message.includes('verrouillé')) {
          setError({
            kind: 'locked',
            message: 'Votre compte est temporairement verrouillé.',
            detail: "Plusieurs tentatives de connexion ont échoué. Contactez votre administrateur pour le débloquer.",
          });
        } else if (response.status === 403 && data.message.includes('désactivé')) {
          setError({
            kind: 'disabled',
            message: 'Ce compte est désactivé.',
            detail: 'Contactez votre administrateur.',
          });
        } else {
          setError({ kind: 'other', message: data.message || 'Erreur de connexion' });
        }
        return;
      }

      // Connexion réussie, rediriger vers la page d'accueil du rôle (SPEC §4)
      navigate(LANDING_BY_ROLE[data.user.role] || '/');
    } catch (err) {
      setError({ kind: 'other', message: 'Une erreur est survenue lors de la tentative de connexion.' });
    } finally {
      setLoading(false);
    }
  };

  const alertStyles =
    error && error.kind === 'locked'
      ? 'bg-[#FFF4E0] border-[#B7791F] text-[#7A5A11]'
      : 'bg-[#FEF3F2] border-[#B42318] text-[#B42318]';

  const fieldClass = (withIcon) =>
    `w-full h-[44px] ${withIcon ? 'pl-11 pr-11' : 'pl-11 pr-3.5'} bg-white border ${
      error ? 'border-[#B42318]' : 'border-[#E3E8EF]'
    } rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20 disabled:bg-[#F0F2F5] disabled:text-[#8A94A6]`;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <div className="h-1 w-full flex">
        <div className="flex-1 bg-[#B42318]" />
        <div className="flex-1 bg-[#1E7B4F]" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[960px] flex flex-col md:flex-row bg-white rounded-[12px] border border-[#E3E8EF] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Panneau institutionnel */}
          <div className="md:w-[46%] bg-[#0B2A4A] text-white p-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-4">
                <Logo size={64} />
                <div>
                  <div className="text-[13px] tracking-wide text-white/80">Ministère de l'Économie et des Finances</div>
                  <div className="text-[12px] tracking-widest uppercase text-white/60 mt-1">DGBF · SSEBF</div>
                </div>
              </div>
              <div className="mt-8 text-[32px] font-semibold tracking-tight">SIGBD</div>
              <div className="mt-1 text-[15px] text-white/90 leading-snug">
                Système Informatisé de Gestion de la Base de Données
              </div>
              <p className="mt-6 text-[14px] text-white/70 leading-relaxed">
                Plateforme de collecte et de suivi des rapports des services régionaux.
              </p>
            </div>
            <div className="mt-10 text-[12px] text-white/60">
              © Ministère de l'Économie et des Finances – DGBF · SSEBF
            </div>
          </div>

          {/* Formulaire */}
          <div className="flex-1 p-10">
            <h1 className="text-[28px] font-semibold text-[#0B2A4A] leading-tight tracking-tight mb-2">
              Connexion
            </h1>
            <p className="text-[15px] text-[#5B6778] mb-6">
              Accédez à votre espace avec votre identifiant (IM).
            </p>

            {error && (
              <div className={`border rounded-lg p-3 text-[13px] mb-5 ${alertStyles}`} role="alert">
                <p className="font-semibold">{error.message}</p>
                {error.detail && <p className="mt-0.5">{error.detail}</p>}
              </div>
            )}

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
                    className={fieldClass(true)}
                    disabled={blocked}
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
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Votre mot de passe"
                    className={fieldClass(true)}
                    disabled={blocked}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6778] hover:text-[#1A2433]"
                    disabled={blocked}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                      {showPassword && <path d="M3 3l18 18"></path>}
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || blocked}
                className="w-full h-[44px] bg-[#1F5FA8] hover:bg-[#174C87] disabled:bg-[#E3E8EF] disabled:text-[#8A94A6] text-white text-[15px] font-semibold rounded-[8px] transition-colors flex items-center justify-center"
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#E3E8EF] flex items-start gap-2 text-[12px] text-[#5B6778]">
              <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <p>
                Accès réservé aux agents autorisés. Les connexions et les actions sensibles sont
                enregistrées.
              </p>
            </div>

            <p className="mt-4 text-center text-[13px] text-[#5B6778]">
              Mot de passe oublié ou compte bloqué ? Contactez votre administrateur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

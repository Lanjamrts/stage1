"use client";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANDING_BY_ROLE } from '../../menus.js';
import Logo from '../Common/Logo.jsx';
import Button from '../Common/Button.jsx';

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState({ current: false, next: false, confirm: false });

  const navigate = useNavigate();

  const validate = (pwd) => {
    if (pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
    if (!/[A-Z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une lettre majuscule';
    if (!/[a-z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une lettre minuscule';
    if (!/[0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un chiffre';
    return null;
  };

  const rules = [
    { label: 'Au moins 8 caractères', ok: newPassword.length >= 8 },
    {
      label: 'Au moins une majuscule et une minuscule',
      ok: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
    },
    { label: 'Au moins un chiffre', ok: /[0-9]/.test(newPassword) },
    {
      label: 'Un mot de passe différent du mot de passe actuel',
      ok: newPassword.length > 0 && newPassword !== current,
    },
  ];
  const allOk = rules.every((r) => r.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const errNew = validate(newPassword);
    if (errNew) {
      setError(errNew);
      return;
    }
    if (newPassword !== confirmation) {
      setError('Le nouveau mot de passe et la confirmation ne correspondent pas');
      return;
    }
    if (newPassword === current) {
      setError('Le nouveau mot de passe doit être différent du mot de passe actuel');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, new: newPassword, confirmation }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Échec du changement de mot de passe');
        return;
      }
      setDone(true);
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const goToSpace = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = res.ok ? await res.json() : null;
      navigate(data ? (LANDING_BY_ROLE[data.role] || '/') : '/login');
    } catch (err) {
      navigate('/');
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      /* déconnexion best effort */
    }
    navigate('/login');
  };

  const eyeBtn = (key) => (
    <button
      type="button"
      onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
      aria-label="Afficher ou masquer le mot de passe"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6778] hover:text-[#1A2433]"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </button>
  );

  const inputClass =
    'w-full h-[44px] px-3.5 pr-10 bg-white border border-[#E3E8EF] rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20';

  // Écran de confirmation (zip d_confirmation)
  if (done) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center px-4">
        <div className="flex justify-center mb-6"><Logo size={56} withText /></div>
        <div className="w-full max-w-[480px] bg-white rounded-[12px] border border-[#E3E8EF] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#EBF7EE] flex items-center justify-center text-[#1E7B4F]">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] mt-5">Mot de passe modifié</h1>
          <p className="text-[15px] text-[#5B6778] mt-3">
            Votre nouveau mot de passe est enregistré. Vous pouvez maintenant accéder à votre
            espace.
          </p>
          <Button
            type="button"
            size="lg"
            variant="primary"
            className="mt-7 w-full gap-2"
            onClick={goToSpace}
          >
            Accéder à mon espace
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="flex justify-center mb-6"><Logo size={56} withText /></div>
        <div className="bg-[#FFF4E0] border border-[#B7791F] rounded-lg p-4 text-[14px] text-[#7A5A11] mb-5">
          C'est votre première connexion. Pour votre sécurité, vous devez remplacer le mot de passe
          provisoire qui vous a été remis.
        </div>

        <div className="bg-white rounded-[12px] border border-[#E3E8EF] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-10">
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] leading-tight tracking-tight mb-2">
            Changez votre mot de passe
          </h1>
          <p className="text-[15px] text-[#5B6778] mb-8">
            Renseignez votre mot de passe actuel et définissez un nouveau mot de passe sécurisé.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="current" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
                Mot de passe actuel (provisoire)
              </label>
              <div className="relative">
                <input
                  id="current"
                  type={show.current ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Votre mot de passe actuel"
                  className={inputClass}
                  required
                />
                {eyeBtn('current')}
              </div>
            </div>

            <div>
              <label htmlFor="new" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="new"
                  type={show.next ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  className={inputClass}
                  required
                />
                {eyeBtn('next')}
              </div>
            </div>

            <div>
              <label htmlFor="confirmation" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
                Confirmer le nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="confirmation"
                  type={show.confirm ? 'text' : 'password'}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Confirmez le nouveau mot de passe"
                  className={inputClass}
                  required
                />
                {eyeBtn('confirm')}
              </div>
            </div>

            <div className="bg-[#F5F7FA] border border-[#E3E8EF] rounded-lg p-4">
              <p className="text-[13px] font-semibold text-[#1A2433] mb-2">
                Votre mot de passe doit contenir :
              </p>
              <ul className="space-y-1.5">
                {rules.map((r) => (
                  <li key={r.label} className="flex items-center gap-2 text-[13px]">
                    <span
                      className={`inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px] ${
                        r.ok ? 'bg-[#1E7B4F] text-white' : 'bg-[#E3E8EF] text-[#8A94A6]'
                      }`}
                      aria-hidden="true"
                    >
                      {r.ok ? '✓' : ''}
                    </span>
                    <span className={r.ok ? 'text-[#1E7B4F]' : 'text-[#5B6778]'}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="bg-[#FEF3F2] border border-[#B42318] rounded-lg p-3 text-[13px] text-[#B42318]">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              variant="primary"
              className="w-full gap-2"
              disabled={loading || !allOk}
            >
              {loading ? 'Changement en cours...' : 'Enregistrer et continuer'}
              {!loading && (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              )}
            </Button>

            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={logout}
            >
              Annuler et se déconnecter
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-[12px] text-[#5B6778]">
          Connexion chiffrée SSL/TLS 256-bit conforme au Référentiel Général de Sécurité
        </p>
      </div>
    </div>
  );
}

"use client";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANDING_BY_ROLE } from '../../menus.js';

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const validate = (pwd) => {
    if (pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
    if (!/[A-Z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une lettre majuscule';
    if (!/[a-z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une lettre minuscule';
    if (!/[0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un chiffre';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const errCurrent = validate(current);
    if (errCurrent) {
      setError(errCurrent);
      return;
    }
    const errNew = validate(newPassword);
    if (errNew) {
      setError(errNew);
      return;
    }
    if (newPassword !== confirmation) {
      setError('Le nouveau mot de passe et la confirmation ne correspondent pas');
      return;
    }
    // TODO : s'assurer que le nouveau mot de passe est différent du provisoire (pas implémenté)

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
      setSuccess('Mot de passe changé avec succès.');
      // Rediriger vers la page d'accueil du rôle (SPEC §4)
      setTimeout(async () => {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          const data = res.ok ? await res.json() : null;
          navigate(data ? (LANDING_BY_ROLE[data.role] || '/') : '/login');
        } catch (err) {
          navigate('/');
        }
      }, 1000);
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[480px] bg-white rounded-[12px] border border-[#E3E8EF] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-10">
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] leading-tight tracking-tight mb-2">
          Changer votre mot de passe
        </h1>
        <p className="text-[15px] text-[#5B6778] mb-8">
          Veuillez créer un nouveau mot de passe conforme aux règles de sécurité.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="current" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
              Mot de passe actuel
            </label>
            <input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Votre mot de passe actuel"
              className="w-full h-[44px] px-3.5 bg-white border border-[#E3E8EF] rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20"
              required
            />
          </div>

          <div>
            <label htmlFor="new" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
              Nouveau mot de passe
            </label>
            <input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe"
              className="w-full h-[44px] px-3.5 bg-white border border-[#E3E8EF] rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmation" className="block text-[14px] font-semibold text-[#1A2433] mb-1.5">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="confirmation"
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Confirmez le nouveau mot de passe"
              className="w-full h-[44px] px-3.5 bg-white border border-[#E3E8EF] rounded-[8px] text-[14px] text-[#1A2433] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/20"
              required
            />
          </div>

          {error && (
            <div className="bg-[#FEF3F2] border border-[#B42318] rounded-lg p-3 text-[13px] text-[#B42318]">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#EBF7EE] border border-[#1E7B4F] rounded-lg p-3 text-[13px] text-[#1E7B4F]">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[44px] bg-[#1F5FA8] hover:bg-[#174C87] text-white text-[15px] font-semibold rounded-[8px] transition-colors flex items-center justify-center"
          >
            {loading ? 'Changement en cours...' : 'Changer le mot de passe'}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-[#5B6778]">
          Les règles du mot de passe : 8 caractères, majuscule, minuscule, chiffre.
        </p>
      </div>
    </div>
  );
}

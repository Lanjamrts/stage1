"use client";
import React, { useState, useEffect } from 'react';
import Button from '../Button.jsx';

export default function ExpiryWarningModal({ isOpen, onConfirm, onExpire, onCancel, timeLeft }) {
  const [count, setCount] = useState(timeLeft);
  const onExpireRef = React.useRef(onExpire);
  React.useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    if (!isOpen) return;
    setCount(timeLeft);
    const timer = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Compte à rebours terminé : la session expire
          onExpireRef.current && onExpireRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, timeLeft]);

  if (!isOpen) return null;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  const progress = timeLeft > 0 ? Math.max(0, Math.min(100, (count / timeLeft) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-[12px] border border-[#E3E8EF] shadow-[0_12px_32px_rgba(11,42,74,0.12)] p-6 w-full max-w-md">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FEF3C7] text-[#B7791F] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Votre session va expirer</h2>
            <p className="text-[14px] text-[#5B6778] mt-1">
              Sans activité de votre part, vous serez déconnecté dans{' '}
              <span className="font-semibold text-[#B7791F] text-[18px]">{formatTime(count)}</span>
              .
            </p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-[#E3E8EF] overflow-hidden">
              <div
                className="h-full bg-[#B7791F] transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[13px] text-[#5B6778] mt-3">
              Vos brouillons enregistrés ne seront pas perdus.
            </p>
            <div className="mt-4 flex justify-end gap-2">
                <Button variant="primary" onClick={onConfirm}>
                  Rester connecté
                </Button>
                <Button variant="secondary" onClick={onCancel}>
                  Se déconnecter
                </Button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}

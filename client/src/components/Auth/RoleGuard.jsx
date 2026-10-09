import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AccessDenied from '../../pages/AccessDenied.jsx';

// Garde de route : authentifié + mot de passe à jour + rôle autorisé.
// Sinon : /login, /change-password ou page « Accès refusé » (aucun code technique).
export default function RoleGuard({ roles, children }) {
  const [state, setState] = useState({ status: 'loading' }); // loading | unauthenticated | passwordChange | ok | forbidden
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: 'unauthenticated' });
          return;
        }
        const data = await res.json();
        if (data.mustChangePassword) {
          setState({ status: 'passwordChange' });
          return;
        }
        setState({ status: roles.includes(data.role) ? 'ok' : 'forbidden' });
      } catch (err) {
        if (!cancelled) setState({ status: 'unauthenticated' });
      }
    }
    check();
    return () => { cancelled = true; };
  }, [location.pathname]);

  switch (state.status) {
    case 'loading':
      return (
        <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
          <div className="text-[#5B6778]">Chargement...</div>
        </div>
      );
    case 'unauthenticated':
      return <Navigate to="/login" state={{ from: location }} replace />;
    case 'passwordChange':
      return <Navigate to="/change-password" replace />;
    case 'forbidden':
      return <AccessDenied />;
    default:
      return <>{children}</>;
  }
}

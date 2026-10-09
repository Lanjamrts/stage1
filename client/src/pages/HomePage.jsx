import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ClientDashboard from './client/ClientDashboard.jsx';
import Admin1Dashboard from './admin1/Admin1Dashboard.jsx';

// Page d'accueil « / » : le contenu dépend du rôle.
// - client : tableau de bord client (Phase 3)
// - admin1 : tableau de bord admin1 (Phase 5)
// - consultant : tableau de bord consultant (Phase 6)
export default function HomePage() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    api('/auth/me')
      .then((d) => setRole(d.role))
      .catch(() => setRole(null));
  }, []);

  if (role === 'client') return <ClientDashboard />;
  if (role === 'admin1') return <Admin1Dashboard />;
  if (role === null) return <div className="text-[#5B6778]">Chargement...</div>;

  return (
    <div className="bg-white rounded-xl border border-[#E3E8EF] p-6 shadow-sm">
      <h1 className="text-[20px] font-semibold text-[#0B2A4A]">Tableau de bord</h1>
      <p className="text-[#5B6778] mt-2">Contenu de cette page (à implémenter)</p>
    </div>
  );
}

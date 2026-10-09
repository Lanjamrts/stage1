import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ClientDashboard from './client/ClientDashboard.jsx';
import Admin1Dashboard from './admin1/Admin1Dashboard.jsx';

// Page d'accueil « / » : le contenu dépend du rôle.
// - client : tableau de bord client (Phase 3)
// - admin1 : tableau de bord admin1 (Phase 5)
// - consultant : tableau de bord en lecture seule (Phase 6)
export default function HomePage() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    api('/auth/me')
      .then((d) => setRole(d.role))
      .catch(() => setRole(null));
  }, []);

  // '/' est réservé (ROUTE_ROLES) à client, admin1 et consultant ; les autres
  // rôles atterrissent sur leur page (SPEC §4) et ne passent jamais ici.
  if (role === 'client') return <ClientDashboard />;
  if (role === 'admin1') return <Admin1Dashboard />;
  if (role === 'consultant') return <Admin1Dashboard readOnly />;
  if (role === null) return <div className="text-[#5B6778]">Chargement...</div>;
  return null;
}

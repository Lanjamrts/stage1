import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Charge le profil connecté (GET /api/auth/me) — partagé par les pages.
export default function useMe() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/auth/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false ));
  }, []);
  return { me, loading };
}

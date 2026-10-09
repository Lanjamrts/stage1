// Menus et routes par rôle — SPEC §4 (libellés et ordre exacts)

export const ROLE_MENUS = {
  client: [
    { label: 'Tableau de bord', path: '/', icon: '📊' },
    { label: 'Mes saisies', path: '/mes-saisies', icon: '📝' },
  ],
  admin2: [
    { label: 'Données saisies', path: '/donnees-saisies', icon: '📂' },
    { label: 'Consultation et téléchargement', path: '/consultation', icon: '🔍' },
    { label: 'Remarques', path: '/remarques', icon: '💬' },
  ],
  admin1: [
    { label: 'Tableau de bord', path: '/', icon: '📊' },
    { label: 'Utilisateurs', path: '/utilisateurs', icon: '👥' },
    { label: 'Collecte et téléchargement', path: '/collecte', icon: '📈' },
    { label: "Journal d'audit", path: '/audit', icon: '📋' },
    { label: 'Remarques', path: '/remarques', icon: '💬' },
  ],
  developpeur: [
    { label: 'Paramétrage', path: '/parametrage', icon: '⚙️' },
    { label: 'Remarques', path: '/remarques', icon: '💬' },
    { label: "Journal d'audit", path: '/audit', icon: '📋' },
  ],
  consultant: [
    { label: 'Tableau de bord', path: '/', icon: '📊' },
    { label: 'Consultation des données', path: '/consultation-donnees', icon: '📊' },
  ],
};

// Rôles autorisés pour chaque route (garde de route)
export const ROUTE_ROLES = {
  '/': ['client', 'admin1', 'consultant'],
  '/mes-saisies': ['client'],
  '/mes-saisies/:id': ['client'],
  '/donnees-saisies': ['admin2'],
  '/donnees-saisies/:id': ['admin2'],
  '/consultation': ['admin2'],
  '/remarques': ['admin1', 'admin2', 'developpeur'],
  '/collecte': ['admin1'],
  '/audit': ['admin1', 'developpeur'],
  '/utilisateurs': ['admin1'],
  '/parametrage': ['developpeur'],
  '/parametrage/:id': ['developpeur'],
  '/consultation-donnees': ['consultant'],
  '/consultation-donnees/:id': ['consultant'],
};

// Libellés d'affichage des rôles (chip dans la TopBar)
export const ROLE_LABELS = {
  client: 'Client',
  admin2: 'Admin 2',
  admin1: 'Admin 1',
  developpeur: 'Développeur',
  consultant: 'Consultant',
};

// Page d'accueil après connexion (SPEC §4)
export const LANDING_BY_ROLE = {
  client: '/',
  admin2: '/donnees-saisies',
  admin1: '/',
  developpeur: '/parametrage',
  consultant: '/',
};

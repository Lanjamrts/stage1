// Helpers partagés pour le journal d'audit (SPEC §8 : lecture seule).
// Fuseau d'affichage : heure de Madagascar (Indian/Antananarivo = UTC+3).
export const TZ = 'Indian/Antananarivo';
export const TZ_LABEL = 'Heure de Madagascar (UTC+3)';

// Libellés français des actions d'audit.
export const ACTION_LABELS = {
  login_success: 'Connexion réussie',
  login_failure: 'Connexion échouée',
  login_failure_desactive: 'Connexion (compte désactivé)',
  login_lockout: 'Compte verrouillé',
  logout: 'Déconnexion',
  password_change: 'Changement de mot de passe',
  password_reset: 'Réinitialisation de mot de passe',
  user_create: "Création d'utilisateur",
  profil_change: 'Modification de profil',
  user_deactivate: 'Désactivation',
  saisie_create: 'Création de saisie',
  saisie_update: 'Modification de saisie',
  saisie_submit: 'Soumission de saisie',
  saisie_validate: 'Validation de saisie',
  saisie_reject: 'Rejet de saisie',
  saisie_export: 'Export vers la base',
  download_excel: 'Téléchargement Excel',
  download_pdf: 'Téléchargement PDF',
  remarque_create: 'Création de remarque',
  remarque_state_change: "Changement d'état de remarque",
  module_publish: 'Publication de gabarit',
};

export const ACTION_LIBELLE = (a) => ACTION_LABELS[a] || a;

// Actions d'anomalie (résultat « Anomalies »).
export const ANOMALY_ACTIONS = new Set([
  'login_failure',
  'login_failure_desactive',
  'login_lockout',
]);

// Actions en couleur orange.
export const ORANGE_ACTIONS = new Set([
  'saisie_reject',
  'download_excel',
  'download_pdf',
  'saisie_export',
]);

export function actionCategory(action) {
  if (ANOMALY_ACTIONS.has(action)) return 'anomaly';
  if (ORANGE_ACTIONS.has(action)) return 'orange';
  return 'neutral';
}

// Date et heure affichées : jj/mm/aaaa hh:mm:ss (fuseau Madagascar).
export function formatDateTimeTZ(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Libellé de jour pour les séparateurs : « Lundi 2 novembre 2026 ».
export function formatDayLabelTZ(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const label = d.toLocaleDateString('fr-FR', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Clé de regroupement par jour (fuseau Madagascar).
export function dayKeyTZ(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.toLocaleString('en-US', { timeZone: TZ, year: 'numeric' });
  const m = d.toLocaleString('en-US', { timeZone: TZ, month: '2-digit' });
  const day = d.toLocaleString('en-US', { timeZone: TZ, day: '2-digit' });
  return `${y}-${m}-${day}`;
}

// Adresse IP affichée ; l'adresse brute reste dans le title.
export function formatIp(ip) {
  if (!ip) return { display: '—', title: '—' };
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return { display: 'Local (127.0.0.1)', title: ip };
  }
  const mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return { display: mapped, title: ip };
}

// Raccourcis de période : minutes depuis maintenant.
export const PERIOD_SHORTCUTS = [
  { label: 'Dernière heure', sinceMinutes: 60 },
  { label: '24 h', sinceMinutes: 1440 },
  { label: '7 jours', sinceMinutes: 10080 },
  { label: '30 jours', sinceMinutes: 43200 },
  { label: 'Personnalisée', sinceMinutes: null },
];

export const RESULTAT_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'anomalies', label: 'Anomalies' },
];

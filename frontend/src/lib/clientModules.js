// Calculs partagés pour les pages client (modules, tableau de bord).
// Aucun état, pas de dépendance React.

export const PERIODICITY_LABELS = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  event: 'Événement',
};

export const STATUS_LABELS = {
  brouillon: 'Brouillon',
  soumise: 'Soumise',
  rejetee: 'Rejetée',
  validee: 'Validée',
  exportee: 'Exportée',
  archivee: 'Archivée',
};

// Période courante d'un module périodique : période de sa périodicité dont
// start <= aujourd'hui la plus récente.
export function currentPeriod(periodicity, periodes, today) {
  const list = periodes.filter((p) => p.periodicity === periodicity);
  const started = list
    .filter((p) => new Date(p.start) <= today)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  return started[0] || list.sort((a, b) => new Date(b.start) - new Date(a.start))[0] || null;
}

// Nombre de jours de retard d'une échéance passée (null sinon).
export function joursRetard(deadline, today) {
  if (!deadline) return null;
  const days = Math.floor((today - new Date(deadline)) / 86400000);
  return days > 0 ? days : null;
}

// Calcule les lignes « rapport attendu » pour tous les modules du client.
export function buildRows(modules, saisies, periodes, today) {
  return modules
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((m) => {
      if (m.kind === 'periodic') {
        const p = currentPeriod(m.periodicity, periodes, today);
        const saisie = p
          ? saisies.find((s) => s.moduleId === m.id && s.periodeId === p.id)
          : null;
        return { module: m, periode: p, saisie, isEvent: false };
      }
      const mine = saisies
        .filter((s) => s.moduleId === m.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { module: m, periode: null, saisie: mine[0] || null, isEvent: true };
    });
}

// Statut de retard d'une ligne (null si pas en retard).
export function lateOf(row, today) {
  if (!row.periode || row.saisie) return null;
  return joursRetard(row.periode.deadline, today);
}

// Action principale à proposer sur une ligne de module.
export function actionFor(row) {
  if (row.saisie) {
    if (row.saisie.status === 'brouillon') return { label: 'Continuer', primary: false };
    if (row.saisie.status === 'rejetee') return { label: 'Corriger', primary: false };
    return { label: 'Consulter', primary: false };
  }
  if (row.isEvent) return { label: 'Nouvelle saisie', primary: true };
  return { label: 'Saisir', primary: true };
}

// 4 compteurs du tableau de bord client.
export function countersFor(saisies, rows, today) {
  const lateCount = rows.filter((r) => lateOf(r, today)).length;
  return [
    { label: 'En retard', value: lateCount, color: 'text-[#B7791F]' },
    { label: 'Brouillons', value: saisies.filter((s) => s.status === 'brouillon').length, color: 'text-[#5B6778]' },
    { label: 'Soumises', value: saisies.filter((s) => s.status === 'soumise').length, color: 'text-[#1F5FA8]' },
    { label: 'Rejetées', value: saisies.filter((s) => s.status === 'rejetee').length, color: 'text-[#B42318]' },
  ];
}

// Rapport est-il remis (soumis ou au-delà) ?
export function estRemis(saisie) {
  return !!saisie && saisie.status !== 'brouillon';
}

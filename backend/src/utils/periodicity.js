// Cadences a client may choose when creating a saisie for a module.
// `periodicity` stays the EXPECTED cadence (used by the dashboard);
// `allowedPeriodicities` only widens what can be created.
export function acceptedPeriodicities(moduleDoc) {
  const extra = Array.isArray(moduleDoc?.allowedPeriodicities) ? moduleDoc.allowedPeriodicities : [];
  return Array.from(new Set([moduleDoc?.periodicity, ...extra].filter(Boolean)));
}
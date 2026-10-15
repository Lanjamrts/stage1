"use strict";

import ProfilModel from '../models/Profil.js';
import ModuleModel from '../models/Module.js';
import { MODULES } from './modules.js';

export const PROFILS = [
  { code: 'client', label: 'Client' },
  { code: 'admin2', label: 'Administrateur regional (Admin 2)' },
  { code: 'admin1', label: 'Administrateur central (Admin 1)' },
  { code: 'developpeur', label: 'Developpeur' },
  { code: 'consultant', label: 'Consultant' },
];

export async function ensureProfils() {
  let created = 0;
  for (const p of PROFILS) {
    const res = await ProfilModel.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
    created += res.upsertedCount || 0;
  }
  return { created, existing: PROFILS.length - created };
}

export async function ensureModules() {
  let created = 0;
  for (const m of MODULES) {
    const res = await ModuleModel.updateOne(
      { code: m.code },
      { $setOnInsert: { ...m, version: 1, active: true } },
      { upsert: true },
    );
    created += res.upsertedCount || 0;
  }
  // Databases created before this field existed: fill it for RA only if it is missing.
  // Never overwrites a value that already exists (a developer may have chosen otherwise).
  await ModuleModel.updateOne(
    { code: 'RA', allowedPeriodicities: { $exists: false } },
    { $set: { allowedPeriodicities: ['monthly', 'quarterly'] } },
  );
  return { created, existing: MODULES.length - created };
}
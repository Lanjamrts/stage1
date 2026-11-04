"use strict";

import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { closeOracle } from '../db/oracle.js';
import { ensureProfils, ensureModules, ensureEpnReference } from './common.js';

const config = loadConfig();

async function main() {
  await mongoose.connect(config.MONGODB_URI);
  console.log(`Connecte a MongoDB (${mongoose.connection.name})`);
  const p = await ensureProfils();
  console.log(`Profils : ${p.created} crees, ${p.existing} deja presents`);
  const m = await ensureModules();
  console.log(`Modules : ${m.created} crees, ${m.existing} deja presents`);
  const ref = await ensureEpnReference({ apply: true });
  if (!ref.success) {
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Ministères : ${ref.created.ministeres} créés, ${ref.existing.ministeres} déjà présents`);
  console.log(`EPN : ${ref.created.epns} créés, ${ref.existing.epns} déjà présents`);
  await mongoose.disconnect();
  // Sans effet si Oracle n'a pas ete utilise : referme le pool ouvert par un
  // depot (REFERENCE_STORE/AUDIT_STORE=oracle) pour que le processus se termine.
  await closeOracle();
  console.log('Seed de reference termine (aucune donnee supprimee ni modifiee).');
}

main().catch((err) => { console.error('Erreur de seed de reference:', err); process.exit(1); });

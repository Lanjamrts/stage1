"use strict";

// Script système (SPEC §2) : exportee -> archivee.
// Archive les rapports EXPORTÉS dont la période est terminée (periode.end < aujourd'hui).
// Aucun bouton d'interface, aucune ligne d'audit (listes fermées de la SPEC §8),
// pas d'entrée dans validations (non prévue pour archivee).
// Usage : npm run archive

import mongoose from 'mongoose';
import dotenv from 'dotenv';

import PeriodeModel from '../models/Periode.js';
import SaisieModel from '../models/Saisie.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sigbd';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const periodesTerminees = await PeriodeModel.find({ end: { $lt: new Date() } }).select('_id').lean();
  const periodeIds = periodesTerminees.map((p) => p._id);

  let archived = 0;
  if (periodeIds.length > 0) {
    const result = await SaisieModel.updateMany(
      { status: 'exportee', periodeId: { $in: periodeIds } },
      { $set: { status: 'archivee' } }
    );
    archived = result.modifiedCount || 0;
  }

  console.log(`Periodes terminees: ${periodeIds.length}`);
  console.log(`Saisies archivees: ${archived}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Echec de l'archivage:", err.message);
  process.exit(1);
});

"use strict";

// Script système (SPEC §2) : exportee -> archivee.
// Archive les rapports EXPORTÉS dont la période est terminée (periode.end < aujourd'hui).
// Aucun bouton d'interface, aucune ligne d'audit (listes fermées de la SPEC §8),
// pas d'entrée dans validations (non prévue pour archivee).
// Usage : npm run archive

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

import { getPeriodeRepository } from '../repositories/periodeRepository.js';
import { getSaisieRepository } from '../repositories/saisieRepository.js';
import { ouvrirBase, fermerBase } from './connexion.js';

dotenv.config();

// Exporté pour les tests : aucune connexion gérée ici (main() ouvre et ferme).
export async function archiverSaisiesExportees() {
  const periodesTerminees = await getPeriodeRepository().listerTerminees(new Date());
  // Chaînes : estIdValide (dépôt Saisie) refuse toute valeur non chaîne.
  const periodeIds = periodesTerminees.map((p) => String(p._id));

  let archived = 0;
  if (periodeIds.length > 0) {
    archived = (await getSaisieRepository().archiverExportees(periodeIds)) || 0;
  }

  console.log(`Periodes terminees: ${periodeIds.length}`);
  console.log(`Saisies archivees: ${archived}`);

  return { code: 0, periodesTerminees: periodeIds.length, archivees: archived };
}

async function main() {
  await ouvrirBase();
  try {
    const { code } = await archiverSaisiesExportees();
    return code;
  } finally {
    await fermerBase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error("Echec de l'archivage:", err.message);
      process.exit(1);
    }
  );
}

#!/usr/bin/env node
"use strict";

// Étape 43a : vérification d'un fichier de sauvegarde Oracle (JSON).
// Contrôle la somme de contrôle SHA-256 et les comptes de l'en-tête contre le
// nombre réel de lignes de chaque table. Aucune connexion à la base : ni
// identifiant, ni mot de passe. La vérification MongoDB (verify-backup.js) est
// inchangée.
//
// Usage : node src/scripts/verify-backup-oracle.js [fichier]
//         sans argument : la sauvegarde Oracle la plus récente du dossier.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getBackupDir } from './backup-common.js';
import { EXTENSION, TABLES, lireFichierBackup } from './backup-oracle.js';

export function choisirFichier(argv, backupDir) {
  const argument = argv.find((arg) => !arg.startsWith('--'));
  if (argument) return { chemin: resolve(argument), erreur: null };
  const fichiers = readdirSync(backupDir)
    .filter((fichier) => fichier.endsWith(EXTENSION))
    .map((fichier) => ({ fichier, temps: statSync(join(backupDir, fichier)).mtimeMs }))
    .sort((a, b) => b.temps - a.temps);
  if (fichiers.length === 0) {
    return { chemin: null, erreur: `Aucune sauvegarde Oracle trouvée dans ${backupDir}` };
  }
  return { chemin: join(backupDir, fichiers[0].fichier), erreur: null };
}

export function main(argv = process.argv.slice(2)) {
  const optionsInconnues = argv.filter((arg) => arg.startsWith('--'));
  if (optionsInconnues.length > 0) {
    for (const option of optionsInconnues) console.error(`Option inconnue : ${option}`);
    console.error('');
    console.error('Usage : node src/scripts/verify-backup-oracle.js [fichier]');
    return 1;
  }

  const { chemin, erreur } = choisirFichier(argv, getBackupDir());
  if (erreur) {
    console.error(erreur);
    return 1;
  }
  if (!existsSync(chemin)) {
    console.error(`Fichier introuvable : ${chemin}`);
    return 1;
  }

  const { ok, fichier, erreurs } = lireFichierBackup(chemin);
  console.log(`Fichier : ${chemin}`);
  if (fichier) {
    console.log(`Format : ${fichier.format} v${fichier.version}`);
    console.log(`Service : ${fichier.service}`);
    console.log(`Date : ${fichier.date}`);
    console.log(`Somme de contrôle SHA-256 : ${fichier.sha256 ?? '(absente)'}`);
    console.log('');
    console.log('table | en-tête | lignes | OK/ÉCART');
    console.log('------|---------|--------|---------');
    for (const definition of TABLES) {
      const section = Array.isArray(fichier.tables)
        ? fichier.tables.find((s) => s.name === definition.nom)
        : null;
      const lignes = section && Array.isArray(section.rows) ? section.rows.length : 0;
      const attendu = fichier.counts ? fichier.counts[definition.nom] : undefined;
      const statut = attendu === lignes ? 'OK' : 'ÉCART';
      console.log(`${definition.nom} | ${attendu} | ${lignes} | ${statut}`);
    }
    console.log('');
  }

  if (!ok) {
    console.error('Vérification en échec :');
    for (const erreurFichier of erreurs) console.error(`  - ${erreurFichier}`);
    return 1;
  }
  console.log('Sauvegarde vérifiée : somme de contrôle et comptes conformes.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`Erreur : ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
}

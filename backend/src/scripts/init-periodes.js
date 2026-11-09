"use strict";

import { pathToFileURL } from 'node:url';

import { getPeriodeRepository } from '../repositories/periodeRepository.js';
import { ouvrirBase, fermerBase } from './connexion.js';

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    annee: null,
    echeanceMensuelleJour: null,
    echeanceTrimestrielleJours: null,
    premierMois: 1,
    apply: false,
    autoriserEcheancesPassees: false
  };
  const errors = [];

  const booleanFlags = new Set(['apply', 'autoriser-echeances-passees']);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let name, value;
      if (eqIdx >= 0) {
        name = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
      } else {
        name = arg.slice(2);
        if (booleanFlags.has(name)) {
          value = 'true';
        } else {
          value = args[i + 1];
          if (value === undefined || value.startsWith('--')) {
            errors.push(`Option --${name} requiert une valeur`);
            continue;
          }
          i++;
        }
      }

      switch (name) {
        case 'annee':
          options.annee = parseInt(value, 10);
          if (isNaN(options.annee) || options.annee < 2020 || options.annee > 2100) {
            errors.push(`Valeur invalide pour --annee : ${value} (entier entre 2020 et 2100)`);
          }
          break;
        case 'echeance-mensuelle-jour':
          options.echeanceMensuelleJour = parseInt(value, 10);
          if (isNaN(options.echeanceMensuelleJour) || options.echeanceMensuelleJour < 1 || options.echeanceMensuelleJour > 28) {
            errors.push(`Valeur invalide pour --echeance-mensuelle-jour : ${value} (entier entre 1 et 28)`);
          }
          break;
        case 'echeance-trimestrielle-jours':
          options.echeanceTrimestrielleJours = parseInt(value, 10);
          if (isNaN(options.echeanceTrimestrielleJours) || options.echeanceTrimestrielleJours < 1 || options.echeanceTrimestrielleJours > 90) {
            errors.push(`Valeur invalide pour --echeance-trimestrielle-jours : ${value} (entier entre 1 et 90)`);
          }
          break;
        case 'premier-mois':
          options.premierMois = parseInt(value, 10);
          if (isNaN(options.premierMois) || options.premierMois < 1 || options.premierMois > 12) {
            errors.push(`Valeur invalide pour --premier-mois : ${value} (entier entre 1 et 12)`);
          }
          break;
        case 'apply':
          options.apply = true;
          break;
        case 'autoriser-echeances-passees':
          options.autoriserEcheancesPassees = true;
          break;
        default:
          errors.push(`Option inconnue : --${name}`);
      }
    } else {
      errors.push(`Option inconnue : ${arg}`);
    }
  }

  if (options.annee === null) errors.push('Option obligatoire manquante : --annee');
  if (options.echeanceMensuelleJour === null) errors.push('Option obligatoire manquante : --echeance-mensuelle-jour');
  if (options.echeanceTrimestrielleJours === null) errors.push('Option obligatoire manquante : --echeance-trimestrielle-jours');

  if (errors.length > 0) {
    console.error(errors.join('\n'));
    console.error('');
    console.error('Usage :');
    console.error('  npm run init:periodes -- --annee 2026 --echeance-mensuelle-jour 5 --echeance-trimestrielle-jours 15 [--premier-mois 10] [--apply] [--autoriser-echeances-passees]');
    process.exit(1);
  }

  return options;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

export function calculerPeriodes(options) {
  const { annee, echeanceMensuelleJour, echeanceTrimestrielleJours, premierMois } = options;
  const periods = [];

  for (let m = premierMois; m <= 12; m++) {
    const start = new Date(Date.UTC(annee, m - 1, 1));
    const end = new Date(Date.UTC(annee, m, 0));
    const deadline = new Date(Date.UTC(annee, m, echeanceMensuelleJour));
    const label = `${MOIS[m - 1]} ${annee}`;
    periods.push({
      label,
      periodicity: 'monthly',
      start,
      end,
      deadline
    });
  }

  for (let q = 1; q <= 4; q++) {
    if (q * 3 < premierMois) continue;
    const start = new Date(Date.UTC(annee, (q - 1) * 3, 1));
    const end = new Date(Date.UTC(annee, q * 3, 0));
    const deadline = new Date(end.getTime() + echeanceTrimestrielleJours * 86400000);
    const label = `T${q} ${annee}`;
    periods.push({
      label,
      periodicity: 'quarterly',
      start,
      end,
      deadline
    });
  }

  return periods;
}

// Lecture seule : les périodes déjà présentes, celles à créer et les conflits.
export async function planifier(options) {
  const periodes = calculerPeriodes(options);

  const keys = periodes.map(p => ({ periodicity: p.periodicity, start: p.start }));
  const existing = await getPeriodeRepository().listerParCles(keys);

  const existingByKey = new Map();
  const existingByLabel = new Map();
  for (const p of existing) {
    existingByKey.set(`${p.periodicity}|${p.start.getTime()}`, p);
    existingByLabel.set(p.label, p);
  }

  const conflicts = [];
  const toCreate = [];
  const alreadyPresent = [];

  for (const p of periodes) {
    const key = `${p.periodicity}|${p.start.getTime()}`;
    if (existingByKey.has(key)) {
      const ex = existingByKey.get(key);
      if (ex.label !== p.label || ex.end.getTime() !== p.end.getTime() || ex.deadline.getTime() !== p.deadline.getTime()) {
        conflicts.push(`Periode ${p.label} : echeance, fin ou label different (deja presente avec periodicity=${p.periodicity}, start=${formatDate(p.start)})`);
      } else {
        alreadyPresent.push(p);
      }
    } else if (existingByLabel.has(p.label)) {
      const ex = existingByLabel.get(p.label);
      conflicts.push(`Label "${p.label}" : deja utilise pour periodicity=${ex.periodicity}, start=${formatDate(ex.start)}`);
    } else {
      toCreate.push(p);
    }
  }

  return { periodes, existantes: existing, aCreer: toCreate, dejaPresentes: alreadyPresent, conflits: conflicts };
}

// Exécution complète (sans connexion) : retourne le code de sortie et les
// compteurs, en reprenant les messages et l'ordre de l'original.
export async function executerInitPeriodes(options) {
  const plan = await planifier(options);

  if (plan.conflits.length > 0) {
    for (const c of plan.conflits) console.error(c);
    return { code: 1, conflits: plan.conflits, creees: 0, dejaPresentes: plan.dejaPresentes.length };
  }

  const now = new Date();
  const pastDeadline = plan.aCreer.filter(p => p.deadline < now);
  if (pastDeadline.length > 0) {
    console.log(`ATTENTION : ${pastDeadline.length} periode(s) a creer ont une echeance deja depassee : le tableau de bord les comptera comme attendues et en retard pour toutes les structures.`);
    if (options.apply && !options.autoriserEcheancesPassees) {
      console.error('Ecriture refusee : utilisez --premier-mois pour ne generer que les periodes a venir, ou --autoriser-echeances-passees pour forcer.');
      return { code: 1, conflits: [], creees: 0, dejaPresentes: plan.dejaPresentes.length };
    }
  }

  console.log(`Periodes : ${plan.aCreer.length} a creer, ${plan.dejaPresentes.length} deja presente(s)`);
  for (const p of plan.aCreer) {
    console.log(`  + ${p.label} | ${p.periodicity} | ${formatDate(p.start)} -> ${formatDate(p.end)} | echeance ${formatDate(p.deadline)}`);
  }

  if (!options.apply) {
    console.log('DRY-RUN : aucune donnee ecrite. Relancez avec --apply pour ecrire.');
    return { code: 0, conflits: [], creees: 0, dejaPresentes: plan.dejaPresentes.length };
  }

  const existantesParCle = new Map(
    plan.existantes.map(p => [`${p.periodicity}|${p.start.getTime()}`, p])
  );

  let created = 0;
  let existingCount = 0;

  for (const p of plan.periodes) {
    const key = `${p.periodicity}|${p.start.getTime()}`;
    if (existantesParCle.has(key)) {
      existingCount++;
      continue;
    }
    const { cree } = await getPeriodeRepository().creerSiAbsent(p);
    if (cree) {
      created++;
    } else {
      existingCount++;
    }
  }

  console.log(`Periodes : ${created} creee(s), ${existingCount} deja presente(s)`);
  return { code: 0, conflits: [], creees: created, dejaPresentes: existingCount };
}

async function main() {
  const options = parseArgs();
  const { nom } = await ouvrirBase();
  console.log(`Base cible : ${nom}`);
  try {
    const { code } = await executerInitPeriodes(options);
    return code;
  } finally {
    await fermerBase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('Erreur:', err);
      process.exit(1);
    }
  );
}

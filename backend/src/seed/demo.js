"use strict";

import './guard.js';

import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { loadConfig } from '../config.js';
import { ouvrirBase, fermerBase, nomOracle } from '../scripts/connexion.js';
import { getRegionRepository } from '../repositories/regionRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { getUtilisateurRepository } from '../repositories/utilisateurRepository.js';
import { getPeriodeRepository } from '../repositories/periodeRepository.js';
import { getModuleRepository } from '../repositories/moduleRepository.js';
import { getSaisieRepository } from '../repositories/saisieRepository.js';
import { getRemarqueRepository } from '../repositories/remarqueRepository.js';
import { getAuditRepository } from '../repositories/auditRepository.js';
import { getProfilRepository } from '../repositories/profilRepository.js';
import { getReferentielRepository } from '../repositories/referentielRepository.js';
import { MODULES } from './modules.js';
import { buildSaisies } from './saisies.js';
import { ensureProfils, ensureModules, ensureEpnReference } from './common.js';

dotenv.config();

const REGIONS = [
  { name: 'Alaotra-Mangoro', code: 'ALA' },
  { name: 'Analamanga', code: 'ANL' },
  { name: 'Atsimo-Andrefana', code: 'ATA' },
  { name: 'Atsinanana', code: 'ATS' },
  { name: 'Boeny', code: 'BOE' },
  { name: 'Diana', code: 'DIA' },
  { name: 'Haute Matsiatra', code: 'HAM' },
  { name: 'Itasy', code: 'ITA' },
  { name: 'Menabe', code: 'MEN' },
  { name: 'Sava', code: 'SAV' },
  { name: 'Sofia', code: 'SOF' },
  { name: 'Vakinankaratra', code: 'VAK' },
];

const REGIONAL_STRUCTURE_TYPES = ['SRB', 'SRSP', 'SRPE', 'CIRBF'];
const REGIONS_WITH_STRUCTURES = ['Analamanga', 'Atsinanana', 'Diana'];

const DIRECTIONS = [
  'Direction des Regions Budget et des Finances',
  'Direction des Structures Excentriques',
  'Direction Generale du Budget et des Finances',
];
const SERVICES = ['Service des rapports', 'Service des ressources humaines', 'Service informatique'];
const GRADES = ["Attache d'administration", 'Secretaire de bureau', "Agent d'execution"];
const STDS = [
  'Direction Regionale de l\'Education Nationale – Analamanga',
  'Direction Regionale de l\'Education Nationale – Atsinanana',
  'Direction Regionale de l\'Education Nationale – Diana',
];

const PERIODES = [
  { label: 'Septembre 2026', start: new Date('2026-09-01'), end: new Date('2026-09-30'), deadline: new Date('2026-10-05'), periodicity: 'monthly' },
  { label: 'T3 2026', start: new Date('2026-07-01'), end: new Date('2026-09-30'), deadline: new Date('2026-10-15'), periodicity: 'quarterly' },
  { label: 'Octobre 2026', start: new Date('2026-10-01'), end: new Date('2026-10-31'), deadline: new Date('2026-11-05'), periodicity: 'monthly' },
];

// Nom de la base affiché dans la demande de confirmation : calculé SANS aucune
// connexion. En Mongo, le nom déjà déduit de MONGODB_URI ; en Oracle, le même
// libellé que ouvrirBase() (service seul, jamais d'identifiant).
function libelleBase() {
  const config = loadConfig();
  if (config.CORE_STORE === 'oracle') return nomOracle(config);
  return new URL(config.MONGODB_URI).pathname.replace('/', '') || '(inconnue)';
}

// Demande de confirmation AVANT toute connexion et toute suppression.
// Retourne le code de sortie (0 : continuer ou annulé sans écriture, 1 : refus)
// au lieu d'appeler process.exit : l'appelant referme d'abord la base.
async function confirmOrExit({ yes, purgeAudit }) {
  if (yes) return { code: 0 };
  const dbName = libelleBase();
  console.log(`ATTENTION : ce script SUPPRIME les donnees de la base "${dbName}" (regions, structures, utilisateurs, periodes, referentiels, modules, saisies, remarques) et recree des donnees de demonstration.`);
  console.log(purgeAudit ? 'Le journal d\'audit sera AUSSI supprime (--purge-audit).' : 'Le journal d\'audit est conserve.');
  if (!process.stdin.isTTY) {
    console.error('Terminal non interactif : relancez avec --yes pour confirmer.');
    return { code: 1 };
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Tapez OUI pour continuer : ');
  rl.close();
  if (answer.trim() !== 'OUI') {
    console.log('Annule. Aucune donnee modifiee.');
    return { code: 0 };
  }
  return { code: 0 };
}

// Seed de démonstration (SPEC §9) : toute la logique, sans process.exit.
// La connexion est ouverte ici (puis refermée par l'appelant : seed() en ligne
// de commande, le afterAll du test) — jamais deux fois de suite, jamais
// refermée par un autre utilisateur de la base.
export async function executerSeedDemo({ yes = false, purgeAudit = false } = {}) {
  const confirmation = await confirmOrExit({ yes, purgeAudit });
  if (confirmation.code !== 0) return { code: confirmation.code };

  const { store } = await ouvrirBase();
  console.log(store === 'oracle' ? 'Connecte a Oracle' : 'Connecte a MongoDB');

  // Nettoyage (seed idempotent) : séquentiel, dans l'ordre des clés étrangères.
  await getRemarqueRepository().supprimerTout();
  await getSaisieRepository().supprimerTout();
  await getUtilisateurRepository().supprimerTout();
  await getModuleRepository().supprimerTout();
  await getPeriodeRepository().supprimerTout();
  await getStructureRepository().supprimerTout();
  await getRegionRepository().supprimerTout();
  await getProfilRepository().supprimerTout();
  await getReferentielRepository().supprimerTout();
  console.log('Collections nettoyees');

  if (purgeAudit) {
    await getAuditRepository().supprimerTout();
    console.log('Journal d\'audit supprime (--purge-audit)');
  } else {
    console.log('Journal d\'audit conserve');
  }

  // 1. Profils (les 5 roles) - utiliser ensureProfils pour reset et recreer
  const profils = await ensureProfils();
  console.log(`${profils.created + profils.existing} profils prets`);

  // 2. Regions (12)
  const regionDocs = await getRegionRepository().insererPlusieurs(REGIONS.map(r => r.name));
  const regionByName = {};
  regionDocs.forEach(r => { regionByName[r.name] = r._id; });
  const regionByCode = {};
  REGIONS.forEach(r => { regionByCode[r.code] = regionByName[r.name]; });
  console.log(`${regionDocs.length} regions creees`);

  // 3. Structures
  const structures = [];
  for (const regionName of REGIONS_WITH_STRUCTURES) {
    const code = REGIONS.find(r => r.name === regionName).code;
    for (const type of REGIONAL_STRUCTURE_TYPES) {
      structures.push({
        code: `${type}-${code}`,
        label: `${type} – ${regionName}`,
        type,
        regionId: regionByName[regionName],
        active: true,
      });
    }
  }
  structures.push({ code: 'SSEBF', label: 'SSEBF', type: 'SSEBF', active: true });
  structures.push({ code: 'DGBF', label: 'DGBF', type: 'DGBF', active: true });
  structures.push({ code: 'CELLULE_INFO', label: 'DGBF – Cellule Informatique', type: 'CELLULE_INFO', active: true });
  const structureDocs = await getStructureRepository().insererPlusieurs(structures);
  const structByCode = {};
  structureDocs.forEach(s => { structByCode[s.code] = s._id; });
  console.log(`${structureDocs.length} structures creees`);

  // 4. Referentiels
  // Chargement des référentiels de référence : ministères et EPN (depuis data/init)
  const epnRef = await ensureEpnReference({ apply: true });
  if (!epnRef.success) {
    console.error('Echec du chargement des référentiels ministères/EPN.');
    return { code: 1 };
  }

  const referentiels = [];
  for (const d of DIRECTIONS) referentiels.push({ type: 'directions', value: d });
  for (const s of SERVICES) referentiels.push({ type: 'services', value: s });
  for (const g of GRADES) referentiels.push({ type: 'grades', value: g });
  for (const st of STDS) referentiels.push({ type: 'std', value: st });
  await getReferentielRepository().insererPlusieurs(referentiels);
  console.log(`${referentiels.length} referentiels crees`);

  // 5. Periodes (3)
  const periodeDocs = await getPeriodeRepository().insererPlusieurs(PERIODES);
  const periodeIdByLabel = {};
  periodeDocs.forEach(p => { periodeIdByLabel[p.label] = p._id; });
  console.log(`${PERIODES.length} periodes creees`);

  // 6. Modules (gabarits, fields structurés) - utiliser ensureModules pour reset et recreer
  await ensureModules();
  const moduleDocs = await getModuleRepository().lister({ codes: MODULES.map((m) => m.code) });
  const moduleIdByCode = {};
  moduleDocs.forEach(m => { moduleIdByCode[m.code] = m._id; });
  console.log(`${MODULES.length} modules crees`);

  // 7. Utilisateurs (mot de passe depuis SEED_DEMO_PASSWORD, défaut seulement hors production)
  const config = loadConfig();
  const demoPassword = process.env.SEED_DEMO_PASSWORD || (config.NODE_ENV === 'production' ? undefined : 'Test@2026');
  if (!demoPassword) {
    console.error('SEED_DEMO_PASSWORD est requis en production');
    return { code: 1 };
  }
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const utilisateurs = [
    { im: '104562', nom: 'Rakotoarivelo', prenom: 'Hery', direction: 'DRBF Analamanga', service: 'Service des rapports', role: 'client', structureId: structByCode['SRB-ANL'], status: 'actif', mustChangePassword: false },
    { im: '112470', nom: 'Randriamampionona', prenom: 'Jean', direction: 'DRBF Analamanga', service: 'Service des rapports', role: 'client', structureId: structByCode['SRSP-ANL'], status: 'actif', mustChangePassword: false },
    { im: '115908', nom: 'Raharimalala', prenom: 'Voahangy', direction: 'CIRBF Analamanga', service: 'Service des rapports', role: 'client', structureId: structByCode['CIRBF-ANL'], status: 'actif', mustChangePassword: false },
    { im: '108231', nom: 'Rasoamanana', prenom: 'Lalao', direction: 'DRBF Analamanga', service: 'Coordination regionale', role: 'admin2', structureId: structByCode['SRB-ANL'], status: 'actif', mustChangePassword: false },
    { im: '120344', nom: 'Andrianarisoa', prenom: 'Mamy', direction: 'SSEBF', service: 'Service des structures excentriques', role: 'admin1', structureId: structByCode['SSEBF'], status: 'actif', mustChangePassword: false },
    { im: '121775', nom: 'Rakotomalala', prenom: 'Fanja', direction: 'DGBF', service: 'Direction Generale', role: 'consultant', structureId: structByCode['DGBF'], status: 'actif', mustChangePassword: false },
    { im: '123009', nom: 'Ratsimba', prenom: 'Tiana', direction: 'DGBF', service: 'Cellule Informatique', role: 'developpeur', structureId: structByCode['CELLULE_INFO'], status: 'actif', mustChangePassword: false },
    { im: '098716', nom: 'Rabemananjara', prenom: 'Solo', direction: 'DRBF Atsinanana', service: 'Service des rapports', role: 'client', structureId: structByCode['SRB-ATS'], status: 'desactive', mustChangePassword: false },
    { im: '125430', nom: 'Rakotonirina', prenom: 'Haja', direction: 'DRBF Analamanga', service: 'Service des rapports', role: 'client', structureId: structByCode['SRSP-ANL'], status: 'actif', mustChangePassword: true },
    { im: 'SYS-0000', nom: 'Systeme', prenom: 'SIGBD', direction: 'DGBF', service: 'Cellule Informatique', role: 'developpeur', structureId: structByCode['CELLULE_INFO'], status: 'actif', mustChangePassword: false },
  ];
  // Le dépôt Utilisateur n'a pas de insererPlusieurs : un creer par compte,
  // l'ordre du tableau (et donc des _id) est conservé.
  const userDocs = [];
  for (const u of utilisateurs) {
    userDocs.push(await getUtilisateurRepository().creer({ ...u, passwordHash, failedAttempts: 0, lockedUntil: null }));
  }
  const userIdByIm = {};
  const actorLabelByIm = {};
  userDocs.forEach(u => {
    userIdByIm[u.im] = u._id;
    actorLabelByIm[u.im] = `${u.prenom} ${u.nom}`;
  });
  console.log(`${utilisateurs.length} utilisateurs crees`);

  // 8. Saisies de depart (divers statuts — SPEC §9)
  const saisies = buildSaisies({
    moduleIdByCode,
    structureIdByCode: structByCode,
    userIdByIm,
    periodeIdByLabel,
    actorLabelByIm,
  });
  await getSaisieRepository().insererPlusieurs(saisies);
  console.log(`${saisies.length} saisies creees`);

  console.log('Seed termine avec succes.');
  return { code: 0 };
}

async function seed() {
  const args = process.argv.slice(2);
  let code = 1;
  try {
    const resultat = await executerSeedDemo({
      yes: args.includes('--yes'),
      purgeAudit: args.includes('--purge-audit'),
    });
    code = resultat.code;
  } catch (err) {
    console.error('Erreur de seed:', err);
    code = 1;
  }
  // fermerBase() est sans effet si rien n'a été ouvert ; toute sortie du
  // script passe par ici, succès comme échec, avant process.exit.
  try {
    await fermerBase();
  } catch (err) {
    console.error('Erreur de seed:', err);
    code = 1;
  }
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
}

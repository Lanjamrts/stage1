"use strict";

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { loadConfig } from '../config.js';

import RegionModel from '../models/Region.js';
import StructureModel from '../models/Structure.js';
import ProfilModel from '../models/Profil.js';
import UtilisateurModel from '../models/Utilisateur.js';
import PeriodeModel from '../models/Periode.js';
import ReferentielModel from '../models/Referentiel.js';
import JournalAuditModel from '../models/JournalAudit.js';
import ModuleModel from '../models/Module.js';
import SaisieModel from '../models/Saisie.js';
import RemarqueModel from '../models/Remarque.js';
import { MODULES } from './modules.js';
import { buildSaisies } from './saisies.js';

dotenv.config();
const config = loadConfig();

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
  'Direction des Régions Budget et des Finances',
  'Direction des Structures Excentriques',
  'Direction Générale du Budget et des Finances',
];
const SERVICES = ['Service des rapports', 'Service des ressources humaines', 'Service informatique'];
const GRADES = ["Attaché d'administration", 'Secrétaire de bureau', "Agent d'exécution"];
const EPNS = [
  'Centre de formation professionnelle d\'Analamanga',
  'Centre de formation professionnelle d\'Atsinanana',
  'Centre de formation professionnelle de Diana',
];
const STDS = [
  'Direction Régionale de l\'Éducation Nationale – Analamanga',
  'Direction Régionale de l\'Éducation Nationale – Atsinanana',
  'Direction Régionale de l\'Éducation Nationale – Diana',
];

const PERIODES = [
  { label: 'Septembre 2026', start: new Date('2026-09-01'), end: new Date('2026-09-30'), deadline: new Date('2026-10-05'), periodicity: 'monthly' },
  { label: 'T3 2026', start: new Date('2026-07-01'), end: new Date('2026-09-30'), deadline: new Date('2026-10-15'), periodicity: 'quarterly' },
  { label: 'Octobre 2026', start: new Date('2026-10-01'), end: new Date('2026-10-31'), deadline: new Date('2026-11-05'), periodicity: 'monthly' },
];

async function seed() {
  if (config.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Seed refusé en production. Définissez SEED_ALLOW_PRODUCTION=true pour forcer.');
    process.exit(1);
  }

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connecte a MongoDB');

  // Nettoyage (seed idempotent)
  await Promise.all([
    RegionModel.deleteMany({}),
    StructureModel.deleteMany({}),
    ProfilModel.deleteMany({}),
    UtilisateurModel.deleteMany({}),
    PeriodeModel.deleteMany({}),
    ReferentielModel.deleteMany({}),
    JournalAuditModel.deleteMany({}),
    ModuleModel.deleteMany({}),
    SaisieModel.deleteMany({}),
    RemarqueModel.deleteMany({}),
  ]);
  console.log('Collections nettoyees');

  // 1. Profils (les 5 roles)
  const profils = [
    { code: 'client', label: 'Client' },
    { code: 'admin2', label: 'Administrateur regional (Admin 2)' },
    { code: 'admin1', label: 'Administrateur central (Admin 1)' },
    { code: 'developpeur', label: 'Developpeur' },
    { code: 'consultant', label: 'Consultant' },
  ];
  await ProfilModel.insertMany(profils);
  console.log(`${profils.length} profils crees`);

  // 2. Regions (12)
  const regionDocs = await RegionModel.insertMany(REGIONS.map(r => ({ name: r.name })));
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
  const structureDocs = await StructureModel.insertMany(structures);
  const structByCode = {};
  structureDocs.forEach(s => { structByCode[s.code] = s._id; });
  console.log(`${structureDocs.length} structures creees`);

  // 4. Referentiels
  const referentiels = [];
  for (const d of DIRECTIONS) referentiels.push({ type: 'directions', value: d });
  for (const s of SERVICES) referentiels.push({ type: 'services', value: s });
  for (const g of GRADES) referentiels.push({ type: 'grades', value: g });
  for (const e of EPNS) referentiels.push({ type: 'epn', value: e });
  for (const st of STDS) referentiels.push({ type: 'std', value: st });
  await ReferentielModel.insertMany(referentiels);
  console.log(`${referentiels.length} referentiels crees`);

  // 5. Periodes (3)
  const periodeDocs = await PeriodeModel.insertMany(PERIODES);
  const periodeIdByLabel = {};
  periodeDocs.forEach(p => { periodeIdByLabel[p.label] = p._id; });
  console.log(`${PERIODES.length} periodes creees`);

  // 6. Modules (gabarits, fields structurés)
  const moduleDocs = await ModuleModel.insertMany(MODULES.map(m => ({ ...m, version: 1, active: true })));
  const moduleIdByCode = {};
  moduleDocs.forEach(m => { moduleIdByCode[m.code] = m._id; });
  console.log(`${MODULES.length} modules cres`);

  // 7. Utilisateurs (mot de passe depuis SEED_DEMO_PASSWORD, défaut seulement hors production)
  const demoPassword = process.env.SEED_DEMO_PASSWORD || (config.NODE_ENV === 'production' ? undefined : 'Test@2026');
  if (!demoPassword) {
    console.error('SEED_DEMO_PASSWORD est requis en production');
    process.exit(1);
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
  const userDocs = await UtilisateurModel.insertMany(
    utilisateurs.map(u => ({ ...u, passwordHash, failedAttempts: 0, lockedUntil: null }))
  );
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
  await SaisieModel.insertMany(saisies);
  console.log(`${saisies.length} saisies creees`);

  await mongoose.disconnect();
  console.log('Seed termine avec succes.');
}

seed().catch(err => {
  console.error('Erreur de seed:', err);
  process.exit(1);
});

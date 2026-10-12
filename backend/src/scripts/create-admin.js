"use strict";

// Script pour créer le premier admin1 en production
// Usage: npm run create-admin
// Demande IM, nom, prénom et génère un mot de passe provisoire (format Xxx-Xxx-Xxx)

import readline from 'readline';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { loadConfig } from '../config.js';

import UtilisateurModel from '../models/Utilisateur.js';
import StructureModel from '../models/Structure.js';
import ProfilModel from '../models/Profil.js';

dotenv.config();
const config = loadConfig();

function generateProvisionalPassword() {
  const generateGroup = () => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    return (
      uppercase[Math.floor(Math.random() * uppercase.length)] +
      lowercase[Math.floor(Math.random() * lowercase.length)] +
      digits[Math.floor(Math.random() * digits.length)]
    );
  };
  return `${generateGroup()}-${generateGroup()}-${generateGroup()}`;
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  if (config.NODE_ENV !== 'production') {
    console.error('Ce script est destiné à la production uniquement.');
    process.exit(1);
  }

  await mongoose.connect(config.MONGODB_URI);
  console.log('✅ MongoDB connecté');

  // Vérifier qu'il n'y a pas déjà un admin1
  const existingAdmin1 = await UtilisateurModel.findOne({ role: 'admin1' });
  if (existingAdmin1) {
    console.error('Un admin1 existe déjà. Impossible de créer un nouvel admin1 initial.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Récupérer le profil admin1
  const admin1Profil = await ProfilModel.findOne({ code: 'admin1' });
  if (!admin1Profil) {
    console.error('Profil admin1 introuvable. Lancez le seed d\'abord.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Récupérer la structure SSEBF
  const ssebfStructure = await StructureModel.findOne({ type: 'SSEBF' });
  if (!ssebfStructure) {
    console.error('Structure SSEBF introuvable. Lancez le seed d\'abord.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('=== Création du premier administrateur central (Admin 1) ===\n');

  const im = await question(rl, 'IM (identifiant unique) : ');
  if (!im) {
    console.error('IM requis');
    rl.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  const existingUser = await UtilisateurModel.findOne({ im });
  if (existingUser) {
    console.error(`Un utilisateur avec l'IM ${im} existe déjà.`);
    rl.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  const nom = await question(rl, 'Nom : ');
  if (!nom) {
    console.error('Nom requis');
    rl.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  const prenom = await question(rl, 'Prénom : ');
  if (!prenom) {
    console.error('Prénom requis');
    rl.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  const provisionalPassword = generateProvisionalPassword();
  const passwordHash = await bcrypt.hash(provisionalPassword, 10);

  await UtilisateurModel.create({
    im,
    nom,
    prenom,
    direction: 'SSEBF',
    service: 'Service des structures excentriques',
    role: 'admin1',
    structureId: ssebfStructure._id,
    status: 'actif',
    mustChangePassword: true,
    passwordHash,
    failedAttempts: 0,
    lockedUntil: null,
  });

  console.log('\n✅ Admin 1 créé avec succès !');
  console.log(`IM : ${im}`);
  console.log(`Nom : ${prenom} ${nom}`);
  console.log(`Mot de passe provisoire : ${provisionalPassword}`);
  console.log('\n⚠️  NOTEZ CE MOT DE PASSE PROVISOIRE MAINTENANT - il ne sera plus affiché.');
  console.log('L\'utilisateur devra le changer à sa première connexion.');

  rl.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
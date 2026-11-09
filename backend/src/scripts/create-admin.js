"use strict";

// Script pour créer le premier admin1 en production
// Usage: npm run create-admin
// Demande IM, nom, prénom et génère un mot de passe provisoire (format Xxx-Xxx-Xxx)

import readline from 'readline';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';

import { getProfilRepository } from '../repositories/profilRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { getUtilisateurRepository } from '../repositories/utilisateurRepository.js';
import { ouvrirBase, fermerBase } from './connexion.js';

dotenv.config();

// Erreur dont le message est affiché tel quel (sans préfixe « Erreur: »).
class ErreurScript extends Error {}

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

// Vérifications qui précèdent toute demande : admin1 déjà présent, profil et
// structure SSEBF. Retourne la structure SSEBF (réutilisée pour la création).
export async function verifierPeutCreerAdmin1() {
  const existingAdmin1 = await getUtilisateurRepository().trouverPremierParRole('admin1');
  if (existingAdmin1) {
    throw new ErreurScript('Un admin1 existe déjà. Impossible de créer un nouvel admin1 initial.');
  }

  const admin1Profil = await getProfilRepository().trouverParCode('admin1');
  if (!admin1Profil) {
    throw new ErreurScript("Profil admin1 introuvable. Lancez le seed d'abord.");
  }

  const ssebfStructure = await getStructureRepository().trouverParType('SSEBF');
  if (!ssebfStructure) {
    throw new ErreurScript(
      "Structure SSEBF introuvable. Lancez d'abord : npm run init:structures -- --apply"
    );
  }
  return ssebfStructure;
}

export async function verifierImDisponible(im) {
  if (!im) {
    throw new ErreurScript('IM requis');
  }
  const existingUser = await getUtilisateurRepository().trouverParIm(im);
  if (existingUser) {
    throw new ErreurScript(`Un utilisateur avec l'IM ${im} existe déjà.`);
  }
}

// Écriture : hachage bcrypt et champs strictement identiques à l'original.
// Retourne le mot de passe provisoire clair (affiché une seule fois).
export async function creerAdmin1({ im, nom, prenom, structureId }) {
  if (!nom) {
    throw new ErreurScript('Nom requis');
  }
  if (!prenom) {
    throw new ErreurScript('Prénom requis');
  }

  const provisionalPassword = generateProvisionalPassword();
  const passwordHash = await bcrypt.hash(provisionalPassword, 10);

  try {
    await getUtilisateurRepository().creer({
      im,
      nom,
      prenom,
      direction: 'SSEBF',
      service: 'Service des structures excentriques',
      role: 'admin1',
      structureId,
      status: 'actif',
      mustChangePassword: true,
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
    });
  } catch (err) {
    // Course possible entre le contrôle trouParIm et l'écriture.
    if (err && err.code === 'DOUBLON') {
      throw new ErreurScript(`Un utilisateur avec l'IM ${im} existe déjà.`);
    }
    throw err;
  }
  return { password: provisionalPassword };
}

// Parcours complet, sans invite : utilisé par les tests.
export async function creerPremierAdmin1({ im, nom, prenom }) {
  const ssebfStructure = await verifierPeutCreerAdmin1();
  await verifierImDisponible(im);
  return creerAdmin1({ im, nom, prenom, structureId: ssebfStructure._id });
}

async function main() {
  const config = loadConfig();
  if (config.NODE_ENV !== 'production') {
    console.error('Ce script est destiné à la production uniquement.');
    await fermerBase();
    process.exit(1);
  }

  const { store } = await ouvrirBase();
  console.log(store === 'oracle' ? '✅ Oracle connecté' : '✅ MongoDB connecté');

  let rl = null;
  let code = 0;
  try {
    // Vérifications avant toute invite (comportement d'origine).
    const ssebfStructure = await verifierPeutCreerAdmin1();

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('=== Création du premier administrateur central (Admin 1) ===\n');

    const im = await question(rl, 'IM (identifiant unique) : ');
    await verifierImDisponible(im);

    const nom = await question(rl, 'Nom : ');
    if (!nom) {
      throw new ErreurScript('Nom requis');
    }

    const prenom = await question(rl, 'Prénom : ');
    if (!prenom) {
      throw new ErreurScript('Prénom requis');
    }

    const { password } = await creerAdmin1({
      im,
      nom,
      prenom,
      structureId: ssebfStructure._id,
    });

    console.log('\n✅ Admin 1 créé avec succès !');
    console.log(`IM : ${im}`);
    console.log(`Nom : ${prenom} ${nom}`);
    console.log(`Mot de passe provisoire : ${password}`);
    console.log('\n⚠️  NOTEZ CE MOT DE PASSE PROVISOIRE MAINTENANT - il ne sera plus affiché.');
    console.log("L'utilisateur devra le changer à sa première connexion.");
  } catch (err) {
    if (err instanceof ErreurScript) {
      console.error(err.message);
    } else {
      console.error('Erreur:', err.message);
    }
    code = 1;
  } finally {
    if (rl) rl.close();
    await fermerBase();
  }

  if (code) process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error('Erreur:', err.message);
    await fermerBase();
    process.exit(1);
  });
}

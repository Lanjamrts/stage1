"use strict";

import { loadConfig } from '../config.js';

// Forme des identifiants selon le stockage actif : ObjectId MongoDB (24 chiffres
// hexadécimaux) ou NUMBER Oracle (chiffres sans zéro initial, 18 chiffres max).
const ID_MONGO = /^[0-9a-fA-F]{24}$/;
const ID_ORACLE = /^[1-9][0-9]{0,17}$/;

// CORE_STORE est relu À CHAQUE appel : les tests changent l'interrupteur en
// cours de session. Toute valeur non chaîne est refusée.
export function estIdValide(valeur) {
  if (typeof valeur !== 'string') return false;
  return loadConfig().CORE_STORE === 'oracle' ? ID_ORACLE.test(valeur) : ID_MONGO.test(valeur);
}

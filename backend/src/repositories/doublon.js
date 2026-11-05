"use strict";

// Normalisation d'une violation d'unicité : MongoDB (code 11000) et Oracle
// (errorNum 1) deviennent une Error dont `code` vaut 'DOUBLON', avec le message
// d'origine et l'erreur d'origine conservés dans `cause`.
// Toute autre erreur n'est pas touchée (remontée telle quelle par l'appelant).

function estDoublon(err) {
  if (!err || typeof err !== 'object') return false;
  const code = err.code != null ? Number(err.code) : NaN;
  if (code === 11000 || code === 11001) return true;
  const errorNum = err.errorNum != null ? Number(err.errorNum) : NaN;
  if (errorNum === 1) return true;
  const writeErrors = err.writeErrors || (err.result && err.result.result && err.result.result.writeErrors);
  if (Array.isArray(writeErrors) && writeErrors.some((w) => w && (Number(w.code) === 11000 || Number(w.code) === 11001))) {
    return true;
  }
  if (estDoublon(err.cause)) return true;
  if (estDoublon(err.originalError)) return true;
  return false;
}

// Retourne une Error 'DOUBLON' si `err` est une violation d'unicité, sinon null.
export function erreurDoublonSi(err) {
  if (!estDoublon(err)) return null;
  const doublon = new Error(err.message);
  doublon.code = 'DOUBLON';
  doublon.cause = err;
  return doublon;
}

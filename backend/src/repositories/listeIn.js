"use strict";

// Découpage d'une liste en IN : Oracle limite un IN à 1000 valeurs, les paquets
// sont donc de 900 et reliés par OR (même règle que auditOracle.js).
// `colonne` est toujours une constante SQL de l'application : aucun texte
// utilisateur n'est concaténé.

const TAILLE_PAQUET = 900;

// Retourne { condition, valeurs } à ajouter dans un WHERE.
// Liste vide → condition fausse ('1 = 0') : aucune ligne, comme $in: [].
export function construireIn(colonne, valeurs) {
  if (valeurs.length === 0) {
    return { condition: '1 = 0', valeurs: [] };
  }
  const paquets = [];
  const params = [];
  for (let i = 0; i < valeurs.length; i += TAILLE_PAQUET) {
    const paquet = valeurs.slice(i, i + TAILLE_PAQUET);
    paquets.push(`${colonne} IN (${paquet.map(() => '?').join(', ')})`);
    params.push(...paquet);
  }
  return { condition: `(${paquets.join(' OR ')})`, valeurs: params };
}

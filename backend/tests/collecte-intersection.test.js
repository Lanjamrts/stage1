"use strict";

// Étape 41.3 — test unitaire (sans Oracle, jamais ignoré) de la fonction
// d'intersection locale utilisée par buildFilter : les conditions de même
// nature sont en ET, donc les listes de filtres sont INTERSECTÉES (et non
// remplacées). Une intersection vide → [] : la liste de dépôt est vide, donc
// aucune ligne, comme `$in: []` avant.

import { describe, it, expect } from 'vitest';

import { intersecterListes } from '../src/controllers/collecteController.js';

describe('intersecterListes — intersection locale des listes de filtres', () => {
  it('aucune liste fournie → undefined (aucun filtre posé)', () => {
    expect(intersecterListes()).toBeUndefined();
    expect(intersecterListes(null, undefined)).toBeUndefined();
    expect(intersecterListes('ignore', null)).toBeUndefined();
  });

  it('une seule liste fournie → dédoublonnée, ordre de la première conservé', () => {
    expect(intersecterListes(['b', 'a', 'b'])).toEqual(['b', 'a']);
    expect(intersecterListes(null, ['x', 'y'])).toEqual(['x', 'y']);
    expect(intersecterListes(undefined, ['x'], null)).toEqual(['x']);
  });

  it('deux listes ou plus → intersection, ordre de la première, doublons retirés', () => {
    expect(intersecterListes(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
    expect(intersecterListes(['a', 'b'], ['a', 'b'], ['b'])).toEqual(['b']);
    expect(intersecterListes(['b', 'a', 'b'], ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('intersection vide → [] (donc aucune ligne)', () => {
    expect(intersecterListes(['a'], ['b'])).toEqual([]);
    expect(intersecterListes(['a', 'b'], ['c', 'd'])).toEqual([]);
    expect(intersecterListes(['a'], ['a'], ['z'])).toEqual([]);
  });

  it('les entrées non tableaux sont ignorées (null, undefined, chaînes)', () => {
    expect(intersecterListes(null, ['a'], undefined, ['a', 'b'])).toEqual(['a']);
    expect(intersecterListes(['a', 'b'], 'pas-un-tableau', ['b'])).toEqual(['b']);
  });
});

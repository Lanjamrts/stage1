"use strict";

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const ROOT = resolve(__dirname, '..', '..');
const DOC_PATH = join(ROOT, 'docs', 'RECETTE.md');

describe('Dossier de recette — vérifications automatiques', () => {
  it('R1 : toutes les references de tests du dossier de recette existent', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const doc = readFileSync(DOC_PATH, 'utf8');

    const pattern = /^- (backend\/tests\/[\w.-]+\.test\.js) :: (.+?)( \(API uniquement\))?$/gm;
    const matches = [...doc.matchAll(pattern)];
    expect(matches.length).toBeGreaterThanOrEqual(8);

    for (const m of matches) {
      const filePath = join(ROOT, m[1]);
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf8');
      expect(content).toContain(m[2]);
    }
  });

  it('R2 : les 12 scenarios T-01 a T-12 sont presents une seule fois', () => {
    const doc = readFileSync(DOC_PATH, 'utf8');
    for (let i = 1; i <= 12; i++) {
      const id = `T-${String(i).padStart(2, '0')}`;
      const headingPattern = new RegExp(`^### ${id}$`, 'm');
      const matches = doc.match(headingPattern);
      expect(matches).not.toBeNull();
      expect(matches.length).toBe(1);
    }
  });

  it('R3 : chaque scenario a un etat valide coherent', () => {
    const doc = readFileSync(DOC_PATH, 'utf8');

    const sections = doc.split(/^### T-/m).slice(1);
    expect(sections.length).toBe(12);

    const etatPattern = /^\*\*État \*\* : (Automatisé|Procédure manuelle|Non couvert)$/m;
    const bulletPattern = /^- backend\/tests\/[\w.-]+\.test\.js :: .+$/m;

    const summaryTablePattern = /^\| T-\d{2} \| .+ \| (Automatisé|Procédure manuelle|Non couvert) \|$/gm;
    const summaryMatches = [...doc.matchAll(summaryTablePattern)];
    const summaryEtats = new Map();
    for (const m of summaryMatches) {
      const idMatch = m[0].match(/T-\d{2}/);
      if (idMatch) {
        summaryEtats.set(idMatch[0], m[1]);
      }
    }

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const id = `T-${String(i + 1).padStart(2, '0')}`;

      const etatMatch = section.match(etatPattern);
      expect(etatMatch).not.toBeNull();
      const etat = etatMatch[1];
      expect(['Automatisé', 'Procédure manuelle', 'Non couvert']).toContain(etat);

      const hasBullet = bulletPattern.test(section);
      if (etat === 'Automatisé') {
        expect(hasBullet).toBe(true);
      }
      if (etat === 'Non couvert') {
        expect(hasBullet).toBe(false);
      }

      const summaryEtat = summaryEtats.get(id);
      expect(summaryEtat).toBeDefined();
      expect(summaryEtat).toBe(etat);
    }
  });
});
"use strict";

import { describe, it, expect } from 'vitest';
import { validateSubmit, validateDraft } from '../../shared/rules.mjs';
import { buildExportModel } from '../src/services/exportModel.js';
import { buildWorkbook } from '../src/services/exportXlsx.js';
import { renderPdf } from '../src/services/exportPdf.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import * as zlib from 'node:zlib';
import { MODULES } from '../src/seed/modules.js';

const NCA = MODULES.find((m) => m.code === 'NCA');
if (!NCA) throw new Error('Module NCA introuvable dans seed/modules.js');

const TABLE_KEY = 'membres';

function membresTable(moduleDef) {
  return moduleDef.fields.find((f) => f.key === TABLE_KEY);
}

const BASE_VALUES = {
  epn: 'Economic Development Board of Madagascar',
  ref_arrete: "Décret n° 2026-001",
  date_arrete: '2026-03-15',
  duree_mandat: 3,
  statut: 'En fonction',
};

function row(values) {
  return {
    structureLabel: 'SRB – Analamanga',
    moduleCode: NCA.code,
    moduleLabel: NCA.label,
    module: NCA,
    authorLabel: 'Jean Rakoto',
    statusLabel: 'Exportée',
    periodeLabel: 'Octobre 2026',
    eventDate: null,
    dates: {
      created: new Date('2026-10-16T08:00:00Z'),
      submitted: new Date('2026-10-16T09:00:00Z'),
      exported: new Date('2026-10-16T10:00:00Z'),
    },
    values,
  };
}

function extractPdfText(buffer) {
  const text = buffer.toString('latin1');
  let out = '';
  let idx = 0;
  while ((idx = text.indexOf('stream', idx)) >= 0) {
    const start = text.indexOf('\n', idx) + 1;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    const raw = Buffer.from(text.slice(start, end), 'latin1');
    let dec = '';
    try { dec = zlib.inflateSync(raw).toString('latin1'); } catch { dec = raw.toString('latin1'); }
    for (const h of [...dec.matchAll(/<([0-9A-Fa-f\s]+)>/g)]) {
      const hex = h[1].replace(/\s/g, '');
      for (let i = 0; i + 1 < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
    }
    idx = end + 9;
  }
  return out;
}

function submitAvec(mandat) {
  const valeurs = { ...BASE_VALUES, membres: [{ nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur', mandat }] };
  return validateSubmit(NCA.fields, valeurs, { today: new Date() });
}

describe('ETAPE 26 — NCA : colonne « N° de mandat » sur la table membres', () => {
  it('la definition du module contient la colonne mandat (entier, min 1, requise, pas de max, après qualite)', () => {
    const table = membresTable(NCA);
    expect(table).not.toBeUndefined();
    expect(table.type).toBe('table');

    const cles = table.fields.map((f) => f.key);
    const iQualite = cles.indexOf('qualite');
    const iMandat = cles.indexOf('mandat');
    expect(iMandat).toBe(iQualite + 1, 'mandat doit etre place juste apres qualite');

    const mandat = table.fields[iMandat];
    expect(mandat.key).toBe('mandat');
    expect(mandat.label).toBe('N° de mandat');
    expect(mandat.type).toBe('integer');
    expect(mandat.required).toBe(true);
    expect(mandat.min).toBe(1);
    expect(mandat.max).toBeUndefined();
    expect(mandat.placeholder).toBe('1 = premier mandat, 2 = deuxième mandat, etc.');
  });

  describe('validation (saisie)', () => {
    it('accepte mandat 1, 2 et 25', () => {
      for (const m of [1, 2, 25]) {
        expect(submitAvec(m)).toEqual({});
      }
    });

    it('refuse 0', () => {
      const errors = submitAvec(0);
      expect(errors['membres.0.mandat']).toBe("La valeur doit être supérieure ou égale à 1.");
    });

    it('refuse -1', () => {
      const errors = submitAvec(-1);
      expect(errors['membres.0.mandat']).toBe("La valeur doit être supérieure ou égale à 1.");
    });

    it('refuse 1.5 (pas un entier)', () => {
      const errors = submitAvec(1.5);
      expect(errors['membres.0.mandat']).toBe("Ce champ doit être un nombre entier.");
    });

    it('refuse vide (champ obligatoire)', () => {
      const errors = submitAvec('');
      expect(errors['membres.0.mandat']).toBe("Ce champ est obligatoire.");
    });

    it('en brouillon, une ligne sans mandat ne bloque pas l enregistrement mais le type est controle', () => {
      // Brouillon : pas d erreur d obligation sur un champ absent...
      const valeursAbsent = { ...BASE_VALUES, membres: [{ nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur' }] };
      expect(validateDraft(NCA.fields, valeursAbsent, { today: new Date() })).toEqual({});

      // ...mais une valeur présente invalide est refusee meme en brouillon.
      const valeursInvalide = { ...BASE_VALUES, membres: [{ nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur', mandat: 0 }] };
      expect(validateDraft(NCA.fields, valeursInvalide, { today: new Date() })).toHaveProperty('membres.0.mandat');
    });
  });

  describe('export Excel', () => {
    it('la colonne « N° de mandat » figure après « Qualité », valeur entière sans séparateur de milliers', async () => {
      const valeurs = {
        ...BASE_VALUES,
        membres: [
          { nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur', mandat: 1 },
          { nom: 'Rasoa', prenom: 'Marie', qualite: 'Trésorière', mandat: 25 },
        ],
      };
      const model = buildExportModel([row(valeurs)], {
        filters: { regions: [], modules: [] },
        generatedAt: new Date('2026-10-16T12:00:00Z'),
      });
      const wb = buildWorkbook(model);
      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(buffer);
      const sheet = wb2.getWorksheet('NCA – Membres');
      expect(sheet).not.toBeUndefined();

      const headers = [];
      sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value || '')));
      const iQualite = headers.indexOf('Qualité');
      const iMandat = headers.indexOf('N° de mandat');
      expect(iQualite).toBeGreaterThanOrEqual(0);
      expect(iMandat).toBe(iQualite + 1);

      expect(String(sheet.getCell(2, iMandat + 1).value || '')).toBe('1');
      expect(String(sheet.getCell(3, iMandat + 1).value || '')).toBe('25');

      let interdit = false;
      sheet.getRow(2).eachCell((cell) => {
        const v = String(cell.value || '');
        if (v === 'undefined' || v === 'null') interdit = true;
      });
      sheet.getRow(3).eachCell((cell) => {
        const v = String(cell.value || '');
        if (v === 'undefined' || v === 'null') interdit = true;
      });
      expect(interdit).toBe(false);
    });

    it('une saisie d ancienne version (sans mandat) exporte une cellule vide, pas de undefined ni null', async () => {
      const valeurs = {
        ...BASE_VALUES,
        membres: [{ nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur' }],
      };
      const model = buildExportModel([row(valeurs)], {
        filters: { regions: [], modules: [] },
        generatedAt: new Date('2026-10-16T12:00:00Z'),
      });
      const wb = buildWorkbook(model);
      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(buffer);
      const sheet = wb2.getWorksheet('NCA – Membres');
      const headers = [];
      sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value || '')));
      const iMandat = headers.indexOf('N° de mandat');
      expect(iMandat).toBeGreaterThanOrEqual(0);
      expect(String(sheet.getCell(2, iMandat + 1).value || '')).toBe('');

      let interdit = false;
      sheet.getRow(2).eachCell((cell) => {
        const v = String(cell.value || '');
        if (v === 'undefined' || v === 'null') interdit = true;
      });
      expect(interdit).toBe(false);
    });
  });

  describe('export PDF', () => {
    it('la colonne « N° de mandat » figure dans le tableau du PDF', async () => {
      const valeurs = {
        ...BASE_VALUES,
        membres: [{ nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur', mandat: 2 }],
      };
      const model = buildExportModel([row(valeurs)], { filters: { regions: [], modules: [] } });
      const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
      const chunks = [];
      const buffer = await new Promise((resolve, reject) => {
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        renderPdf(model, doc);
        doc.end();
      });
      const pdfText = extractPdfText(buffer);
      expect(pdfText.includes('N° de mandat')).toBe(true);
    });

    it('une saisie d ancienne version ne produit ni undefined ni null dans le PDF', async () => {
      const valeurs = {
        ...BASE_VALUES,
        membres: [{ nom: 'Rakoto', prenom: 'Jean', qualite: 'Administrateur' }],
      };
      const model = buildExportModel([row(valeurs)], { filters: { regions: [], modules: [] } });
      const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
      const chunks = [];
      const buffer = await new Promise((resolve, reject) => {
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        renderPdf(model, doc);
        doc.end();
      });
      const pdfText = extractPdfText(buffer);
      expect(pdfText).not.toContain('undefined');
      expect(pdfText).not.toContain('null');
    });
  });
});

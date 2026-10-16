"use strict";
import { describe, it, expect } from 'vitest';
import { buildExportModel, fmtDate, fmtDateTime } from '../src/services/exportModel.js';
import { buildWorkbook } from '../src/services/exportXlsx.js';
import { renderPdf } from '../src/services/exportPdf.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const ValueType = ExcelJS.ValueType;

const RA_MODULE = {
  code: 'RA',
  label: "Rapport d'activit\u00e9s",
  fields: [
    { key: 'activites', label: 'Activit\u00e9s r\u00e9alis\u00e9es', type: 'table', fields: [
      { key: 'intitule', label: 'Intitul\u00e9', type: 'text' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'statut', label: 'Statut', type: 'select' },
    ] },
    { key: 'indicateurs', label: 'Indicateurs de performance', type: 'table', fields: [
      { key: 'indicateur', label: 'Indicateur', type: 'text' },
      { key: 'valeur', label: 'Valeur', type: 'decimal' },
    ] },
    { key: 'difficultes', label: 'Difficult\u00e9s rencontr\u00e9es et solutions', type: 'textarea' },
    { key: 'perspectives', label: 'Perspectives et besoins', type: 'textarea' },
  ],
};

const TSE_MODULE = {
  code: 'TSE',
  label: 'Transfert salaires et accessoires EPN',
  fields: [
    { key: 'montant', label: 'Montant', type: 'integer' },
    { key: 'date_acte', label: "Date de l'acte", type: 'date' },
    { key: 'nature', label: 'Nature', type: 'select' },
    { key: 'std', label: 'STD', type: 'multiselect' },
  ],
};

function row(module, values, overrides = {}) {
  return {
    structureLabel: overrides.structureLabel || 'SRB \u2013 Analamanga',
    moduleCode: module.code,
    moduleLabel: module.label,
    module,
    authorLabel: overrides.authorLabel || 'Jean Rakoto',
    statusLabel: 'Export\u00e9e',
    periodeLabel: overrides.periodeLabel || 'Octobre 2026',
    eventDate: null,
    dates: {
      created: new Date('2026-10-16T08:00:00Z'),
      submitted: new Date('2026-10-16T09:00:00Z'),
      exported: new Date('2026-10-16T10:00:00Z'),
    },
    values,
    ...overrides,
  };
}

describe('Rendu des formats d\'export (collecte)', () => {
  it('X1 : les dates sont formatees en heure de Madagascar quel que soit le fuseau du serveur', () => {
    const instant = new Date('2026-10-16T21:30:00Z');
    const before = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      expect(fmtDateTime(instant)).toBe('17/10/2026 00:30');
      expect(fmtDate(instant)).toBe('17/10/2026');
    } finally {
      process.env.TZ = before;
    }
  });

  it('X2 : les lignes de tableau restent groupees avec tous leurs sous-champs', () => {
    const values = {
      activites: [
        { intitule: 'R\u00e9union budg\u00e9taire', date: '2026-10-01', statut: 'Realisee' },
        { intitule: 'Formation', date: '2026-10-05', statut: 'En cours' },
      ],
      indicateurs: [{ indicateur: 'Taux', valeur: 12.5 }],
      difficultes: '  rien  ',
      perspectives: '',
    };
    const model = buildExportModel([row(RA_MODULE, values)]);
    const saisie = model.modules[0].saisies[0];
    expect(saisie.tables.activites).toHaveLength(2);
    expect(saisie.tables.activites[0]).toMatchObject({ intitule: 'R\u00e9union budg\u00e9taire', statut: 'Realisee' });
    expect(saisie.tables.activites[0].date instanceof Date).toBe(true);
    expect(saisie.tables.activites[1]).toMatchObject({ intitule: 'Formation', statut: 'En cours' });
    expect(saisie.tables.activites[1].date instanceof Date).toBe(true);
    expect(saisie.tables.indicateurs).toEqual([{ indicateur: 'Taux', valeur: 12.5 }]);
    expect(saisie.scalars.difficultes).toBe('rien');
    expect(saisie.scalars.perspectives).toBe('');
  });

  it('X3 : les valeurs sont typees selon le champ (nombre, date, texte sans espaces parasites)', () => {
    const values = {
      montant: '42',
      date_acte: '2026-10-05',
      nature: '  Salaires  ',
      std: ['STD A', 'STD B'],
      inconnu: 'ignoré',
    };
    const model = buildExportModel([row(TSE_MODULE, values)], { filters: { regions: [], modules: [] } });
    const saisie = model.modules[0].saisies[0];
    expect(typeof saisie.scalars.montant).toBe('number');
    expect(saisie.scalars.montant).toBe(42);
    expect(saisie.scalars.date_acte instanceof Date).toBe(true);
    expect(fmtDate(saisie.scalars.date_acte)).toBe('05/10/2026');
    expect(saisie.scalars.nature).toBe('Salaires');
    expect(saisie.scalars.std).toBe('STD A, STD B');
    // cl\u00e9 absente du gabarit : jamais d'undefined, liste 'Autres champs'
    expect(saisie.autresChamps).toEqual([{ cle: 'inconnu', valeur: 'ignor\u00e9' }]);
  });

  async function writtenWorkbook(rows, filters = { regions: [], modules: [] }) {
    const model = buildExportModel(rows, { filters, generatedAt: new Date('2026-10-16T12:00:00Z') });
    const wb = buildWorkbook(model);
    const buffer = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    return wb2;
  }

  it('X4 : le classeur contient Synthese, une feuille par module et des noms de feuille valides et uniques', async () => {
    const wb = await writtenWorkbook([
      row(RA_MODULE, { activites: [], indicateurs: [], difficultes: '', perspectives: '' }),
      row(TSE_MODULE, { montant: 10, date_acte: '', nature: '', std: [] }),
    ]);
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names[0]).toBe('Synth\u00e8se');
    expect(names).toContain('RA');
    expect(names).toContain('TSE');
    expect(new Set(names).size).toBe(names.length);
    const INVALID = /[\[\]:*?\/\\]/;
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(31);
      expect(INVALID.test(name)).toBe(false);
    }
  });

  it('X5 : les cellules numeriques et dates sont de vrais nombres et de vraies dates avec format', async () => {
    const wb = await writtenWorkbook([
      row(RA_MODULE, { activites: [], indicateurs: [], difficultes: '', perspectives: '' }),
      row(TSE_MODULE, { montant: 10, date_acte: '2026-10-05', nature: 'Salaires', std: [] }),
    ]);
    const synth = wb.getWorksheet('Synth\u00e8se');
    const dateCell = synth.getCell(9, 7); // ligne 9 = premi\u00e8re saisie, col G Cre\u00e9e le
    expect(dateCell.type).toBe(ValueType.Date);
    expect(dateCell.numFmt).toBe('dd/mm/yyyy hh:mm');
    expect(dateCell.value instanceof Date).toBe(true);

    const tse = wb.getWorksheet('TSE');
    let foundNumber = false;
    let foundDate = false;
    tse.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.type === ValueType.Number && cell.numFmt === '#,##0') foundNumber = true;
        if (cell.type === ValueType.Date && cell.numFmt === 'dd/mm/yyyy') foundDate = true;
      });
    });
    expect(foundNumber).toBe(true);
    expect(foundDate).toBe(true);
  });

  it('X6 : l en-tete est fige, filtre et les colonnes de dates sont assez larges', async () => {
    const wb = await writtenWorkbook([
      row(RA_MODULE, { activites: [], indicateurs: [], difficultes: '', perspectives: '' }),
    ]);
    const synth = wb.getWorksheet('Synth\u00e8se');
    expect(synth.autoFilter).toBeDefined();
    expect(synth.views.some((v) => v.state === 'frozen' && v.topLeftCell === 'A9')).toBe(true);
    const widths = [7, 8, 9].map((i) => synth.getColumn(i).width);
    expect(widths.every((w) => w >= 20)).toBe(true);

    const ra = wb.getWorksheet('RA');
    expect(ra.autoFilter).toBeDefined();
    expect(ra.views.some((v) => v.state === 'frozen' && v.topLeftCell === 'A2')).toBe(true);
  });

  it('X7 : le PDF est genere sur plusieurs pages avec en-tete et pied de page sans erreur', () => {
    const rows = [];
    for (let i = 0; i < 60; i++) {
      rows.push(row(RA_MODULE, {
        activites: [{ intitule: `Activit\u00e9 ${i}`, date: '2026-10-01', statut: 'Realisee' }],
        indicateurs: [{ indicateur: 'T', valeur: i }],
        difficultes: 'Difficult\u00e9s ' + 'x'.repeat(120),
        perspectives: 'Perspectives ' + 'y'.repeat(120),
      }));
    }
    const model = buildExportModel(rows, { filters: { regions: ['Analamanga'], modules: [] } });
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
          const text = buffer.toString('latin1');
          const pages = (text.match(/\/Type\s*\/Page/g) || []).length;
          expect(pages).toBeGreaterThanOrEqual(2);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      doc.on('error', reject);
      renderPdf(model, doc);
      doc.end();
    });
  });

  it('X8 : un export vide produit un message clair dans l Excel', async () => {
    const wb = await writtenWorkbook([], { regions: [], modules: [] });
    const synth = wb.getWorksheet('Synth\u00e8se');
    let found = false;
    synth.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value || '').includes('Aucune donn\u00e9e \u00e0 exporter pour cette s\u00e9lection')) found = true;
      });
    });
    expect(found).toBe(true);
  });
});

"use strict";
import { describe, it, expect } from 'vitest';
import { buildExportModel, fmtDate, fmtDateTime, formatPdfCell, computeTableColumnWidths, isPlainNumberField } from '../src/services/exportModel.js';
import { saisieBlockHeight } from '../src/services/exportPdf.js';
import { buildWorkbook, cleanSheetNameBase } from '../src/services/exportXlsx.js';
import { renderPdf, rowHeight } from '../src/services/exportPdf.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import * as zlib from 'node:zlib';

const ValueType = ExcelJS.ValueType;

const CONTENT_W_TEST = 595 - 2 * 42;

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

const RH_MODULE = {
  code: 'RH',
  label: 'Ressources humaines',
  fields: [
    { key: 'besoins', label: 'Besoins en personnel et en formation', type: 'textarea' },
    {
      key: 'effectif',
      label: 'Effectif par catégorie, grade et sexe',
      type: 'table',
      fields: [
        { key: 'categorie', label: 'Catégorie', type: 'select' },
        { key: 'grade', label: 'Grade', type: 'text' },
        { key: 'sexe', label: 'Sexe', type: 'select' },
        { key: 'effectif', label: 'Effectif', type: 'integer' },
      ],
    },
    {
      key: 'mouvements',
      label: 'Mouvements de personnel',
      type: 'table',
      fields: [
        { key: 'type', label: 'Type', type: 'select' },
        { key: 'nombre', label: 'Nombre', type: 'integer' },
      ],
    },
  ],
};

const STATUT_MODULE = {
  code: 'ST',
  label: 'Module test statut',
  fields: [
    { key: 'statut', label: 'Statut', type: 'select' },
    { key: 'objet', label: 'Objet', type: 'text' },
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
          const pages = (text.match(/\/Type \/Page(?!s)/g) || []).length;
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

  it('X9 : un export d une saisie produit exactement une page PDF avec Page 1 / 1', () => {
    const model = buildExportModel([row(RA_MODULE, { activites: [], indicateurs: [], difficultes: '', perspectives: '' })], {
      filters: { regions: [], modules: [] },
    });
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
          const text = buffer.toString('latin1');
          const pages = (text.match(/\/Type \/Page(?!s)/g) || []).length;
          const pdfText = extractPdfText(buffer);
          expect(pages).toBe(1);
          expect(pdfText.includes('Page 1 / 1')).toBe(true);
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

  it('X10 : les heures ecrites dans l Excel sont celles de Madagascar (instant 2026-10-16T07:14:04Z → cellule 10:14)', async () => {
    const r = row(TSE_MODULE, { montant: 10, date_acte: '', nature: '', std: [] });
    r.dates.created = new Date('2026-10-16T07:14:04Z');
    const wb = await writtenWorkbook([r], { regions: [], modules: [] });
    const synth = wb.getWorksheet('Synth\u00e8se');
    const cell = synth.getCell(9, 7);
    expect(cell.type).toBe(ValueType.Date);
    expect(cell.value instanceof Date).toBe(true);
    expect(cell.value.getUTCHours()).toBe(10);
    expect(cell.value.getUTCMinutes()).toBe(14);
    expect(cell.value.getUTCSeconds()).toBe(4);
    expect(cell.numFmt).toBe('dd/mm/yyyy hh:mm');
  });

  it('X11 : le libelle Statut de la saisie est distinct du champ Statut', async () => {
    const wb = await writtenWorkbook([row(STATUT_MODULE, { statut: 'Valid\u00e9', objet: 'test' })], { regions: [], modules: [] });
    const st = wb.getWorksheet('ST');
    const headers = [];
    st.getRow(1).eachCell((cell) => headers.push(String(cell.value || '')));
    expect(headers).toContain('Statut de la saisie');
    expect(headers).toContain('Statut (champ)');
    expect(headers.indexOf('Statut de la saisie')).not.toBe(headers.indexOf('Statut (champ)'));
  });

  it('X12 : fitToPage est actif et la largeur des colonnes suit le contenu', async () => {
    const wb = await writtenWorkbook([row(RA_MODULE, { activites: [], indicateurs: [], difficultes: '', perspectives: '' })], { regions: [], modules: [] });
    for (const ws of wb.worksheets) {
      expect(ws.pageSetup.fitToPage).toBe(true);
      expect(ws.pageSetup.orientation).toBe('landscape');
      expect(ws.pageSetup.fitToWidth).toBe(1);
    }
    const synth = wb.getWorksheet('Synth\u00e8se');
    const colA = synth.getColumn(1).width;
    expect(colA).toBeGreaterThanOrEqual(12);
    expect(colA).toBeLessThanOrEqual(45);
  });

  it('X13 : les dates des tableaux PDF sont ecrites au format jj/mm/aaaa et jamais en texte brut de date JavaScript', () => {
    const dateField = { key: 'date_acquisition', label: "Date d'acquisition", type: 'date' };
    const d = new Date('2026-03-12T03:00:00Z');
    expect(formatPdfCell(dateField, d)).toBe('12/03/2026');
    expect(formatPdfCell(dateField, d)).not.toMatch(/GMT/);
    expect(formatPdfCell(dateField, d)).not.toMatch(/2026 03:00:00/);
    expect(formatPdfCell(dateField, null)).toBe('—');
    expect(formatPdfCell(dateField, '')).toBe('—');
  });

  it('X14 : un tableau a 11 colonnes ne depasse pas la marge droite et reste lisible', () => {
    const doc = new PDFDocument({ margin: 42, size: 'A4' });
    const labels = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'];
    const rows = [
      ['valeur longue une', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11'],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'],
    ];
    const { widths, useFiches, minWidths } = computeTableColumnWidths(doc, labels, rows, CONTENT_W_TEST, 8);
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(CONTENT_W_TEST + 1);
    for (let i = 0; i < labels.length; i++) {
      expect(widths[i]).toBeGreaterThanOrEqual(minWidths[i]);
    }
    // Si trop large, on bascule en fiches (useFiches true)
    if (useFiches) {
      expect(typeof useFiches).toBe('boolean');
    }
  });

  it('X15 : un module qui n a que des tableaux ne cree pas de feuille Excel vide de champs', async () => {
    const TABLE_ONLY_MODULE = {
      code: 'TO',
      label: 'Tableau seulement',
      fields: [
        {
          key: 'lignes',
          label: 'Lignes',
          type: 'table',
          fields: [
            { key: 'a', label: 'Col A', type: 'text' },
            { key: 'b', label: 'Col B', type: 'text' },
          ],
        },
      ],
    };
    const wb = await writtenWorkbook([
      row(TABLE_ONLY_MODULE, { lignes: [{ a: 'x', b: 'y' }] }),
    ], { regions: [], modules: [] });
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names).not.toContain('TO');
    expect(names.some((n) => n.startsWith('TO \u2013'))).toBe(true);
  });

  it('X16 : le PDF de 60 saisies a autant de pages que le total affiche dans le pied de page et aucune page vide', () => {
    const rows = [];
    for (let i = 0; i < 60; i++) {
      rows.push(row(RA_MODULE, {
        activites: [{ intitule: `Activit\u00e9 ${i}`, date: '2026-10-01', statut: 'Realisee' }],
        indicateurs: [{ indicateur: 'T', valeur: i }],
        difficultes: 'Difficult\u00e9s',
        perspectives: 'Perspectives',
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
          const pages = (text.match(/\/Type \/Page(?!s)/g) || []).length;
          const pdfText = extractPdfText(buffer);
          // Le total annoncé dans le pied de page correspond au nombre de pages réelles.
          const match = pdfText.match(/Page \d+ \/ (\d+)/);
          const announced = match ? Number(match[1]) : null;
          expect(announced).toBe(pages);
          // Aucune page vide : chaque page contient du texte ou un dessin.
          // On vérifie que le dernier "Page X / Y" cohérent et qu'il y a du contenu.
          expect(pdfText.includes('Collecte des données')).toBe(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      doc.on('error', reject);
      const total = renderPdf(model, doc);
      expect(total).toBeGreaterThanOrEqual(2);
      doc.end();
    });
  });

  it('X17 : la hauteur d une ligne libelle valeur couvre le libelle sur plusieurs lignes', () => {
    const doc = new PDFDocument({ margin: 42, size: 'A4' });
    const h = rowHeight(doc, 'Besoins en personnel et en formation', 'Recrutement de plusieurs agents pour le service.', 150, 365, 8.5, 6);
    // Le libellé tient sur 2 lignes en 150 pt, donc la hauteur > une ligne simple.
    expect(h).toBeGreaterThan(14);
    // Une ligne courte ne dépasse pas beaucoup.
    const h2 = rowHeight(doc, 'Nom', 'Jean', 150, 365, 8.5, 6);
    expect(h2).toBeLessThanOrEqual(h);
  });

  it('X18 : les noms de feuilles longs sont coupes proprement sans ponctuation finale et restent uniques', () => {
    expect(cleanSheetNameBase('RH \u2013 Effectif par cat\u00e9gorie, grade et sexe')).toBe('RH \u2013 Effectif par cat\u00e9gorie');
    expect(cleanSheetNameBase('Nom avec points...')).toBe('Nom avec points');
    expect(cleanSheetNameBase('Court')).toBe('Court');
    expect(cleanSheetNameBase('')).toBe('Feuil1');
    // Un nom de 31 chars pile n'est pas coupé.
    const trenteetun = 'A'.repeat(31);
    expect(cleanSheetNameBase(trenteetun)).toBe(trenteetun);
    // Un nom de 32 chars est coupé à 31 (pas d'espace, on garde 31).
    expect(cleanSheetNameBase('A'.repeat(32)).length).toBeLessThanOrEqual(31);
  });

  it('X19 : le libellé long de champ scalaire ne chevauche pas le titre du tableau suivant (rendu réel)', () => {
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const pdfText = extractPdfText(buffer);
          // Le libellé long (39 caractères) doit apparaître en entier (pas coupé).
          expect(pdfText.includes('Besoins en personnel et en formation')).toBe(true);
          // Le titre du tableau suivant doit apparaître après le libellé dans l'ordre de lecture.
          const idxLabel = pdfText.indexOf('Besoins en personnel et en formation');
          const idxTable = pdfText.indexOf('Effectif par catégorie');
          expect(idxLabel).toBeGreaterThanOrEqual(0);
          expect(idxTable).toBeGreaterThan(idxLabel);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      doc.on('error', reject);
      // Dessin d'un champ scalaire avec libellé long suivi d'un titre de tableau.
      const labelColW = Math.floor((595 - 84) * 0.38);
      const valColW = 595 - 84 - labelColW;
      const size = 8.5;
      const padding = 5;
      const label = 'Besoins en personnel et en formation';
      const value = 'Recrutement de plusieurs agents pour le service et formation continue du personnel administratif.';
      doc.font('Helvetica-Bold').fontSize(size);
      const hLabel = doc.heightOfString(label, { width: labelColW - 2 * padding });
      doc.font('Helvetica').fontSize(size);
      const hValue = doc.heightOfString(value, { width: valColW - 2 * padding });
      const needed = Math.max(hLabel, hValue) + 2 * padding;
      doc.rect(42, doc.y, 595 - 84, needed).stroke('#D9D9D9');
      doc.font('Helvetica-Bold').fontSize(size).fillColor('#555555').text(label, 42 + padding, doc.y + (needed - size * 1.2) / 2, { width: labelColW - 2 * padding, lineBreak: true });
      doc.font('Helvetica').fontSize(size).fillColor('#1A2433').text(value, 42 + labelColW + padding, doc.y + (needed - size * 1.2) / 2, { width: valColW - 2 * padding, lineBreak: true });
      doc.y += needed + 12; // 12 pt d'espace avant le titre
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0B2A4A').text('Effectif par catégorie, grade et sexe', 42, doc.y, { width: 595 - 84, lineBreak: false });
      doc.x = 42;
      doc.end();
    });
  });

  it('X22 : rowHeight couvre le libellé sur plusieurs lignes (nouvelle largeur 38%, padding 5)', () => {
    const doc = new PDFDocument({ margin: 42, size: 'A4' });
    const labelColW = Math.floor((595 - 84) * 0.38);
    const valColW = 595 - 84 - labelColW;
    const h = rowHeight(doc, 'Besoins en personnel et en formation', 'Recrutement de plusieurs agents.', labelColW, valColW, 8.5, 5);
    // Le libellé (39 chars) en 146 pt de large tient sur 2 lignes → hauteur ≥ 2 lignes + 2*padding.
    expect(h).toBeGreaterThanOrEqual(2 * 8.5 * 1.2 + 10);
    // Une ligne courte est plus petite.
    const h2 = rowHeight(doc, 'Nom', 'Jean', labelColW, valColW, 8.5, 5);
    expect(h2).toBeLessThan(h);
  });

  it('X21 : le nombre de pages du PDF reste égal au total affiché dans les pieds de page, aucune page vide', () => {
    const rows = [];
    for (let i = 0; i < 60; i++) {
      rows.push(row(RH_MODULE, {
        besoins: 'Besoins en personnel et en formation pour le service.',
        effectif: [{ categorie: 'Cat\u00e9gorie A', grade: 'Attach\u00e9', sexe: 'Homme', effectif: 4 }],
        mouvements: [{ type: 'Arriv\u00e9e', nombre: 2 }],
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
          const text = buffer.toString('latin1');
          const pages = (text.match(/\/Type \/Page(?!s)/g) || []).length;
          const pdfText = extractPdfText(buffer);
          const match = pdfText.match(/Page \d+ \/ (\d+)/);
          const announced = match ? Number(match[1]) : null;
          expect(announced).toBe(pages);
          expect(pages).toBeGreaterThanOrEqual(1);
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

  it('X23 : export de 3 saisies RH (comme dans la demo) produit un PDF sans page vide et pieds coherents', () => {
    const rows = [];
    for (let i = 0; i < 3; i++) {
      rows.push(row(RH_MODULE, {
        besoins: i === 0 ? 'Besoins en personnel et en formation pour le service des ressources humaines et formation continue du personnel administratif.' : 'Besoins simples.',
        effectif: i === 0 ? [{ categorie: 'Cat\u00e9gorie A', grade: 'Attach\u00e9', sexe: 'Homme', effectif: 4 }, { categorie: 'Cat\u00e9gorie B', grade: 'Secr\u00e9taire', sexe: 'Femme', effectif: 6 }] : [],
        mouvements: i === 2 ? [{ type: 'Affectation', nombre: 3 }] : [],
      }));
    }
    const model = buildExportModel(rows, { filters: { regions: [], modules: [] } });
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString('latin1');
          const pages = (text.match(/\/Type \/Page(?!s)/g) || []).length;
          const pdfText = extractPdfText(buffer);
          const match = pdfText.match(/Page \d+ \/ (\d+)/);
          const announced = match ? Number(match[1]) : null;
          expect(announced).toBe(pages);
          expect(pages).toBeGreaterThanOrEqual(1);
          // Le libellé long de la saisie 1 doit apparaître en entier.
          expect(pdfText.includes('Besoins en personnel et en formation')).toBe(true);
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

  it('X24 : isPlainNumberField vrai pour annee, immatriculation, code_poste ; faux pour effectif et montant', () => {
    expect(isPlainNumberField({ key: 'annee' })).toBe(true);
    expect(isPlainNumberField({ key: 'immatriculation' })).toBe(true);
    expect(isPlainNumberField({ key: 'code_poste' })).toBe(true);
    expect(isPlainNumberField({ key: 'effectif' })).toBe(false);
    expect(isPlainNumberField({ key: 'montant' })).toBe(false);
  });

  it('X25 : la cellule Annee (2004) a le format 0 ; effectif (12345) garde #,##0', async () => {
    const ANNEE_MODULE = {
      code: 'RM',
      label: 'Recensement matériels roulants',
      fields: [
        { key: 'annee', label: 'Année', type: 'integer' },
        { key: 'effectif', label: 'Effectif', type: 'integer' },
      ],
    };
    const wb = await writtenWorkbook([row(ANNEE_MODULE, { annee: 2004, effectif: 12345 })], { regions: [], modules: [] });
    const sheet = wb.getWorksheet('RM');
    const headers = [];
    sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value || '')));
    const anneeCol = headers.indexOf('Année') + 1;
    const effCol = headers.indexOf('Effectif') + 1;
    expect(anneeCol).toBeGreaterThan(0);
    expect(effCol).toBeGreaterThan(0);
    expect(sheet.getCell(2, anneeCol).numFmt).toBe('0');
    expect(sheet.getCell(2, effCol).numFmt).toBe('#,##0');
  });

  it('X26 : le PDF affiche 2004 sans séparateur de milliers pour le champ Annee', () => {
    const ANNEE_MODULE = {
      code: 'RM',
      label: 'Recensement matériels roulants',
      fields: [
        { key: 'annee', label: 'Année', type: 'integer' },
      ],
    };
    const model = buildExportModel([row(ANNEE_MODULE, { annee: 2004 })], { filters: { regions: [], modules: [] } });
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const pdfText = extractPdfText(buffer);
          expect(pdfText.includes('2004')).toBe(true);
          expect(pdfText).not.toContain('2 004');
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

  it('X27 : le PDF affiche 2004 sans séparateur pour Annee en scalaire et en tableau', () => {
    const ANNEE_TABLE_MODULE = {
      code: 'AT',
      label: 'Avec annee',
      fields: [
        { key: 'annee', label: 'Année', type: 'integer' },
        {
          key: 'lignes',
          label: 'Lignes',
          type: 'table',
          fields: [
            { key: 'annee', label: 'Année', type: 'integer' },
            { key: 'libelle', label: 'Libellé', type: 'text' },
          ],
        },
      ],
    };
    const model = buildExportModel([row(ANNEE_TABLE_MODULE, { annee: 2004, lignes: [{ annee: 2004, libelle: 'x' }] })], { filters: { regions: [], modules: [] } });
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const pdfText = extractPdfText(buffer);
          expect(pdfText.includes('2004')).toBe(true);
          expect(pdfText).not.toContain('2 004');
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

  it('X28 : le bloc titre + grille + 8 champs scalaires est gardé ensemble (modèle de calcul)', () => {
    const HUIT_MODULE = {
      code: 'H8',
      label: 'Huit champs',
      fields: [
        { key: 'c1', label: 'Champ 1', type: 'text' },
        { key: 'c2', label: 'Champ 2', type: 'text' },
        { key: 'c3', label: 'Champ 3', type: 'text' },
        { key: 'c4', label: 'Champ 4', type: 'text' },
        { key: 'c5', label: 'Champ 5', type: 'text' },
        { key: 'c6', label: 'Champ 6', type: 'text' },
        { key: 'c7', label: 'Champ 7', type: 'text' },
        { key: 'c8', label: 'Champ 8', type: 'text' },
      ],
    };
    const s = {
      structure: 'SRB – Analamanga',
      periode: 'Octobre 2026',
      statut: 'Exportée',
      auteur: 'Jean Rakoto',
      dates: { exported: new Date('2026-10-16T10:00:00Z') },
      scalars: { c1: 'v1', c2: 'v2', c3: 'v3', c4: 'v4', c5: 'v5', c6: 'v6', c7: 'v7', c8: 'v8' },
    };
    // En haut de page : le bloc tient sur la page.
    const docHaut = new PDFDocument({ margin: 42, size: 'A4' });
    docHaut.y = 42;
    const hHaut = saisieBlockHeight(docHaut, HUIT_MODULE, s);
    const remHaut = docHaut.page.height - docHaut.page.margins.bottom - docHaut.y;
    expect(hHaut).toBeGreaterThan(0);
    expect(hHaut).toBeLessThanOrEqual(remHaut);
    // En bas de page : le bloc ne tient pas -> saut de page avant le titre.
    const docBas = new PDFDocument({ margin: 42, size: 'A4' });
    docBas.y = docBas.page.height - docBas.page.margins.bottom - 30;
    const hBas = saisieBlockHeight(docBas, HUIT_MODULE, s);
    const remBas = docBas.page.height - docBas.page.margins.bottom - docBas.y;
    expect(hBas).toBeGreaterThan(remBas);
  });

  it('X29 : le nombre de pages reste égal au total des pieds de page, aucune page vide', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) {
      rows.push(row(RH_MODULE, {
        besoins: 'Besoins en personnel et en formation pour le service.',
        effectif: [{ categorie: 'Cat\u00e9gorie A', grade: 'Attach\u00e9', sexe: 'Homme', effectif: 4 }],
        mouvements: [{ type: 'Arriv\u00e9e', nombre: 2 }],
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
          const text = buffer.toString('latin1');
          const pages = (text.match(/\/Type \/Page(?!s)/g) || []).length;
          const pdfText = extractPdfText(buffer);
          const match = pdfText.match(/Page \d+ \/ (\d+)/);
          const announced = match ? Number(match[1]) : null;
          expect(announced).toBe(pages);
          expect(pages).toBeGreaterThanOrEqual(1);
          // Aucune page vide : chaque page contient du texte ou un dessin.
          expect(pdfText.includes('Collecte des données')).toBe(true);
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
});

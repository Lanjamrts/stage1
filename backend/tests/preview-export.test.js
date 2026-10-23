"use strict";

// ETAPE 30 — Aperçu de l'export (développeur uniquement).
// Base dédiée sigbd_test (semencée par `npm test`), jamais la base de dev.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { inflateSync } from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

const { default: app } = await import('../src/server.js');

import Module from '../src/models/Module.js';
import Saisie from '../src/models/Saisie.js';
import Referentiel from '../src/models/Referentiel.js';
import { buildExportModel } from '../src/services/exportModel.js';
import { buildExampleRow } from '../src/services/previewExport.js';
import { renderPdf } from '../src/services/exportPdf.js';
import PDFDocument from 'pdfkit';

const PASSWORD = 'Test@2026';
const agents = {};
let raModule;
let ncaModule;

async function login(im, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password });
  if (res.status !== 200) {
    throw new Error(`login ${im} → ${res.status} : ${JSON.stringify(res.body)}`);
  }
  return agent;
}

const PREVIEW_BANNER = 'APERÇU – DONNÉES D’EXEMPLE';

function modulePayload(mod) {
  return {
    code: mod.code,
    label: mod.label,
    periodicity: mod.periodicity,
    kind: mod.kind,
    structureTypes: mod.structureTypes,
    fields: mod.fields,
  };
}

// Extrait le texte d'un buffer PDF (même approche que export-format.test.js).
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
    try { dec = inflateSync(raw).toString('latin1'); } catch { dec = raw.toString('latin1'); }
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

// Le PDF encode – et ’ en WinAnsi (lu en latin1 comme \u0096 / \u0092).
function normalizePdfText(t) {
  return t.replace(/\u0096/g, '–').replace(/\u0092/g, '’').replace(/\u0097/g, '—');
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  agents.dev = await login('123009'); // développeur
  agents.client = await login('104562'); // client
  agents.admin1 = await login('120344'); // admin1
  agents.admin2 = await login('108231'); // admin2
  agents.consultant = await login('121775'); // consultant
  raModule = await Module.findOne({ code: 'RA' });
  ncaModule = await Module.findOne({ code: 'NCA' });
  expect(raModule).not.toBeNull();
  expect(ncaModule).not.toBeNull();
  // Le référentiel EPN doit être présent (chargé par le seed de démonstration).
  const epnCount = await Referentiel.countDocuments({ type: 'epn' });
  expect(epnCount).toBeGreaterThan(0);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("ETAPE 30 — aperçu de l'export (POST /api/config/modules/preview-export)", () => {
  it('développeur : format pdf → 200, application/pdf, Content-Disposition inline', async () => {
    const res = await agents.dev
      .post('/api/config/modules/preview-export')
      .send({ gabarit: modulePayload(raModule), format: 'pdf' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline');
  });

  it('développeur : format sheets → JSON avec Synthèse et feuille du module', async () => {
    const res = await agents.dev
      .post('/api/config/modules/preview-export')
      .send({ gabarit: modulePayload(raModule), format: 'sheets' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.sheets).toBeInstanceOf(Array);
    const names = res.body.sheets.map((s) => s.name);
    expect(names).toContain('Synthèse');
    expect(names.some((n) => n === 'RA' || n.startsWith('RA'))).toBe(true);
    const synth = res.body.sheets.find((s) => s.name === 'Synthèse');
    expect(synth.columns.length).toBeGreaterThan(0);
    expect(synth.rows.length).toBeGreaterThan(0);
    const modSheet = res.body.sheets.find((s) => s.name === 'RA');
    expect(modSheet).not.toBeUndefined();
    expect(modSheet.columns[0]).toBe('Structure');
    expect(modSheet.columns[1]).toBe('Période / Événement');
    expect(modSheet.columns[2]).toBe('Statut de la saisie');
    expect(modSheet.columns[3]).toBe('Auteur');
    const scalarLabels = raModule.fields.filter((f) => f.type !== 'table').map((f) => f.label);
    for (const lbl of scalarLabels) {
      expect(modSheet.columns).toContain(lbl);
    }
  });

  it('gabarit avec champ table → la feuille du tableau existe avec 3 lignes', async () => {
    const res = await agents.dev
      .post('/api/config/modules/preview-export')
      .send({ gabarit: modulePayload(raModule), format: 'sheets' });
    expect(res.status).toBe(200);
    const tableSheet = res.body.sheets.find((s) => s.name.includes('Activités'));
    expect(tableSheet).not.toBeUndefined();
    expect(tableSheet.rows.length).toBe(3);
    expect(tableSheet.columns).toContain('Intitulé');
    expect(tableSheet.columns).toContain('Date');
    expect(tableSheet.columns).toContain('Statut');
  });

  it('gabarit avec champ source epn → colonnes Ministère de tutelle et Régime présentes et remplies', async () => {
    const res = await agents.dev
      .post('/api/config/modules/preview-export')
      .send({ gabarit: modulePayload(ncaModule), format: 'sheets' });
    expect(res.status).toBe(200);
    const modSheet = res.body.sheets.find((s) => s.name === 'NCA');
    expect(modSheet).not.toBeUndefined();
    expect(modSheet.columns).toContain('Ministère de tutelle');
    expect(modSheet.columns).toContain('Régime');
    const mi = modSheet.columns.indexOf('Ministère de tutelle');
    const ri = modSheet.columns.indexOf('Régime');
    const dataRow = modSheet.rows[modSheet.rows.length - 1];
    expect(dataRow[mi]).toBeTruthy();
    expect(dataRow[ri]).toBeTruthy();
  });

  it('gabarit invalide : clé de champ incorrecte → 400', async () => {
    const res = await agents.dev.post('/api/config/modules/preview-export').send({
      gabarit: {
        code: 'TEST30',
        label: 'Test',
        periodicity: 'monthly',
        kind: 'event',
        structureTypes: ['SRB'],
        fields: [{ key: '1invalide', label: 'X', type: 'text' }],
      },
      format: 'sheets',
    });
    expect(res.status).toBe(400);
  });

  it('gabarit invalide : type de champ inconnu → 400', async () => {
    const res = await agents.dev.post('/api/config/modules/preview-export').send({
      gabarit: {
        code: 'TEST30',
        label: 'Test',
        periodicity: 'monthly',
        kind: 'event',
        structureTypes: ['SRB'],
        fields: [{ key: 'champ', label: 'X', type: 'inconnu' }],
      },
      format: 'sheets',
    });
    expect(res.status).toBe(400);
  });

  it('gabarit invalide : tableau sans sous-champ → 400', async () => {
    const res = await agents.dev.post('/api/config/modules/preview-export').send({
      gabarit: {
        code: 'TEST30',
        label: 'Test',
        periodicity: 'monthly',
        kind: 'event',
        structureTypes: ['SRB'],
        fields: [{ key: 'tab', label: 'Tab', type: 'table', fields: [] }],
      },
      format: 'sheets',
    });
    expect(res.status).toBe(400);
  });

  it('code absent ou vide → 200 (code d’exemple utilisé pour l’aperçu)', async () => {
    for (const format of ['pdf', 'sheets']) {
      const res = await agents.dev.post('/api/config/modules/preview-export').send({
        gabarit: {
          code: '',
          label: 'Sans code',
          periodicity: 'monthly',
          kind: 'event',
          structureTypes: ['SRB'],
          fields: [{ key: 'champ', label: 'Champ', type: 'text' }],
        },
        format,
      });
      expect(res.status).toBe(200, `${format} avec code vide`);
      if (format === 'sheets') {
        expect(res.body.sheets).toBeInstanceOf(Array);
        expect(res.body.sheets.length).toBeGreaterThan(0);
      }
    }
  });

  it('autres rôles ne peuvent pas prévisualiser : 403', async () => {
    const gabarit = modulePayload(raModule);
    for (const [role, agent] of Object.entries(agents)) {
      if (role === 'dev') continue;
      const res = await agent.post('/api/config/modules/preview-export').send({ gabarit, format: 'sheets' });
      expect(res.status).toBe(403);
    }
  });

  it('sans authentification → 401', async () => {
    const res = await request(app)
      .post('/api/config/modules/preview-export')
      .send({ gabarit: modulePayload(raModule), format: 'sheets' });
    expect(res.status).toBe(401);
  });

  it('mention APERÇU – DONNÉES D’EXEMPLE dans le PDF (renderPdf direct) et dans la feuille Synthèse', async () => {
    const epnDocs = await Referentiel.find({ type: 'epn' }).lean();
    const epnDict = {};
    for (const d of epnDocs) epnDict[String(d.value)] = { ministere: d.ministere || '', regime: d.regime || '' };
    const epnValue = epnDocs.length ? epnDocs[0] : null;
    const model = buildExportModel([buildExampleRow(raModule, epnValue)], {
      filters: {}, generatedAt: new Date(), epnDict,
    });
    const chunks = [];
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    doc.on('data', (c) => chunks.push(c));
    const ended = new Promise((resolve) => doc.on('end', resolve));
    renderPdf(model, doc, { preview: true });
    doc.end();
    await ended;
    const buffer = Buffer.concat(chunks);
    const text = normalizePdfText(extractPdfText(buffer));
    expect(text).toContain(PREVIEW_BANNER);

    const res = await agents.dev
      .post('/api/config/modules/preview-export')
      .send({ gabarit: modulePayload(raModule), format: 'sheets' });
    expect(res.status).toBe(200);
    const synth = res.body.sheets.find((s) => s.name === 'Synthèse');
    const flat = synth.rows.flat();
    expect(flat.some((v) => String(v) === PREVIEW_BANNER)).toBe(true);
  });
});

describe('ETAPE 30 — aucune écriture en base', () => {
  it('compte des saisies et modules identique avant et après des prévisualisations', async () => {
    const saisiesAvant = await Saisie.countDocuments();
    const modulesAvant = await Module.countDocuments();

    const gabarit = modulePayload(raModule);
    await agents.dev.post('/api/config/modules/preview-export').send({ gabarit, format: 'pdf' });
    await agents.dev.post('/api/config/modules/preview-export').send({ gabarit, format: 'sheets' });
    await agents.dev.post('/api/config/modules/preview-export').send({
      gabarit: { code: 'X', label: 'X', periodicity: 'monthly', kind: 'event', structureTypes: ['SRB'], fields: [{ key: 'a', label: 'A', type: 'text' }] },
      format: 'sheets',
    });

    const saisiesApres = await Saisie.countDocuments();
    const modulesApres = await Module.countDocuments();
    expect(saisiesApres).toBe(saisiesAvant);
    expect(modulesApres).toBe(modulesAvant);
  });
});

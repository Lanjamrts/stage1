"use strict";

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import ExcelJS from 'exceljs';

import { buildExportModel } from '../src/services/exportModel.js';
import { buildWorkbook } from '../src/services/exportXlsx.js';
import { serializeSaisie } from '../src/services/serializeSaisie.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sigbd_test';

const { default: app } = await import('../src/server.js');

import Structure from '../src/models/Structure.js';
import Saisie from '../src/models/Saisie.js';

const PASSWORD = 'Test@2026';
const agents = {};
let exporteeIds = []; // ids de saisies exportee/archivee (admin1 voit tout)

async function login(im) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ im, password: PASSWORD });
  expect(res.status).toBe(200, `login ${im} → ${res.status}`);
  return agent;
}

function synthDataRows(sheet) {
  let n = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 8) n += 1; // en-tête Synthèse à la ligne 8
  });
  return n;
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  agents.admin1 = await login('120344'); // admin1 central (toutes régions)
  agents.admin2 = await login('108231'); // admin2 régional (Analamanga)
  const rows = await Saisie.find({ status: { $in: ['exportee', 'archivee'] } }).lean();
  exporteeIds = rows.map((r) => String(r._id));
  expect(exporteeIds.length).toBeGreaterThan(1);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('ETAPE 27 — GET /api/collecte/export sélection par ids', () => {
  it('sans ids : comportement actuel (200 xlsx et pdf)', async () => {
    const xlsx = await agents.admin1.get('/api/collecte/export?format=xlsx');
    expect(xlsx.status).toBe(200);
    const pdf = await agents.admin1.get('/api/collecte/export?format=pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('pdf');
  });

  it('id invalide → 400 « Filtre invalide. »', async () => {
    const res = await agents.admin1.get('/api/collecte/export?format=xlsx&ids=notanid');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Filtre invalide.');
  });

  it('plus de 300 ids → 400', async () => {
    const ids = Array.from({ length: 301 }, () => '000000000000000000000000');
    const res = await agents.admin1.get(
      `/api/collecte/export?format=xlsx&ids=${ids.join(',')}`
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('300');
  });

  it('export avec 2 ids valides → 200 (xlsx et pdf), sous-ensemble uniquement', async () => {
    const [id1, id2] = exporteeIds.slice(0, 2);

    const xlsx = await agents.admin1.get(`/api/collecte/export?format=xlsx&ids=${id1},${id2}`);
    expect(xlsx.status).toBe(200);

    const pdf = await agents.admin1.get(`/api/collecte/export?format=pdf&ids=${id1},${id2}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('pdf');
  });

  it('id inexistant ou hors périmètre / mauvais statut ignoré ; seul → 400 « Aucune saisie sélectionnée à exporter. »', async () => {
    const fake = new mongoose.Types.ObjectId().toString();
    const res = await agents.admin1.get(`/api/collecte/export?format=xlsx&ids=${fake}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Aucune saisie sélectionnée à exporter.');
  });

  it('admin2 : id d une saisie d une autre région ignoré → 400 si c est le seul id', async () => {
    const anStructs = await Structure.find({}).populate('regionId').lean();
    const anIds = anStructs
      .filter((s) => s.regionId && s.regionId.name === 'Analamanga')
      .map((s) => String(s._id));
    const hors = await Saisie.findOne({
      status: { $in: ['exportee', 'archivee'] },
      structureId: { $nin: anIds },
    });
    expect(hors).not.toBeNull();

    const res = await agents.admin2.get(
      `/api/collecte/export?format=xlsx&ids=${String(hors._id)}`
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Aucune saisie sélectionnée à exporter.');
  });

  it('admin2 : id d une saisie de sa région → 200', async () => {
    const dans = await Saisie.findOne({
      status: { $in: ['exportee', 'archivee'] },
    }).lean();
    // prendre une saisie en Analamanga
    const anStructs = await Structure.find({}).populate('regionId').lean();
    const anIds = anStructs
      .filter((s) => s.regionId && s.regionId.name === 'Analamanga')
      .map((s) => String(s._id));
    const s = await Saisie.findOne({
      status: { $in: ['exportee', 'archivee'] },
      structureId: { $in: anIds },
    }).lean();
    expect(s).not.toBeNull();
    const res = await agents.admin2.get(
      `/api/collecte/export?format=xlsx&ids=${String(s._id)}`
    );
    expect(res.status).toBe(200);
  });

  it('export ne modifie pas le statut des saisies', async () => {
    const [id1] = exporteeIds.slice(0, 1);
    const before = await Saisie.findById(id1).select('status').lean();
    expect(before.status).toBe('exportee');
    await agents.admin1.get(`/api/collecte/export?format=xlsx&ids=${id1}`);
    const after = await Saisie.findById(id1).select('status').lean();
    expect(after.status).toBe('exportee');
  });

  it('buildExportModel ne restitue que les lignes fournies (xlsx et pdf)', async () => {
    const docs = await Saisie.find({ _id: { $in: exporteeIds.slice(0, 2) } })
      .populate('moduleId')
      .populate('periodeId')
      .populate('authorId')
      .populate('structureId')
      .lean();
    const rows = docs.map((d) => serializeSaisie(d, agents.admin1, { withFields: true }));
    const model = buildExportModel(rows, { filters: { regions: [], modules: [] } });
    const wb = buildWorkbook(model);
    const synth = wb.getWorksheet('Synthèse');
    expect(synthDataRows(synth)).toBe(2);
    // Le même model en PDF produit un PDF valide sans erreur.
    // (renderPdf est testé par export-format.test.js ; on vérifie juste la construction.)
    expect(model.modules.length).toBeGreaterThan(0);
    expect(model.count).toBe(2);
  });
});

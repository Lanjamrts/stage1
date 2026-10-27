"use strict";
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { renderPdf } from '../src/services/exportPdf.js';
import { buildExportModel } from '../src/services/exportModel.js';

const ASSETS = join(__dirname, '..', 'assets');
const PUBLIC = join(__dirname, '..', '..', 'frontend', 'public');

function pdfBuffer(model) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    renderPdf(model, doc);
    doc.end();
  });
}

describe('Step 31 — nouveau logo', () => {
  it('backend/assets/icon.png existe (logo du PDF)', () => {
    expect(existsSync(join(ASSETS, 'icon.png'))).toBe(true);
  });

  it('aucun fichier emblem* dans backend/assets ni frontend/public', () => {
    for (const dir of [ASSETS, PUBLIC]) {
      for (const name of readdirSync(dir)) {
        expect(name.toLowerCase().startsWith('emblem')).toBe(false);
      }
    }
  });

  it('renderPdf s execute sans erreur avec le nouveau logo', async () => {
    const rows = [
      {
        structureLabel: 'SRB – Analamanga',
        moduleCode: 'RA',
        moduleLabel: 'Rapport d’activités',
        authorLabel: 'Jean Rakoto',
        statusLabel: 'Exportée',
        periodeLabel: 'Octobre 2026',
        dates: { created: new Date('2026-10-16T08:00:00Z'), submitted: new Date('2026-10-16T09:00:00Z'), exported: new Date('2026-10-16T10:00:00Z') },
        values: {},
      },
    ];
    const model = buildExportModel(rows, { filters: { regions: ['Analamanga'], modules: [] } });
    const buffer = await pdfBuffer(model);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    const pages = (buffer.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length;
    expect(pages).toBeGreaterThanOrEqual(1);
  });
});

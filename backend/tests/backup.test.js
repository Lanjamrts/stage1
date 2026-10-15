"use strict";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const URI = 'mongodb://127.0.0.1:27017/sigbd_backupcheck';
const TEMP_BACKUP_DIR = join(tmpdir(), 'sigbd-backup-test-' + Date.now());

function runScript(script, args = [], extraEnv = {}) {
  const result = spawnSync('node', [script, ...args], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: URI,
      JWT_SECRET: 'a'.repeat(40),
      BACKUP_DIR: TEMP_BACKUP_DIR,
      ...extraEnv
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function hasMongoTools() {
  const dump = spawnSync('mongodump', ['--version'], { encoding: 'utf8' });
  const restore = spawnSync('mongorestore', ['--version'], { encoding: 'utf8' });
  return dump.status === 0 && restore.status === 0;
}

const skipIfNoTools = hasMongoTools() ? describe : describe.skip;

skipIfNoTools('Scripts de sauvegarde et restauration', { timeout: 60000 }, () => {
  let mongooseConnected = false;

  async function ensureConnected() {
    if (!mongooseConnected || mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        try { await mongoose.disconnect(); } catch { /* ignore */ }
      }
      await mongoose.connect(URI);
      mongooseConnected = true;
    }
  }

  beforeAll(async () => {
    await ensureConnected();
    await mongoose.connection.dropDatabase();
    mkdirSync(TEMP_BACKUP_DIR, { recursive: true });
  });

  afterAll(async () => {
    await ensureConnected();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (existsSync(TEMP_BACKUP_DIR)) rmSync(TEMP_BACKUP_DIR, { recursive: true, force: true });
    // Clean up restorecheck db
    const cleanupUri = 'mongodb://127.0.0.1:27017/sigbd_backupcheck_restorecheck';
    try {
      await mongoose.connect(cleanupUri);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    } catch {
      // ignore
    }
  });

  beforeEach(async () => {
    await ensureConnected();
    await mongoose.connection.dropDatabase();
    // Insert test data
    const db = mongoose.connection.db;
    await db.collection('test_coll1').insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]);
    await db.collection('test_coll2').insertMany([{ b: 'x' }, { b: 'y' }]);
  });

  it('B1 : backup cree une archive non vide et refuse d ecraser un fichier existant', async () => {
    const r1 = runScript('src/scripts/backup.js');
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('Sauvegarde créée');

    const files = readdirSync(TEMP_BACKUP_DIR).filter(f => f.endsWith('.archive.gz'));
    expect(files.length).toBe(1);
    const filePath = join(TEMP_BACKUP_DIR, files[0]);

    // Try to overwrite
    const r2 = runScript('src/scripts/backup.js', ['--output', filePath]);
    expect(r2.status).toBe(1);
    expect(r2.stderr + r2.stdout).toContain('existe déjà');
  });

  it('B2 : restore sans --yes en mode non interactif est refuse', async () => {
    // First create a backup
    const r1 = runScript('src/scripts/backup.js');
    expect(r1.status).toBe(0);
    const files = readdirSync(TEMP_BACKUP_DIR).filter(f => f.endsWith('.archive.gz'));
    const filePath = join(TEMP_BACKUP_DIR, files[0]);

    // Try restore without --yes (stdin closed)
    const r2 = runScript('src/scripts/restore.js', [filePath]);
    expect(r2.status).toBe(1);
    expect(r2.stderr + r2.stdout).toContain('Terminal non interactif');
  });

  it('B3 : restore remet les collections supprimees avec le meme nombre de documents', async () => {
    // Create backup
    const r1 = runScript('src/scripts/backup.js');
    expect(r1.status).toBe(0);
    const files = readdirSync(TEMP_BACKUP_DIR).filter(f => f.endsWith('.archive.gz'));
    const filePath = join(TEMP_BACKUP_DIR, files[0]);

    // Delete collections
    await mongoose.connection.db.collection('test_coll1').deleteMany({});
    await mongoose.connection.db.collection('test_coll2').deleteMany({});

    // Restore with --yes
    const r2 = runScript('src/scripts/restore.js', [filePath, '--yes']);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('Restauration terminée');

    const count1 = await mongoose.connection.db.collection('test_coll1').countDocuments();
    const count2 = await mongoose.connection.db.collection('test_coll2').countDocuments();
    expect(count1).toBe(3);
    expect(count2).toBe(2);
  });

  it('B4 : backup:verify confirme la restauration et supprime la base temporaire', async () => {
    // Create backup
    const r1 = runScript('src/scripts/backup.js');
    expect(r1.status).toBe(0);
    const files = readdirSync(TEMP_BACKUP_DIR).filter(f => f.endsWith('.archive.gz'));
    const filePath = join(TEMP_BACKUP_DIR, files[0]);

    // Verify
    const r2 = runScript('src/scripts/verify-backup.js', [filePath]);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('Restauration vérifiée');

    // Ensure temp db is dropped
    const checkUri = 'mongodb://127.0.0.1:27017/sigbd_backupcheck_restorecheck';
    let tempExists = false;
    try {
      await mongoose.connect(checkUri);
      await mongoose.connection.db.listCollections().toArray();
      tempExists = true;
      await mongoose.disconnect();
    } catch {
      tempExists = false;
    }
    expect(tempExists).toBe(false);
  });

  it('B5 : restore est refuse en production sans --allow-production', async () => {
    const r1 = runScript('src/scripts/backup.js');
    expect(r1.status).toBe(0);
    const files = readdirSync(TEMP_BACKUP_DIR).filter(f => f.endsWith('.archive.gz'));
    const filePath = join(TEMP_BACKUP_DIR, files[0]);

    const r2 = runScript('src/scripts/restore.js', [filePath, '--yes'], { NODE_ENV: 'production' });
    expect(r2.status).toBe(1);
    expect(r2.stderr + r2.stdout).toContain('interdite en production');
  });

  it('B6 : backup:verify detecte un ecart quand la base a change apres la sauvegarde', async () => {
    // Create backup
    const r1 = runScript('src/scripts/backup.js');
    expect(r1.status).toBe(0);
    const files = readdirSync(TEMP_BACKUP_DIR).filter(f => f.endsWith('.archive.gz'));
    const filePath = join(TEMP_BACKUP_DIR, files[0]);

    // Add a document after backup
    await mongoose.connection.db.collection('test_coll1').insertOne({ a: 4 });

    // Verify should detect the difference
    const r2 = runScript('src/scripts/verify-backup.js', [filePath]);
    expect(r2.status).toBe(1);
    expect(r2.stdout).toContain('ÉCART');

    // Clean up temp db
    const checkUri = 'mongodb://127.0.0.1:27017/sigbd_backupcheck_restorecheck';
    let tempExists = false;
    try {
      await mongoose.connect(checkUri);
      await mongoose.connection.db.listCollections().toArray();
      tempExists = true;
      await mongoose.disconnect();
    } catch {
      tempExists = false;
    }
    expect(tempExists).toBe(false);
  });
});
"use strict";

import { loadConfig } from '../config.js';
import { mkdirSync, existsSync, statSync, chmodSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..', '..');

export function getDbName() {
  const config = loadConfig();
  const uri = config.MONGODB_URI;
  const match = uri.match(/\/([^/?]+)(\?.*)?$/);
  if (!match || !match[1]) {
    throw new Error('MONGODB_URI ne contient pas de nom de base de données.');
  }
  return match[1];
}

export function getBackupDir() {
  const backupDir = process.env.BACKUP_DIR || join(ROOT, 'backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  } else {
    try {
      chmodSync(backupDir, 0o700);
    } catch {
      // ignore
    }
  }

  // Migrate old backend/backups if it exists
  const oldBackupDir = join(ROOT, 'backend', 'backups');
  if (existsSync(oldBackupDir)) {
    const files = readdirSync(oldBackupDir);
    for (const file of files) {
      if (file.endsWith('.archive.gz') || file.endsWith('.archive')) {
        const oldPath = join(oldBackupDir, file);
        const newPath = join(backupDir, file);
        try {
          renameSync(oldPath, newPath);
        } catch {
          // ignore if already exists or other error
        }
      }
    }
    try {
      rmdirSync(oldBackupDir);
    } catch {
      // ignore if not empty or other error
    }
  }

  return backupDir;
}

export function checkMongoTools() {
  const dump = spawnSync('mongodump', ['--version'], { encoding: 'utf8' });
  const restore = spawnSync('mongorestore', ['--version'], { encoding: 'utf8' });
  if (dump.status !== 0 || restore.status !== 0) {
    console.error('Les outils MongoDB Database Tools (mongodump, mongorestore) sont introuvables. Installez-les puis réessayez.');
    process.exit(1);
  }
}

export function getConfigUri() {
  return loadConfig().MONGODB_URI;
}

export function getConfigUriWithoutDb() {
  const uri = loadConfig().MONGODB_URI;
  return uri.replace(/\/[^/?]+(\?.*)?$/, '/$1');
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function runCommand(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10, shell: false });
  return result;
}

export { ROOT };
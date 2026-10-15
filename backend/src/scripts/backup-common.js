"use strict";

import { loadConfig } from '../config.js';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');

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
    const st = statSync(backupDir);
    if ((st.mode & 0o777) !== 0o700) {
      try {
        // Best effort: try to tighten
        // Note: chmodSync may not work on all platforms
      } catch {
        // ignore
      }
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
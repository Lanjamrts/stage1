#!/usr/bin/env node
"use strict";

import { parseArgs } from 'node:util';
import { URL } from 'node:url';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    url: { type: 'string', default: 'http://localhost:4000' },
    duration: { type: 'string', default: '20' },
    concurrency: { type: 'string', default: '5' },
    'p95-max': { type: 'string' }
  },
  strict: true,
  allowPositionals: true
});

const baseUrl = values.url;
const durationSec = parseInt(values.duration, 10);
const concurrency = parseInt(values.concurrency, 10);
const p95Max = values['p95-max'] ? parseInt(values['p95-max'], 10) : null;

try {
  const url = new URL(baseUrl);
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    console.error('L\'hôte doit être localhost ou 127.0.0.1 pour des raisons de sécurité.');
    process.exit(1);
  }
  if (url.protocol !== 'http:') {
    console.error('Seul http est supporté.');
    process.exit(1);
  }
} catch {
  console.error('URL invalide.');
  process.exit(1);
}

const accounts = [
  { im: '104562', role: 'client', password: 'Test@2026' },
  { im: '108231', role: 'admin2', password: 'Test@2026' },
  { im: '120344', role: 'admin1', password: 'Test@2026' },
  { im: '123009', role: 'developpeur', password: 'Test@2026' },
  { im: '121775', role: 'consultant', password: 'Test@2026' }
];

const routes = [
  { path: '/api/modules', method: 'GET', roles: ['client', 'admin1', 'admin2', 'developpeur', 'consultant'] },
  { path: '/api/saisies', method: 'GET', roles: ['client', 'admin1', 'admin2', 'consultant'] },
  { path: '/api/dashboard', method: 'GET', roles: ['admin1', 'consultant'] },
  { path: '/api/collecte', method: 'GET', roles: ['admin1', 'admin2'] }
];

const cookies = new Map();
const MAX_REQUESTS_PER_ACCOUNT = 1000;
const requestCounts = new Map();

async function login(account) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ im: account.im, password: account.password }),
    credentials: 'include'
  });
  if (!res.ok) {
    throw new Error(`Échec de connexion pour ${account.im} (${account.role}) : ${res.status}`);
  }
  const cookieHeader = res.headers.get('set-cookie');
  if (!cookieHeader) {
    throw new Error('Pas de cookie de session reçu');
  }
  const tokenMatch = cookieHeader.match(/token=([^;]+)/);
  if (!tokenMatch) {
    throw new Error('Cookie token non trouvé');
  }
  cookies.set(account.im, tokenMatch[1]);
  requestCounts.set(account.im, 0);
}

async function makeRequest(account, route) {
  const cookie = cookies.get(account.im);
  if (!cookie) return { ok: false, status: 0, latency: 0 };

  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}${route.path}`, {
      method: route.method,
      headers: { 'Cookie': `token=${cookie}` },
      credentials: 'include'
    });
    const latency = performance.now() - start;
    return { ok: res.ok, status: res.status, latency, route: route.path };
  } catch (err) {
    const latency = performance.now() - start;
    return { ok: false, status: 0, latency, route: route.path, error: err.message };
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function run() {
  console.log(`Test de charge : ${baseUrl}`);
  console.log(`Durée : ${durationSec}s, Concurrence : ${concurrency}`);
  console.log('');

  for (const acc of accounts) {
    try {
      await login(acc);
      console.log(`Connecté : ${acc.im} (${acc.role})`);
    } catch (err) {
      console.error(`Échec de connexion initiale pour ${acc.im} : ${err.message}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Démarrage du test...');

  const startTime = Date.now();
  const endTime = startTime + durationSec * 1000;
  const results = [];
  const errors = [];
  const rateLimited = [];

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() < endTime) {
      for (const account of accounts) {
        if (Date.now() >= endTime) break;
        if ((requestCounts.get(account.im) || 0) >= MAX_REQUESTS_PER_ACCOUNT) continue;

        const allowedRoutes = routes.filter(r => r.roles.includes(account.role));
        if (allowedRoutes.length === 0) continue;

        const route = allowedRoutes[Math.floor(Math.random() * allowedRoutes.length)];
        const result = await makeRequest(account, route);

        requestCounts.set(account.im, (requestCounts.get(account.im) || 0) + 1);
        results.push(result);

        if (!result.ok) {
          if (result.status === 429) rateLimited.push(result);
          errors.push(result);
        }
      }
    }
  });

  await Promise.all(workers);

  const totalTime = (Date.now() - startTime) / 1000;
  const totalReq = results.length;
  const errorCount = errors.length;
  const rateLimitedCount = rateLimited.length;

  const allLatencies = results.map(r => r.latency);
  const p50 = percentile(allLatencies, 50);
  const p95 = percentile(allLatencies, 95);
  const p99 = percentile(allLatencies, 99);

  console.log('');
  console.log('=== RÉSULTATS ===');
  console.log(`Durée réelle : ${totalTime.toFixed(1)}s`);
  console.log(`Requêtes totales : ${totalReq}`);
  console.log(`Taux d'erreur : ${totalReq > 0 ? ((errorCount / totalReq) * 100).toFixed(2) : 0}%`);
  console.log(`Réponses 429 : ${rateLimitedCount}`);
  console.log(`Latence globale : p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms`);
  console.log('');

  for (const route of routes) {
    const routeResults = results.filter(r => r.route === route.path);
    if (routeResults.length === 0) continue;
    const lats = routeResults.map(r => r.latency);
    const errs = routeResults.filter(r => !r.ok).length;
    console.log(`${route.path} : ${routeResults.length} req, p50=${percentile(lats, 50).toFixed(1)}ms p95=${percentile(lats, 95).toFixed(1)}ms p99=${percentile(lats, 99).toFixed(1)}ms, erreurs=${errs}`);
  }

  if (p95Max !== null && p95 > p95Max) {
    console.log(`\nÉCHEC : p95 global (${p95.toFixed(1)}ms) > seuil (${p95Max}ms)`);
    process.exit(1);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
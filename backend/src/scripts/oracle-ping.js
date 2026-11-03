#!/usr/bin/env node
"use strict";

import { pingOracle, closeOracle } from '../db/oracle.js';

async function main() {
  try {
    const result = await pingOracle();
    console.log(`Oracle OK — version ${result.version} — service ${result.service}`);
    process.exit(0);
  } catch (err) {
    console.error(err && err.message ? String(err.message) : 'Erreur Oracle inconnue.');
    await closeOracle();
    process.exit(1);
  } finally {
    await closeOracle();
  }
}

main();

#!/usr/bin/env node
"use strict";

import { pingOracle, closeOracle, messageErreurOracle } from '../db/oracle.js';

const verbose = process.argv.includes('--verbose') || process.env.DEBUG_ORACLE === '1';

async function main() {
  let code = 0;
  try {
    const result = await pingOracle();
    console.log(`Oracle OK — version ${result.version} — service ${result.service}`);
  } catch (err) {
    code = 1;
    if (verbose && err && err.stack) console.error(String(err.stack));
    console.error(`Échec Oracle : ${messageErreurOracle(err)}`);
  } finally {
    try {
      await closeOracle();
    } catch {
      /* pool déjà fermé */
    }
  }
  process.exit(code);
}

main();

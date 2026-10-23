"use strict";

import { ensureEpnReference } from '../seed/common.js';

function parseArg(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const epnPath = parseArg('epn');
  const ministeresPath = parseArg('ministeres');

  const res = await ensureEpnReference({ apply: APPLY, epnPath, ministeresPath });
  if (!res.success) {
    process.exit(1);
  }
  if (res.dryRun) {
    process.exit(0);
  }

  console.log(`Ministeres : ${res.created.ministeres} cree(s), ${res.existing.ministeres} deja present(s)`);
  console.log(`EPN : ${res.created.epns} cree(s), ${res.existing.epns} deja present(s)`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});

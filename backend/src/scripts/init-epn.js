"use strict";

import { pathToFileURL } from 'node:url';

import { ensureEpnReference } from '../seed/common.js';
import { fermerBase } from './connexion.js';

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
  if (!res.success) return 1;
  if (res.dryRun) return 0;

  console.log(`Ministeres : ${res.created.ministeres} cree(s), ${res.existing.ministeres} deja present(s)`);
  console.log(`EPN : ${res.created.epns} cree(s), ${res.existing.epns} deja present(s)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(async (code) => {
      // Aucune sortie avant la fermeture : le pool et MongoDB sont refermes
      // puis le code est rendu au systeme.
      await fermerBase();
      process.exit(code);
    })
    .catch(async (err) => {
      console.error('Erreur:', err);
      await fermerBase().catch(() => {});
      process.exit(1);
    });
}

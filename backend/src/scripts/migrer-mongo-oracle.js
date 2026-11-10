"use strict";

// Étape 42 : migration des données MongoDB → Oracle.
// - Source : MongoDB en LECTURE SEULE (find().lean()), jamais d'écriture ni
//   de suppression. Connexion sur MONGODB_URI de loadConfig().
// - Cible : modules *Oracle.js importés directement (CORE_STORE reste « mongo »
//   pendant la migration : getXxxRepository() basculerait sur Mongo).
// - DRY-RUN par défaut (plan + anomalies, aucune écriture) ; --apply écrit puis
//   vérifie ligne à ligne et sort en 1 au moindre écart.
// - Cible obligatoirement vide, références orphelines et doublons refusés.
// - Aucun identifiant de connexion ni mot de passe dans les journaux.

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import { loadConfig } from '../config.js';
import { nomOracle, fermerBase } from './connexion.js';

import Profil from '../models/Profil.js';
import Region from '../models/Region.js';
import Structure from '../models/Structure.js';
import Utilisateur from '../models/Utilisateur.js';
import Periode from '../models/Periode.js';
import ModuleSigbd from '../models/Module.js';
import Saisie from '../models/Saisie.js';
import Remarque from '../models/Remarque.js';
import Referentiel from '../models/Referentiel.js';
import JournalAudit from '../models/JournalAudit.js';

import * as profilOracle from '../repositories/profilOracle.js';
import * as regionOracle from '../repositories/regionOracle.js';
import * as structureOracle from '../repositories/structureOracle.js';
import * as periodeOracle from '../repositories/periodeOracle.js';
import * as moduleOracle from '../repositories/moduleOracle.js';
import * as referentielOracle from '../repositories/referentielOracle.js';
import * as utilisateurOracle from '../repositories/utilisateurOracle.js';
import * as saisieOracle from '../repositories/saisieOracle.js';
import * as remarqueOracle from '../repositories/remarqueOracle.js';
import * as auditOracle from '../repositories/auditOracle.js';

// Entités de la migration, dans l'ordre d'écriture (clés étrangères) et de
// comptage. `table` est une constante (jamais de texte venant des données).
export const ENTITES = [
  { cle: 'profils', table: 'PROFIL', libelle: 'profils' },
  { cle: 'regions', table: 'REGION', libelle: 'regions' },
  { cle: 'structures', table: 'STRUCTURE', libelle: 'structures' },
  { cle: 'periodes', table: 'PERIODE', libelle: 'periodes' },
  { cle: 'modules', table: 'MODULE_SIGBD', libelle: 'modules' },
  { cle: 'periodicites', table: 'MODULE_PERIODICITE', libelle: 'periodicites' },
  { cle: 'typesStructure', table: 'MODULE_TYPE_STRUCTURE', libelle: 'types structure' },
  { cle: 'referentiels', table: 'REFERENTIEL', libelle: 'referentiels' },
  { cle: 'utilisateurs', table: 'UTILISATEUR', libelle: 'utilisateurs' },
  { cle: 'saisies', table: 'SAISIE', libelle: 'saisies' },
  { cle: 'validations', table: 'SAISIE_VALIDATION', libelle: 'validations' },
  { cle: 'remarques', table: 'REMARQUE', libelle: 'remarques' },
  { cle: 'journalAudit', table: 'JOURNAL_AUDIT', libelle: "journal d'audit" },
];

// Libellés des phases d'écriture (message d'échec en cours d'écriture).
const PHASES = [
  'profils',
  'regions',
  'structures',
  'periodes',
  'modules',
  'referentiels',
  'utilisateurs',
  'saisies',
  'remarques',
  "journal d'audit",
];

// ---------------------------------------------------------------------------
// Fonctions pures (testables sans base)
// ---------------------------------------------------------------------------

// Remplace un identifiant ancien par le nouveau quand la table le contient ;
// absent de la table → conservé tel quel (les orphelins sont refusés avant).
export function remplacerRef(valeur, table) {
  if (valeur === undefined) return undefined;
  if (valeur === null) return null;
  const cle = String(valeur);
  return table.has(cle) ? table.get(cle) : cle;
}

// Identifiant présent (non null) remplacé, absent/undefined conservés tels
// quels (une référence peut être absente du document source).
function remplacerRefPresente(doc, champ, table) {
  if (doc[champ] !== undefined && doc[champ] !== null) {
    return { [champ]: remplacerRef(doc[champ], table) };
  }
  return {};
}

export function remplacerRefsStructure(doc, tables) {
  return { ...doc, ...remplacerRefPresente(doc, 'regionId', tables.regions) };
}

export function remplacerRefsUtilisateur(doc, tables) {
  return {
    ...doc,
    structureId: remplacerRef(doc.structureId, tables.structures),
  };
}

export function remplacerRefsSaisie(doc, tables) {
  const sortie = {
    ...doc,
    structureId: remplacerRef(doc.structureId, tables.structures),
    moduleId: remplacerRef(doc.moduleId, tables.modules),
    authorId: remplacerRef(doc.authorId, tables.utilisateurs),
    ...remplacerRefPresente(doc, 'periodeId', tables.periodes),
  };
  if (Array.isArray(doc.validations)) {
    sortie.validations = doc.validations.map((validation) =>
      validation.actorId === undefined || validation.actorId === null
        ? validation
        : { ...validation, actorId: remplacerRef(validation.actorId, tables.utilisateurs) }
    );
  }
  return sortie;
}

export function remplacerRefsRemarque(doc, tables) {
  return { ...doc, authorId: remplacerRef(doc.authorId, tables.utilisateurs) };
}

// Journal d'audit : userRef remappé seulement s'il vaut un ancien _id connu
// (IM, « unknown »… conservés) ; objet « saisie:<id> » / « utilisateur:<id> »
// remappé seulement si l'id est connu (autres préfixes conservés).
export function remapperAuditEntree(entree, tables) {
  const sortie = { ...entree };
  let remplacee = false;

  if (entree.userId !== undefined && entree.userId !== null) {
    const cle = String(entree.userId);
    if (tables.utilisateurs.has(cle)) {
      sortie.userId = tables.utilisateurs.get(cle);
      remplacee = true;
    }
  }

  const correspondance = /^(saisie|utilisateur):(.+)$/.exec(entree.object || '');
  if (correspondance) {
    const prefixe = correspondance[1];
    const ancienId = correspondance[2];
    const table = prefixe === 'saisie' ? tables.saisies : tables.utilisateurs;
    if (table.has(ancienId)) {
      sortie.object = `${prefixe}:${table.get(ancienId)}`;
      remplacee = true;
    }
  }

  return { entree: sortie, remplacee };
}

function idsDe(docs) {
  return new Set(docs.map((doc) => String(doc._id)));
}

// Références qui pointent vers un _id absent de la source : refusées avant
// toute écriture (elles échoueraient de toute façon sur les FK Oracle).
export function detecterOrphelins(source) {
  const regions = idsDe(source.regions);
  const structures = idsDe(source.structures);
  const periodes = idsDe(source.periodes);
  const modules = idsDe(source.modules);
  const utilisateurs = idsDe(source.utilisateurs);
  const problemes = [];

  const structuresOrphelines = source.structures.filter(
    (s) => s.regionId !== undefined && s.regionId !== null && !regions.has(String(s.regionId))
  ).length;
  if (structuresOrphelines > 0) {
    problemes.push(`${structuresOrphelines} structure(s) orpheline(s) : region absente de la source`);
  }

  const utilisateursOrphelins = source.utilisateurs.filter(
    (u) => u.structureId === undefined || u.structureId === null || !structures.has(String(u.structureId))
  ).length;
  if (utilisateursOrphelins > 0) {
    problemes.push(`${utilisateursOrphelins} utilisateur(s) orphelin(s) : structure absente de la source`);
  }

  const comptesSaisies = { structure: 0, module: 0, periode: 0, auteur: 0 };
  let validationsOrphelines = 0;
  for (const saisie of source.saisies) {
    if (!structures.has(String(saisie.structureId))) comptesSaisies.structure++;
    if (!modules.has(String(saisie.moduleId))) comptesSaisies.module++;
    if (saisie.periodeId !== undefined && saisie.periodeId !== null && !periodes.has(String(saisie.periodeId))) {
      comptesSaisies.periode++;
    }
    if (!utilisateurs.has(String(saisie.authorId))) comptesSaisies.auteur++;
    for (const validation of saisie.validations || []) {
      if (validation.actorId !== undefined && validation.actorId !== null && !utilisateurs.has(String(validation.actorId))) {
        validationsOrphelines++;
      }
    }
  }
  const libellesSaisies = {
    structure: 'structure',
    module: 'module',
    periode: 'periode',
    auteur: 'auteur',
  };
  for (const [cle, libelle] of Object.entries(libellesSaisies)) {
    if (comptesSaisies[cle] > 0) {
      problemes.push(`${comptesSaisies[cle]} saisie(s) orpheline(s) : reference ${libelle} absente de la source`);
    }
  }
  if (validationsOrphelines > 0) {
    problemes.push(`${validationsOrphelines} validation(s) orpheline(s) : acteur absent de la source`);
  }

  const remarquesOrphelines = source.remarques.filter(
    (r) => r.authorId === undefined || r.authorId === null || !utilisateurs.has(String(r.authorId))
  ).length;
  if (remarquesOrphelines > 0) {
    problemes.push(`${remarquesOrphelines} remarque(s) orpheline(s) : auteur absent de la source`);
  }

  return problemes;
}

function compterParCle(docs, cle) {
  const comptes = new Map();
  for (const doc of docs) {
    const key = cle(doc);
    comptes.set(key, (comptes.get(key) || 0) + 1);
  }
  return comptes;
}

function messagesDoublons(libelle, comptes, formater) {
  const messages = [];
  for (const [cle, nombre] of comptes) {
    if (nombre > 1) messages.push(`${libelle} en double : ${formater(cle)} (${nombre} occurrences)`);
  }
  return messages;
}

function formatDateUTC(valeur) {
  return new Date(valeur).toISOString().slice(0, 10);
}

// Violations d'unicité de la cible Oracle déjà présentes dans la source
// (codes, IM, labels, clés uniques de période et de saisie).
export function detecterDoublons(source) {
  const messages = [];

  messages.push(
    ...messagesDoublons('Profil', compterParCle(source.profils, (p) => String(p.code)), (c) => `code "${c}"`)
  );
  messages.push(
    ...messagesDoublons('Region', compterParCle(source.regions, (r) => String(r.name)), (c) => `name "${c}"`)
  );
  messages.push(
    ...messagesDoublons('Structure', compterParCle(source.structures, (s) => String(s.code)), (c) => `code "${c}"`)
  );
  messages.push(
    ...messagesDoublons('Utilisateur', compterParCle(source.utilisateurs, (u) => String(u.im)), (c) => `IM "${c}"`)
  );
  messages.push(
    ...messagesDoublons('Module', compterParCle(source.modules, (m) => String(m.code)), (c) => `code "${c}"`)
  );
  messages.push(
    ...messagesDoublons(
      'Referentiel',
      compterParCle(source.referentiels, (r) => `${r.type}|${r.value}`),
      (c) => `type/valeur "${c.replace('|', '" / "')}"`
    )
  );
  messages.push(
    ...messagesDoublons(
      'Periode',
      compterParCle(source.periodes, (p) => `${p.periodicity}|${new Date(p.start).getTime()}`),
      (c) => {
        const [periodicity, start] = c.split('|');
        return `periodicity "${periodicity}" start ${formatDateUTC(Number(start))}`;
      }
    )
  );
  // L'index unique de SAISIE ne concerne que les saisies de période renseignée
  // (les saisies d'événement sans période ne sont jamais en conflit).
  messages.push(
    ...messagesDoublons(
      'Saisie',
      compterParCle(
        source.saisies.filter((s) => s.periodeId !== undefined && s.periodeId !== null),
        (s) => `${s.structureId}|${s.moduleId}|${s.periodeId}`
      ),
      () => 'meme association structure/module/periode'
    )
  );

  // Les deux tableaux enfants sont dedup() a l'ecriture : un doublon interne
  // ferait un ecart de comptes (periodicites / types structure) plus tard.
  for (const module of source.modules) {
    messages.push(
      ...messagesDoublons(
        `Module ${module.code} periodicites`,
        compterParCle(module.allowedPeriodicities || [], (v) => String(v)),
        (c) => `"${c}"`
      )
    );
    messages.push(
      ...messagesDoublons(
        `Module ${module.code} types structure`,
        compterParCle(module.structureTypes || [], (v) => String(v)),
        (c) => `"${c}"`
      )
    );
  }

  return messages;
}

export function compterSource(source) {
  const comptes = {};
  for (const { cle } of ENTITES) comptes[cle] = 0;
  comptes.profils = source.profils.length;
  comptes.regions = source.regions.length;
  comptes.structures = source.structures.length;
  comptes.periodes = source.periodes.length;
  comptes.modules = source.modules.length;
  comptes.periodicites = source.modules.reduce(
    (n, m) => n + (Array.isArray(m.allowedPeriodicities) ? m.allowedPeriodicities.length : 0),
    0
  );
  comptes.typesStructure = source.modules.reduce(
    (n, m) => n + (Array.isArray(m.structureTypes) ? m.structureTypes.length : 0),
    0
  );
  comptes.referentiels = source.referentiels.length;
  comptes.utilisateurs = source.utilisateurs.length;
  comptes.saisies = source.saisies.length;
  comptes.validations = source.saisies.reduce(
    (n, s) => n + (Array.isArray(s.validations) ? s.validations.length : 0),
    0
  );
  comptes.remarques = source.remarques.length;
  comptes.journalAudit = source.audit.length;
  return comptes;
}

// Nom de la base source affiché, déduit de MONGODB_URI (jamais d'identifiant).
export function nomBaseSource(config = loadConfig()) {
  try {
    return new URL(config.MONGODB_URI).pathname.replace('/', '') || '(inconnue)';
  } catch {
    return '(inconnue)';
  }
}

function messageCibleNonVide(tables, config) {
  const liste = tables.join(', ');
  if (config.NODE_ENV === 'production') {
    return (
      `Cible Oracle non vide (${liste}) : en production, « npm run oracle:schema -- --reset » est interdit, ` +
      'utilisez une cible neuve.'
    );
  }
  return (
    `Cible Oracle non vide (${liste}) : recreez le schema avec « npm run oracle:schema -- --reset » ` +
    'avant de relancer la migration.'
  );
}

// ---------------------------------------------------------------------------
// Lecture source (MongoDB, lecture seule) et comptage cible (Oracle)
// ---------------------------------------------------------------------------

function parIdCroissant(docs) {
  return [...docs].sort((a, b) => {
    const ga = String(a._id);
    const gb = String(b._id);
    return ga < gb ? -1 : ga > gb ? 1 : 0;
  });
}

export async function lireSource() {
  const [profils, regions, structures, periodes, modules, referentiels, utilisateurs, saisies, remarques, audit] =
    await Promise.all([
      Profil.find().lean(),
      Region.find().lean(),
      Structure.find().lean(),
      Periode.find().lean(),
      ModuleSigbd.find().lean(),
      Referentiel.find().lean(),
      Utilisateur.find().lean(),
      Saisie.find().lean(),
      Remarque.find().lean(),
      JournalAudit.find().lean(),
    ]);

  // Le journal part dans l'ordre chronologique (createdAt, puis _id).
  const chronologique = [...audit].sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    if (da !== db) return da - db;
    return String(a._id) < String(b._id) ? -1 : String(a._id) > String(b._id) ? 1 : 0;
  });

  return {
    profils: parIdCroissant(profils),
    regions: parIdCroissant(regions),
    structures: parIdCroissant(structures),
    periodes: parIdCroissant(periodes),
    modules: parIdCroissant(modules),
    referentiels: parIdCroissant(referentiels),
    utilisateurs: parIdCroissant(utilisateurs),
    saisies: parIdCroissant(saisies),
    remarques: parIdCroissant(remarques),
    audit: chronologique,
  };
}

// Comptage de la cible : COUNT(*) par table, noms de table en constantes
// (aucun texte venant des données dans le SQL).
export async function compterCible() {
  const { getKnex } = await import('../db/oracle.js');
  const db = await getKnex();
  const comptes = {};
  for (const { cle, table } of ENTITES) {
    const resultat = await db.raw(`SELECT COUNT(*) AS N FROM ${table}`);
    const lignes = resultat.rows || resultat;
    comptes[cle] = Number(lignes[0].N ?? lignes[0].n ?? 0);
  }
  return comptes;
}

// ---------------------------------------------------------------------------
// Écriture cible (modules Oracle, ordre des clés étrangères)
// ---------------------------------------------------------------------------

async function phase(nom, fonction) {
  try {
    return await fonction();
  } catch (err) {
    const erreur = err instanceof Error ? err : new Error(String(err));
    erreur.phase = nom;
    throw erreur;
  }
}

async function ecrireSource(source, tables) {
  await phase(PHASES[0], async () => {
    for (const profil of source.profils) {
      await profilOracle.assurer(
        {
          code: profil.code,
          label: profil.label,
          createdAt: profil.createdAt,
          updatedAt: profil.updatedAt,
        },
        { conserverDates: true }
      );
    }
  });

  await phase(PHASES[1], async () => {
    const lignes = await regionOracle.insererPlusieurs(
      source.regions.map((region) => ({
        name: region.name,
        createdAt: region.createdAt,
        updatedAt: region.updatedAt,
      })),
      { conserverDates: true }
    );
    lignes.forEach((ligne, index) => {
      tables.regions.set(String(source.regions[index]._id), ligne._id);
    });
  });

  await phase(PHASES[2], async () => {
    const lignes = await structureOracle.insererPlusieurs(
      source.structures.map((structure) => {
        const doc = remplacerRefsStructure(structure, tables);
        return {
          code: doc.code,
          label: doc.label,
          type: doc.type,
          regionId: doc.regionId ?? null,
          active: doc.active,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      }),
      { conserverDates: true }
    );
    lignes.forEach((ligne, index) => {
      tables.structures.set(String(source.structures[index]._id), ligne._id);
    });
  });

  await phase(PHASES[3], async () => {
    const lignes = await periodeOracle.insererPlusieurs(
      source.periodes.map((periode) => ({
        label: periode.label,
        start: periode.start,
        end: periode.end,
        deadline: periode.deadline,
        periodicity: periode.periodicity,
        createdAt: periode.createdAt,
        updatedAt: periode.updatedAt,
      })),
      { conserverDates: true }
    );
    lignes.forEach((ligne, index) => {
      tables.periodes.set(String(source.periodes[index]._id), ligne._id);
    });
  });

  await phase(PHASES[4], async () => {
    for (const module of source.modules) {
      const ligne = await moduleOracle.creer(
        {
          code: module.code,
          label: module.label,
          periodicity: module.periodicity,
          allowedPeriodicities: module.allowedPeriodicities,
          kind: module.kind,
          structureTypes: module.structureTypes,
          version: module.version,
          active: module.active,
          fields: module.fields,
          createdAt: module.createdAt,
          updatedAt: module.updatedAt,
        },
        { conserverDates: true }
      );
      tables.modules.set(String(module._id), ligne._id);
    }
  });

  await phase(PHASES[5], async () => {
    await referentielOracle.insererPlusieurs(
      source.referentiels.map((referentiel) => ({
        type: referentiel.type,
        value: referentiel.value,
        ministere: referentiel.ministere,
        regime: referentiel.regime,
        acronyme: referentiel.acronyme,
        createdAt: referentiel.createdAt,
        updatedAt: referentiel.updatedAt,
      })),
      { conserverDates: true }
    );
  });

  await phase(PHASES[6], async () => {
    for (const utilisateur of source.utilisateurs) {
      const ligne = await utilisateurOracle.creer(remplacerRefsUtilisateur(utilisateur, tables), {
        conserverDates: true,
      });
      tables.utilisateurs.set(String(utilisateur._id), ligne._id);
    }
  });

  await phase(PHASES[7], async () => {
    const lignes =
      (await saisieOracle.insererPlusieurs(
        source.saisies.map((saisie) => remplacerRefsSaisie(saisie, tables)),
        { conserverDates: true }
      )) || [];
    lignes.forEach((ligne, index) => {
      tables.saisies.set(String(source.saisies[index]._id), ligne._id);
    });
  });

  await phase(PHASES[8], async () => {
    for (const remarque of source.remarques) {
      const ligne = await remarqueOracle.creer(remplacerRefsRemarque(remarque, tables), {
        conserverDates: true,
      });
      tables.remarques.set(String(remarque._id), ligne._id);
    }
  });

  await phase(PHASES[9], async () => {
    let remappes = 0;
    for (const entree of source.audit) {
      const { entree: ligne, remplacee } = remapperAuditEntree(entree, tables);
      if (remplacee) remappes++;
      await auditOracle.ajouter({
        userRef: ligne.userId,
        action: ligne.action,
        objet: ligne.object,
        ip: ligne.ip,
        createdAt: ligne.createdAt,
      });
    }
    const conservees = source.audit.length - remappes;
    console.log(`Journal d'audit : ${remappes} entree(s) remappee(s), ${conservees} conservee(s) telles quelles.`);
  });
}

// ---------------------------------------------------------------------------
// Vérification après --apply
// ---------------------------------------------------------------------------

function memesDates(a, b) {
  const videA = a === undefined || a === null;
  const videB = b === undefined || b === null;
  if (videA || videB) return videA && videB;
  return new Date(a).getTime() === new Date(b).getTime();
}

function triAlphabetique(valeurs) {
  return [...(valeurs || [])].sort();
}

export async function verifierMigration(source, tables) {
  const comptesSource = compterSource(source);
  const comptesCible = await compterCible();
  const ecarts = [];
  const lignes = [];

  const noter = (libelle, ok, detail) => {
    lignes.push({ libelle, ok, detail });
    if (!ok) ecarts.push(detail ? `${libelle} : ${detail}` : libelle);
  };

  // (1) mêmes nombres de lignes source / cible pour chaque entité.
  for (const { cle, libelle } of ENTITES) {
    const attendu = comptesSource[cle];
    const obtenu = comptesCible[cle];
    noter(`comptes ${libelle}`, attendu === obtenu, `${attendu}/${obtenu}`);
  }

  // (2) profils : code présent en cible, label identique.
  for (const profil of source.profils) {
    const cible = await profilOracle.trouverParCode(profil.code);
    const problemes = [];
    if (!cible) problemes.push('absent de la cible');
    else if (cible.label !== profil.label) problemes.push('label different');
    noter(`profil ${profil.code}`, problemes.length === 0, problemes.join(', '));
  }

  // (3) régions : nom identique, dates conservées.
  const regionsCible = new Map((await regionOracle.lister()).map((r) => [r.name, r]));
  source.regions.forEach((region) => {
    const cible = regionsCible.get(region.name);
    const problemes = [];
    if (!cible) {
      problemes.push('absente de la cible');
    } else {
      if (!memesDates(cible.createdAt, region.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, region.updatedAt)) problemes.push('updatedAt differente');
    }
    noter(`region ${region.name}`, problemes.length === 0, problemes.join(', '));
  });

  // (4) structures : code, label, type, région remappée, actif, dates.
  const structuresCible = new Map((await structureOracle.lister()).map((s) => [s._id, s]));
  source.structures.forEach((structure) => {
    const problemes = [];
    const nouveauId = tables.structures.get(String(structure._id));
    const cible = nouveauId ? structuresCible.get(nouveauId) : null;
    if (!cible) {
      problemes.push('absente de la cible');
    } else {
      if (cible.code !== structure.code) problemes.push('code different');
      if (cible.label !== structure.label) problemes.push('label different');
      if (cible.type !== structure.type) problemes.push('type different');
      const regionAttendue =
        structure.regionId === undefined || structure.regionId === null
          ? null
          : tables.regions.get(String(structure.regionId));
      if ((cible.regionId ?? null) !== (regionAttendue ?? null)) problemes.push('regionId non resolu');
      if (Boolean(cible.active) !== Boolean(structure.active ?? true)) problemes.push('active different');
      if (!memesDates(cible.createdAt, structure.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, structure.updatedAt)) problemes.push('updatedAt differente');
    }
    noter(`structure ${structure.code}`, problemes.length === 0, problemes.join(', '));
  });

  // (5) périodes : libellé, dates, périodicité, dates de création.
  const periodesCible = new Map((await periodeOracle.lister()).map((p) => [p._id, p]));
  source.periodes.forEach((periode) => {
    const problemes = [];
    const nouveauId = tables.periodes.get(String(periode._id));
    const cible = nouveauId ? periodesCible.get(nouveauId) : null;
    if (!cible) {
      problemes.push('absente de la cible');
    } else {
      if (cible.label !== periode.label) problemes.push('label different');
      if (!memesDates(cible.start, periode.start)) problemes.push('start differente');
      if (!memesDates(cible.end, periode.end)) problemes.push('end differente');
      if (!memesDates(cible.deadline, periode.deadline)) problemes.push('deadline differente');
      if (cible.periodicity !== periode.periodicity) problemes.push('periodicity differente');
      if (!memesDates(cible.createdAt, periode.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, periode.updatedAt)) problemes.push('updatedAt differente');
    }
    noter(`periode ${periode.label}`, problemes.length === 0, problemes.join(', '));
  });

  // (6) modules : fields, périodicités et types de structure.
  const modulesCible = new Map((await moduleOracle.lister()).map((m) => [m._id, m]));
  source.modules.forEach((module) => {
    const problemes = [];
    const nouveauId = tables.modules.get(String(module._id));
    const cible = nouveauId ? modulesCible.get(nouveauId) : null;
    if (!cible) {
      problemes.push('absent de la cible');
    } else {
      if (JSON.stringify(cible.fields) !== JSON.stringify(module.fields)) problemes.push('fields differents');
      if (JSON.stringify(triAlphabetique(cible.allowedPeriodicities)) !== JSON.stringify(triAlphabetique(module.allowedPeriodicities))) {
        problemes.push('allowedPeriodicities differentes');
      }
      if (JSON.stringify(triAlphabetique(cible.structureTypes)) !== JSON.stringify(triAlphabetique(module.structureTypes))) {
        problemes.push('structureTypes differents');
      }
      if (cible.code !== module.code) problemes.push('code different');
      if (cible.label !== module.label) problemes.push('label different');
      if (cible.periodicity !== module.periodicity) problemes.push('periodicity differente');
      if (cible.kind !== module.kind) problemes.push('kind different');
      if (Number(cible.version) !== Number(module.version)) problemes.push('version differente');
      if (Boolean(cible.active) !== Boolean(module.active ?? true)) problemes.push('active different');
      if (!memesDates(cible.createdAt, module.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, module.updatedAt)) problemes.push('updatedAt differente');
    }
    noter(`module ${module.code}`, problemes.length === 0, problemes.join(', '));
  });

  // (7) référentiels : type/valeur présents, attributs identiques.
  const referentielsCible = new Map();
  for (const type of new Set(source.referentiels.map((r) => r.type))) {
    for (const ligne of await referentielOracle.lister(type)) {
      referentielsCible.set(`${ligne.type}|${ligne.value}`, ligne);
    }
  }
  source.referentiels.forEach((referentiel) => {
    const cible = referentielsCible.get(`${referentiel.type}|${referentiel.value}`);
    const problemes = [];
    if (!cible) {
      problemes.push('absent de la cible');
    } else {
      if ((cible.ministere ?? '') !== (referentiel.ministere ?? '')) problemes.push('ministere different');
      if ((cible.regime ?? '') !== (referentiel.regime ?? '')) problemes.push('regime different');
      if ((cible.acronyme ?? '') !== (referentiel.acronyme ?? '')) problemes.push('acronyme different');
    }
    noter(`referentiel ${referentiel.type}/${referentiel.value}`, problemes.length === 0, problemes.join(', '));
  });

  // (8) tous les utilisateurs : im, rôle, structure et dates.
  // listerParIds serait filtré par estIdValide (CORE_STORE=mongo pendant la
  // migration) : on charge par rôle, enum fermée des cinq rôles.
  const roles = ['client', 'admin2', 'admin1', 'developpeur', 'consultant'];
  const utilisateursCible = new Map(
    (await Promise.all(roles.map((role) => utilisateurOracle.listerParRole(role))))
      .flat()
      .map((u) => [u._id, u])
  );
  source.utilisateurs.forEach((utilisateur) => {
    const problemes = [];
    const nouveauId = tables.utilisateurs.get(String(utilisateur._id));
    const cible = nouveauId ? utilisateursCible.get(nouveauId) : null;
    if (!cible) {
      problemes.push('absent de la cible');
    } else {
      if (cible.im !== utilisateur.im) problemes.push('im different');
      if (cible.role !== utilisateur.role) problemes.push('role different');
      const structureAttendue = tables.structures.get(String(utilisateur.structureId));
      if (cible.structureId !== structureAttendue) problemes.push('structure differente');
      else if (!structuresCible.has(cible.structureId)) problemes.push('structure inexistante en cible');
      if (!memesDates(cible.createdAt, utilisateur.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, utilisateur.updatedAt)) problemes.push('updatedAt differente');
    }
    noter(`utilisateur ${utilisateur.im}`, problemes.length === 0, problemes.join(', '));
  });

  // (9) chaque saisie : values, status, dates, validations, références.
  const saisiesCible = new Map((await saisieOracle.lister()).map((s) => [s._id, s]));
  source.saisies.forEach((saisie, index) => {
    const problemes = [];
    const nouveauId = tables.saisies.get(String(saisie._id));
    const cible = nouveauId ? saisiesCible.get(nouveauId) : null;
    if (!cible) {
      problemes.push('absente de la cible');
    } else {
      if (JSON.stringify(cible.values) !== JSON.stringify(saisie.values)) problemes.push('values differentes');
      if (cible.status !== saisie.status) problemes.push('status different');
      if (Number(cible.moduleVersion) !== Number(saisie.moduleVersion)) problemes.push('moduleVersion differente');
      const datesSource = saisie.dates || {};
      const datesCible = cible.dates || {};
      if (!memesDates(datesCible.created, datesSource.created)) problemes.push('dates.created differente');
      if (!memesDates(datesCible.submitted, datesSource.submitted)) problemes.push('dates.submitted differente');
      if (!memesDates(datesCible.exported, datesSource.exported)) problemes.push('dates.exported differente');
      if (!memesDates(cible.eventDate, saisie.eventDate)) problemes.push('eventDate differente');
      if (!memesDates(cible.createdAt, saisie.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, saisie.updatedAt)) problemes.push('updatedAt differente');

      const validationsSource = saisie.validations || [];
      const validationsCible = cible.validations || [];
      if (validationsCible.length !== validationsSource.length) {
        problemes.push(`validations ${validationsSource.length}/${validationsCible.length}`);
      } else {
        validationsSource.forEach((validation, i) => {
          const autre = validationsCible[i];
          if (autre.decision !== validation.decision) problemes.push(`validation ${i + 1} : decision differente`);
          if ((autre.motif ?? null) !== (validation.motif ?? null)) problemes.push(`validation ${i + 1} : motif different`);
          if ((autre.actorLabel ?? null) !== (validation.actorLabel ?? null)) {
            problemes.push(`validation ${i + 1} : actorLabel different`);
          }
          if (!memesDates(autre.date, validation.date)) problemes.push(`validation ${i + 1} : date differente`);
          const acteurAttendu =
            validation.actorId === undefined || validation.actorId === null
              ? null
              : tables.utilisateurs.get(String(validation.actorId));
          if ((autre.actorId ?? null) !== (acteurAttendu ?? null)) {
            problemes.push(`validation ${i + 1} : acteur non resolu`);
          }
        });
      }

      const structureAttendue = tables.structures.get(String(saisie.structureId));
      if (cible.structureId !== structureAttendue) problemes.push('structureId non resolu');
      else if (!structuresCible.has(cible.structureId)) problemes.push('structure inexistante en cible');

      const moduleAttendu = tables.modules.get(String(saisie.moduleId));
      if (cible.moduleId !== moduleAttendu) problemes.push('moduleId non resolu');
      else if (!modulesCible.has(cible.moduleId)) problemes.push('module inexistant en cible');

      const auteurAttendu = tables.utilisateurs.get(String(saisie.authorId));
      if (cible.authorId !== auteurAttendu) problemes.push('authorId non resolu');
      else if (!utilisateursCible.has(cible.authorId)) problemes.push('auteur inexistant en cible');

      if (saisie.periodeId === undefined || saisie.periodeId === null) {
        if (cible.periodeId !== null) problemes.push('periodeId devrait etre absent');
      } else {
        const periodeAttendue = tables.periodes.get(String(saisie.periodeId));
        if (cible.periodeId !== periodeAttendue) problemes.push('periodeId non resolu');
        else if (!periodesCible.has(cible.periodeId)) problemes.push('periode inexistante en cible');
      }
    }
    noter(`saisie ${index + 1}`, problemes.length === 0, problemes.join(', '));
  });

  // (10) remarques : auteur remappé, texte/état/dates identiques.
  const remarquesCible = new Map((await remarqueOracle.lister()).map((r) => [r._id, r]));
  source.remarques.forEach((remarque, index) => {
    const problemes = [];
    const nouveauId = tables.remarques.get(String(remarque._id));
    const cible = nouveauId ? remarquesCible.get(nouveauId) : null;
    if (!cible) {
      problemes.push('absente de la cible');
    } else {
      const auteurAttendu = tables.utilisateurs.get(String(remarque.authorId));
      if (cible.authorId !== auteurAttendu) problemes.push('authorId non resolu');
      else if (!utilisateursCible.has(cible.authorId)) problemes.push('auteur inexistant en cible');
      if (cible.context !== remarque.context) problemes.push('context different');
      if (cible.text !== remarque.text) problemes.push('text different');
      if (cible.state !== remarque.state) problemes.push('state different');
      if (!memesDates(cible.createdAt, remarque.createdAt)) problemes.push('createdAt differente');
      if (!memesDates(cible.updatedAt, remarque.updatedAt)) problemes.push('updatedAt differente');
    }
    noter(`remarque ${index + 1}`, problemes.length === 0, problemes.join(', '));
  });

  // (11) journal d'audit : tout est relu (DESC) puis inversé → ordre
  // chronologique = ordre source, comparaison ligne à ligne après remappage.
  const totalAudit = comptesSource.journalAudit;
  const auditCible =
    totalAudit > 0
      ? (await auditOracle.lister({ limit: totalAudit, page: 1 })).lignes.reverse()
      : [];
  if (totalAudit !== auditCible.length) {
    noter('audit', false, `${totalAudit}/${auditCible.length}`);
  } else {
    source.audit.forEach((entree, index) => {
      const problemes = [];
      const { entree: attendue } = remapperAuditEntree(entree, tables);
      const cible = auditCible[index];
      if (!cible) {
        problemes.push('absente de la cible');
      } else {
        if ((cible.userRef ?? null) !== (attendue.userId ?? null)) problemes.push('userRef different');
        if (cible.action !== attendue.action) problemes.push('action differente');
        if ((cible.objet ?? null) !== (attendue.object ?? null)) problemes.push('objet different');
        if ((cible.ip ?? null) !== (attendue.ip ?? null)) problemes.push('ip different');
        if (!memesDates(cible.createdAt, attendue.createdAt)) problemes.push('createdAt differente');
      }
      noter(`audit ${index + 1}`, problemes.length === 0, problemes.join(', '));
    });
  }

  return { lignes, ecarts };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

let sourceOuverteParScript = false;

// MongoDB connectée sur MONGODB_URI de loadConfig() si personne ne l'a ouverte.
async function assurerSource() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(loadConfig().MONGODB_URI);
    sourceOuverteParScript = true;
  }
}

// Fermeture avant toute sortie du script : Mongo ouverte ici (si besoin),
// puis fermerBase() (pool Oracle, sans effet si rien n'est ouvert).
export async function fermerMigration() {
  try {
    if (sourceOuverteParScript) {
      sourceOuverteParScript = false;
      if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    }
  } finally {
    await fermerBase();
  }
}

export async function executerMigration({ apply = false } = {}) {
  const config = loadConfig();
  await assurerSource();

  const source = await lireSource();
  const comptes = compterSource(source);
  const comptesCible = await compterCible();

  console.log(`Base source : ${nomBaseSource(config)}`);
  console.log(`Base cible : ${nomOracle(config)}`);
  console.log('Plan de migration MongoDB -> Oracle :');
  for (const { cle, libelle } of ENTITES) {
    console.log(`  ${libelle.padEnd(17)} : ${comptes[cle]}`);
  }

  const anomalies = [];
  const tablesNonVides = ENTITES.filter(({ cle }) => comptesCible[cle] > 0).map(({ table }) => table);
  if (tablesNonVides.length > 0) anomalies.push(messageCibleNonVide(tablesNonVides, config));
  anomalies.push(...detecterOrphelins(source));
  anomalies.push(...detecterDoublons(source));

  if (anomalies.length > 0) {
    console.log('Anomalies :');
    for (const anomalie of anomalies) console.log(`  - ${anomalie}`);
    return { code: 1, anomalies };
  }
  console.log('Anomalies : aucune.');

  if (!apply) {
    console.log('DRY-RUN : aucune donnee ecrite. Relancez avec --apply pour ecrire.');
    return { code: 0, anomalies: [] };
  }

  const tables = {
    regions: new Map(),
    structures: new Map(),
    periodes: new Map(),
    modules: new Map(),
    utilisateurs: new Map(),
    saisies: new Map(),
    remarques: new Map(),
  };

  try {
    await ecrireSource(source, tables);
  } catch (err) {
    const entite = err.phase || 'inconnue';
    console.error(`Echec lors de l'ecriture des ${entite} : ${err.message}`);
    console.error(
      'Ne retentez rien : recreez le schema (« npm run oracle:schema -- --reset ») ou utilisez une cible neuve ' +
        'en production, puis relancez la migration.'
    );
    return { code: 1, entite };
  }

  const { lignes, ecarts } = await verifierMigration(source, tables);
  console.log('Verification :');
  for (const ligne of lignes) {
    console.log(`  ${ligne.libelle} : ${ligne.ok ? 'OK' : `ECART${ligne.detail ? ` (${ligne.detail})` : ''}`}`);
  }
  if (ecarts.length === 0) {
    console.log('Verification terminee : aucun ecart.');
    return { code: 0, ecarts: [] };
  }
  console.log(`Verification terminee : ${ecarts.length} ecart(s).`);
  return { code: 1, ecarts };
}

// ---------------------------------------------------------------------------
// Ligne de commande
// ---------------------------------------------------------------------------

export function parseArgs(args = process.argv.slice(2)) {
  const options = { apply: false };
  const erreurs = [];
  for (const arg of args) {
    if (arg === '--apply') options.apply = true;
    else erreurs.push(`Option inconnue : ${arg}`);
  }
  return { ...options, erreurs };
}

async function main() {
  const { apply, erreurs } = parseArgs();
  if (erreurs.length > 0) {
    for (const erreur of erreurs) console.error(erreur);
    console.error('');
    console.error('Usage : node src/scripts/migrer-mongo-oracle.js [--apply]');
    await fermerMigration();
    return 1;
  }

  let code = 1;
  try {
    const resultat = await executerMigration({ apply });
    code = resultat.code;
  } catch (err) {
    console.error('Erreur de migration:', err && err.message ? err.message : err);
    code = 1;
  }
  await fermerMigration();
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('Erreur de migration:', err && err.message ? err.message : err);
      fermerMigration().finally(() => process.exit(1));
    }
  );
}

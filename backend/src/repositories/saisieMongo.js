"use strict";

// Saisies sur MongoDB : documents lean tels quels (l'_id et les références
// restent des ObjectId), avec deux normalisations de lecture :
// - chaque entrée de `validations` est réduite à ses 5 clés (decision,
//   motif, actorId, actorLabel, date) sans le sous-_id Mongoose, actorId
//   converti en chaîne (voir DECISIONS.md [P40]) ;
// - avec { avecLiens: true }, authorId est remplacé par l'utilisateur SANS
//   passwordHash (les autres liens sont l'objet complet du dépôt).

import Saisie from '../models/Saisie.js';
import { estIdValide } from './ids.js';
import { erreurDoublonSi } from './doublon.js';

// Liste blanche des champs modifiables par mettreAJour : tout autre champ
// lève une Error explicite avant toute écriture.
const CHAMPS_MODIFIABLES = new Set(['values', 'status', 'moduleVersion', 'dates']);

const CLES_DATES = ['created', 'submitted', 'exported'];

function verifierChamps(champs) {
  const inconnus = Object.keys(champs).filter((cle) => !CHAMPS_MODIFIABLES.has(cle));
  if (inconnus.length > 0) {
    throw new Error(`Champ non modifiable : ${inconnus.join(', ')}`);
  }
}

// Normalisation d'une entrée d'historique : 5 clés toujours présentes,
// actorId en chaîne (ObjectId lean → String), null quand absent.
function normaliserValidation(entree) {
  return {
    decision: entree.decision,
    motif: entree.motif == null ? null : entree.motif,
    actorId: entree.actorId == null ? null : String(entree.actorId),
    actorLabel: entree.actorLabel == null ? null : entree.actorLabel,
    date: entree.date,
  };
}

// Mongoose minimise les objets vides : values {} n'est jamais écrit dans la
// base, donc complété à la lecture pour garder la même forme qu'Oracle.
function normaliserSaisie(doc) {
  if (!doc) return doc;
  return {
    ...doc,
    values: doc.values === undefined || doc.values === null ? {} : doc.values,
    validations: (doc.validations || []).map(normaliserValidation),
  };
}

// L'utilisateur lié ne doit jamais exposer passwordHash (ni en Mongo ni en
// Oracle) : le champ est retiré de l'objet peuplé.
function sansPasswordHash(utilisateur) {
  if (!utilisateur || typeof utilisateur !== 'object') return utilisateur;
  if (!('passwordHash' in utilisateur)) return utilisateur;
  const { passwordHash, ...reste } = utilisateur;
  return reste;
}

// Toute saisie retournée passe par ici : liens peuplés si demandés. Avec
// liens, periodeId est toujours présent (null pour une saisie d'événement),
// comme côté Oracle ; sans liens, il reste absent du document (comme lean()).
function postLecture(doc, avecLiens) {
  if (!doc) return doc;
  const saisie = normaliserSaisie(doc);
  if (avecLiens) {
    if (saisie.periodeId === undefined || saisie.periodeId === null) {
      saisie.periodeId = null;
    }
    if (saisie.authorId && typeof saisie.authorId === 'object') {
      saisie.authorId = sansPasswordHash(saisie.authorId);
    }
  }
  return saisie;
}

function normaliserIds(liste) {
  if (!Array.isArray(liste)) return null;
  return [...new Set(liste.filter((id) => estIdValide(id)))];
}

// Filtres combinés en ET ; toute liste fournie mais vide (ou composée
// uniquement d'ids invalides) → aucune ligne (cohérent avec $in: []).
function construireFiltre({ statuts, structureIds, moduleId, moduleIds, periodeId, ids } = {}) {
  const clauses = [];
  if (Array.isArray(statuts)) {
    if (statuts.length === 0) return { vide: true, filtre: {} };
    clauses.push({ status: { $in: statuts } });
  }
  if (Array.isArray(structureIds)) {
    const valides = normaliserIds(structureIds);
    if (valides.length === 0) return { vide: true, filtre: {} };
    clauses.push({ structureId: { $in: valides } });
  }
  if (moduleId !== undefined && moduleId !== null) {
    if (!estIdValide(moduleId)) return { vide: true, filtre: {} };
    clauses.push({ moduleId });
  }
  if (Array.isArray(moduleIds)) {
    const valides = normaliserIds(moduleIds);
    if (valides.length === 0) return { vide: true, filtre: {} };
    clauses.push({ moduleId: { $in: valides } });
  }
  if (periodeId !== undefined && periodeId !== null) {
    if (!estIdValide(periodeId)) return { vide: true, filtre: {} };
    clauses.push({ periodeId });
  }
  if (Array.isArray(ids)) {
    const valides = normaliserIds(ids);
    if (valides.length === 0) return { vide: true, filtre: {} };
    clauses.push({ _id: { $in: valides } });
  }
  if (clauses.length === 0) return { vide: false, filtre: {} };
  return { vide: false, filtre: clauses.length === 1 ? clauses[0] : { $and: clauses } };
}

// Tri : 'majDesc' (défaut) = updatedAt décroissant puis id décroissant ;
// 'structureMajAsc' = structureId croissant (ObjectId = ordre de création)
// puis updatedAt croissant. Toute autre valeur → défaut.
function triDe(tri) {
  return tri === 'structureMajAsc' ? { structureId: 1, updatedAt: 1 } : { updatedAt: -1, _id: -1 };
}

function remplirLiens(requete) {
  return requete
    .populate('structureId')
    .populate('moduleId')
    .populate('periodeId')
    .populate('authorId');
}

// Préparation de `creer` / `insererPlusieurs` : valeurs par défaut, et
// periodeId null/undefined retiré du document (l'index unique partiel ne
// s'applique qu'aux documents qui ont le champ : deux saisies d'événement
// sans période restent possibles, comme aujourd'hui).
function preparer(doc) {
  const prepare = {
    ...doc,
    status: doc.status === undefined || doc.status === null ? 'brouillon' : doc.status,
    values: doc.values === undefined || doc.values === null ? {} : doc.values,
    dates: { created: new Date(), submitted: null, exported: null, ...(doc.dates || {}) },
  };
  if (prepare.periodeId === undefined || prepare.periodeId === null) {
    delete prepare.periodeId;
  }
  return prepare;
}

export async function trouverParId(id, options = {}) {
  if (!estIdValide(id)) return null;
  let requete = Saisie.findById(id);
  if (options.avecLiens) requete = remplirLiens(requete);
  const doc = await requete.lean();
  return postLecture(doc, options.avecLiens === true);
}

export async function trouverParCle({ structureId, moduleId, periodeId } = {}) {
  const filtre = {};
  if (structureId !== undefined && structureId !== null) {
    if (!estIdValide(structureId)) return null;
    filtre.structureId = structureId;
  }
  if (moduleId !== undefined && moduleId !== null) {
    if (!estIdValide(moduleId)) return null;
    filtre.moduleId = moduleId;
  }
  if (periodeId !== undefined && periodeId !== null) {
    if (!estIdValide(periodeId)) return null;
    filtre.periodeId = periodeId;
  }
  if (Object.keys(filtre).length === 0) return null;
  const doc = await Saisie.findOne(filtre).lean();
  return postLecture(doc, false);
}

export async function creer(doc) {
  try {
    const cree = await Saisie.create(preparer(doc));
    return normaliserSaisie(cree.toObject());
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function mettreAJour(id, champs = {}, validation) {
  verifierChamps(champs);
  if (!estIdValide(id)) return null;

  const set = {};
  for (const cle of Object.keys(champs)) {
    if (cle === 'dates') {
      const dates = champs.dates || {};
      for (const date of CLES_DATES) {
        if (Object.hasOwn(dates, date)) set[`dates.${date}`] = dates[date];
      }
    } else {
      set[cle] = champs[cle];
    }
  }
  const maj = {};
  if (Object.keys(set).length > 0) maj.$set = set;
  if (validation) maj.$push = { validations: { ...validation, date: validation.date || new Date() } };
  if (Object.keys(maj).length === 0) {
    const doc = await Saisie.findById(id).lean();
    return doc ? normaliserSaisie(doc) : null;
  }
  const doc = await Saisie.findOneAndUpdate({ _id: id }, maj, { new: true }).lean();
  return doc ? normaliserSaisie(doc) : null;
}

export async function lister(options = {}) {
  const { vide, filtre } = construireFiltre(options);
  if (vide) return [];
  let requete = Saisie.find(filtre).sort(triDe(options.tri));
  if (options.limite !== undefined && options.limite !== null) {
    requete = requete.limit(options.limite);
  }
  if (options.avecLiens) requete = remplirLiens(requete);
  const docs = await requete.lean();
  return docs.map((doc) => postLecture(doc, options.avecLiens === true));
}

export async function listerResume({ moduleId, periodeId } = {}) {
  const filtre = {};
  if (moduleId !== undefined && moduleId !== null) {
    if (!estIdValide(moduleId)) return [];
    filtre.moduleId = moduleId;
  }
  if (periodeId !== undefined && periodeId !== null) {
    if (!estIdValide(periodeId)) return [];
    filtre.periodeId = periodeId;
  }
  // Exactement les 4 champs du tableau de bord, sans _id, ordre de création.
  return Saisie.find(filtre)
    .select('structureId moduleId periodeId status -_id')
    .sort({ _id: 1 })
    .lean();
}

export async function existePourModule(moduleId) {
  if (!estIdValide(moduleId)) return false;
  const doc = await Saisie.findOne({ moduleId }).select('_id').lean();
  return doc != null;
}

export async function archiverExportees(periodeIds) {
  const valides = normaliserIds(periodeIds);
  if (valides === null || valides.length === 0) return 0;
  const resultat = await Saisie.updateMany(
    { status: 'exportee', periodeId: { $in: valides } },
    { $set: { status: 'archivee' } }
  );
  return resultat.modifiedCount;
}

export async function insererPlusieurs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return;
  try {
    await Saisie.insertMany(docs.map(preparer));
  } catch (err) {
    throw erreurDoublonSi(err) || err;
  }
}

export async function supprimerTout() {
  await Saisie.deleteMany({});
}

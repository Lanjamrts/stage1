"use strict";
import PDFDocument from 'pdfkit';

import { getSaisieRepository } from '../repositories/saisieRepository.js';
import { getStructureRepository } from '../repositories/structureRepository.js';
import { getRegionRepository } from '../repositories/regionRepository.js';
import { getReferentielRepository } from '../repositories/referentielRepository.js';
import { estIdValide } from '../repositories/ids.js';
import { logAudit } from '../middleware/auth.js';
import { structuresInScope, statusesInScope } from '../middleware/scope.js';
import { serializeSaisie } from '../services/serializeSaisie.js';
import { buildExportModel } from '../services/exportModel.js';
import { buildWorkbook } from '../services/exportXlsx.js';
import { renderPdf } from '../services/exportPdf.js';

const STRUCTURE_TYPES = ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF', 'SSEBF', 'DGBF', 'CELLULE_INFO'];

function parseIdList(value) {
  const ids = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.some((id) => !estIdValide(id))) return null;
  return ids;
}

// Intersection de listes : ordre de la première, doublons retirés, entrées
// non tableaux ignorées. Aucune liste fournie → undefined (aucun filtre) ;
// une intersection vide → [] (donc aucune ligne, comme $in: [] avant).
export function intersecterListes(...listes) {
  const fournies = listes.filter((liste) => Array.isArray(liste));
  if (fournies.length === 0) return undefined;
  const [premiere, ...autres] = fournies;
  const ensembles = autres.map((liste) => new Set(liste));
  return [...new Set(premiere)].filter((valeur) => ensembles.every((ens) => ens.has(valeur)));
}

// Filtre commun liste/export (SPEC §8) : renvoie des OPTIONS de dépôt
// (statuts, structureIds, moduleIds, periodeId) au lieu d'un filtre Mongo.
// Conventions de retour inchangées : null = rôle refusé (403),
// 'invalid' = filtre invalide (400), {} = aucun filtre.
// admin1 = toutes régions ; admin2 = région forcée depuis sa structure.
// Les conditions de même nature sont en ET : les listes sont INTERSECTÉES,
// le périmètre de l'admin2 n'est jamais remplacé par un filtre de requête.
// Filtres admin1 : regions[] (noms), types[] (types de structure),
// modules[] (ids), periode, structure, statut.
async function buildFilter(user, query, { ignoreStatut = false } = {}) {
  if (user.role !== 'admin1' && user.role !== 'admin2') return null; // 403
  let structureIds = null;
  let moduleIds = null;
  let statuts = null;
  let periodeId;
  if (user.role === 'admin2') {
    const ids = await structuresInScope(user);
    structureIds = (ids || []).map(String);
    // admin2 ne voit jamais les brouillons
    statuts = statusesInScope('admin2');
  }
  if (query.module) {
    if (!estIdValide(query.module)) return 'invalid';
    moduleIds = intersecterListes([query.module], moduleIds);
  }
  if (query.modules) {
    const ids = parseIdList(query.modules);
    if (!ids) return 'invalid';
    moduleIds = intersecterListes(moduleIds, ids);
  }
  if (query.periode) {
    if (!estIdValide(query.periode)) return 'invalid';
    periodeId = query.periode;
  }
  if (query.structure) {
    if (!estIdValide(query.structure)) return 'invalid';
    structureIds = intersecterListes(structureIds, [query.structure]);
  }
  if (query.regions) {
    const names = String(query.regions)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const regionIds = (await getRegionRepository().listerParNoms(names)).map((r) => String(r._id));
    const structures = await getStructureRepository().lister({ regionIds });
    structureIds = intersecterListes(structureIds, structures.map((s) => String(s._id)));
  }
  if (query.types) {
    const types = String(query.types)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (types.length === 0 || types.some((t) => !STRUCTURE_TYPES.includes(t))) return 'invalid';
    const structures = await getStructureRepository().lister({ types });
    structureIds = intersecterListes(structureIds, structures.map((s) => String(s._id)));
  }
  if (query.statut && !ignoreStatut) statuts = intersecterListes(statuts, [query.statut]);

  const options = {};
  if (statuts) options.statuts = statuts;
  if (structureIds) options.structureIds = structureIds;
  if (moduleIds) options.moduleIds = moduleIds;
  if (periodeId !== undefined) options.periodeId = periodeId;
  return options;
}

// GET /api/collecte
export async function listCollecte(req, res) {
  const filter = await buildFilter(req.user, req.query);
  if (filter === null) {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  if (filter === 'invalid') {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  const docs = await getSaisieRepository().lister({
    ...filter,
    avecLiens: true,
    tri: 'majDesc',
    limite: 1000,
  });
  return res
    .status(200)
    .json(docs.map((d) => serializeSaisie(d, req.user, { withFields: false })));
}

// GET /api/collecte/historique (admin1 : tous statuts, métadonnées uniquement)
export async function listHistorique(req, res) {
  if (req.user.role !== 'admin1') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const filter = await buildFilter(req.user, req.query);
  if (filter === 'invalid') {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  const docs = await getSaisieRepository().lister({
    ...(filter || {}),
    avecLiens: true,
    tri: 'majDesc',
    limite: 1000,
  });
  return res.status(200).json(
    docs.map((d) => {
      const meta = serializeSaisie(d, req.user, { withFields: false });
      meta.values = null; // métadonnées uniquement
      return meta;
    })
  );
}

// ------------------------------------------------------------------ helpers export

const MAX_EXPORT_IDS = 300;
const STATUTS_EXPORT = ['exportee', 'archivee'];

// Collecte la liste à exporter : uniquement exportee et archivee (SPEC §8),
// avec les mêmes filtres que la liste (hors statut, forcé ci-dessous).
// Si query.ids est fourni, l'export est restreint aux saisies dont l'id figure
// dans la liste (périmètre rôle, statut, filtres régions/modules toujours
// appliqués ; ids hors périmètre ou mauvais statut ignorés silencieusement).
async function loadExportRows(user, query) {
  const filter = await buildFilter(user, query || {}, { ignoreStatut: true });
  if (filter === null || filter === 'invalid') return filter;
  const options = { ...filter, avecLiens: true, tri: 'structureMajAsc', limite: 5000 };
  let idsRestriction = false;
  if (query.ids !== undefined) {
    const ids = parseIdList(query.ids);
    if (!ids) return 'invalid';
    if (ids.length > MAX_EXPORT_IDS) return 'too_many';
    options.ids = ids;
    idsRestriction = true;
  } else {
    options.statuts = intersecterListes(filter.statuts, STATUTS_EXPORT);
  }
  const docs = await getSaisieRepository().lister(options);
  if (idsRestriction && docs.length === 0) return 'none_selected';
  return docs;
}

// GET /api/collecte/export?format=xlsx|pdf
export async function exportCollecte(req, res) {
  const user = req.user;
  if (user.role !== 'admin1' && user.role !== 'admin2') {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  const format = req.query.format;
  if (!['xlsx', 'pdf'].includes(format)) {
    return res.status(400).json({ message: 'Format requis : xlsx ou pdf' });
  }

  const loaded = await loadExportRows(user, req.query);
  if (loaded === null) {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
  }
  if (loaded === 'invalid') {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  if (loaded === 'too_many') {
    return res.status(400).json({ message: '300 saisies maximum par téléchargement.' });
  }
  if (loaded === 'none_selected') {
    return res.status(400).json({ message: 'Aucune saisie sélectionnée à exporter.' });
  }
  const docs = loaded;
  const rows = docs.map((d) => serializeSaisie(d, user, { withFields: true }));
  const stamp = new Date().toISOString().slice(0, 10);

  // Le référentiel EPN est chargé une seule fois par export (dictionnaire valeur → {ministere, regime}).
  const epnDocs = await getReferentielRepository().lister('epn');
  const epnDict = {};
  for (const d of epnDocs) {
    epnDict[String(d.value)] = { ministere: d.ministere || '', regime: d.regime || '' };
  }

  const filters = {
    regions: req.query.regions
      ? String(req.query.regions).split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    modules: req.query.module || req.query.modules
      ? [...new Set(rows.map((r) => r.moduleLabel).filter(Boolean))]
      : [],
  };
  const model = buildExportModel(rows, { filters, generatedAt: new Date(), epnDict });

  if (format === 'xlsx') {
    const wb = buildWorkbook(model);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="sigbd-collecte-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sigbd-collecte-${stamp}.pdf"`);
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
    doc.pipe(res);
    renderPdf(model, doc);
    doc.end();
  }

  await logAudit(user._id, format === 'xlsx' ? 'download_excel' : 'download_pdf', 'collecte', req.ip);
  return undefined;
}

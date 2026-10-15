"use strict";
import Module from '../models/Module.js';
import Saisie from '../models/Saisie.js';
import Periode from '../models/Periode.js';
import Structure from '../models/Structure.js';
import Region from '../models/Region.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// « Soumise ou ultérieur » : tout statut hors brouillon (rejetee incluse,
// car issue d'une soumission). Comptée une fois = statut courant.
const SUBMITTED_STATUSES = ['soumise', 'rejetee', 'validee', 'exportee', 'archivee'];

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

// GET /api/dashboard?module=&periode= (SPEC §8, admin1 et consultant)
// Calcul (SPEC §8) :
// - attendues = pour chaque période dont l'échéance est atteinte et chaque
//   module, une saisie par structure autorisée
// - soumises = attendues couvertes par une saisie « soumise ou ultérieur »
// - en retard = attendues sans telle saisie (constat fait après l'échéance)
// - taux de rejet = rejetee / (soumise ou ultérieur, comptées une fois)
// - regroupement par région
export async function getDashboard(req, res) {
  const moduleId = req.query.module;
  const periodeId = req.query.periode;
  if (moduleId && !OBJECT_ID.test(moduleId)) {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }
  if (periodeId && !OBJECT_ID.test(periodeId)) {
    return res.status(400).json({ message: 'Filtre invalide.' });
  }

  const now = new Date();
  const [periodes, modules, structures, regions, saisies] = await Promise.all([
    Periode.find({}).lean(),
    Module.find({ active: true }).lean(),
    Structure.find({ active: true }).lean(),
    Region.find({}).lean(),
    Saisie.find({
      ...(moduleId ? { moduleId } : {}),
      ...(periodeId ? { periodeId } : {}),
    })
      .select('structureId moduleId periodeId status')
      .lean(),
  ]);

  const regionName = new Map(regions.map((r) => [String(r._id), r.name]));
  const structureRegion = new Map(
    structures.map((s) => [String(s._id), s.regionId ? regionName.get(String(s.regionId)) || '' : ''])
  );

  // Périodes prises en compte : échéance atteinte (le filtre explicite ne
  // fait que restreindre cette liste).
  const periods = periodes.filter(
    (p) => new Date(p.deadline) <= now && (!periodeId || String(p._id) === periodeId)
  );
  const mods = modules.filter((m) => !moduleId || String(m._id) === moduleId);

  // Structures régionales (groupées par région) autorisées par type.
  const regionalStructures = structures.filter((s) => s.regionId);

  // Saisies « soumise ou ultérieur » : index des emplacements couverts.
  const submittedKeys = new Set();
  for (const s of saisies) {
    if (!SUBMITTED_STATUSES.includes(s.status)) continue;
    submittedKeys.add(`${s.structureId}|${s.moduleId}|${s.periodeId}`);
  }

  // Slots attendus : période × module de même périodicité × structure.
  const totals = { attendues: 0, soumises: 0, enRetard: 0 };
  const byRegion = new Map(); // nom région -> compteurs de slots
  const lateByStructure = new Map();
  const ensureRegion = (name) => {
    if (!byRegion.has(name)) byRegion.set(name, { attendues: 0, soumises: 0, enRetard: 0 });
    return byRegion.get(name);
  };

  // Expected submissions use the module's primary cadence only (periodicity). allowedPeriodicities does not create expectations.
  for (const p of periods) {
    for (const m of mods) {
      if (m.kind !== 'periodic' || m.periodicity !== p.periodicity) continue;
      for (const s of regionalStructures) {
        if (!(m.structureTypes || []).includes(s.type)) continue;
        const region = regionName.get(String(s.regionId)) || '';
        const bucket = ensureRegion(region);
        totals.attendues += 1;
        bucket.attendues += 1;
        const key = `${s._id}|${m._id}|${p._id}`;
        if (submittedKeys.has(key)) {
          totals.soumises += 1;
          bucket.soumises += 1;
        } else {
          totals.enRetard += 1;
          bucket.enRetard += 1;
          const entry = lateByStructure.get(String(s._id)) || {
            structure: s.label,
            region,
            nb: 0,
            items: [],
          };
          entry.nb += 1;
          const retardJours = Math.max(
            1,
            Math.ceil((now - new Date(p.deadline)) / (24 * 60 * 60 * 1000))
          );
          entry.items.push({
            module: m.label,
            echeance: p.deadline,
            retardJours,
          });
          lateByStructure.set(String(s._id), entry);
        }
      }
    }
  }

  // Taux de rejet : sur les saisies « soumise ou ultérieur » du périmètre.
  let denom = 0;
  let rejet = 0;
  const rejByRegion = new Map(); // nom région -> {denom, rejet}
  for (const s of saisies) {
    if (!SUBMITTED_STATUSES.includes(s.status)) continue;
    const region = structureRegion.get(String(s.structureId)) || '';
    const bucket = rejByRegion.get(region) || { denom: 0, rejet: 0 };
    bucket.denom += 1;
    if (s.status === 'rejetee') bucket.rejet += 1;
    rejByRegion.set(region, bucket);
    denom += 1;
    if (s.status === 'rejetee') rejet += 1;
  }

  // Toutes les régions ayant au moins une structure (triées par nom).
  const structureCount = new Map();
  for (const s of regionalStructures) {
    const name = regionName.get(String(s.regionId)) || '';
    structureCount.set(name, (structureCount.get(name) || 0) + 1);
  }

  const regionRows = [...structureCount.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .map(([name]) => {
      const slots = byRegion.get(name) || { attendues: 0, soumises: 0, enRetard: 0 };
      const rej = rejByRegion.get(name) || { denom: 0, rejet: 0 };
      return {
        region: name,
        structures: structureCount.get(name),
        attendues: slots.attendues,
        soumises: slots.soumises,
        enRetard: slots.enRetard,
        tauxSoumission: pct(slots.soumises, slots.attendues),
        tauxRejet: pct(rej.rejet, rej.denom),
      };
    });

  const structuresEnRetard = [...lateByStructure.values()]
    .sort((a, b) => b.nb - a.nb || a.structure.localeCompare(b.structure, 'fr'))
    .map((e) => ({
      structure: e.structure,
      region: e.region,
      nb: e.nb,
      items: e.items.sort((a, b) => b.retardJours - a.retardJours),
    }));

  return res.status(200).json({
    module: moduleId || null,
    periode: periodeId || null,
    totals: {
      attendues: totals.attendues,
      soumises: totals.soumises,
      enRetard: totals.enRetard,
      tauxSoumission: pct(totals.soumises, totals.attendues),
      tauxRejet: pct(rejet, denom),
    },
    regions: regionRows,
    structuresEnRetard,
  });
}

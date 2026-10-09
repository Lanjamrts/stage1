"use strict";
import StructureModel from '../models/Structure.js';
import RegionModel from '../models/Region.js';

// Helpers de périmètre (rôle + portée) — utilisés par les routes des phases suivantes.
// Retournent les structures visibles par l'utilisateur, ou null = « toutes ».

// Structures visibles par un utilisateur :
// - client        : uniquement sa structure
// - admin2        : toutes les structures de la région de sa structure
// - admin1        : toutes les structures (null)
// - developpeur   : aucun accès aux rapports ([])
// - consultant    : toutes les structures (lecture seule exportee/archivee)
export async function structuresInScope(user) {
  if (!user) return [];
  if (user.role === 'admin1' || user.role === 'consultant') return null; // toutes
  if (user.role === 'developpeur') return []; // aucun rapport

  const structure = await StructureModel.findById(user.structureId);
  if (!structure) return [];

  // client : sa seule structure
  if (user.role === 'client') return [structure._id];

  // admin2 : toute sa région (structures sans région = hors périmètre)
  if (user.role === 'admin2') {
    if (!structure.regionId) return [structure._id];
    const regional = await StructureModel.find({
      regionId: structure.regionId,
      type: { $in: ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF'] },
    }).select('_id');
    return regional.map((s) => s._id);
  }

  return [structure._id];
}

// Région de l'admin2 (ou null si hors région)
export async function regionOfUser(user) {
  if (!user) return null;
  if (user.role === 'admin1' || user.role === 'consultant') return null; // toutes régions
  const structure = await StructureModel.findById(user.structureId);
  return structure ? structure.regionId : null;
}

// Statuts visibles par rôle pour les listes de rapports
export function statusesInScope(role) {
  switch (role) {
    case 'client':
      return ['brouillon', 'soumise', 'rejetee', 'validee', 'exportee', 'archivee'];
    case 'admin2':
      return ['soumise', 'validee', 'rejetee', 'exportee', 'archivee']; // jamais brouillon
    case 'admin1':
      return ['brouillon', 'soumise', 'rejetee', 'validee', 'exportee', 'archivee'];
    case 'consultant':
      return ['exportee', 'archivee'];
    default:
      return [];
  }
}

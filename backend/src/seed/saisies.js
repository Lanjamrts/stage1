"use strict";

// ~10 saisies de départ dans divers statuts (SPEC §9) pour que chaque écran
// ait des données : une rejetée avec motif, des exportées en Atsinanana et
// Diana, un auteur système (SYS-0000) pour les saisies hors région d'un
// utilisateur réel.

const now = new Date('2026-10-09T08:00:00.000Z');
const earlier = new Date('2026-10-02T08:00:00.000Z');
const late = new Date('2026-10-07T08:00:00.000Z');

const RA_VALUES = {
  activites: [
    { intitule: 'Réunion de planification mensuelle', date: '2026-10-03', statut: 'Réalisée' },
    { intitule: 'Visite des services rattachés', date: '2026-10-06', statut: 'En cours' },
  ],
  indicateurs: [{ indicateur: 'Dossiers traités', valeur: 42 }],
  difficultes: 'Retard dans la transmission des états des services déconcentrés.',
  perspectives: 'Accélérer la collecte des états avant la fin du mois.',
};

const RH_VALUES = {
  effectif: [
    { categorie: 'Catégorie A', grade: "Attaché d'administration", sexe: 'Homme', effectif: 4 },
    { categorie: 'Catégorie B', grade: 'Secrétaire de bureau', sexe: 'Femme', effectif: 6 },
    { categorie: 'Catégorie C', grade: "Agent d'exécution", sexe: 'Homme', effectif: 3 },
  ],
  mouvements: [{ type: 'Arrivée', nombre: 2 }, { type: 'Affectation', nombre: 1 }],
  besoins: 'Recrutement de deux agents administratifs pour le service des rapports.',
};

const RMI_VALUES = {
  equipements: [
    {
      designation: 'Ordinateur de bureau',
      type: 'Ordinateur',
      marque: 'HP',
      modele: 'ProDesk 400',
      numero_serie: 'HP-2026-0011',
      date_acquisition: '2026-03-12',
      etat: 'Bon',
      service: 'Service des rapports',
      agent: 'Agent A',
    },
    {
      designation: 'Imprimante laser',
      type: 'Imprimante',
      marque: 'Canon',
      modele: 'LBP-226',
      numero_serie: 'CN-2026-0042',
      date_acquisition: '2025-11-05',
      etat: 'Moyen',
      service: 'Service informatique',
      agent: 'Agent B',
    },
  ],
};

// NCA et TSE : le champ `epn` (source 'epn') doit contenir un nom exact present dans epn.csv.
// Les membres des saisies NCA ont un "N° de mandat" valide (entier >= 1).
const NCA_VALUES_1 = {
  epn: 'Economic Development Board of Madagascar',
  membres: [{ nom: 'Rakoto', prenom: 'Hery', qualite: 'Membre', mandat: 1 }],
  ref_arrete: 'Décret n° 2026-001',
  date_arrete: '2026-09-15',
  duree_mandat: 3,
  statut: 'En fonction',
};

const NCA_VALUES_2 = {
  epn: 'Centre Hospitalier Universitaire Joseph Ravoahangy Andrianavalona',
  membres: [{ nom: 'Randria', prenom: 'Jean', qualite: 'Président', mandat: 2 }],
  ref_arrete: 'Décret n° 2026-002',
  date_arrete: '2026-09-20',
  duree_mandat: 3,
  statut: 'En fonction',
};

const TSE_VALUES_1 = {
  epn: 'Autorité de régulation des marchés publics',
  date_demande: '2026-10-01',
  nature: 'Salaires',
  periode_concernee: 'Septembre 2026',
  montant: 50000000,
  statut: 'Effectué',
  ref_piece: 'PIECE-2026-001',
};

const TSE_VALUES_2 = {
  epn: 'Institut national de la statistique',
  date_demande: '2026-10-02',
  nature: 'Accessoires',
  periode_concernee: 'T3 2026',
  montant: 12000000,
  statut: 'En cours',
  ref_piece: 'PIECE-2026-002',
};

// { code, structure, im, periode, status, values, motif?, dates }
const PLAN = [
  { code: 'RA', structure: 'SRB-ANL', im: '104562', periode: 'Octobre 2026', status: 'brouillon', values: RA_VALUES, created: late },
  { code: 'RH', structure: 'SRB-ANL', im: '104562', periode: 'T3 2026', status: 'rejetee', values: RH_VALUES, motif: "Merci de compléter la colonne grade pour chaque catégorie d'effectif.", created: earlier, submitted: earlier, rejected: late },
  { code: 'RMI', structure: 'SRB-ANL', im: '104562', periode: 'T3 2026', status: 'validee', values: RMI_VALUES, created: earlier, submitted: earlier, validated: late },
  { code: 'RA', structure: 'CIRBF-ANL', im: '115908', periode: 'Octobre 2026', status: 'soumise', values: RA_VALUES, created: earlier, submitted: late },
  { code: 'RH', structure: 'SRSP-ANL', im: '112470', periode: 'T3 2026', status: 'exportee', values: RH_VALUES, created: earlier, submitted: earlier, validated: late, exported: late },
  { code: 'RMI', structure: 'SRSP-ANL', im: '112470', periode: 'T3 2026', status: 'brouillon', values: { equipements: [RMI_VALUES.equipements[0]] }, created: late },
  { code: 'RH', structure: 'CIRBF-ANL', im: '115908', periode: 'T3 2026', status: 'archivee', values: RH_VALUES, created: earlier, submitted: earlier, validated: late, exported: late },
  { code: 'NCA', structure: 'SRB-ANL', im: '104562', periode: 'Octobre 2026', status: 'soumise', values: NCA_VALUES_1, created: earlier, submitted: late },
  { code: 'NCA', structure: 'SRB-ANL', im: '104562', periode: 'T3 2026', status: 'validee', values: NCA_VALUES_2, created: earlier, submitted: earlier, validated: late },
  { code: 'TSE', structure: 'SRB-ANL', im: '104562', periode: 'Septembre 2026', status: 'brouillon', values: TSE_VALUES_1, created: late },
  { code: 'TSE', structure: 'SRB-ANL', im: '104562', periode: 'T3 2026', status: 'soumise', values: TSE_VALUES_2, created: earlier, submitted: late },
  // Auteur système (SYS-0000) : régions sans utilisateur client réel
  { code: 'RA', structure: 'SRB-ATS', im: 'SYS-0000', periode: 'Septembre 2026', status: 'exportee', values: RA_VALUES, created: earlier, submitted: earlier, validated: late, exported: late },
  { code: 'RMI', structure: 'SRB-ATS', im: 'SYS-0000', periode: 'T3 2026', status: 'exportee', values: RMI_VALUES, created: earlier, submitted: earlier, validated: late, exported: late },
  { code: 'RH', structure: 'SRB-DIA', im: 'SYS-0000', periode: 'T3 2026', status: 'exportee', values: RH_VALUES, created: earlier, submitted: earlier, validated: late, exported: late },
];

export function buildSaisies({ moduleIdByCode, structureIdByCode, userIdByIm, periodeIdByLabel, actorLabelByIm = {} }) {
  const actor = (im) => ({ actorId: userIdByIm[im], actorLabel: actorLabelByIm[im] || null });

  return PLAN.map((item) => {
    const validations = [];
    if (['soumise', 'rejetee', 'validee', 'exportee', 'archivee'].includes(item.status)) {
      validations.push({ decision: 'soumise', date: item.submitted || earlier, ...actor(item.im) });
    }
    if (['validee', 'exportee', 'archivee'].includes(item.status)) {
      validations.push({ decision: 'validee', date: item.validated || late, ...actor(item.im) });
    }
    if (item.status === 'rejetee') {
      validations.push({ decision: 'rejetee', motif: item.motif, date: item.rejected || late, ...actor(item.im) });
    }
    if (['exportee', 'archivee'].includes(item.status)) {
      validations.push({ decision: 'exportee', date: item.exported || late, ...actor(item.im) });
    }

    return {
      structureId: structureIdByCode[item.structure],
      moduleId: moduleIdByCode[item.code],
      moduleVersion: 1,
      periodeId: periodeIdByLabel[item.periode],
      authorId: userIdByIm[item.im],
      status: item.status,
      values: item.values,
      validations,
      dates: {
        created: item.created || now,
        submitted: item.submitted || null,
        exported: item.exported || null,
      },
    };
  });
}

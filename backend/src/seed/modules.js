"use strict";

// Définitions structurées des 13 modules (gabarits) — SPEC §7.
// Les formulaires sont générés depuis modules.fields (aucun formulaire en dur).
// Groupe 1 (phased) : modules 1, 5, 10 — puis les 10 autres sont ajoutés.

const field = (key, label, type, rules = {}) => ({ key, label, type, ...rules });

// ---------------------------------------------------------------- Groupe 1
export const MODULES_GROUP_1 = [
  {
    code: 'RA',
    label: "Rapport d'activités",
    periodicity: 'monthly',
    allowedPeriodicities: ['monthly', 'quarterly'],
    kind: 'periodic',
    structureTypes: ['SRB', 'SRSP', 'CIRBF'],
    fields: [
      {
        key: 'activites',
        label: 'Activités réalisées',
        type: 'table',
        required: true,
        fields: [
          field('intitule', 'Intitulé', 'text', { required: true, maxLength: 200 }),
          field('date', 'Date', 'date', { required: true, noFuture: true }),
          field('statut', 'Statut', 'select', { required: true, options: ['Réalisée', 'En cours', 'Non réalisée'] }),
        ],
      },
      {
        key: 'indicateurs',
        label: 'Indicateurs de performance',
        type: 'table',
        fields: [
          field('indicateur', 'Indicateur', 'text', { required: true }),
          field('valeur', 'Valeur', 'decimal', { required: true, min: 0 }),
        ],
      },
      field('difficultes', 'Difficultés rencontrées et solutions', 'textarea', { maxLength: 2000 }),
      field('perspectives', 'Perspectives et besoins', 'textarea', { maxLength: 2000 }),
    ],
  },
  {
    code: 'RH',
    label: 'Ressources humaines',
    periodicity: 'quarterly',
    kind: 'periodic',
    structureTypes: ['SRB', 'SRSP', 'CIRBF'],
    fields: [
      {
        key: 'effectif',
        label: 'Effectif par catégorie, grade et sexe',
        type: 'table',
        required: true,
        fields: [
          field('categorie', 'Catégorie', 'select', {
            required: true,
            options: ['Catégorie A', 'Catégorie B', 'Catégorie C', 'Catégorie D'],
          }),
          field('grade', 'Grade', 'text', { required: true }),
          field('sexe', 'Sexe', 'select', { required: true, options: ['Homme', 'Femme'] }),
          field('effectif', 'Effectif', 'integer', { required: true, min: 0 }),
        ],
      },
      {
        key: 'mouvements',
        label: 'Mouvements de personnel',
        type: 'table',
        fields: [
          field('type', 'Type', 'select', { required: true, options: ['Arrivée', 'Départ', 'Affectation'] }),
          field('nombre', 'Nombre', 'integer', { required: true, min: 1 }),
        ],
      },
      field('besoins', 'Besoins en personnel et en formation', 'textarea', { maxLength: 2000 }),
    ],
  },
  {
    code: 'RMI',
    label: 'Recensement matériel informatique',
    periodicity: 'quarterly',
    kind: 'periodic',
    structureTypes: ['DRBF', 'SRB', 'SRSP', 'SRPE', 'CIRBF'],
    fields: [
      {
        key: 'equipements',
        label: 'Équipements',
        type: 'table',
        required: true,
        fields: [
          field('designation', 'Désignation', 'text', { required: true }),
          field('type', 'Type', 'select', {
            required: true,
            options: ['Ordinateur', 'Imprimante', 'Serveur', 'Onduleur', 'Autre'],
          }),
          field('marque', 'Marque', 'text'),
          field('modele', 'Modèle', 'text'),
          field('numero_serie', 'Numéro de série', 'text', {
            required: true,
            unique: true,
            uniqueMessage: 'Ce numéro de série existe déjà dans votre recensement.',
          }),
          field('date_acquisition', "Date d'acquisition", 'date', { required: true, noFuture: true }),
          field('etat', 'État', 'select', { required: true, options: ['Bon', 'Moyen', 'Hors service'] }),
          field('service', 'Service', 'text'),
          field('agent', 'Agent', 'text'),
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------- Groupe 2
// Les 10 autres modules (SPEC §7).
export const MODULES_GROUP_2 = [
  {
    code: 'CRGP',
    label: 'Compte rendu CRGP',
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB'],
    fields: [
      field('date_reunion', 'Date de réunion', 'date', { required: true, noFuture: true }),
      field('lieu', 'Lieu', 'text', { required: true }),
      field('theme', 'Thème', 'text', { required: true }),
      field('nb_participants', 'Nombre de participants', 'integer', { required: true, min: 0 }),
      field('structures_presentes', 'Structures présentes', 'multiselect', { required: true, source: 'structures' }),
      field('points_abordes', 'Points abordés', 'textarea', { required: true }),
      field('decisions', 'Décisions', 'textarea', { required: true }),
      field('recommandations', 'Recommandations', 'textarea'),
      {
        key: 'actions',
        label: 'Actions',
        type: 'table',
        required: true,
        fields: [
          field('action', 'Action', 'text', { required: true }),
          field('responsable', 'Responsable', 'text', { required: true }),
          field('echeance', 'Échéance', 'date', { required: true }),
        ],
      },
      field('prochaine_reunion', 'Prochaine réunion', 'date'),
    ],
  },
  {
    code: 'ASS',
    label: "Compte rendu d'assistance",
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB', 'CIRBF'],
    fields: [
      field('date_intervention', "Date d'intervention", 'date', { required: true, noFuture: true }),
      field('agent', 'Agent', 'text', { required: true }),
      field('type_beneficiaire', 'Type de bénéficiaire', 'select', {
        required: true,
        options: ['CLD', 'EPN', 'Autre'],
      }),
      field('nom_beneficiaire', 'Nom du bénéficiaire', 'text', { required: true }),
      field('nature_objet', "Nature de l'objet", 'textarea', { required: true }),
      field('resultats', 'Résultats', 'textarea', { required: true }),
      field('suites', 'Suites données', 'textarea'),
    ],
  },
  {
    code: 'FOR',
    label: 'Compte rendu de formation',
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB', 'SRSP', 'CIRBF'],
    fields: [
      field('intitule', 'Intitulé', 'text', { required: true }),
      field('date_debut', 'Date de début', 'date', { required: true }),
      field('date_fin', 'Date de fin', 'date', { required: true, afterField: 'date_debut' }),
      field('lieu', 'Lieu', 'text', { required: true }),
      field('formateur', 'Formateur', 'text', { required: true }),
      field('public_cible', 'Public cible', 'text', { required: true }),
      field('nb_hommes', 'Nombre d\'hommes', 'integer', { required: true, min: 0 }),
      field('nb_femmes', 'Nombre de femmes', 'integer', { required: true, min: 0 }),
      field('total', 'Total', 'auto', { auto: 'total', sum: ['nb_hommes', 'nb_femmes'] }),
      field('themes', 'Thèmes', 'textarea', { required: true }),
      field('evaluation', 'Évaluation', 'textarea', { required: true }),
      field('recommandations', 'Recommandations', 'textarea'),
    ],
  },
  {
    code: 'NOS',
    label: 'Nomination Ordonnateur Secondaire',
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB', 'SRSP', 'CIRBF'],
    fields: [
      field('titulaire_nom', 'Titulaire — Nom', 'text', { required: true }),
      field('titulaire_prenom', 'Titulaire — Prénom', 'text', { required: true }),
      field('titulaire_im', 'Titulaire — IM', 'text', { required: true }),
      field('suppleant_nom', 'Suppléant — Nom', 'text', { required: true }),
      field('suppleant_prenom', 'Suppléant — Prénom', 'text', { required: true }),
      field('suppleant_im', 'Suppléant — IM', 'text', { required: true }),
      field('ref_arrete', "Référence de l'arrêté", 'text', { required: true }),
      field('date_arrete', "Date de l'arrêté", 'date', { required: true, noFuture: true }),
      field('date_prise_fonction', 'Date de prise de fonction', 'date', {
        required: true,
        afterField: 'date_arrete',
      }),
      field('statut', 'Statut', 'select', { required: true, options: ['En fonction', 'Remplacé'] }),
    ],
  },
  {
    code: 'NPR',
    label: 'Nomination PRMP',
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['DRBF', 'SRB'],
    fields: [
      field('nom', 'Nom', 'text', { required: true }),
      field('prenom', 'Prénom', 'text', { required: true }),
      field('im', 'IM', 'text', { required: true }),
      field('fonction', 'Fonction', 'text', { required: true }),
      field('ref_arrete', "Référence de l'arrêté", 'text', { required: true }),
      field('date_arrete', "Date de l'arrêté", 'date', { required: true, noFuture: true }),
      field('date_prise_fonction', 'Date de prise de fonction', 'date', {
        required: true,
        afterField: 'date_arrete',
      }),
      field('statut', 'Statut', 'select', { required: true, options: ['En fonction', 'Remplacé'] }),
    ],
  },
  {
    code: 'NCA',
    label: "Nomination membres du Conseil d'Administration EPN",
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB'],
    fields: [
      field('epn', 'EPN', 'select', { required: true, source: 'epn' }),
      {
        key: 'membres',
        label: 'Membres',
        type: 'table',
        required: true,
        fields: [
          field('nom', 'Nom', 'text', { required: true }),
          field('prenom', 'Prénom', 'text', { required: true }),
          field('qualite', 'Qualité', 'text', { required: true }),
          field(
            'mandat',
            'N° de mandat',
            'integer',
            {
              required: true,
              min: 1,
              placeholder: '1 = premier mandat, 2 = deuxième mandat, etc.',
            },
          ),
        ],
      },
      field('ref_arrete', "Référence de l'arrêté", 'text', { required: true }),
      field('date_arrete', "Date de l'arrêté", 'date', { required: true, noFuture: true }),
      field('duree_mandat', 'Durée du mandat (années)', 'integer', { required: true, min: 1 }),
      field('statut', 'Statut', 'select', { required: true, options: ['En fonction', 'Remplacé'] }),
    ],
  },
  {
    code: 'RMB',
    label: 'Recensement mobilier de bureau',
    periodicity: 'quarterly',
    kind: 'periodic',
    structureTypes: ['DRBF', 'SRB', 'SRSP', 'CIRBF'],
    fields: [
      {
        key: 'articles',
        label: 'Articles',
        type: 'table',
        required: true,
        fields: [
          field('designation', 'Désignation', 'text', { required: true }),
          field('quantite', 'Quantité', 'integer', { required: true, min: 1 }),
          field('date_acquisition', "Date d'acquisition", 'date', { required: true, noFuture: true }),
          field('etat', 'État', 'select', { required: true, options: ['Bon', 'Moyen', 'Hors service'] }),
          field('service', 'Service', 'text'),
          field('agent', 'Agent', 'text'),
        ],
      },
    ],
  },
  {
    code: 'RMR',
    label: 'Recensement matériels roulants',
    periodicity: 'quarterly',
    kind: 'periodic',
    structureTypes: ['DRBF', 'SRB', 'SRSP', 'SRPE', 'CIRBF'],
    fields: [
      {
        key: 'vehicules',
        label: 'Véhicules',
        type: 'table',
        required: true,
        fields: [
          field('type', 'Type', 'select', {
            required: true,
            options: ['Voiture', 'Camionnette', 'Moto', 'Autre'],
          }),
          field('marque', 'Marque', 'text', { required: true }),
          field('modele', 'Modèle', 'text', { required: true }),
          field('immatriculation', 'Immatriculation', 'text', {
            required: true,
            unique: true,
            uniqueMessage: 'Cette immatriculation existe déjà dans votre recensement.',
          }),
          field('annee', 'Année', 'integer', { required: true, max: 'currentYear' }),
          field('etat', 'État', 'select', { required: true, options: ['Bon', 'Moyen', 'Hors service'] }),
          field('service', 'Service', 'text'),
          field('agent', 'Agent', 'text'),
        ],
      },
    ],
  },
  {
    code: 'RAV',
    label: "Régie d'avances STD",
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB'],
    fields: [
      field('std', 'STD', 'select', { required: true, source: 'std' }),
      field('intitule', 'Intitulé', 'text', { required: true }),
      field('statut', 'Statut', 'select', { required: true, options: ['Active', 'Suspendue', 'Clôturée'] }),
      field('montant', 'Montant', 'integer', { required: true, min: 0 }),
      field('ref_acte', "Référence de l'acte", 'text', { required: true }),
      field('date_acte', "Date de l'acte", 'date', { required: true, noFuture: true }),
      field('regisseur_nom', 'Régisseur — Nom', 'text', { required: true }),
      field('regisseur_prenom', 'Régisseur — Prénom', 'text', { required: true }),
      field('regisseur_im', 'Régisseur — IM', 'text', { required: true }),
      field('regisseur_fonction', 'Régisseur — Fonction', 'text', { required: true }),
    ],
  },
  {
    code: 'TSE',
    label: 'Transfert salaires et accessoires EPN',
    periodicity: 'monthly',
    kind: 'event',
    structureTypes: ['SRB'],
    fields: [
      field('epn', 'EPN', 'select', { required: true, source: 'epn' }),
      field('date_demande', 'Date de demande', 'date', { required: true, noFuture: true }),
      field('nature', 'Nature', 'select', { required: true, options: ['Salaires', 'Accessoires'] }),
      field('periode_concernee', 'Période concernée', 'text', { required: true }),
      field('montant', 'Montant', 'integer', { required: true, min: 0 }),
      field('statut', 'Statut', 'select', {
        required: true,
        options: ['Demandé', 'En cours', 'Effectué'],
      }),
      field('ref_piece', 'Référence de la pièce', 'text', { required: true }),
    ],
  },
];

export const MODULES = [...MODULES_GROUP_1, ...MODULES_GROUP_2];

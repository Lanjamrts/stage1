# Dossier de recette – SIGBD (livrable L5)

## 1. Objet et environnement

Ce dossier de recette valide les 12 scénarios de la spécification (SPEC.md) pour l'application SIGBD. Les tests automatisés s'exécutent sur la base de test dédiée `sigbd_test` ; les procédures manuelles utilisent les données de démonstration (`npm run seed:demo --prefix backend`). Pour lancer les tests automatisés : `npm test` à la racine du projet (ou `cd backend && npm test`). Le démarrage rapide (données de démo + serveurs) est décrit dans le README (section « Démarrage rapide »). Comptes de démo : voir le tableau du README (mot de passe commun `Test@2026`). **Important : les procédures manuelles sont ÉCRITES mais NON EXÉCUTÉES ; le tableau de résultats de la section 4 est donc vide. Les tests automatisés T-10 et les vérifications d'archive (backup:verify) sont exécutés dans la suite de tests `npm test`.**

## 2. Synthèse

| N° | Scénario | État |
|----|----------|------|
| T-01 | Connexion avec identifiants valides / invalides | Procédure manuelle |
| T-02 | Création, recherche et suppression d'un utilisateur par l'Administrateur 1 | Automatisé |
| T-03 | Saisie, enregistrement, modification puis enregistrement (Client) | Automatisé |
| T-04 | Contrôles de saisie (champs obligatoires, formats) | Automatisé |
| T-05 | Soumission, puis validation par l'Administrateur régional | Automatisé |
| T-06 | Rejet avec motif et correction par le Client | Automatisé |
| T-07 | Sélection de régions et types de rapport, téléchargement Excel et PDF | Automatisé |
| T-08 | Envoi d'une remarque via la zone contextuelle | Automatisé |
| T-09 | Contrôle des droits par profil (accès non autorisé) | Automatisé |
| T-10 | Sauvegarde puis restauration de la base | Automatisé |
| T-11 | Test de charge et de connexion à débit limité | Procédure manuelle |
| T-12 | Compatibilité navigateurs | Procédure manuelle |

## 3. Scénarios

### T-01

**Scénario :** Connexion avec identifiants valides / invalides

**Critère d'acceptation :** Accès autorisé uniquement avec identifiants valides

**Tests automatiques :**
Aucun test automatique.

**Procédure manuelle :**
1. Ouvrir http://localhost:5173
2. Saisir un IM invalide (ex: `999999`) et mot de passe `Test@2026`, cliquer sur « Connexion » → message d'erreur « Identifiant ou mot de passe incorrect »
3. Saisir IM valide `104562` et mot de passe incorrect `WrongPass` → message d'erreur « Identifiant ou mot de passe incorrect »
4. Saisir IM valide `104562` et mot de passe `Test@2026`, cliquer sur « Connexion » → redirection vers le Tableau de bord (client)
5. Vérifier que le menu affiche « Tableau de bord » et « Mes saisies »
6. Se déconnecter (menu utilisateur → Déconnexion)
7. Répéter avec le compte admin2 `108231` → redirection vers « Données saisies »
8. Répéter avec le compte admin1 `120344` → redirection vers « Tableau de bord »
9. Répéter avec le compte développeur `123009` → redirection vers « Paramétrage »
10. Répéter avec le compte consultant `121775` → redirection vers « Tableau de bord »

**État ** : Procédure manuelle

### T-02

**Scénario :** Création, recherche et suppression d'un utilisateur par l'Administrateur 1

**Critère d'acceptation :** Compte créé, retrouvé, retiré ; historique conservé

**Tests automatiques :**
- backend/tests/rbac.test.js :: admin1 : utilisateurs (créer, modifier profil, réinitialiser, désactiver) (API uniquement)

**Procédure manuelle :**
1. Se connecter en admin1 (`120344` / `Test@2026`)
2. Cliquer sur « Utilisateurs » dans le menu latéral
3. Cliquer sur « Ajouter un utilisateur »
4. Remplir : IM `991000`, Nom `Rakoto`, Prénom `Phase Sept`, Direction `Direction des Régions Budget et des Finances`, Service `Service des rapports`, Rôle `client`, Structure `SRB – Analamanga`
5. Cliquer sur « Créer » → message de succès, mot de passe provisoire affiché (format `Xxx-Xxx-Xxx`)
6. Rechercher `991000` dans la barre de recherche → l'utilisateur apparaît dans la liste
7. Cliquer sur l'utilisateur → vérifier les informations affichées
8. Cliquer sur « Désactiver » → confirmation, utilisateur marqué inactif
9. Vérifier que l'historique (journal d'audit) conserve les traces de création et désactivation : aller dans « Journal d'audit », filtrer sur l'action « user_create » et « user_deactivate »

**Note :** L'application DÉSACTIVE les comptes au lieu de les supprimer (l'historique est ainsi conservé).

**État ** : Automatisé

### T-03

**Scénario :** Saisie, enregistrement, modification puis enregistrement (Client)

**Critère d'acceptation :** Données conservées et modifiables avant soumission

**Tests automatiques :**
- backend/tests/rbac.test.js :: client : crée, enregistre un brouillon et soumet (API uniquement)
- backend/tests/rbac.test.js :: client : édite une saisie rejetée (rejetee → modification autorisée) (API uniquement)
- backend/tests/periodicity.test.js :: POST /api/saisies avec RA et la periode T3 2026 → 201 (API uniquement)

**Procédure manuelle :**
1. Se connecter en client (`104562` / `Test@2026`)
2. Sur le Tableau de bord, cliquer sur « Nouvelle saisie »
3. Choisir Module « Rapport d'activités » (RA), Période « Septembre 2026 » (mensuelle), cliquer « Créer »
4. Remplir quelques champs : « Activités réalisées » = `Test activités`, « Indicateurs de performance » = `Test indicateurs`
5. Cliquer sur « Enregistrer » → message « Brouillon enregistré. »
6. Revenir sur la liste « Mes saisies » → la saisie apparaît en statut « Brouillon »
7. Cliquer sur la saisie pour la rouvrir
8. Modifier « Activités réalisées » = `Activités modifiées`
9. Cliquer sur « Enregistrer » → message « Brouillon enregistré. »
10. Vérifier que la modification est conservée en rouvrant la saisie

**État ** : Automatisé

### T-04

**Scénario :** Contrôles de saisie (champs obligatoires, formats)

**Critère d'acceptation :** Messages d'erreur clairs, saisie invalide bloquée

**Tests automatiques :**
- backend/tests/rbac.test.js :: soumission avec champs obligatoires manquants → 400 (API uniquement)
- backend/tests/periodicity.test.js :: POST RH avec Septembre 2026 → 400 et message attendu (API uniquement)

**Procédure manuelle :**
1. Se connecter en client (`104562` / `Test@2026`)
2. Créer une nouvelle saisie RA pour « Septembre 2026 »
3. Laisser tous les champs vides, cliquer sur « Soumettre » → messages d'erreur sous les champs obligatoires : « Ce champ est obligatoire. »
4. Remplir un champ numérique avec du texte (si applicable) → message d'erreur format
5. Corriger les erreurs, cliquer « Soumettre » → succès, statut passe à « Soumise »
6. Essayer de modifier la saisie soumise → message « Cette saisie ne peut plus être modifiée. »

**État ** : Automatisé

### T-05

**Scénario :** Soumission, puis validation par l'Administrateur régional

**Critère d'acceptation :** Statut passé à « Validée » ; export vers la base réussi

**Tests automatiques :**
- backend/tests/rbac.test.js :: admin2 : valide, rejette avec motif et exporte (sa région) (API uniquement)
- backend/tests/rbac.test.js :: transition interdite : brouillon → validee (409) (API uniquement)
- backend/tests/rbac.test.js :: transition interdite : rejetee → validee (409) (API uniquement)

**Procédure manuelle :**
1. Se connecter en client (`104562` / `Test@2026`), créer et soumettre une saisie RA (statut « Soumise »)
2. Se déconnecter, se connecter en admin2 (`108231` / `Test@2026`)
3. Aller dans « Données saisies » (onglet « Soumises »)
4. Trouver la saisie soumise, cliquer sur « Examiner »
5. Vérifier les données, cliquer sur « Valider » → statut passe à « Validée »
6. Cliquer sur « Exporter » (bouton visible sur les saisies validées) → confirmation, puis statut passe à « Exportée »
7. Vérifier dans « Consultation et téléchargement » que la saisie est visible avec statut « Exportée »

**Note :** La validation ET l'export sont faits par admin2 (108231), jamais par admin1.

**État ** : Automatisé

### T-06

**Scénario :** Rejet avec motif et correction par le Client

**Critère d'acceptation :** Motif visible du Client ; nouvelle soumission possible

**Tests automatiques :**
- backend/tests/rbac.test.js :: admin2 : valide, rejette avec motif et exporte (sa région) (API uniquement)
- backend/tests/rbac.test.js :: client : édite une saisie rejetée (rejetee → modification autorisée) (API uniquement)
- backend/tests/rbac.test.js :: rejet sans motif → 400 (motif obligatoire) (API uniquement)
- backend/tests/rbac.test.js :: transition interdite : validee → rejetee (409) (API uniquement)

**Procédure manuelle :**
1. Se connecter en client (`104562` / `Test@2026`), créer et soumettre une saisie
2. Se connecter en admin2 (`108231` / `Test@2026`), aller dans « Données saisies » → « Soumises »
3. Cliquer « Examiner » sur la saisie, cliquer « Rejeter »
4. Saisir un motif : `Merci de compléter la colonne modèle.`, confirmer → statut « Rejetée »
5. Se connecter en client (`104562`), aller dans « Mes saisies » → la saisie a un badge « Rejetée » et le motif est visible
6. Cliquer sur la saisie, corriger les données, cliquer « Enregistrer » puis « Soumettre » → nouvelle soumission acceptée, statut « Soumise »

**État ** : Automatisé

### T-07

**Scénario :** Sélection de régions et types de rapport, téléchargement Excel et PDF

**Critère d'acceptation :** Fichiers conformes au canevas et aux données validées

**Tests automatiques :**
- backend/tests/rbac.test.js :: admin2 : consulte sa région (liste, collecte, export) et envoie une remarque (API uniquement)
- backend/tests/rbac.test.js :: admin1 : tableau de bord, collecte, historique, export, audit, remarques (API uniquement)
- backend/tests/rbac.test.js :: consultant : consultation, rapport exporté et tableau de bord (lecture seule) (API uniquement)
- backend/tests/export-format.test.js :: X4 : le classeur contient Synthese, une feuille par module et des noms de feuille valides et uniques
- backend/tests/export-format.test.js :: X5 : les cellules numeriques et dates sont de vrais nombres et de vraies dates avec format
- backend/tests/export-format.test.js :: X6 : l en-tete est fige, filtre et les colonnes de dates sont assez larges
- backend/tests/export-format.test.js :: X7 : le PDF est genere sur plusieurs pages avec en-tete et pied de page sans erreur
- backend/tests/export-format.test.js :: X8 : un export vide produit un message clair dans l Excel
- backend/tests/export-format.test.js :: X9 : un export d une saisie produit exactement une page PDF avec Page 1 / 1
- backend/tests/export-format.test.js :: X10 : les heures ecrites dans l Excel sont celles de Madagascar (instant 2026-10-16T07:14:04Z → cellule 10:14)
- backend/tests/export-format.test.js :: X11 : le libelle Statut de la saisie est distinct du champ Statut
- backend/tests/export-format.test.js :: X12 : fitToPage est actif et la largeur des colonnes suit le contenu
- backend/tests/export-format.test.js :: X15 : un module qui n a que des tableaux ne cree pas de feuille Excel vide de champs
- backend/tests/export-format.test.js :: X16 : le PDF de 60 saisies a autant de pages que le total affiche dans le pied de page et aucune page vide
- backend/tests/export-format.test.js :: X21 : le nombre de pages du PDF reste égal au total affiché dans les pieds de page, aucune page vide
- backend/tests/export-format.test.js :: X23 : export de 3 saisies RH (comme dans la demo) produit un PDF sans page vide et pieds coherents

**Limite :** Les tests automatiques vérifient la structure du fichier Excel (feuille Synthèse, une feuille par module, noms de feuille valides et uniques) et du PDF (pages, en-tête, pied de page, pas de page vide) avec des données générées ; ils ne remplacent pas la vérification visuelle manuelle contre les données validées réales, qui est la procédure manuelle ci-dessous.

**Limite :** les tests automatiques vérifient que l'export répond 200 et qu'il est réservé aux bons rôles ; ils ne vérifient pas le contenu des fichiers. La conformité du contenu (colonnes, valeurs, une fiche par saisie) se contrôle avec la procédure manuelle ci-dessous.

**Procédure manuelle :**
1. Se connecter en admin1 (`120344` / `Test@2026`), aller dans « Collecte et téléchargement »
2. Sélectionner Régions : `Analamanga`, Modules : `RA`, Période : `Septembre 2026`
3. Cliquer « Télécharger en Excel (.xlsx) » → téléchargement fichier `.xlsx` (2 feuilles : métadonnées + valeurs aplaties)
4. Cliquer « Télécharger en PDF » → téléchargement fichier `.pdf` (une fiche par saisie)
5. Se connecter en admin2 (`108231`), aller dans « Consultation et téléchargement »
6. Même sélection → Télécharger en Excel (.xlsx) et en PDF (admin2 ne voit que sa région Analamanga)
7. Se connecter en consultant (`121775`), aller dans « Consultation des données »
8. Vérifier qu'il n'y a AUCUN bouton de téléchargement (le consultant n'a pas le droit de télécharger)
9. Ouvrir le fichier `.xlsx` : vérifier que la première feuille est intitulée « Synthèse » (titre, sous-titres « Ministère de l'Économie et des Finances — DGBF / SSEBF », date d'export, régions, modules, nombre de saisies), puis qu'il existe une feuille par module exporté (ex. « RA », « RH ») avec des colonnes lisibles (« Structure », « Période / Événement », « Auteur », « Statut », champs du gabarit) et les nombres alignés à droite. Pour un module à tableau (ex. « RH »), vérifier la présence d'une feuille de tableau par tableau de saisie avec une ligne par ligne de saisie.
10. Ouvrir le fichier `.pdf` : vérifier l'en-tête de chaque page (logo, « SIGBD », « Ministère de l'Économie et des Finances — DGBF / SSEBF », filet de séparation), le pied de page « Page X / Y » et « Document généré par SIGBD le … » en gris, le titre « Collecte des données » en page 1, puis pour chaque saisie le bloc « <code> — <libellé du module> », la grille d'informations, les champs scalaires en deux colonnes et les vrais tableaux pour les champs de type table.

**État ** : Automatisé

### T-08

**Scénario :** Envoi d'une remarque via la zone contextuelle

**Critère d'acceptation :** Remarque reçue par l'administrateur de l'application

**Tests automatiques :**
- backend/tests/rbac.test.js :: admin2 : consulte sa région (liste, collecte, export) et envoie une remarque (API uniquement)
- backend/tests/rbac.test.js :: admin1 : tableau de bord, collecte, historique, export, audit, remarques (API uniquement)
- backend/tests/rbac.test.js :: developpeur : publie une version de gabarit, gère les listes et les remarques (API uniquement)

**Procédure manuelle :**
1. Se connecter en admin2 (`108231` / `Test@2026`), aller dans « Données saisies »
2. Sur une ligne de saisie, cliquer sur l'icône de remarque (bulle) → zone de saisie de remarque
3. Saisir : `Contexte : Module RA — Octobre 2026`, Texte : `Bien reçu, merci.`
4. Cliquer « Envoyer » → confirmation
5. Se connecter en développeur (`123009`), aller dans « Remarques »
6. La remarque apparaît dans la boîte de réception avec statut « nouvelle »
7. Changer le statut en « en_cours » via le sélecteur → statut mis à jour

**Note :** Les remarques sont des messages de support envoyés par admin1/admin2 vers l'équipe technique (développeur) ; le développeur les reçoit et les traite.

**État ** : Automatisé

### T-09

**Scénario :** Contrôle des droits par profil (accès non autorisé)

**Critère d'acceptation :** Accès refusé aux menus et données hors profil

**Tests automatiques :**
- backend/tests/rbac.test.js :: client : ne valide jamais un rapport (403) (API uniquement)
- backend/tests/rbac.test.js :: client : ne rejette jamais un rapport (403) (API uniquement)
- backend/tests/rbac.test.js :: client : ne télécharge rien — collecte et export (403) (API uniquement)
- backend/tests/rbac.test.js :: client : lit uniquement sa structure (autre structure → 404) (API uniquement)
- backend/tests/rbac.test.js :: admin2 : ne crée jamais d'utilisateur (403) (API uniquement)
- backend/tests/rbac.test.js :: admin2 : ne lit pas une saisie d'une autre région (404) (API uniquement)
- backend/tests/rbac.test.js :: admin2 : ne voit jamais de brouillon (404 + liste sans brouillon) (API uniquement)
- backend/tests/rbac.test.js :: admin1 : ne valide jamais (403) (API uniquement)
- backend/tests/rbac.test.js :: admin1 : ne rejette jamais (403) (API uniquement)
- backend/tests/rbac.test.js :: admin1 : n’exporte jamais (403) (API uniquement)
- backend/tests/rbac.test.js :: admin1 : ne modifie jamais une saisie (403) (API uniquement)
- backend/tests/rbac.test.js :: admin1 : ne modifie jamais un gabarit (403 sur POST et PUT /config) (API uniquement)
- backend/tests/rbac.test.js :: developpeur : ne lit aucune saisie (403 sur détail et liste) (API uniquement)
- backend/tests/rbac.test.js :: developpeur : ne crée jamais d'utilisateur (403) (API uniquement)
- backend/tests/rbac.test.js :: consultant : ne télécharge rien (403 sur collecte et export) (API uniquement)
- backend/tests/rbac.test.js :: consultant : n’écrit quoi que ce soit (403 partout) (API uniquement)

**Procédure manuelle :**
1. Se connecter en client (`104562`), essayer d'accéder à `/donnees-saisies` (URL admin2) → page « Accès refusé » (403)
2. En client, essayer d'accéder à `/collecte` (URL admin1) → 403
3. En client, essayer de valider une saisie via l'API → 403
4. En client, essayer de télécharger un export → 403
5. Se connecter en admin2 (`108231`), essayer d'accéder à `/utilisateurs` (URL admin1) → 403
6. En admin2, essayer de lire une saisie d'une autre région (ex: Atsinanana) via l'API → 404
7. En admin2, essayer de voir des brouillons → 404
8. Se connecter en admin1 (`120344`), essayer de valider une saisie → 403
9. En admin1, essayer d'exporter une saisie → 403
10. Se connecter en développeur (`123009`), essayer d'accéder à une saisie détail → 403
11. En développeur, essayer de créer un utilisateur → 403
12. Se connecter en consultant (`121775`), essayer de télécharger un export → 403
13. En consultant, essayer d'accéder à `/parametrage` → 403
14. Tout utilisateur essayer d'ouvrir une page d'un autre rôle → 403 ou 404 selon le cas

**État ** : Automatisé

### T-10

**Scénario :** Sauvegarde puis restauration de la base

**Critère d'acceptation :** Restauration complète et vérifiée

**Tests automatiques :**
- backend/tests/backup.test.js :: B1 : backup cree une archive non vide et refuse d ecraser un fichier existant (API uniquement)
- backend/tests/backup.test.js :: B2 : restore sans --yes en mode non interactif est refuse (API uniquement)
- backend/tests/backup.test.js :: B3 : restore remet les collections supprimees avec le meme nombre de documents (API uniquement)
- backend/tests/backup.test.js :: B4 : backup:verify confirme la restauration et supprime la base temporaire (API uniquement)
- backend/tests/backup.test.js :: B5 : restore est refuse en production sans --allow-production (API uniquement)
- backend/tests/backup.test.js :: B6 : backup:verify detecte un ecart quand la base a change apres la sauvegarde (API uniquement)

**Limite :** les tests B1 à B6 sont automatiquement ignorés si l'outil `mongodump` n'est pas installé (c'est le cas de la CI GitHub). Ils s'exécutent sur une machine où `mongodump` et `mongorestore` sont disponibles. Résultat constaté à renseigner dans la section 4.

**Procédure manuelle :**
1. Créer une sauvegarde : `npm run backup --prefix backend`
2. Copier le fichier généré dans `backups/` vers un stockage externe (HORS du serveur)
3. Sur une COPIE de la base (jamais la base de production) : `npm run restore --prefix backend -- backups/<fichier> --yes`
4. Vérifier que les collections ont le même nombre de documents : `npm run backup:verify --prefix backend -- backups/<fichier>`
4. Répéter cette procédure chaque trimestre et consigner les résultats.

**État ** : Automatisé

### T-11

**Scénario :** Test de charge et de connexion à débit limité

**Critère d'acceptation :** Objectifs de performance NF-03 respectés

**Tests automatiques :**
Aucun test automatique.

**Procédure manuelle :**
1. Préparer une base dédiée : `MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_loadcheck node backend/src/seed/demo.js --yes`
2. Démarrer l'API sur cette base : `MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_loadcheck PORT=4000 node backend/src/server.js`
3. Lancer le test de charge : `npm run loadtest -- --duration 20 --concurrency 5`
4. Observer les résultats : p50/p95/p99, taux d'erreur, nombre de 429
5. Pour le test à débit limité : ouvrir les outils de développement du navigateur (onglet Réseau), sélectionner le profil « Fast 3G » ou « Slow 3G », recharger la page, chronométrer l'affichage complet ; objectif : < 3 secondes.
6. Nettoyer : arrêter l'API, supprimer la base `sigbd_loadcheck`.

**État ** : Procédure manuelle

### T-12

**Scénario :** Compatibilité navigateurs

**Critère d'acceptation :** Fonctionnement correct sur les navigateurs cibles

**Tests automatiques :**
Aucun test automatique.

**Procédure manuelle :**
1. Ouvrir l'application sur Chrome (version récente), se connecter avec `104562` / `Test@2026`
2. Créer une saisie RA, la soumettre
3. Vérifier que les formulaires et tableaux s'affichent correctement
4. Répéter sur Firefox (version récente)
5. Répéter sur Edge (version récente)
6. Enregistrer les résultats dans la section 4 (Fiche de résultats)

**État ** : Procédure manuelle

## 4. Fiche de résultats

| N° | Date | Testeur | Navigateur et version | Résultat (OK / KO) | Observations |
|----|------|---------|----------------------|-------------------|--------------|
| T-01 |      |         |                      |                   |              |
| T-02 |      |         |                      |                   |              |
| T-03 |      |         |                      |                   |              |
| T-04 |      |         |                      |                   |              |
| T-05 |      |         |                      |                   |              |
| T-06 |      |         |                      |                   |              |
| T-07 |      |         |                      |                   |              |
| T-08 |      |         |                      |                   |              |
| T-09 |      |         |                      |                   |              |
| T-10 |      |         |                      |                   |              |
| T-11 |      |         |                      |                   |              |
| T-12 |      |         |                      |                   |              |
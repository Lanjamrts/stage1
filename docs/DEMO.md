# Script de démonstration — SIGBD (10 minutes)

## Avant la démonstration

```bash
npm run seed:demo --prefix backend   # taper OUI ; efface et remet les données de démo
npm run dev                          # lance l'API (port 4000) et le frontend (port 5173)
```

Ouvrir http://localhost:5173

**Avertissement** : le seed réinitialise les données de démo (toutes les saisies, utilisateurs, etc. sont recréées).

Les saisies de démonstration (modules NCA et TSE) utilisent des EPN réels du référentiel de référence, chargés par `npm run seed:ref` (32 ministères, 223 EPN depuis `backend/data/init/epn.csv`).

**Liste de contrôle** :
- [ ] MongoDB lancé sur `mongodb://127.0.0.1:27017`
- [ ] Ports 4000 (API) et 5173 (frontend) libres
- [ ] Navigateur sur la page de connexion

---

## Comptes utilisés

| Rôle | IM | Mot de passe |
|------|-----|--------------|
| Client | `104562` | `Test@2026` |
| Admin 2 | `108231` | `Test@2026` |
| Admin 1 | `120344` | `Test@2026` |
| Développeur | `123009` | `Test@2026` |
| Consultant | `121775` | `Test@2026` |

*Source : README.md section « Comptes de démonstration »*

---

## Déroulé (≈ 10 min)

### 1. Le Client crée une saisie pour Septembre 2026 (2 min)

- **Compte** : Client — `104562`
- **Écran** : « Mes saisies » <!-- frontend/src/menus.js:6 -->
- **Actions** :
  - Cliquer « Créer une nouvelle saisie » <!-- frontend/src/pages/client/MesSaisies.jsx:240 -->
  - Module : « Rapport d'activités » (RA), Période : « Septembre 2026 » (mensuelle) → « Créer » <!-- frontend/src/components/Form/NouvelleSaisieModal.jsx:194 -->
  - Remplir quelques champs (ex. « Activités réalisées », « Indicateurs de performance »)
  - Cliquer « Enregistrer » <!-- frontend/src/components/Form/NouvelleSaisieModal.jsx:177 -->
  - Cliquer « Soumettre » <!-- frontend/src/pages/client/SaisieDetail.jsx:240 -->
- **Résultat attendu** : Saisie passe en statut « Soumise », badge « Soumise » visible dans la liste
- **Ce qu'on dit** : « Le client crée son brouillon pour la période Septembre 2026, l'enregistre, puis le soumet pour validation. »

---

### 2. L'Admin 2 rejette avec un motif (1 min 30 s)

- **Compte** : Admin 2 — `108231`
- **Écran** : « Données saisies » <!-- frontend/src/menus.js:9 -->
- **Actions** :
  - Onglet « À examiner » <!-- frontend/src/pages/admin2/DonneesSaisies.jsx:11 --> → trouver la saisie RA du client `104562` pour Septembre 2026
  - Cliquer « Examiner » <!-- frontend/src/pages/admin2/DonneesSaisies.jsx:126 -->
  - Cliquer « Rejeter » <!-- frontend/src/pages/admin2/RevueSaisie.jsx:293 -->
  - Saisir motif : `Merci de détailler les indicateurs de performance.` → « Confirmer le rejet » <!-- frontend/src/pages/admin2/RevueSaisie.jsx:67-68 -->
- **Résultat attendu** : Saisie passe en « Rejetée », motif visible côté client
- **Ce qu'on dit** : « L'admin régional examine et rejette avec un motif obligatoire sur les indicateurs de performance. »

---

### 3. Le Client corrige et resoumet (1 min 30 s)

- **Compte** : Client — `104562`
- **Écran** : « Mes saisies » <!-- frontend/src/menus.js:6 -->
- **Actions** :
  - La saisie a un badge « Rejetée » et le motif est visible
  - Cliquer sur la saisie → modifier le champ « Indicateurs de performance » <!-- backend/src/seed/modules.js:31-37 -->
  - Cliquer « Enregistrer » puis « Soumettre » <!-- frontend/src/pages/client/SaisieDetail.jsx:240 -->
- **Résultat attendu** : Nouvelle soumission acceptée, statut « Soumise »
- **Ce qu'on dit** : « Le client voit le motif, corrige les indicateurs de performance, et resoumet sans recréer la saisie. »

---

### 4. L'Admin 2 valide puis exporte (2 min)

- **Compte** : Admin 2 — `108231`
- **Écran** : « Données saisies » <!-- frontend/src/menus.js:9 -->
- **Actions** :
  - Onglet « À examiner » <!-- frontend/src/pages/admin2/DonneesSaisies.jsx:11 --> → « Examiner » sur la saisie corrigée
  - Cliquer « Valider » <!-- frontend/src/pages/admin2/RevueSaisie.jsx:287 --> → fenêtre « Valider ce rapport ? » → bouton « Confirmer la validation » <!-- frontend/src/pages/admin2/RevueSaisie.jsx:348-353 --> → statut « Validée » <!-- frontend/src/components/Common/StatusBadge.jsx:18 -->
  - Cliquer « Exporter vers la base » <!-- frontend/src/pages/admin2/RevueSaisie.jsx:306 --> → fenêtre « Exporter vers la base ? » → bouton « Exporter vers la base » <!-- frontend/src/pages/admin2/RevueSaisie.jsx:356-362 --> → statut « Exportée » <!-- frontend/src/components/Common/StatusBadge.jsx:19 -->
- **Résultat attendu** : Saisie en « Exportée », visible dans « Consultation et téléchargement »
- **Ce qu'on dit** : « Validation puis export vers la base centrale en un clic, avec modale de confirmation. »

---

### 5. L'Admin 1 collecte et télécharge (1 min 30 s)

- **Compte** : Admin 1 — `120344`
- **Écran** : « Collecte et téléchargement » <!-- frontend/src/menus.js:16 -->
- **Actions** :
  - Onglet « Résultats » <!-- frontend/src/pages/admin1/CollectePage.jsx:238 --> → cocher « Régions » : `Analamanga` <!-- frontend/src/pages/admin1/CollectePage.jsx:273-284 -->
  - Cocher « Modules » : `Rapport d'activités` <!-- frontend/src/pages/admin1/CollectePage.jsx:306-316 -->
  - Cocher une ou deux lignes du tableau : case d'en-tête « Tout sélectionner », lien « Tout désélectionner » au-dessus du tableau <!-- frontend/src/pages/admin1/CollectePage.jsx:211,186 -->
  - Cliquer sur le bouton de téléchargement Excel (libellé dynamique selon la sélection) <!-- frontend/src/pages/admin1/CollectePage.jsx:125-143 -->
  - Cliquer sur le bouton de téléchargement PDF (id.) <!-- frontend/src/pages/admin1/CollectePage.jsx:125-143 -->
  - (Optionnel) Onglet « Historique des soumissions » <!-- frontend/src/pages/admin1/CollectePage.jsx:239 --> pour voir l'historique complet
- **Résultat attendu** : Fichiers .xlsx (2 feuilles : « Données » + « Valeurs ») <!-- backend/src/controllers/collecteController.js:214,241 --> et .pdf téléchargés ; le fichier .xlsx ne contient que les saisies sélectionnées quand une sélection est active ; boutons de téléchargement visibles uniquement sur l'onglet « Résultats »
- **Ce qu'on dit** : « L'admin central télécharge les exports consolidés de toutes les régions, avec deux feuilles Excel (métadonnées + valeurs aplaties). Les filtres sont des cases à cocher Régions et Modules, pas de filtre Période. »

---

### 6. Tableau de bord Admin 1 (1 min)

- **Compte** : Admin 1 — `120344`
- **Écran** : « Tableau de bord » <!-- frontend/src/menus.js:14 -->
- **Actions** :
  - Observer les 4 cartes : « Taux de soumission », « Soumissions reçues », « En retard », « Taux de rejet » <!-- frontend/src/pages/admin1/Admin1Dashboard.jsx:54-80 -->
  - Voir le tableau « Structures en retard » (Module / Échéance / Retard) <!-- frontend/src/pages/admin1/Admin1Dashboard.jsx:216-265 -->
- **Résultat attendu** : Vue d'ensemble centralisée en temps réel
- **Ce qu'on dit** : « Tableau de bord central avec 4 indicateurs clés et le détail des structures en retard par région. »

---

### 7. Le Consultant en lecture seule (1 min)

- **Compte** : Consultant — `121775`
- **Écran** : « Consultation des données » <!-- frontend/src/menus.js:27 -->
- **Actions** :
  - Filtrer : Région (sélecteur), Module (sélecteur), Période (sélecteur), Statut (sélecteur) <!-- frontend/src/pages/consultant/ConsultationDonnees.jsx:83-134 -->
  - Cliquer sur une ligne → détail de la saisie exportée (bouton « Consulter » sans téléchargement) <!-- frontend/src/pages/consultant/ConsultationDonnees.jsx:202-210 -->
  - Vérifier l'**absence** de bouton de téléchargement
- **Résultat attendu** : Consultation possible, **pas de bouton** d'export ni d'action
- **Ce qu'on dit** : « Le consultant a un accès lecture seule aux données validées/archivées, avec filtres Région, Module, Période, Statut. »

---

### 8. Le Développeur : éditeur de gabarit (1 min)

- **Compte** : Développeur — `123009`
- **Écran** : « Paramétrage » <!-- frontend/src/menus.js:21 -->
- **Actions** :
  - Liste des 13 modules <!-- backend/src/seed/modules.js: MODULES.length = 13 --> avec version
  - Cliquer sur un module (ex. RA) → éditeur de champs
  - « Annuler les modifications » <!-- frontend/src/pages/dev/GabaritEditeur.jsx:727 -->
  - « Publier la version N+1 » <!-- frontend/src/pages/dev/GabaritEditeur.jsx:734 -->
- **Résultat attendu** : Version du module incrémentée, champs modifiés publiés
- **Ce qu'on dit** : « Le développeur gère les gabarits (versions, activation, champs) sans coder. »

---

### 9. Journal d'audit (30 s)

- **Compte** : Admin 1 — `120344` (ou Développeur `123009`)
- **Écran** : « Journal d'audit » <!-- frontend/src/menus.js:17,23 -->
- **Actions** :
  - Filtrer par action : voir les libellés affichés <!-- frontend/src/pages/admin1/AuditJournal.jsx:8-30 -->
    - `saisie_submit` → « Soumission de saisie »
    - `saisie_validate` → « Validation de saisie »
    - `saisie_reject` → « Rejet de saisie »
    - `saisie_export` → « Export vers la base »
    - `download_excel` → « Téléchargement Excel »
    - `download_pdf` → « Téléchargement PDF »
- **Résultat attendu** : Traçabilité complète, append-only (pas de suppression)
- **Ce qu'on dit** : « Audit append-only : chaque action sensible laisse une trace immuable avec libellé français. »

---

## Plan B

- Si un écran ne répond pas : relancer `npm run dev`
- Si les données sont perdues/corrompues : relancer `npm run seed:demo --prefix backend` (taper OUI)
- Comptes de secours : `112470` (Client), `108231` (Admin 2), `120344` (Admin 1)
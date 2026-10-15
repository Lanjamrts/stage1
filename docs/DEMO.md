# Script de démonstration — SIGBD (10 minutes)

## Avant la démonstration

```bash
npm run seed:demo --prefix backend   # taper OUI ; efface et remet les données de démo
npm run dev                          # lance l'API (port 4000) et le frontend (port 5173)
```

Ouvrir http://localhost:5173

**Avertissement** : le seed réinitialise les données de démo (toutes les saisies, utilisateurs, etc. sont recréées).

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

### 1. Le Client soumet un rapport (2 min)

- **Compte** : Client — `104562`
- **Écran** : « Mes saisies » (`frontend/src/menus.js:6`)
- **Actions** :
  - Cliquer « Créer une nouvelle saisie » (`frontend/src/pages/client/MesSaisies.jsx:240`)
  - Module : « Rapport d'activités » (RA), Période : « Octobre 2026 » (mensuelle) → « Créer »
  - Remplir quelques champs (ex. Activités, Indicateurs)
  - Cliquer « Enregistrer » (`frontend/src/components/Form/NouvelleSaisieModal.jsx:177`)
  - Cliquer « Soumettre » (`frontend/src/pages/client/SaisieDetail.jsx:240`)
- **Résultat attendu** : Saisie passe en statut « Soumise », badge « Soumise » visible dans la liste
- **Ce qu'on dit** : « Le client crée son brouillon, l'enregistre, puis le soumet pour validation. »

---

### 2. L'Admin 2 rejette avec un motif (1 min 30 s)

- **Compte** : Admin 2 — `108231`
- **Écran** : « Données saisies » (`frontend/src/menus.js:9`)
- **Actions** :
  - Onglet « Soumises » → trouver la saisie RA du client `104562`
  - Cliquer « Examiner » (`frontend/src/pages/admin2/DonneesSaisies.jsx:126`)
  - Cliquer « Rejeter » (`frontend/src/pages/admin2/RevueSaisie.jsx:33`)
  - Saisir motif : `Merci de compléter la colonne grade.` → « Rejeter » (`frontend/src/pages/admin2/RevueSaisie.jsx:293`)
- **Résultat attendu** : Saisie passe en « Rejetée », motif visible côté client
- **Ce qu'on dit** : « L'admin régional examine et rejette avec un motif obligatoire. »

---

### 3. Le Client corrige et resoumet (1 min 30 s)

- **Compte** : Client — `104562`
- **Écran** : « Mes saisies » (`frontend/src/menus.js:6`)
- **Actions** :
  - La saisie a un badge « Rejetée » et le motif est visible
  - Cliquer sur la saisie → corriger les données (ex. ajouter le grade manquant)
  - Cliquer « Enregistrer » puis « Soumettre » (`frontend/src/pages/client/SaisieDetail.jsx:240`)
- **Résultat attendu** : Nouvelle soumission acceptée, statut « Soumise »
- **Ce qu'on dit** : « Le client voit le motif, corrige, et resoumet sans recréer la saisie. »

---

### 4. L'Admin 2 valide puis exporte (2 min)

- **Compte** : Admin 2 — `108231`
- **Écran** : « Données saisies » (`frontend/src/menus.js:9`)
- **Actions** :
  - Onglet « Soumises » → « Examiner » sur la saisie corrigée
  - Cliquer « Valider » (`frontend/src/pages/admin2/RevueSaisie.jsx:287`) → statut « Validée »
  - Cliquer « Exporter vers la base » (`frontend/src/pages/admin2/RevueSaisie.jsx:306`) → confirmation → statut « Exportée »
- **Résultat attendu** : Saisie en « Exportée », visible dans « Consultation et téléchargement »
- **Ce qu'on dit** : « Validation puis export vers la base centrale en un clic. »

---

### 5. L'Admin 1 collecte et télécharge (1 min 30 s)

- **Compte** : Admin 1 — `120344`
- **Écran** : « Collecte et téléchargement » (`frontend/src/menus.js:16`)
- **Actions** :
  - Filtrer : Région `Analamanga`, Module `RA`, Période `Octobre 2026`
  - Cliquer « Télécharger en Excel (.xlsx) » (`frontend/src/pages/admin1/CollectePage.jsx:223`)
  - Cliquer « Télécharger en PDF » (`frontend/src/pages/admin1/CollectePage.jsx:229`)
- **Résultat attendu** : Fichiers .xlsx (2 feuilles) et .pdf téléchargés
- **Ce qu'on dit** : « L'admin central télécharge les exports consolidés de toutes les régions. »

---

### 6. Tableau de bord Admin 1 (1 min)

- **Compte** : Admin 1 — `120344`
- **Écran** : « Tableau de bord » (`frontend/src/menus.js:14`)
- **Actions** :
  - Observer les compteurs : Total, Brouillons, Soumises, Rejetées
  - Vérifier la liste des structures en retard (si applicable)
- **Résultat attendu** : Vue d'ensemble centralisée en temps réel
- **Ce qu'on dit** : « Tableau de bord central avec indicateurs de suivi pour la direction. »

---

### 7. Le Consultant en lecture seule (1 min)

- **Compte** : Consultant — `121775`
- **Écran** : « Consultation des données » (`frontend/src/menus.js:27`)
- **Actions** :
  - Filtrer : Région, Module, Période
  - Cliquer sur une ligne → détail de la saisie exportée
  - Vérifier l'**absence** de bouton de téléchargement
- **Résultat attendu** : Consultation possible, **pas de bouton** d'export ni d'action
- **Ce qu'on dit** : « Le consultant a un accès lecture seule aux données validées/archivées. »

---

### 8. Le Développeur : éditeur de gabarit (1 min)

- **Compte** : Développeur — `123009`
- **Écran** : « Paramétrage » (`frontend/src/menus.js:21`)
- **Actions** :
  - Liste des 13 modules avec version
  - Cliquer sur un module (ex. RA) → éditeur de champs
  - « Annuler les modifications » (`frontend/src/pages/dev/GabaritEditeur.jsx:727`)
  - « Publier la version N+1 » (`frontend/src/pages/dev/GabaritEditeur.jsx:734`)
- **Résultat attendu** : Version du module incrémentée, champs modifiés publiés
- **Ce qu'on dit** : « Le développeur gère les gabarits (versions, activation, champs) sans coder. »

---

### 9. Journal d'audit (30 s)

- **Compte** : Admin 1 — `120344` (ou Développeur `123009`)
- **Écran** : « Journal d'audit » (`frontend/src/menus.js:17` ou `frontend/src/menus.js:23`)
- **Actions** :
  - Filtrer par rôle, action, utilisateur
  - Vérifier les traces : `login_success`, `saisie_submit`, `saisie_rejeter`, `saisie_valider`, `saisie_exporter`, `download_excel`, `download_pdf`
- **Résultat attendu** : Traçabilité complète, append-only (pas de suppression)
- **Ce qu'on dit** : « Audit append-only : chaque action sensible laisse une trace immuable. »

---

## Plan B

- Si un écran ne répond pas : relancer `npm run dev`
- Si les données sont perdues/corrompues : relancer `npm run seed:demo --prefix backend` (taper OUI)
- Comptes de secours : `112470` (Client), `108231` (Admin 2), `120344` (Admin 1)
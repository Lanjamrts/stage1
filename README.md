# SIGBD — Système Informatisé de Gestion de la Base de Données

Application web du Ministère de l'Économie et des Finances (Madagascar), Direction Générale
du Budget et des Finances — Service des Structures Excentriques du Budget et des Finances (SSEBF).

SIGBD centralise la collecte des 13 modules de rapports budgétaires (Rapport d'activités,
Ressources humaines, CRGP, …), leur validation régionale, leur export vers la base centrale
et leur consultation en lecture seule.

## Prérequis

- Node.js ≥ 18
- MongoDB local (`mongodb://127.0.0.1:27017`) ou Docker (optionnel, voir `npm run db:up`)

## Démarrage rapide

```bash
npm run install:all                # installe les dépendances (racine, backend, frontend)
npm run setup                      # crée les .env (backend + frontend) sans écraser l'existant
npm run db:up                      # (optionnel) démarre MongoDB dans Docker
npm run seed:demo --prefix backend # données de démonstration ; tapez OUI à la confirmation
npm run dev                        # lance l'API (port 4000) et le frontend (port 5173)
```

Puis ouvrir <http://localhost:5173> et se connecter avec `104562` / `Test@2026`.

> **Note** : si un MongoDB local tourne déjà sur le port 27017, ne lancez pas `npm run db:up` (conflit de port).

## Installation

```bash
cd backend  && npm install
cd ../frontend && npm install
```

## Configuration

La méthode recommandée est d'utiliser le script de configuration automatique :

```bash
npm run setup
```

Ce script copie `backend/.env.example` vers `backend/.env` et `frontend/.env.example` vers `frontend/.env` **uniquement s'ils n'existent pas déjà** (jamais d'écrasement). Il génère aussi un `JWT_SECRET` aléatoire de 96 caractères dans `backend/.env`.

Méthode manuelle (alternative) :

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Puis adaptez les valeurs, notamment `JWT_SECRET` en production.

Variables backend (`.env`) :
- `NODE_ENV` : `development` | `production` | `test` (défaut: `development`)
- `MONGODB_URI` : URI de connexion MongoDB (défaut: `mongodb://127.0.0.1:27017/sigbd`)
- `PORT` : Port du serveur API (défaut: `4000`)
- `JWT_SECRET` : **Secret JWT (minimum 32 caractères, OBLIGATOIRE en production, ne jamais utiliser la valeur par défaut)**
- `SESSION_TIMEOUT_MINUTES` : Délai d'inactivité glissant en minutes (défaut: `30`)
- `CORS_ORIGIN` : Origine CORS autorisée (ex: `https://votre-domaine.com`)
- `TRUST_PROXY` : Faire confiance aux en-têtes de proxy si derrière un reverse proxy (défaut: `false`)
- `JSON_BODY_LIMIT_KB` : Taille max du corps JSON en KB (défaut: `2048`, pour recensements et gabarits volumineux)
- `RATE_LIMIT_WINDOW_MINUTES` : Fenêtre de rate limiting par utilisateur en minutes (défaut: `15`)
- `RATE_LIMIT_USER_MAX` : Nombre max de requêtes par utilisateur par fenêtre (défaut: `1200`)
- `LOGIN_RATE_LIMIT_WINDOW_MINUTES` : Fenêtre de rate limiting pour login en minutes (défaut: `5`)
- `LOGIN_RATE_LIMIT_MAX` : Nombre max de tentatives de login par IP par fenêtre (défaut: `60`)
- `SEED_DEMO_PASSWORD` : Mot de passe pour les comptes de démo (défaut: `Test@2026` hors production)
- `SEED_ALLOW_PRODUCTION` : Autoriser le seed de **démonstration** en production (défaut: `false`, **dangereux**)

Variables frontend (`.env`) :
- `VITE_API_URL` : URL de l'API backend (défaut: `http://localhost:4000`)
- `NODE_ENV` : `development` | `production`

⚠️ **En production** :
- `JWT_SECRET` doit être défini, faire ≥ 32 caractères, et ne pas être la valeur par défaut
- Les comptes de démo (IM `104562`, `112470`, `115908`, `108231`, `120344`, `121775`, `123009`, `125430`, `098716`) **ne doivent jamais exister en production**
- Utilisez `npm run create-admin` pour créer le premier admin1 avec un mot de passe provisoire généré aléatoirement
- Le seed de **démonstration** est refusé en production sauf si `SEED_ALLOW_PRODUCTION=true` (à éviter)

## Base de données (seed)

```bash
cd backend && npm run seed:ref
```

Crée les profils et les 13 gabarits s'ils n'existent pas. Sûr en production. Ne supprime jamais rien.

```bash
cd backend && npm run seed:demo
```
(ou `npm run seed`) : données de démonstration. SUPPRIME les données (sauf le journal d'audit) après confirmation « OUI ». Options : `-- --yes` (sans confirmation), `-- --purge-audit` (supprime aussi le journal d'audit).

```bash
cd backend && npm run create-admin
```
Crée le premier administrateur (production).

Après un seed:demo il faut se reconnecter.

### Mise en service (production)

1. `npm run seed:ref`
2. `npm run create-admin`
3. Les référentiels réels seront importés à l'étape suivante du projet.

Archivage (script système, sans bouton d'interface) :

```bash
cd backend && npm run archive
```

Passe en statut `archivee` les rapports `exportee` dont la période est terminée.

## Périodicité du Rapport d'activités

Le Rapport d'activités accepte une période mensuelle ou trimestrielle ; le tableau de bord n'attend que la cadence mensuelle ; règle à confirmer par le SSEBF.

## Initialiser une base réelle

Pour initialiser une base de production (ou de préproduction) avec les structures centrales, les régions et les structures régionales, utilisez une base dédiée (jamais la base de démo `sigbd`).

1. Choisissez la base réelle, par exemple `sigbd_prod` (jamais la base de démo `sigbd`).
2. `NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run seed:ref` (profils et modules).
3. Éditez `backend/data/init/regions.csv` et `backend/data/init/structures.csv` ; mettez `valide` à `oui` **uniquement après confirmation par le SSEBF**. Types acceptes dans structures.csv : SRB, SRSP, SRPE, CIRBF, DRBF.
4. Vérifiez sans écrire : `NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run init:structures`
5. Écrivez : même commande avec `-- --apply` (refusé tant qu'une ligne a `valide=non`).
6. `NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run create-admin` (premier Admin 1, mot de passe provisoire affiché une seule fois).
7. Connectez-vous en tant qu'Admin 1 et créez les vrais utilisateurs dans l'écran « Utilisateurs ».

Les listes CSV proviennent de sources web non officielles et doivent être confirmées par le SSEBF. Les 3 structures centrales (SSEBF, DGBF, CELLULE_INFO) sont créées par le script. Les périodes seront gérées à l'étape 5. Les utilisateurs ne sont **pas** importés (ils sont saisis dans l'interface).

## Générer les périodes

Pourquoi : sans période, aucun rapport périodique ne peut être créé.

Commande de vérification (dry-run) :
```bash
NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run init:periodes -- --annee 2026 --premier-mois 10 --echeance-mensuelle-jour 5 --echeance-trimestrielle-jours 15
```

Commande d'écriture :
```bash
NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run init:periodes -- --annee 2026 --premier-mois 10 --echeance-mensuelle-jour 5 --echeance-trimestrielle-jours 15 --apply
```

- Les règles d'échéance (jour du mois suivant pour les mensuelles, jours après la fin du trimestre pour les trimestrielles) sont des règles du SSEBF et n'ont **pas de valeur par défaut** ; les valeurs 5 et 15 dans l'exemple viennent des données de démonstration et doivent être confirmées.
- Utilisez `--premier-mois` pour ne générer que les périodes à partir du mois de mise en service (sinon le tableau de bord affiche les périodes passées comme en retard pour toutes les structures).
- Le script ne modifie ni ne supprime jamais les périodes existantes.

## Démarrage

Terminal 1 — API (port 4000) :

```bash
cd backend && npm run dev
```

Terminal 2 — application (port 5173) :

```bash
cd frontend && npm run dev
```

Puis ouvrir <http://localhost:5173>.

## Tests

```bash
cd backend && npm test
```
Ou depuis la racine :
```bash
npm run test
```

Le script sème d'abord la base dédiée `sigbd_test`, puis exécute la suite Vitest
(81 tests : RBAC, machine à états, audit append-only, `mustChangePassword`, périodicité, seed, setup, config…).
Le build de production du client : `cd frontend && npm run build` ou `npm run build` depuis la racine.

## Sauvegarde et restauration

Les sauvegardes sont stockées dans le dossier `backups/` à la racine du dépôt (ignoré par git). Les fichiers sont créés avec les permissions 0600 (lecture/écriture propriétaire uniquement) car ils contiennent des empreintes de mots de passe et des données sensibles.

Commandes (depuis la racine du projet) :

```bash
npm run backup --prefix backend           # crée backups/sigbd-<base>-<AAAAMMJJ-HHMMSS>Z.archive.gz
npm run restore --prefix backend -- <fichier>  # restaure ; ajoutez --yes pour confirmer sans saisie
npm run backup:verify --prefix backend [-- <fichier>]  # vérifie la dernière ou un fichier donné
```

Exemple de ligne cron quotidienne (DOCUMENTATION SEULEMENT, rien n'est installé automatiquement) :

```bash
0 2 * * * cd /chemin/vers/projet && npm run backup --prefix backend >> /var/log/sigbd-backup.log 2>&1
```

**Important** :
- Copiez les sauvegardes HORS du serveur (ex: stockage objet, bande, autre machine).
- Testez la restauration chaque trimestre sur une COPIE de la base (jamais sur la base de production directement).
- Les archives contiennent des données sensibles (empreintes de mots de passe, données budgétaires). Le mode 0600 limite l'accès au propriétaire du fichier.

## Test de charge

```bash
npm run loadtest -- --duration 20 --concurrency 5
```

Options :
- `--url` : URL de l'API (défaut `http://localhost:4000`, doit être localhost ou 127.0.0.1)
- `--duration` : durée en secondes (défaut 20)
- `--concurrency` : nombre de workers parallèles (défaut 5)
- `--p95-max` : seuil en ms pour le p95 global (optionnel, exit 1 si dépassé)

Seuils suggérés (non imposés, à adapter selon l'infrastructure) :
- p95 < 1000 ms par requête API pour qu'une page reste sous 3 s
- Taux d'erreur 0 %
- Débit limité : testez avec les outils de développement du navigateur (onglet Réseau), profil « Fast 3G » ou « Slow 3G », chronométrez l'affichage complet de la page ; objectif : < 3 secondes.

## Comptes de démonstration

Mot de passe commun : `Test@2026`

| IM       | Rôle        | Structure / affectation        |
| -------- | ----------- | ------------------------------ |
| `104562` | client      | SRB – Analamanga               |
| `112470` | client      | SRSP – Analamanga              |
| `115908` | client      | CIRBF – Analamanga             |
| `108231` | admin2      | SRB – Analamanga (région)      |
| `120344` | admin1      | SSEBF (central)                |
| `123009` | developpeur | DGBF – Cellule Informatique    |
| `121775` | consultant  | DGBF (lecture seule)           |
| `125430` | client      | doit changer son mot de passe  |
| `098716` | client      | désactivé                      |

### Que voit chaque compte ?

D'après les menus définis dans `frontend/src/menus.js` :

- **client** : Tableau de bord, Mes saisies
- **admin2** : Données saisies, Consultation et téléchargement, Remarques
- **admin1** : Tableau de bord, Utilisateurs, Collecte et téléchargement, Journal d'audit, Remarques
- **developpeur** : Paramétrage, Remarques, Journal d'audit
- **consultant** : Tableau de bord, Consultation des données

## Rôles et machine à états

- **client** : saisit ses rapports (brouillon → soumission), corrige après rejet.
- **admin2** : valide / rejette (motif obligatoire) / exporte les saisies de sa région.
- **admin1** : utilisateurs, collecte et téléchargement, journal d'audit.
- **developpeur** : paramétrage des canevas et listes, boîte à remarques, journal.
- **consultant** : consultation en lecture seule des données exportées / archivées.

Cycle de vie d'une saisie : `brouillon → soumise → validee|rejetee → exportee → archivee`
( toute autre transition renvoie 409 ).

## Structure du dépôt

```
backend/    API Express + Mongoose (src/server.js), seed, tests Vitest
frontend/   React + Vite + Tailwind (src/pages, src/components)
shared/     rules.mjs — règles de formulaire partagées navigateur/serveur
design/     planches de design de référence (lecture seule)
SPEC.md     spécification fonctionnelle (faisant foi)
DECISIONS.md journal des choix d'implémentation phase par phase
```

## Déploiement

- `backend` : `npm start` (variable `PORT`, `MONGODB_URI`, `JWT_SECRET` via `.env`).
- `frontend` : `npm run build` puis servir `frontend/dist` derrière le même domaine que
  l'API (les appels sont préfixés `/api`, cookies de session `httpOnly`).

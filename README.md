# SIGBD — Système Informatisé de Gestion de la Base de Données

Application web du Ministère de l'Économie et des Finances (Madagascar), Direction Générale
du Budget et des Finances — Service des Structures Excentriques du Budget et des Finances (SSEBF).

SIGBD centralise la collecte des 13 modules de rapports budgétaires (Rapport d'activités,
Ressources humaines, CRGP, …), leur validation régionale, leur export vers la base centrale
et leur consultation en lecture seule.

## Prérequis

- Node.js ≥ 18
- MongoDB local (`mongodb://127.0.0.1:27017`) ou Docker (optionnel, voir `npm run db:up`) — support par défaut
- Oracle XE 21c (support optionnel, voir « Choix de la base de données » et `docs/DEPLOIEMENT.md`)

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
>
> Ce déroulé rapide part sur MongoDB (support par défaut). Pour travailler sur Oracle, positionnez
> `CORE_STORE` / `REFERENCE_STORE` / `AUDIT_STORE` et les variables `ORACLE_*`, posez le schéma
> puis lancez le seed : voir « Choix de la base de données ».

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
- `MONGODB_URI` : URI de connexion MongoDB (défaut: `mongodb://127.0.0.1:27017/sigbd`) — obligatoire sauf si `CORE_STORE`, `REFERENCE_STORE` et `AUDIT_STORE` valent tous `oracle`
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
- `CORE_STORE`, `REFERENCE_STORE`, `AUDIT_STORE` : support de stockage par composant (`mongo` par défaut, `oracle` optionnel) — voir « Choix de la base de données »
- `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`, `ORACLE_POOL_MIN`, `ORACLE_POOL_MAX` : connexion Oracle XE 21c (optionnelle) — voir « Choix de la base de données »
- `ORACLE_TEST_USER`, `ORACLE_TEST_PASSWORD`, `ORACLE_TEST_CONNECT_STRING` : identifiants de test Oracle, lus uniquement si `NODE_ENV=test`

Variables frontend (`.env`) :
- `VITE_API_URL` : URL de l'API backend (défaut: `http://localhost:4000`)
- `NODE_ENV` : `development` | `production`

⚠️ **En production** :
- `JWT_SECRET` doit être défini, faire ≥ 32 caractères, et ne pas être la valeur par défaut
- Les comptes de démo (IM `104562`, `112470`, `115908`, `108231`, `120344`, `121775`, `123009`, `125430`, `098716`) **ne doivent jamais exister en production**
- Utilisez `npm run create-admin` pour créer le premier admin1 avec un mot de passe provisoire généré aléatoirement
- Le seed de **démonstration** est refusé en production sauf si `SEED_ALLOW_PRODUCTION=true` (à éviter)

## Choix de la base de données

SIGBD fonctionne sur **MongoDB** (support par défaut) ou sur **Oracle XE 21c** (support
optionnel) ; le cahier des charges §13 autorise « Oracle ou MongoDB ». Les deux supports sont
code : la lecture et l'écriture passent par la couche des dépôts
(`backend/src/repositories/`) où chaque entité a une implémentation MongoDB (`*Mongo.js`) et
une implémentation Oracle (`*Oracle.js`). Le choix est relu **à chaque appel** par
`getXxxRepository()` d'après trois interrupteurs (`backend/src/config.js`).

### Variables de stockage et variables Oracle

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `CORE_STORE` | `mongo` | Noyau : régions, structures, périodes, utilisateurs, modules, saisies, remarques (`mongo` ou `oracle`) |
| `REFERENCE_STORE` | `mongo` | Profils et listes de référence (directions, services, grades, EPN, STD, ministères) |
| `AUDIT_STORE` | `mongo` | Journal d'audit (append-only) |
| `ORACLE_USER` | (vide) | Utilisateur Oracle applicatif ; **requis en production** dès qu'une variable Oracle est définie ou qu'un interrupteur vaut `oracle` (`backend/src/config.js`) |
| `ORACLE_PASSWORD` | (vide) | Mot de passe Oracle (jamais journalisé ni renvoyé au client) ; la valeur d'exemple est refusée en production |
| `ORACLE_CONNECT_STRING` | `127.0.0.1:1521/XEPDB1` | `hôte:port/service` de la base Oracle |
| `ORACLE_POOL_MIN` | `1` | Taille minimale du pool de connexions (`backend/src/db/oracle.js`) |
| `ORACLE_POOL_MAX` | `10` | Taille maximale du pool |
| `ORACLE_TEST_USER` | (vide) | Identifiants de test, lus **uniquement** quand `NODE_ENV=test` (effacés sinon) |
| `ORACLE_TEST_PASSWORD` | (vide) | idem |
| `ORACLE_TEST_CONNECT_STRING` | (vide) | idem |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/sigbd` | URI MongoDB ; **exigée tant qu'au moins un des trois stocks vaut `mongo`** : le serveur ne connecte MongoDB que si un stockage en a besoin (`backend/src/server.js`). Avec les trois stocks à `oracle`, la variable est facultative (si elle est fournie, elle doit rester une URL valide, mais rien ne s'y connecte) |

Sans `ORACLE_*` et avec les trois interrupteurs à `mongo` (valeurs par défaut), l'application
tourne entièrement sur MongoDB, comme au départ.

### Commandes Oracle

Commandes depuis la racine du dépôt (les options se passent avec `--prefix backend`, voir
les exemples ci-dessous ; un argument de fichier passé tel quel est bien transmis) :

| Commande (racine) | Script `backend/package.json` | Rôle |
| --- | --- | --- |
| `npm run db:oracle:up` / `npm run db:oracle:down` | — | Démarre / arrête le conteneur Oracle de développement (`docker-compose.yml`) |
| `npm run db:oracle:ping` | `oracle:ping` | Teste la connexion : `Oracle OK — version … — service …` (code 1 en cas d'échec) |
| `npm run db:oracle:schema` | `oracle:schema` | Crée les 13 tables (`backend/db/oracle/001_schema.sql`) ; options `--drop` / `--reset` refusées en production |
| `npm run db:migrate:oracle` | `migrate:oracle` | Copie MongoDB → Oracle (`backend/src/scripts/migrer-mongo-oracle.js`) ; dry-run par défaut, `--apply` écrit |
| `npm run db:backup:oracle` | `backup:oracle` | Sauvegarde logique JSON des 13 tables dans `backups/` (fichier mode 0600) |
| `npm run db:restore:oracle` | `restore:oracle` | Restaure un fichier ; dry-run par défaut, `--apply` écrit (base cible vide obligatoire) |
| — | `node src/scripts/verify-backup-oracle.js [fichier]` | Vérifie un fichier de sauvegarde (somme SHA-256 et comptes), sans connexion à la base |
| — | `seed:test:oracle` | Seed de démonstration sur Oracle (nécessite `ORACLE_TEST_*`), utilisé par la recette en mode Oracle |

Exemples avec options (depuis la racine, les options passent par `--prefix backend`) :

```bash
npm run oracle:schema --prefix backend -- --reset          # développement uniquement
npm run migrate:oracle --prefix backend -- --apply         # écrit puis vérifie ligne à ligne
npm run restore:oracle --prefix backend -- ../backups/<fichier> --apply
node backend/src/scripts/verify-backup-oracle.js backups/<fichier>
```

Les commandes npm tournent dans `backend/` : un chemin relatif y est résolu depuis `backend/`
(écrit donc `../backups/<fichier>` pour le dossier `backups/` de la racine, ou un chemin absolu).
Le lancement direct `node backend/src/scripts/…` depuis la racine résout lui les chemins depuis
la racine.

## Base de données (seed)

```bash
cd backend && npm run seed:ref
```

Crée les profils, les 13 gabarits de modules, les 32 ministères et les 223 EPN s'ils n'existent pas. Sûr en production. Ne supprime jamais rien. Un deuxième lancement ne crée aucun doublon.

```bash
cd backend && npm run seed:demo
```
(ou `npm run seed`) : données de démonstration. SUPPRIME les données (sauf le journal d'audit) après confirmation « OUI ». Options : `-- --yes` (sans confirmation), `-- --purge-audit` (supprime aussi le journal d'audit).

```bash
cd backend && npm run create-admin
```
Crée le premier administrateur (production).

Après un seed:demo il faut se reconnecter.

## Base Oracle (XE 21c)

Le socle Oracle XE 21c (dépendances `oracledb` + `knex`, module `backend/src/db/oracle.js`,
service Docker) est actif **uniquement** quand les variables `ORACLE_*` sont définies et qu'un
interrupteur `CORE_STORE` / `REFERENCE_STORE` / `AUDIT_STORE` vaut `oracle` ; avec les valeurs
par défaut, l'application tourne sur MongoDB. Voir « Choix de la base de données » ci-dessus,
le schéma dans [docs/SCHEMA_ORACLE.md](docs/SCHEMA_ORACLE.md) et la mise en production dans
[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

### Prérequis

- Oracle XE 21c accessible sur `127.0.0.1:1521/XEPDB1` (service `XEPDB1`, utilisateur applicatif `sigbd`), ou le service fourni par l'informatique du ministère.
- `oracledb` en **mode léger (thin)** : aucun Instant Client Oracle n'est nécessaire côté Node.
- Variables optionnelles (sans elles, l'application tourne sur MongoDB) :
  - `ORACLE_USER` : utilisateur applicatif
  - `ORACLE_PASSWORD` : mot de passe (jamais journalisé ni renvoyé au client)
  - `ORACLE_CONNECT_STRING` (défaut `127.0.0.1:1521/XEPDB1`)
  - `ORACLE_POOL_MIN` (défaut `1`), `ORACLE_POOL_MAX` (défaut `10`)
- `MONGODB_URI` n'est exigée que si l'un des trois stocks reste sur MongoDB : avec les trois stocks sur Oracle, le serveur démarre sans MongoDB et n'ouvre qu'Oracle (`backend/src/server.js`).

### Démarrer Oracle (Docker, développement uniquement)

```bash
npm run db:oracle:up        # démarre le service oracle (docker compose)
```

Nécessite `ORACLE_PASSWORD`, `APP_USER` et `APP_USER_PASSWORD` dans l'environnement (aucune valeur en clair dans `docker-compose.yml`). Pour l'arrêter : `npm run db:oracle:down`.

### Tester la connexion Oracle

```bash
npm run oracle:ping --prefix backend
```
ou depuis la racine :
```bash
npm run db:oracle:ping
```

Affiche `Oracle OK — version … — service …` ou un message d'erreur clair (code de sortie 1 en cas d'échec, pool fermé). Exécuter avec les variables `ORACLE_*` définies dans le terminal (le mot de passe n'est jamais affiché).

### Mots de passe

Aucun mot de passe réel n'est stocké dans le dépôt. `backend/.env.example` contient uniquement des placeholders (ex. `votre-mot-de-passe-oracle-ici`). Le mot de passe Oracle n'est jamais journalisé ni retourné au client.

### Mise en service (production)

Ordre valable quel que soit le support choisi (MongoDB par défaut, Oracle si `CORE_STORE` /
`REFERENCE_STORE` / `AUDIT_STORE` valent `oracle`) ; le guide détaillé, avec les variables de
production et les points à confirmer avec le ministère, est
[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

1. `npm run seed:ref` — crée les profils, les 13 gabarits de modules, les 32 ministères et les 223 EPN (données de référence, idempotent, ne supprime rien).
2. `npm run init:structures` — importe les régions et les structures (depuis `data/init/regions.csv` et `data/init/structures.csv`).
3. `npm run init:periodes` — génère les périodes de collecte.
4. `npm run create-admin` — crée le premier administrateur (production).

En Oracle, le schéma est posé avant (`npm run db:oracle:schema`) et une éventuelle migration
depuis MongoDB se fait juste après, sur une cible vide (`npm run db:migrate:oracle`), avant
toute écriture de seed.

Les référentiels de référence (ministères et EPN) sont chargés par `seed:ref` ; il n'est plus nécessaire de lancer `init:epn` manuellement.

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
2. `NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run seed:ref` (profils, modules, 32 ministères et 223 EPN).
3. Éditez `backend/data/init/regions.csv` et `backend/data/init/structures.csv` ; mettez `valide` à `oui` **uniquement après confirmation par le SSEBF**. Types acceptes dans structures.csv : SRB, SRSP, SRPE, CIRBF, DRBF.
4. Vérifiez sans écrire : `NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run init:structures`
5. Écrivez : même commande avec `-- --apply` (refusé tant qu'une ligne a `valide=non`).
6. `NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/sigbd_prod npm run create-admin` (premier Admin 1, mot de passe provisoire affiché une seule fois).
7. Connectez-vous en tant qu'Admin 1 et créez les vrais utilisateurs dans l'écran « Utilisateurs ».

Les listes CSV proviennent de sources web non officielles et doivent être confirmées par le SSEBF. Les 3 structures centrales (SSEBF, DGBF, CELLULE_INFO) sont créées par le script. Les périodes sont générées par `init:periodes` (voir « Générer les périodes »). Les utilisateurs ne sont **pas** importés (ils sont saisis dans l'interface).

En mode Oracle, ces mêmes commandes s'appliquent : les scripts écrivent dans le support désigné
par `CORE_STORE` / `REFERENCE_STORE` / `AUDIT_STORE`. `MONGODB_URI` n'est exigée dans la
configuration que si l'un des trois stocks reste sur MongoDB (le serveur ne s'y connecte alors
qu'en cas de besoin) ; avec les trois stocks sur Oracle, elle peut être absente.

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
(119 tests : RBAC, machine à états, audit append-only, `mustChangePassword`, périodicité, seed, setup, config, exports Excel/PDF, sauvegarde ; 6 tests de sauvegarde ignorés si `mongodump` est absent).
Les blocs de tests Oracle ne s'exécutent que si `ORACLE_TEST_USER` et `ORACLE_TEST_PASSWORD` sont définis (sinon ils sont ignorés sans erreur) ; le seed de test Oracle se lance avec `npm run seed:test:oracle --prefix backend` (voir « Recette en mode Oracle » dans [docs/RECETTE.md](docs/RECETTE.md)).
Les exports Excel et PDF suivent une mise en page commune (feuille de synthèse, une feuille par module, tableaux à lignes groupées, en-tête et pied de page PDF).
Le build de production du client : `cd frontend && npm run build` ou `npm run build` depuis la racine.

## Sauvegarde et restauration

Les sauvegardes sont stockées dans le dossier `backups/` à la racine du dépôt (ignoré par git). Les fichiers sont créés avec les permissions 0600 (lecture/écriture propriétaire uniquement) car ils contiennent des empreintes de mots de passe et des données sensibles.

Commandes (depuis la racine du projet) :

```bash
npm run backup --prefix backend           # crée backups/sigbd-<base>-<AAAAMMJJ-HHMMSS>Z.archive.gz
npm run restore --prefix backend -- <fichier>  # restaure ; ajoutez --yes pour confirmer sans saisie
npm run backup:verify --prefix backend [-- <fichier>]  # vérifie la dernière ou un fichier donné
```

En mode Oracle (interrupteurs à `oracle`), les commandes équivalentes produisent un fichier
JSON des 13 tables (`backups/sigbd-oracle-<service>-<horodatage>Z.json`, même dossier, même
mode 0600, somme de contrôle SHA-256) :

```bash
npm run db:backup:oracle                                              # crée la sauvegarde
npm run restore:oracle --prefix backend -- <fichier>                  # dry-run (plan, aucune écriture)
npm run restore:oracle --prefix backend -- <fichier> --apply          # écrit (base cible vide obligatoire)
node backend/src/scripts/verify-backup-oracle.js [<fichier>]          # vérifie sans connexion à la base
```

Le script de vérification Oracle n'a pas de raccourci npm : il s'exécute avec `node`
(depuis la racine ou depuis `backend/` avec `node src/scripts/verify-backup-oracle.js`).

Chemins de fichiers : les commandes `npm run … --prefix backend` s'exécutent dans `backend/`,
un chemin relatif y est donc résolu depuis `backend/` (écrivez `../backups/<fichier>` pour le
dossier `backups/` de la racine, ou un chemin absolu). `node backend/src/scripts/…` lancé
depuis la racine résout lui les chemins depuis la racine.

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
backend/    API Express + Mongoose (src/server.js), dépôts MongoDB/Oracle (src/repositories), seeds, scripts, tests Vitest
backend/db/oracle/  schéma DDL Oracle (001_schema.sql, 000_drop.sql)
frontend/   React + Vite + Tailwind (src/pages, src/components)
shared/     rules.mjs — règles de formulaire partagées navigateur/serveur
design/     planches de design de référence (lecture seule)
SPEC.md     spécification fonctionnelle (faisant foi)
DECISIONS.md journal des choix d'implémentation phase par phase
docs/RECETTE.md      dossier de recette (livrable L5)
docs/DEMO.md         script de démonstration (10 min)
docs/SCHEMA_ORACLE.md schéma Oracle (13 tables, correspondance Mongo → Oracle)
docs/DEPLOIEMENT.md  guide de déploiement pour l'équipe informatique du ministère
```

## Déploiement

- `backend` : `npm start` (variable `PORT`, `MONGODB_URI`, `JWT_SECRET` via `.env` ; variables `CORE_STORE`, `REFERENCE_STORE`, `AUDIT_STORE`, `ORACLE_*` pour basculer sur Oracle).
- `frontend` : `npm run build` puis servir `frontend/dist` derrière le même domaine que
  l'API (les appels sont préfixés `/api`, cookies de session `httpOnly`).
- Guide complet (prérequis, schéma Oracle, variables de production, ordre de mise en service,
  sauvegarde, vérifications, reprise après incident) : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).
- HTTPS, reverse proxy et points à confirmer avec l'informatique du ministère : voir les
  sections correspondantes de `docs/DEPLOIEMENT.md`.

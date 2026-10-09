# SIGBD — Système Informatisé de Gestion de la Base de Données

Application web du Ministère de l'Économie et des Finances (Madagascar), Direction Générale
du Budget et des Finances — Service Systèmes Électroniques de Budget et de Finances
(DGBF / SSEBF).

SIGBD centralise la collecte des 13 modules de rapports budgétaires (Rapport d'activités,
Ressources humaines, CRGP, …), leur validation régionale, leur export vers la base centrale
et leur consultation en lecture seule.

## Prérequis

- Node.js ≥ 18
- MongoDB local (`mongodb://127.0.0.1:27017`)

## Installation

```bash
cd backend  && npm install
cd ../frontend && npm install
```

## Base de données (seed)

```bash
cd backend && npm run seed
```

Le seed est idempotent : il purge et recrée régions, structures, utilisateurs, périodes,
référentiels, modules et saisies. **Après un re-seed, il faut se reconnecter.**

Archivage (script système, sans bouton d'interface) :

```bash
cd backend && npm run archive
```

Passe en statut `archivee` les rapports `exportee` dont la période est terminée.

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

Le script sème d'abord la base dédiée `sigbd_test`, puis exécute la suite Vitest
(33 tests : RBAC, machine à états, audit append-only, `mustChangePassword`…).
Le build de production du client : `cd frontend && npm run build`.

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

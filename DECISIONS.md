# DECISIONS.md

Journal des choix ambigus. Une ligne par décision, la plus simple chaque fois.

## Step 7 – Developer experience

- Root package.json with `install:all`, `setup`, `dev` (concurrently), `db:up`/`db:down` (docker compose), `test`, `build`.
- `scripts/setup.mjs` copies .env.example → .env only if missing, generates 96-char JWT_SECRET, never overwrites.
- `docker-compose.yml` for dev-only MongoDB (no auth, not for production).
- `concurrently@^9` is the only new dependency added.
- Production config refuses the example JWT_SECRET `votre-secret-jwt-d-au-moins-32-caracteres-ici` with clear error message.

- [P1] Structure monorepo: dossiers /server et /client à la racine, chacun avec son package.json et ses scripts.
- [P1] Fichiers de seed centralisés dans /server/src/seed/ et exécutés par `npm run seed` (idempotent: purge puis ré-insertion complète).
- [P1] structures.code non unique (SRB existe dans 3 régions); l'identifiant réel est code+région, libellé unique « SRB – Analamanga ».
- [P1] Les listes de référence (directions, services, grades, EPN, STD) sont stockées dans une collection `referentiels` {type, value} (la spécification compte 9 collections sans emplacement pour ces listes; /referentiels/:type en a besoin — choix le plus simple).
- [P1] Le seed de la Phase 1 couvre: profils, régions, structures, référentiels, périodes, utilisateurs. Modules et saisies arrivent en Phase 3 (déroulé prescrit par la spécification).
- [P2] journal_audit.userId stocké en String (permet d'auditer les échecs de connexion d'un IM inconnu; la spécification n'impose pas d'ObjectId).
- [P2] Rate limiting désactivé si NODE_ENV=test (sinon la suite de tests RBAC serait bloquée par les limites).
- [P2] « Différent du mot de passe provisoire » implémenté comme « nouveau ≠ actuel » (le serveur ne stocke jamais le mot de passe provisoire en clair).
- [P2] requireAuth(options) : allowPasswordChange=true pour logout/me/change-password; toutes les autres routes /api passent par requireAuth strict (403 PASSWORD_CHANGE_REQUIRED).
- [P2] Limite de connexion 20/5min par IP (et non 5) : le verrouillage de compte après 5 échecs doit rester observable par l'utilisateur avant le 429 IP.
- [P2] Helpers de périmètre centralisés dans middleware/scope.js (structuresInScope, regionOfUser, statusesInScope) — utilisés par les routes des phases 3 à 5.
- [P1] Tokens de design définis dans tailwind.config.js (couleurs, espacements, rayon, police Inter), conformes à DESIGN.md.
- [P1] AppShell = Sidebar (emblème + SIGBD + menu du rôle + footer DGBF · SSEBF) + TopBar (64px blanche) + bandeau national 4px (rouge/gauche, vert/droite).
- [P1] Seule une structure par région et par type (SRB, SRSP, SRPE, CIRBF) est créée pour les 3 régions Analamanga, Atsinanana, Diana (cohérent avec les utilisateurs du seed).
- [P1] Les utilisateurs du seed utilisent le mot de passe commun « Test@2026 » (spécifié), hashé avec bcrypt.
- [P1] L'auteur « système » du seed est un utilisateur technique de rôle developpeur (im SYS-0000) créé en base.
- [P1] L'environnement utilise ES modules ("type": "module") côté serveur; Vite côté client.
- [P1] Le cookie de session sera httpOnly + sameSite=strict + secure selon NODE_ENV (décision Phase 2, consignée maintenant).
- [P3] Le DSL de la SPEC (key:type!) est une notation d'écriture : en base, modules.fields est un JSON structuré {key,label,type,required,…) ; pas de parseur DSL.
- [P3] Règles communes navigateur/serveur placées dans /shared/rules.mjs (ESM sans dépendances) ; Vite autorisé via server.fs.allow ['..'].
- [P3] Messages français non fournis par la SPEC : maxLength « Ce champ ne doit pas dépasser N caractères. », entier/nombre, tableau « Ce tableau doit contenir au moins une ligne. », select « Cette valeur n'est pas autorisée. », afterField « La date doit être postérieure ou égale à {libellé}. », transition « Cette transition n'est pas autorisée. », édition « Cette saisie ne peut plus être modifiée. ».
- [P3] GET /api/periodes ajouté (indispensable au choix de période de la modale « Nouvelle saisie » ; la SPEC ne listait pas d'endpoint périodes).
- [P3] GET /api/referentiels/structures sert les libellés des structures actives (source du multiselect « structures » du CRGP).
- [P3] Période courante d'un module = période de sa périodicité dont start <= aujourd'hui la plus récente (Octobre 2026 / T3 2026 avec les données du seed).
- [P3] 4 compteurs du tableau de bord client : Total saisies, Brouillons, Soumises, Rejetées.
- [P3] Les routes de transition admin2 (valider/rejeter/exporter) sont implémentées côté API dès la Phase 3 (droits et machine à états vérifiables) ; l'UI arrive en Phase 4.
- [P3] admin1 voit les métadonnées de toutes les saisies mais values=null hors exportee/archivee (appliqué dès la Phase 3 dans la lecture API).
- [P4] GET /collecte renvoie un tableau JSON simple (cohérent avec /saisies), pas {items, total}.
- [P4] Export Excel = 2 feuilles (métadonnées + valeurs aplaties avec libellés français) ; PDF = une fiche par saisie. Seules les lignes exportee/archivee sont exportées (SPEC §8).
- [P4] Filtres de « Consultation et téléchargement » (admin2) : module, période, statut. Le périmètre régional est forcé côté serveur ; pas de filtre structure (aucun endpoint de structures par région).
- [P4] API remarques implémentée en entier dès la Phase 4 : POST + GET /mes (admin1/admin2) servent l'écran admin2 ; GET / et PATCH /:id/etat (developpeur) serviront la boîte de réception de la Phase 6.
- [P4] Lignes d'audit ajoutées : download_excel, download_pdf, remarque_create, remarque_state_change.
- [P4] La purge du seed inclut désormais la collection remarques (les utilisateurs sont recréés avec de nouveaux _id ; sinon les remarques deviennent orphelines).
- [P5] Tableau de bord : périodes retenues = échéance atteinte ; seuls les modules « periodic » de même périodicité génèrent des emplacements attendus, pour les structures actives ayant une région (types sans structure — DRBF — ou structures sans région — SSEBF, DGBF, Cellule — non comptés).
- [P5] « Soumise ou ultérieur » = statut différent de brouillon (rejetee incluse), comptée une fois = statut courant. Taux de rejet calculé sur toutes les saisies du périmètre (filtres module/période), pas seulement sur les emplacements attendus. « En retard » = emplacement attendu sans aucune saisie soumise ; une saisie soumise après l'échéance n'est pas comptée en retard (lecture simple de la SPEC).
- [P5] Le consultant reçoit les mêmes calculs que admin1 sur GET /dashboard (lecture seule, aucun bouton).
- [P5] GET /referentiels/structures?full=1 renvoie {id, label, type, region} : sert le tiroir Utilisateurs ET les cases régions/types de la page Collecte — pas de nouvel endpoint /regions.
- [P5] Filtres /collecte : regions (noms) et types (codes) en valeurs séparées par des virgules, modules en ids séparés par des virgules. L'export accepte les mêmes filtres mais force toujours exportee+archivee (le paramètre statut est ignoré pour l'export).
- [P5] Pas de réactivation d'utilisateur (absente de la SPEC) : seul « Désactiver » est proposé.
- [P5] Mot de passe provisoire au format Xxx-Xxx-Xxx (majuscule+minuscule+chiffre par groupe), mustChangePassword=true, renvoyé une seule fois.
- [P5] GET /audit : {id, date, action, userId, userLabel, object, ip}, 500 lignes les plus récentes ; filtre role résolu via les ObjectId + IM des utilisateurs du rôle (les échecs de connexion stockent l'IM).
- [P5] Formulaisateur utilisateur : direction et service en saisie libre ; l'IM est immuable à l'édition.
- [P5] Renommage des dossiers à la racine : /client → /frontend et /server → /backend (demande explicite) ; noms de package sigbd-frontend / sigbd-backend ; scripts npm inchangés (à lancer depuis chaque dossier). Les lignes historiques ci-dessus gardent l'ancien nom.
- [P6] Tableau de bord consultant = la page admin1 réutilisée avec pilule « Lecture seule » (GET /dashboard accepte déjà admin1 + consultant) ; pas de page dupliquée.
- [P6] La table « Consultation des données » (consultant) n'a ni bouton ni action : le clic sur une ligne est une navigation vers la page rapport (SPEC §4). Le rapport réutilise GET /saisies/:id et /:id/historique (le serveur renvoie déjà 404 hors exportee/archivee au consultant).
- [P6] GET /consultation : toutes régions, statuts exportee + archivee, filtres module/période ; moduleId ou periodeId malformé → 400 « Filtre invalide. ».
- [P6] Éditeur de gabarit : le serveur valide la structure des champs (types connus, clé /^[a-z][a-z0-9_]*$/i, tableau ≥ 1 sous-champ, ≥ 1 champ) avec messages FR ; la détection de clés dupliquées n'est faite que côté client (pas imposée par la SPEC — choix le plus simple).
- [P6] Activation/désactivation d'un gabarit via PATCH /config/modules/:id/active, sans ligne d'audit (liste fermée des actions auditées en SPEC §8 : « publication de gabarit » = POST/PUT).
- [P6] Listes de référence en écriture : seulement Directions, Services, Grades, EPN, STD (POST|PUT|PATCH) ; Régions, Structures et Périodes en lecture seule (SPEC §8 n'en prévoit pas l'écriture — en ajouter serait une fonctionnalité de plus).
- [P6] Aperçu de l'éditeur = DynamicForm désactivé, valeurs vides, options résolues via /referentiels/:source ; champs auto éditables (total/region/structure/author, clés de somme pour total).
- [P7] Correction de [P2] (SPEC §5 ligne « toute autre route ») : requireAuth strict sur /me et /refresh ; allowPasswordChange réservé à logout et change-password. Frontend : AuthGuard et RoleGuard interprètent le 403 code PASSWORD_CHANGE_REQUIRED comme « changement de mot de passe requis » (et non comme session expirée) pour éviter la boucle vers /login.
- [P7] backend/src/server.js exporte l'app Express et n'appelle startServer() que si NODE_ENV ≠ 'test' : supertest importe l'app sans ouvrir de port, le serveur de dev n'est pas doublé.
- [P7] `npm test` (backend) = seed de la base dédiée sigbd_test puis `vitest run` (vitest.config.js force NODE_ENV et MONGODB_URI ; le script force aussi les variables en ligne) : la base de dev n'est jamais touchée et les tests sont répétables.
- [P7] Suite RBAC (33 tests supertest) : interdits de la matrice, transitions invalides (409), rejet sans motif (400), soumission incomplète (400), édition d'une saisie soumise (409), audit append-only (DELETE/PATCH → 404, longueur stable), mustChangePassword (403 PASSWORD_CHANGE_REQUIRED partout sauf logout/change-password), puis actions autorisées par rôle.
- [P7] Les fixtures de test re-interrogent la base à chaque pick() : les transitions du bloc « actions autorisées » modifient les statuts au fil des tests.
- [P7] PUT /saisies/:id remplace values (pas de fusion) : éditer puis soumettre une saisie rejetée exige d'envoyer le formulaire complet.
- [P8] « Données saisies » (admin2) : une seule lecture de GET /saisies sert les compteurs d'onglets, les filtres (structure / module / période) et la table ; filtrage et pagination (10/25/50) côté client — les volumes de la SPEC ne justifient pas une pagination serveur.
- [P8] Action par statut dans la liste admin2 : Examiner (soumise), Exporter (validee, avec modale de confirmation), Consulter (autres) — export direct depuis la liste = POST /saisies/:id/exporter, comme dans l'écran de revue.
- [P8] admin1 n'a pas d'écran de détail de saisie (SPEC §4 : aucune route) : la colonne Action du zip « Consulter » n'est pas reprise dans l'historique des soumissions.
- [P8] Région dérivée côté client du libellé de structure « TYPE – Région » (split sur l'espace-en-dash) pour les colonnes Région (consultant, collecte) et la région du bandeau admin2 : serializeSaisie ne porte pas la région et aucun endpoint dédié n'est prévu.
- [P8] GET /audit : réponse enrichie de userRole (profil de l'auteur) + libellé utilisateur « Prénom Nom » (« Inconnu (IM x) » pour les échecs de connexion inconnus) pour la colonne Profil du zip. La recherche libre du zip est filtrée côté navigateur (aucun paramètre q côté serveur).
- [P8] Serialize des remarques enrichi de authorRole : sert la colonne Profil et le filtre « Tous les profils » de la boîte à remarques du développeur.
- [P8] GET /dashboard : structuresEnRetard.items = [{module, echeance, retardJours}] pour les colonnes Module / Échéance / Retard du zip (le résumé nb est conservé).
- [P8] Collecte (admin1) : les cases « Types de structure » sont remplacées par les 13 « Modules » (paramètre modules[] déjà supporté par l'API) — correction de [P5].
- [P8] Éditeur de gabarit : modale « Publier la version N ? » avec compteurs champs ajoutés / modifiés / retirés (diff calculée côté client contre la version chargée) ; « Annuler les modifications » restaure les champs initiaux ; « Enregistrer en brouillon » du zip non implémenté (pas d'API brouillon de gabarit — choix le plus simple).
- [P8] Remarques : « Page concernée » = liste déroulante des libellés du menu du rôle connecté (zip) ; compteur /2000 (limite backend) au lieu de /1000 (zip).
- [P8] Libellés de champs RA et RH alignés sur le zip (« Activités réalisées », « Indicateurs de performance », « Difficultés rencontrées et solutions », « Perspectives et besoins », « Effectif par catégorie, grade et sexe », « Mouvements de personnel », « Besoins en personnel et en formation ») — re-seed nécessaire.
- [P8] Aucun élément des « non-objectifs » / « Défauts connus » de la SPEC n'a été repris (vérification grep sur le code : pas de relances, notifications, pièces jointes, lien « mot de passe oublié », suppression d'audit, menu consultant erroné…).
- [P8] `npm run archive` (SPEC §2, exportee -> archivee) référencé dans package.json mais script absent : backend/src/scripts/archive.js créé — archive strictement les saisies exportee dont la période (periode.end) est passée ; les saisies d'événement (sans periodeId) ne sont pas archivées (« dont la période est terminée », lecture stricte) ; ni ligne d'audit ni entrée validations (absentes des listes fermées de la SPEC §2/§8).
- [P8] Expiration glissante réellement glissante : le cookie et le JWT sont régénérés à chaque requête authentifiée (setSessionCookie), le cookie maxAge et la modale d'avertissement suivent SESSION_TIMEOUT_MINUTES du .env (renvoyé par /auth/me sous le nom sessionTimeoutMinutes, avertissement 5 min avant, compte à rebours 60 s) — auparavant maxAge et seuil 25 min étaient codés en dur et le serveur n'allongeait jamais la session.

## Step 12 – Exports Excel et PDF

- `buildExportModel` (backend/src/services/exportModel.js) : modèle de données pur, typé depuis modules.js, dates à l'heure de Madagascar (Indian/Antananarivo, indépendant du fuseau du serveur), lignes de tableau groupées avec tous leurs sous-champs, valeurs vides → '' jamais « undefined ».
- `exportXlsx.js` / `exportPdf.js` : feuille « Synthèse » en premier, une feuille par module et une feuille par tableau de saisie, style commun (en-tête #0B2A4A, bordures fines, figée + filtre, paysage sur une page), en-tête et pied de page « Page X / Y » sur chaque page PDF.
- `exportCollecte` reconstruit sur ce modèle ; en-têtes HTTP, nom de fichier, streaming, journal d'audit et contrôles de rôle inchangés.
- Helpers supprimés : flattenValues, labelMap, labelFor (plus utilisés ailleurs) ; fmtDate/fmtDateTime/periodCell remplacés par les versions pures d'exportModel.
- Aucune nouvelle dépendance (exceljs et pdfkit déjà installées).

## Step 5 – Period generation

- Script instead of API/UI (none exists yet; screens are a later step).
- Deadline rules are REQUIRED arguments with no default (official SSEBF rules; demo values 5 and 15 come from the SPEC sample data).
- Dates stored at 00:00 UTC with end = last day, like the demo seed (display-safe in UTC+3).
- Natural key (periodicity, start) plus unique index, never overwrite, conflicts exit 1.
- --premier-mois and the past-deadline guard because the dashboard counts every period with a passed deadline as expected for all regional structures.
- Labels follow the demo seed convention ("<Mois> <annee>" and "T<n> <annee>").
- Known existing limitation: archive.js treats a period as finished from 00:00 UTC of its last day.
- The Rapport d'activites monthly-and-quarterly case is NOT handled here (Step 5b).

## Step 5b – Accents in period labels

- Month labels now use proper French accents (Février, Août, Décembre).
- Databases already initialised with the old unaccented labels will report a conflict on the same (periodicity, start); in that case rename those periods by hand or recreate them. No migration is written in this step.

## Step 6 – RA periodicity and accents

- New field `allowedPeriodicities` (default `[]`) added to Module model; only RA sets it to `['monthly', 'quarterly']`.
- `periodicity` remains the EXPECTED cadence used by the dashboard; `allowedPeriodicities` only widens what a client can create.
- Dashboard intentionally unchanged: it still counts expected submissions using `periodicity` only. A quarterly RA saisie does not count as the three monthly expected submissions in the dashboard (to be confirmed by the SSEBF).
- RA backfill in `ensureModules()` only when the field is missing (`$exists: false`); never overwrites a developer's choice.
- Accents added to month labels in `init-periodes.js` and test expectations updated; existing databases with unaccented labels will conflict on (periodicity, start) — manual remedy required.
- README fixed: completed the cut sentence about `--purge-audit` and added "Périodicité du Rapport d'activités" section.

## Step 4 – Real database initialization

- CSV import with dry-run by default; --apply refused while any line is valide=non; --allow-unvalidated forbidden in production.
- Never delete or overwrite ($setOnInsert only).
- Structure code = TYPE-SLUGOFREGION (no invented abbreviations); slug = uppercase, accents removed, non-alphanumeric to underscore.
- Label TYPE – Region with EN DASH because the frontend splits on it.
- Central structures created by the script (SSEBF, DGBF, CELLULE_INFO).
- Unique index on Structure.code.
- Semicolon/BOM/CRLF support for French Excel.
- Lists come from unofficial sources; points to confirm: Ambatosoa only in SRB list; Menabe absent from SRPE source; Analamanga SRSP possibly handled by central structure; possible Vatovavy/Fitovinany regrouping.
- Users NOT imported (typed in UI); periods deferred to Step 5.
- Fixed the report counters: a CSV row already present in the database is no longer counted as "a creer" (the preview is what the user reads before --apply); covered by test I10.
- DRBF is accepted in structures.csv (regional directorate that submits reports; not a central structure); no DRBF row is shipped until the SSEBF confirms the list; covered by test I11.
- structures.csv rows are grouped by region (SRB, SRSP, SRPE, CIRBF for each region) rather than by type, which is easier to review with the SSEBF.

## Step 3 – Seed split

- Split the single seed into reference.js (safe, only $setOnInsert for profils and modules) and demo.js (full demo data with purge and confirmation).
- Audit log kept by default in demo seed; --purge-audit flag to delete it explicitly.
- Confirmation prompt requiring "OUI"; --yes flag to skip; non-interactive terminals refuse without --yes.
- Unified production guard variable to SEED_ALLOW_PRODUCTION only (removed ALLOW_SEED_IN_PRODUCTION); guard.js applies only to demo seed, reference seed is always allowed in production.
- seed:test script uses --yes --purge-audit for clean CI runs.
- Fixed typo "modules cres" → "modules crees".
- Corrected SSEBF expansion in README from "Service Systèmes Électroniques de Budget et de Finances" to "Service des Structures Excentriques du Budget et des Finances (SSEBF)".
- Known limitation: demo seed still deletes users, so audit lines may reference users that no longer exist (accepted: the log is append-only).
- demo.js no longer skips the confirmation when NODE_ENV=test: only --yes skips it (prevents an unprompted purge if .env points to the dev database with NODE_ENV=test). Test S9 covers it.

## Step 2 – Backend hardening

- TRUST_PROXY parsing: remplacé z.coerce.boolean() par z.enum(['true','false','1','0']).transform(...) pour éviter que la chaîne "false" ne devienne true.
- trust proxy mis à 1 (au lieu de true) : express-rate-limit v7 lève ERR_ERL_PERMISSIVE_TRUST_PROXY avec true, et true permet aux clients de spoof leur IP via X-Forwarded-For.
- Body limit porté à 2048 KB (au lieu de 10 KB) : les recensements et gabarits dépassent 10 KB.
- Rate limit déplacé après requireAuth et clé par user id (req.user._id) : les bureaux partagent une IP, le limiteur par IP pénaliserait tout le monde.
- Login limit 60 requêtes / 5 min (au lieu de 20) : le verrouillage compte à 5 échecs reste observable avant le 429 IP.
- Réponses 429 en JSON avec code RATE_LIMITED (au lieu de texte brut) : cohérence API.
- Gestionnaire d'erreurs ne fuit plus les messages internes : 413 PAYLOAD_TOO_LARGE, 400 INVALID_JSON, 500 INTERNAL_ERROR génériques.
- requireAuth renvoie 401 sur id malformé (try/catch sur findById) : un token forgé ne fait plus planter le serveur.
- Code mort supprimé : sameStructure, sameRegion (inutilisés, next() seulement).
- Role enum ajouté sur Utilisateur.role : ['client','admin2','admin1','developpeur','consultant'].
- Fallback test corrigé : JWT_SECRET et MONGODB_URI ont des fallbacks dans loadConfig() quand NODE_ENV === 'test' (auparavant bloc inatteignable après zod parse).
- Nouveau fichier de tests hardening.test.js (7 tests) : parseEnv, body limits, JSON errors, forged token, role enum.
- Seed guard (guard.js) is imported first so it runs before any other import. Its variable was later unified to SEED_ALLOW_PRODUCTION (see Step 3).

## Step 1 – Logo

- Corner transparency: original emblem-original.png (1254x1254) had transparent corners (verified via ImageMagick after installation; four corners returned srgba(0,0,0,0)). No flood-fill needed.
- Generated optimized PNGs via ImageMagick convert with -strip -define png:compression-level=9:
  - emblem-128.png: 27,194 bytes (27 KB, target <40 KB)
  - emblem-256.png: 92,290 bytes (92 KB, target <120 KB)
  - favicon.png: 8,104 bytes (8 KB, target <12 KB)
  - apple-touch-icon.png: 49,258 bytes (49 KB, target <60 KB)
- Total shipped images weight: 180 KB (<250 KB target).
- Master file kept in git at frontend/assets-src/emblem-original.png; shipped files in frontend/public/.
- Fallback "MEF" badge (navy circle with gold ring, white "MEF" text) implemented in Logo.jsx for broken-image scenarios — ensures no broken image icon ever appears.
- Logo component used on all five public/auth pages plus sidebar (AppShell): LoginPage, ChangePasswordPage (both returns), SessionExpired, AccessDenied, AppShell.
- Stripe color on LoginPage corrected from #C8102E to #B42318 to match app-wide red.
- Favicon and apple-touch-icon added to index.html with theme-color #0B2A4A.
- No npm dependencies added (ImageMagick used via system package).
- Step 1 bis: <Logo> was imported but not rendered in ChangePasswordPage.jsx; it is now rendered in both returns (done screen and main form). Previous claim 'both returns' was inaccurate until this fix.

## Step 8 – Acceptance dossier

- Purpose of RECETTE.md: maps the 12 SPEC scenarios (T-01..T-12) to existing automated tests and written manual procedures; serves as deliverable L5.
- Three état values: "Automatisé" = at least one automated test cited; "Procédure manuelle" = no automated test but manual procedure written; "Non couvert" = neither.
- Anti-invention check (R1 in recette-doc.test.js): every test reference in RECETTE.md must exist as a real test file and contain the exact title string; fails CI if any reference is invented or drifted.
- T-10 (backup/restore), T-11 (load/bandwidth), T-12 (browsers) deliberately left "Non couvert" / "Procédure manuelle" — T-12 has a checklist procedure for Chrome/Firefox/Edge; T-10/T-11 marked "À définir à l'étape suivante du projet."
- Manual procedures written but not executed; results table in section 4 is blank by design.
- .env permissions set to 600 (rw-------) via chmodSync in scripts/setup.mjs; skip on Windows.
- README quick start fixed: uses `--prefix backend` for seed:demo so the shell stays at repo root; single bash block with 5 lines.
- T-01 passé en procédure manuelle (aucun test automatique ne vérifie un échec de connexion)
- T-04 : références limitées aux tests de validation de champs

## Step 9 – Sauvegarde et test de charge

- Sauvegarde = `mongodump --archive --gzip` vers `backups/` à la racine (mode 0600) ; restauration = `mongorestore --archive --gzip --drop --nsInclude` ; `backup:verify` restaure l'archive dans `<base>_restorecheck` et compare les compteurs de documents.
- `restore` refuse la production sans `--allow-production` ; confirmation interactive `OUI` via `readline` (même mécanique que `seed/demo.js`) ; refus en mode non interactif sans `--yes`.
- Pas de nouvelle dépendance npm ; `loadtest.mjs` en Node natif (fetch, readline) : 5 comptes démo, 4 routes GET par rôle, p50/p95/p99, taux d'erreur, 429 ; sécurité : hôte localhost uniquement, max 1000 req/compte.
- 6 tests backup (B1–B6) : création, refus écrasement, restauration, vérification, garde production, détection écart post-sauvegarde ; total 90 tests.

## Step 10 – Passage final

- Vérification clone neuf sur main : `npm run install:all`, `npm run setup` (.env en 600), seed, `npm run dev`, tests (90 passed), build → OK.
- `docs/DEMO.md` ajouté : script 10 min avec 9 étapes, comptes/menus/boutons lus dans le code (grep), données du seed (RA/RH/RMI, périodes Sept/T3/Oct 2026, structures SRB/SRSP/CIRBF-ANL).
- Étapes marquées « À vérifier » : aucune (toutes les étapes sont réalisables avec les données du seed et les écrans existants).
- README : liens `docs/RECETTE.md` et `docs/DEMO.md` ajoutés dans « Structure du dépôt ».
- DEMO.md corrigé : conflit brouillon Octobre 2026 dans le seed → passage à Septembre 2026 pour l'étape 1 et toutes les étapes suivantes ; libellés d'actions d'audit alignés sur l'affichage réel (ex. saisie_reject → « Rejet de saisie ») ; motif de rejet aligné sur les champs RA réels (« Indicateurs de performance ») ; références de code déplacées en commentaires HTML invisibles.
- DEMO.md : filtre Période inexistant retiré, libellés de confirmation corrigés, références en commentaires HTML.

## Step 11 – Final documentation fixes

- Libellés RECETTE.md corrigés : « Ajouter un utilisateur », « Télécharger en Excel (.xlsx) », « Télécharger en PDF » (vérifiés par grep dans frontend/src).
- Limites T-07 et T-10 écrites honnêtement (État "Automatisé" conservé, aucune citation retirée).
- README : "81 tests" → "91 tests, dont 6 tests de sauvegarde ignorés si mongodump est absent".
- R4 ajouté dans backend/tests/recette-doc.test.js : vérifie que tout libellé « » de RECETTE.md existe dans frontend/src + backend/src ; allowlist ['Démarrage rapide', 'Fast 3G', 'Slow 3G'].

## Step 12.1 – Corrections des exports Excel/PDF

- PDF : plus de page blanche en fin d'export. Le pied de page est écrit après le contenu sur chaque page via `bufferedPageRange()` / `switchToPage(i)`, avec `doc.page.margins.bottom` temporairement à 0 et `lineBreak: false`, puis restauré. « Page X / Y » utilise le nombre réel de pages. Un export d'une saisie = exactement 1 page.
- PDF : nouvel en-tête formel. Page 1 : logo centré (64 pt), « SIGBD » (Helvetica-Bold 20 pt, #0B2A4A), « Ministère de l'Économie et des Finances — DGBF / SSEBF » (9 pt, gris), filet fin pleine largeur (0,75 pt, #0B2A4A), puis 14 pt avant le titre. Pages suivantes : en-tête compact (logo 24 pt à gauche, ligne « SIGBD — Ministère… » à droite centrées verticalement, filet sous-jacent). Les en-têtes sont dessinés à chaque création de page (événement `pageAdded`) et `doc.y` est positionné sous l'en-tête.
- Excel : les cellules date-heure (`Créée le`, `Soumise le`, `Exportée le`) stockent les composantes calendaires/horaires de Madagascar (Indian/Antananarivo) en UTC (`Date.UTC`) pour un affichage sans décalage ; les champs date seule sont à minuit sans décalage.
- « Régions : — » devient « Toutes les régions (<présents>) » quand le filtre est absent, idem « Tous les modules (<présents>) » pour Excel et PDF.
- « Statut de la saisie » remplace « Statut » comme colonne méta (Synthèse, feuilles modules, grille PDF). Un champ de gabarit dont le libellé collide avec une colonne méta reçoit le suffixe « (champ) » (ex. « Statut (champ) »).
- PDF : grille d'informations à colonnes de largeur fixe dans la marge utile avec retour à la ligne ; nombres integer/decimal formatés via `fmtNumber` (espace ordinaire) et alignés à droite.
- Excel : largeur de colonne = contenu max + 2, bornée [12, 45], `wrapText` ; `pageSetup` { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } sur chaque feuille, répétition de l'en-tête (`printTitlesRow`). Vérifié en rechargeant le fichier : `ws.pageSetup.fitToPage === true`.
- Tests ajoutés : X9 (1 saisie = 1 page, « Page 1 / 1 »), X10 (heure Madagascar dans Excel), X11 (Statut de la saisie distinct du champ Statut), X12 (fitToPage actif, largeurs au contenu). Aucun test existant modifié. Nouvelle dépendance : aucune.

## Step 12.2 – PDF (dates des tableaux, titre, tableaux larges) et feuilles Excel sans champ simple

- PDF : toute valeur Date dans les tableaux est formatée via `formatPdfCell` (exportModel.js) qui appelle `fmtDate` (date seule, jj/mm/aaaa) ou `fmtDateTime` (date-heure) selon le type du champ. Plus de `String(Date)` brut ni de « GMT » dans le texte extrait.
- PDF : titre « Collecte des données » écrit en x = marge gauche (42 pt) avec `width = largeur utile`, puis `doc.y` déplacé sous le titre avant les lignes « Date d'export », « Régions », « Modules », « Nombre de saisies » (une chacune, alignées à gauche sur la marge). `doc.x` rétabli à la marge après chaque `text` absolu.
- PDF : colonnes « Structure » et « Période / Événement » supprimées des tableaux (déjà dans le bloc d'informations de la saisie). Largeurs calculées par `computeTableColumnWidths` (pure, exportée) : mini-largeur = largeur du mot le plus long (en-tête + cellules, police 8 pt) + padding, reste réparti selon la longueur moyenne. Taille 8 pt (7,5 si nécessaire). En-tête de tableau calculé via `heightOfString` pour que les libellés soient entièrement visibles. Aucun mot coupé en deux.
- PDF : si la somme des largeurs minimales dépasse la largeur utile, le tableau est affiché en « fiches » : une mini-grille à deux colonnes (libellé gris / valeur) par ligne du tableau, avec un petit titre « Ligne 1 », « Ligne 2 »… au lieu d'un tableau. Règle de repli consignée ici.
- Excel : quand un module n'a aucun champ scalaire (seulement des tableaux), la feuille « <code> » n'est pas créée (elle ne ferait que reprendre les colonnes méta déjà dans « Synthèse »). Seules les feuilles « <code> – <tableau> » sont créées. Les modules avec champs scalaires gardent leur feuille.
- Tests ajoutés : X13 (dates tableaux PDF en jj/mm/aaaa, pas de GMT), X14 (tableau 11 colonnes ne dépasse pas la marge), X15 (module table-only sans feuille Excel meta). Aucun test existant modifié. Nouvelle dépendance : aucune.

## Step 12.3 – Dernières corrections du PDF et du nom des feuilles Excel

- PDF : plus de pages blanches en fin de document. Les pieds de page sont écrits après tout le contenu, en une seule passe, sur chaque page de `bufferedPageRange()` : `switchToPage(i)`, `margins.bottom = 0`, textes en coordonnées absolues à `y = PAGE_HEIGHT - 30` avec `lineBreak: false`, puis restauration de la marge. `flushPages()` est appelé avant `doc.end()`. Le total « Y » de « Page X / Y » = `bufferedPageRange().count` calculé avant d'écrire les pieds, égal au nombre de pages du fichier final. `renderPdf` retourne ce total.
- PDF : hauteur des lignes libellé/valeur calculée par la fonction pure exportée `rowHeight(doc, label, value, labelW, valueW, size, padding)` = `max(heightOfString(label), heightOfString(value)) + padding`. Le libellé long sur plusieurs lignes est entièrement couvert.
- PDF : titre au-dessus de chaque champ de type table (Helvetica-Bold 9 pt, #0B2A4A), avec 4 pt d'espace avant le tableau. Le titre n'est jamais laissé seul en bas de page : si l'espace restant < titre + en-tête de tableau + une ligne, nouvelle page avant d'écrire le titre.
- PDF : avant le bloc d'une saisie, vérification que l'espace restant ≥ titre bloc + grille d'informations + première ligne de contenu, sinon nouvelle page. La grille d'informations n'est jamais seule en bas de page.
- Excel : noms de feuilles nettoyés par la fonction pure exportée `cleanSheetNameBase(name)` : suppression des caractères interdits `[]:*?/\`, coupe au dernier espace avant 31 caractères (jamais au milieu d'un mot), retrait de la ponctuation de fin `[ ,;:.–-]`, valeur de repli `Feuil1`. L'unicité est garantie par `uniqueSheetName` avec suffixes `(2)`, `(3)`.
- Tests ajoutés : X16 (PDF 60 saisies : pages == total annoncé, pas de page vide), X17 (rowHeight couvre le libellé multi-lignes), X18 (noms de feuilles coupés proprement, uniques). Aucun test existant modifié. Nouvelle dépendance : aucune.

## Step 13 – T-07 documentation

- T-07 (RECETTE.md) cite désormais, sous "Tests automatiques", les tests de backend/tests/export-format.test.js qui vérifient le classeur généré (X4, X5, X6, X8, X10, X11, X12, X15 : feuille Synthèse, une feuille par module, noms valides/uniques, cellules typées, en-tête figé/filtré, fitToPage) et le PDF généré (X7, X9, X16, X21, X23 : pages, en-tête, pied de page, pas de page vide) avec des données générées. Aucun code applicatif ni test modifié.
- Ajout d'une phrase "Limite" : ces tests automatisés vérifient la structure des fichiers générés, pas le contenu visuel contre les données validées réelles ; celle-ci reste la procédure manuelle ci-dessous. État conservé : "Automatisé".

## Step 15 – event modules: new saisie

- ClientDashboard.jsx : pour les modules d'événement (isEvent) ayant déjà une saisie, la cellule Action rend deux boutons côte à côte (gap-2) : le bouton existant Consulter/Continuer/Corriger (style secondaire, clic ouvre la saisie) et un bouton primaire « Nouvelle saisie » (setModalModule). Sans saisie existante, le bouton unique « Nouvelle saisie » est conservé. Les modules periodic ne changent pas.
- Sous le nom du module, une légende 12 px secondaire « n saisie enregistrée » / « n saisies enregistrées » s'affiche quand l'événement a déjà des saisies (compté depuis saisies par moduleId), rien quand n = 0.
- Aucun fichier backend, NouvelleSaisieModal.jsx, MesSaisies.jsx ou test modifié.

## Step 15.1 – event action buttons layout and caption spacing

- ClientDashboard.jsx : légende « n saisie enregistrée » / « n saisies enregistrées » écrite en une seule chaîne JSX sur une ligne, `nbEvent` calculé une seule fois par ligne via `saisies.filter(...)` avant le rendu (plus de calcul répété 4 fois, plus d'espaces perdus par le JSX).
- Cellule Action : `whitespace-nowrap` sur le <td>, conteneur `flex flex-nowrap items-center gap-2`, `whitespace-nowrap shrink-0` sur les deux boutons (hauteur et couleurs inchangées).
- En-tête colonne Action : `min-w-[260px]` sur le <th> pour que les deux boutons tiennent sur une ligne.
- Modules périodiques et lignes sans saisie inchangés.

## Step 19 – Button dans les pages

- Utilisateurs.jsx : « Ajouter un utilisateur » (primary), « Réinitialiser les filtres » (secondary), boutons Actions (Modifier le profil = secondary size="sm", Désactiver = danger size="sm", Réinitialiser le mot de passe = secondary size="sm", tous `className="w-full"`), tiroir (Annuler = secondary, Créer/Enregistrer = primary), « Terminer » (primary). Import Button ajouté.
- ClientDashboard.jsx : cellule Action — Consulter/Continuer/Corriger = secondary size="sm", « Nouvelle saisie » = primary size="sm", bouton unique conditionnel `variant={action.primary ? 'primary' : 'secondary'} size="sm"`. Conteneur `flex flex-nowrap items-center gap-2` conservé. Import Button ajouté.
- MesSaisies.jsx : « Réinitialiser les filtres » (secondary, x2), « Créer une nouvelle saisie » (primary), « Aller au tableau de bord » (primary `className="mt-4"`), bouton de ligne Actions (secondary size="sm"). Import Button ajouté.
- Boutons <button> laissés tels quels : Utilisateurs.jsx « Copier » (h-[44px] collé au champ mot de passe), ClientDashboard.jsx « Corriger » (lien souligné, pas un bouton), MesSaisies.jsx pastille « × » (filtre).

## Step 20 – Button dans admin2, consultant et détail de saisie

- Button.jsx : variante `success` (`bg-[#1E7B4F] hover:bg-[#186540] text-white`) ajoutée.
- DonneesSaisies.jsx : Examiner (primary sm), Exporter (success sm), Consulter (secondary sm), « Réinitialiser les filtres » (secondary, className gap-2). Tabs et pagination laissés tels quels.
- RevueSaisie.jsx : RejectModal Annuler (secondary) / Confirmer le rejet (dangerSolid), loadError retour (secondary), Valider (success), Rejeter (dangerSolid), Exporter vers la base (primary, tous w-full gap-2).
- Consultation.jsx : « Réinitialiser les filtres » (secondary, gap-2). Liens Télécharger Excel/PDF (<a>) laissés tels quels.
- ConsultationDonnees.jsx : « Réinitialiser les filtres » (secondary, gap-2), « Consulter » ligne (secondary sm, e.stopPropagation() conservé).
- ConsultationRapport.jsx : « Retour à la consultation » (secondary). Liens texte « Consultation des données » et « Retour à la liste » laissés tels quels.
- SaisieDetail.jsx : « Retour à mes saisies » (secondary), « Soumettre » (primary), « Corriger et resoumettre » (dangerSolid, className whitespace-nowrap).
- Aucun backend, test ou dépendance modifié.

## Step 21 – Button dans les 5 pages restantes

- Parametrage.jsx : « OK » (primary sm, disabled={busy}), « Annuler » (secondary sm), « Ajouter » (primary, disabled={busy || !newValue.trim()}, className shrink-0), « Configurer » et « Activer/Désactiver » (secondary sm). « Renommer » (texte, pas un bouton) et onglets (border-b-2 -mb-px) laissés tels quels. Import Button ajouté.
- CollectePage.jsx : « Réinitialiser les filtres » (secondary sm, className gap-1.5). « Tout cocher/Tout décocher » (liens texte) et onglets laissés tels quels. Import Button ajouté.
- RemarquesPage.jsx : « Réinitialiser les filtres » (secondary, className gap-2), « Envoyer la remarque » (primary, disabled={busy}, libellé dynamique). Onglets laissés tels quels. Import Button ajouté (chemin ../components/Common/Button.jsx).
- AuditJournal.jsx : « Réinitialiser les filtres » (secondary). Import Button ajouté.
- Admin1Dashboard.jsx : « Réinitialiser les filtres » (secondary). Import Button ajouté.
- Aucun backend, test ou dépendance modifié. Button.jsx non touché.

## Step 22 – Icônes vectorielles du menu

- Icon.jsx (nouveau) : composant `Icon({ name, className })` rendant un SVG stroke-based (viewBox 0 0 24 24, stroke currentColor, strokeWidth 1.8, linecap/join round, aria-hidden). Icônes : dashboard (4 carrés 2×2), edit (document + crayon), folder, search (loupe), chat (bulle), users (2 silhouettes), chart (barres montantes), clipboard, settings (engrenage). Nom inconnu → petit cercle (jamais d'erreur).
- menus.js : 15 émojis remplacés par des clés (dashboard, edit, folder, search, chat, users, chart, clipboard, settings). Libellés, paths et ordres inchangés. Consultant « Consultation des données » → 'chart' (distingue du 'dashboard').
- AppShell.jsx : `<span className="text-lg">{item.icon}</span>` remplacé par `<Icon name={item.icon} className="w-5 h-5 shrink-0" />`. Import Icon ajouté. Rien d'autre modifié.
- Aucune nouvelle dépendance. Pas de backend, pas de test, pas de changement de libellé/chemin/ordre.

## Step 29 – Développeur : créer et supprimer un rapport (gabarit)

- Backend `routes/config.js` : nouvelle route `DELETE /api/config/modules/:id`, réservée au développeur (requireRole). Règles dans l'ordre : id invalide → 404 ; module absent → 404 « Ressource introuvable. » ; code dans la liste `MODULES` de `seed/modules.js` (rapport de départ, pas de nouvelle colonne) → 403 « Ce rapport fait partie des rapports de départ : désactivez-le plutôt. » ; au moins une saisie référence le module (`Saisie.moduleId`) → 409 « Ce rapport contient des saisies : désactivez-le plutôt. » ; `confirmCode` absent ou différent du code exact (casse sensible) → 400 « Le code saisi ne correspond pas. » ; sinon suppression définitive → 200 `{ id, code }`.
- Backend `routes/modules.js` : `GET /api/modules` et `GET /api/modules/:id` renvoient un booléen `builtin` calculé côté serveur à partir de la liste `MODULES` (indique les rapports de départ). Le POST création existe déjà (version 1, actif par défaut) et journalise `module_publish`.
- Audit : une ligne `module_delete` est écrite à la suppression (qui, quel code, quand). La création journalise déjà `module_publish`. Liste des actions d'audit fermée en SPEC §8 : une seule action ajoutée (`module_delete`) — le strict minimum.
- Frontend `App.jsx` + `menus.js` : route `/parametrage/nouveau` (rôle developpeur) réutilisant `GabaritEditeur.jsx`.
- Frontend `GabaritEditeur.jsx` : mode création quand `id === 'nouveau'` (code éditable, `POST /api/config/modules`, bouton « Créer le rapport », erreur 409 affichée près du champ code) ; mode édition inchangé (code non modifiable, `PUT`, « Publier la version N »).
- Frontend `Parametrage.jsx` : bouton « Nouveau rapport » ; bouton « Supprimer » par ligne, visible uniquement si `!m.builtin` ; modale de suppression « Supprimer le rapport » avec recopiage exact du code (bouton « Supprimer définitivement » en `dangerSolid` grisé tant que `deleteInput !== deleteCode`), message serveur affiché en cas de 403/409 sans fermer la modale, toast « Rapport <CODE> supprimé. » en succès.
- `Button.jsx` : variante `dangerSolid` déjà existante, réutilisée. Aucune nouvelle dépendance.
- Rapport de test créé manuellement dans `sigbd` puis supprimé ; aucun résidu.

## Step 30 – Aperçu de l'export (développeur)

- Backend `routes/config.js` : nouvelle route `POST /api/config/modules/preview-export` (développeur uniquement, placée avant `/:id`). Corps `{ gabarit, format }` avec `format` = `'pdf'` ou `'sheets'`. Valide le gabarit avec le schéma zod et `findFieldIssue` (400 sinon ; le code n'a pas besoin d'être unique). Construit une seule ligne de saisie d'exemple (`buildExampleRow`) avec des valeurs fictives par type de champ (text/textarea « Exemple de texte », integer 12, decimal 1234.56, date fixe passée, select/multiselect première valeur de la source ou des options, auto « Exemple », table = 3 lignes), sans lire ni écrire aucune saisie en base et sans ligne d'audit.
  - `pdf` : génère le PDF avec `renderPdf` (même moteur que l'export collecte), `Content-Type: application/pdf`, `Content-Disposition: inline`, en mémoire (aucun fichier sur disque), et supprime l'en-tête `X-Frame-Options` uniquement sur cette route pour autoriser l'affichage dans un cadre (iframe). Ajoute la bannière « APERÇU – DONNÉES D’EXEMPLE » sur chaque page (via `PREVIEW_BANNER` dans `exportPdf.js`, conditionnée à `preview: true`, donc absente de l'export collecte officiel).
  - `sheets` : construit le classeur via `buildSheets` (réutilisant `expandColumns`/`headerForColumn`) et renvoie en JSON `{ sheets: [{ name, columns, rows }] }` (Synthèse + une feuille par module + une feuille par tableau). Mention « APERÇU – DONNÉES D’EXEMPLE » dans la feuille Synthèse.
- Frontend `GabaritEditeur.jsx` : bouton « Aperçu de l'export » (disponible en création et modification, état courant), ouvre un panneau avec onglets « PDF » et « Excel ». PDF : blob URL en mémoire dans une iframe (aucun téléchargement, `revokeObjectURL` à la fermeture/changement d'onglet). Excel : un tableau HTML par feuille avec sous-onglets, légende « Représentation de la structure de l’Excel (le style exact n’est pas montré) ». Bouton « Actualiser l'aperçu » régénère depuis l'état courant. Erreur affichée en français si le gabarit est invalide.
- `Button.jsx` : variantes déjà existantes (secondary, dangerSolid), réutilisées. Aucune nouvelle dépendance.

## Step 31 – Nouveau logo

- Fichier maître fourni par l'utilisateur : frontend/public/icone.png (1369x1149, RGB, 1 605 674 octets, non carré) déplacé vers frontend/assets-src/icon-original.png (suivi par git). Proportions conservées, pas de déformation ; complété avec de la transparence pour obtenir des carrés.
- Fichiers dérivés générés avec Pillow (LANCZOS, fond transparent préservé) :
  - frontend/public/icon-128.png : 128x128 RGBA, 30 646 octets (Logo 1x)
  - frontend/public/icon-256.png : 256x256 RGBA, 113 444 octets (Logo 2x et copie backend/assets/icon.png)
  - frontend/public/favicon.png : 64x64 RGBA, 7 825 octets
  - frontend/public/apple-touch-icon.png : 180x180 RGBA, 58 972 octets
  - backend/assets/icon.png : 256x256 RGBA, 113 444 octets (PDF, en-tête height: 64 pt, pied width: 24 pt, proportions préservées)
- Ancien logo supprimé (git rm) : frontend/public/emblem-128.png, frontend/public/emblem-256.png, backend/assets/emblem.png, frontend/assets-src/emblem-original.png.
- Plus aucune référence à emblem/emblème dans le code, les tests ni les docs hors historique de DECISIONS.md (pas réécrit).
- Logo.jsx : src="/icon-128.png", srcSet="/icon-128.png 1x, /icon-256.png 2x", alt inchangé, fallback badge "MEF" conservé.
- exportPdf.js : EMBLEM_PATH/emblemFile() renommés LOGO_PATH/logoFile() pointant vers backend/assets/icon.png ; message d'erreur mis à jour.
- index.html : inchangé (mêmes noms /favicon.png et /apple-touch-icon.png).
- SPEC.md ligne 16 mise à jour (nouveaux fichiers livrés).
- Aucune nouvelle dépendance npm.

## Step 32 – Modules en menu latéral (client) + tableau de bord institutionnel

- `frontend/src/menus.js` : `ROLE_MENUS.client` = « Tableau de bord » (/), « Modules » (/modules), « Mes saisies » (/mes-saisies) ; `ROUTE_ROLES['/modules'] = ['client']` et `ROUTE_ROLES['/modules/:code'] = ['client']`. Les autres rôles et routes sont inchangés.
- `frontend/src/components/Layout/AppShell.jsx` : rendu simple de la barre latérale (`menuItems.map(NavLink)`) pour tous les rôles ; pas de groupe déroulant, pas de chargement de modules/périodes/saisies dans la barre latérale, pas de pastilles ni de localStorage (testé à l'étape 32.1 puis abandonné car illisible : noms tronqués, barre de défilement).
- `frontend/src/lib/clientModules.js` (nouveau) : calculs partagés sans état (période courante, jours de retard, lignes de rapports attendus, action par ligne, 4 compteurs, estRemis) réutilisés par ModulesPage, ModulePage et ClientDashboard.
- `frontend/src/pages/client/ModulesPage.jsx` (nouveau) : route `/modules`, rôle client uniquement ; tableau « Modules » (code/libellé, périodicité, période et échéance avec badge « En retard de N jours », statut, action Saisir/Continuer/Corriger/Consulter/Nouvelle saisie) + recherche (code/libellé, insensible à la casse et aux accents) + filtres rapides (Tous · À faire · En retard · Rejetés · Remis, nombre entre parenthèses) mémorisés dans l'URL (?filtre=&q=) ; lien du nom du module vers /modules/:code ; message « Aucun module ne correspond à votre recherche. » si vide ; modale NouvelleSaisieModal.
- `frontend/src/pages/client/ModulePage.jsx` : fil d'Ariane « Modules › CODE » + lien « ← Retour aux modules ».
- `frontend/src/pages/client/ClientDashboard.jsx` : suppression du bloc « Mes modules » ; bienvenue « Choisissez un module dans le menu Modules pour commencer. » + bouton « Aller aux modules » quand aucune saisie ; alertes (libellés de modules/échéances en liens vers /modules/:code, « Corriger » vers /mes-saisies?statut=rejetee), 4 compteurs ; ajout : « Avancement de la période en cours » (barre progression role progressbar, aria-valuenow), « Prochaines échéances » (lien « Voir tous les modules »), « Activité récente ».
- Accessibilité : filtres = boutons avec aria-pressed ; champ de recherche avec label ; tableau avec en-têtes.
- Aucun texte en anglais visible ; aucune donnée inventée ; aucun backend ni schéma modifié (GET /api/modules, /api/periodes, /api/saisies réutilisés).
- Aucun outil de test frontend ajouté (n'existe pas dans le dépôt).
- RECETTE.md et docs/DEMO.md mises à jour : parcours client = menu Modules → page Modules → un module → saisie ; tableau de bord = avancement, échéances, activité.


## Step 33 – Journal d'audit : pagination, filtres de surveillance, détail au clic

- [P33] GET /api/audit : nouveaux paramètres validés par zod — page (≥ 1, défaut 1), limit (1–100, défaut 50), q (1–64), userId (1–64, exact), action (liste ≤ 10 valeurs séparées par des virgules), role, from, to, sinceMinutes (1–43200). Remplacement de .limit(500) par skip((page−1)·limit).limit(limit), tri createdAt décroissant puis _id décroissant.
- [P33] Le corps de la réponse reste un TABLEAU au format inchangé ; le total filtré passe par l'en-tête X-Total-Count avec Access-Control-Expose-Headers (pas d'élargissement du CORS). DELETE/PATCH/POST sur /api/audit restent à 404 (aucune route d'écriture).
- [P33] Filtres combinés en ET : action ($in), plage de dates (granularité jour), sinceMinutes (createdAt ≥ maintenant − N minutes), rôle (résolution ObjectId + IM), q (regex échappée, insensitive, sur l'objet OU sur nom/prénom/IM des utilisateurs, leurs ids et IM alimentent le filtre userId), userId exact. q + rôle => intersection des listes d'utilisateurs.
- [P33] Pas de chargement complet des utilisateurs : seuls les utilisateurs référencés par les lignes de la page courante sont chargés pour userLabel et userRole.
- [P33] Index créés s'ils n'existent pas sur JournalAudit : { createdAt: -1 } et { userId: 1, createdAt: -1 } (index uniquement, pas de changement de schéma).
- [P33] Frontend : barre d'outils fixe (sticky sous la TopBar) avec raccourcis de période (Dernière heure / 24 h / 7 jours / 30 jours / Personnalisée, calculés en sinceMinutes côté client), recherche « Utilisateur ou objet » avec anti-rebond 400 ms, filtre Action, filtre Profil, filtre Résultat (Tous / Anomalies via action multi-valeurs), réinitialisation ; tout retour à la page 1 ; filtres, q, page et limit mémorisés dans l'URL.
- [P33] Pagination serveur en tête et en pied (25/50/100 lignes par page, Précédent / Suivant, « Page X sur Y · N événements »).
- [P33] Nouvel ordre des colonnes : Date et heure, Action, Utilisateur, Profil, Objet, Adresse ; heure jj/mm/aaaa hh:mm:ss ; fuseau « Heure de Madagascar (UTC+3) » indiqué dans le sous-titre et le panneau de détail.
- [P33] Colonne Action : libellé + couleur (rouge anomalie, orange, neutre ; jamais la couleur seule) ; lignes d'anomalie sur fond rosé très léger. Colonne Adresse : « ::1 » et « ::ffff:127.0.0.1 » → « Local (127.0.0.1) », « ::ffff:a.b.c.d » → « a.b.c.d », adresse brute dans title.
- [P33] Séparateurs par jour (« Lundi 2 novembre 2026 », jour de la semaine en français) avant le premier événement de chaque jour sur la page affichée ; en-tête de tableau fixe (thead sticky).
- [P33] Panneau de détail latéral au clic/Entrée sur une ligne (plein écran sous 1024 px) : date et heure complètes avec fuseau, action libellée + code, utilisateur, profil, objet, adresse interprétée + brute, 5 dernières actions de l'utilisateur (GET /api/audit?userId=…&limit=5). Fermeture par bouton, Échap ou clic hors panneau ; piège de focus et retour du focus sur la ligne ; lignes accessibles (tabIndex, role, aria-selected).
- [P33] Suppression du badge « Journal immuable certifié DGBF » (affirmation non étayée par la SPEC) ; conservé : bandeau « Lecture seule », conservation 12 mois, états chargement/erreur/vide en français. Aucune nouvelle dépendance.
- [P33] RECETTE.md et docs/DEMO.md mises à jour : parcours audit (raccourcis de période, anomalies, recherche, pagination, panneau de détail).

## [P34] Socle Oracle XE 21c

- Base de données cible validée par l'encadrant (cahier des charges §13 : « Oracle ou MongoDB »).
- `oracledb` en **mode léger (thin)** : pas d'appel à `oracledb.initOracleClient()`, aucun Instant Client Oracle requis côté Node. La 11g n'est pas ciblée.
- `knex` (client `oracledb`) pour l'abstraction de requête ; singleton paresseux via `getKnex()` (aucun effet de bord à l'import), `pingOracle()`, `closeOracle()`.
- Liaison de paramètres uniquement : aucune requête SQL construite par concatenation de texte utilisateur (règle consignée en commentaire dans `backend/src/db/oracle.js`).
- MongoDB reste la base active jusqu'à la fin de la migration ; les variables Oracle sont optionnelles et l'application démarre sans elles.
- Objectifs de la migration Oracle : JSON natif, colonnes `IDENTITY`, pagination `OFFSET FETCH`, noms d'identifiants ≤ 128 caractères, booléens en `NUMBER(1)`, chaîne vide = `NULL` à gérer.
- Commande de test : `backend/src/scripts/oracle-ping.js` + scripts `oracle:ping` (backend), `db:oracle:ping`, `db:oracle:up`, `db:oracle:down` (racine).
- Service Docker `oracle` (image `gvenzl/oracle-xe:21-slim`, volume nommé `sigbd_oracle_data`, healthcheck `healthcheck.sh`, `restart unless-stopped`) ; service `mongo` inchangé. En production, l'informatique du ministère installe Oracle XE 21c de façon classique ou fournit un schéma existant ; l'application ne dépend que des variables `ORACLE_*`.
- Aucun des modèles Mongoose, contrôleurs, seeds, scripts existants ni des tests existants n'a été modifié.

## [P35] Schéma Oracle

- DDL posé à part dans `backend/db/oracle/` : aucun modèle, contrôleur, service, seed ni test existant modifié, aucune nouvelle dépendance, le code applicatif reste sur MongoDB.
- 10 modèles Mongoose → **13 tables** (`modules` → `MODULE_SIGBD` + 2 jonctions, `saisies` → `SAISIE` + `SAISIE_VALIDATION`) ; l'énoncé visait « 14 tables » : comptage erroné, le test vérifie la présence des 13 noms attendus dans `user_tables`.
- Noms MAJUSCULES `snake_case` sans guillemets et sans mot réservé : `TYPE` → `TYPE_REF`, `STATUS` → `STATUT`, `OBJECT` → `OBJET`, `TEXT` → `TEXTE`, `VERSION` → `VERSION_MODULE`, `KIND` → `GENRE`, `MODULE` → `MODULE_SIGBD`, dates → `DATE_DEBUT`/`DATE_FIN`/`DATE_LIMITE`/`DATE_CREATION`/`DATE_SOUMISSION`/`DATE_EXPORT`.
- `ID NUMBER GENERATED BY DEFAULT AS IDENTITY` (les seeds pourront imposer des id) ; PK composite sur `MODULE_PERIODICITE (MODULE_ID, PERIODICITE)` et `MODULE_TYPE_STRUCTURE (MODULE_ID, TYPE_STRUCTURE)` (pas de `ID` sur ces deux tables de jonction).
- Chaînes `VARCHAR2(n CHAR)`, booléens `NUMBER(1) DEFAULT x NOT NULL` + `CHECK IN (0,1)`, énumérations `VARCHAR2` + `CHECK IN (...)` avec la largeur exacte de la valeur la plus longue.
- Dates `TIMESTAMP(3) WITH TIME ZONE` ; `CREATED_AT`/`UPDATED_AT NOT NULL DEFAULT SYSTIMESTAMP` sur chaque table **sans trigger** (l'application renseignera `UPDATED_AT`) ; `JOURNAL_AUDIT` n'a que `CREATED_AT` ; `SAISIE.DATE_CREATION` et `SAISIE_VALIDATION.DATE_DECISION` conservés en plus.
- Chaîne vide = `NULL` en Oracle : `REFERENTIEL.MINISTERE/REGIME/ACRONYME` nullable, sans `DEFAULT ''`.
- Longueurs : valeurs de l'énoncé quand il les fixe (toujours ≥ max zod), `REMARQUE.TEXTE = 2000` d'après zod, `JOURNAL_AUDIT.OBJET = 200` d'après l'usage (`saisie:<id>`, `login`) ; aucun CLOB (max 2000 < 4000).
- `UQ_PERIODE_PERIODICITE_DATE_DEBUT` est un **index unique** et non une contrainte `UNIQUE` : ORA-02329 interdit `UNIQUE` sur une colonne `TIMESTAMP WITH TIME ZONE`.
- `UQ_SAISIE_PERIODE` : index unique fonctionnel avec `CASE WHEN PERIODE_ID IS NOT NULL …` pour reproduire le `partialFilterExpression` Mongo (les saisies d'événement à `PERIODE_ID NULL` ne conflictualisent pas, deux saisies périodiques identiques sont refusées).
- `ON DELETE CASCADE` uniquement sur les tables enfants (`MODULE_PERIODICITE`, `MODULE_TYPE_STRUCTURE`, `SAISIE_VALIDATION`) ; index sur chaque colonne FK (`IX_<t>_<c>`, la PK composite menante suffit sur les jonctions).
- `JOURNAL_AUDIT.USER_REF` sans clé étrangère : la colonne contient un ObjectId, un IM ou `unknown`.
- `MODULE_SIGBD.FIELDS_JSON` et `SAISIE.VALEURS_JSON` en type natif `JSON` (Oracle 21c).
- Script `backend/src/scripts/oracle-schema.js` : lignes de commentaire `--` retirées, découpe sur `;` en fin de ligne, une instruction par `knex.raw()` **sans `?`** ; `--drop` ignore ORA-00942, `--reset` = drop + création, `--drop`/`--reset` refusés si `NODE_ENV=production` (avant toute connexion) ; succès `Schéma Oracle créé : N objets` (et `Schéma Oracle supprimé : N objets` pour `--drop` seul), échec `Échec Oracle : <messageErreurOracle>` en une ligne + exit 1, `closeOracle()` dans un `finally`.
- Scripts npm : `oracle:schema` (backend) et `db:oracle:schema` (racine), même format que `oracle:ping` / `db:oracle:ping`.
- Tests `backend/tests/oracle-schema.test.js` : `describe.skipIf` sans `ORACLE_TEST_USER/PASSWORD`, exécution de `--reset` sur le schéma de l'utilisateur de test uniquement (jamais `ORACLE_USER`), plus un test unitaire non skippé (refus de `--drop` en production et lecture des fichiers `.sql`).

## [P36] Journal d'audit sur Oracle (AUDIT_STORE)

- Variable `AUDIT_STORE` (`mongo` par défaut, `oracle`), enum zod ; en production, `oracle` exige `ORACLE_USER`/`ORACLE_PASSWORD` (messages existants du bloc Oracle, aucun nouveau message).
- Dépôt commun `backend/src/repositories/` : `auditRepository.js` (`getAuditRepository()` lit `loadConfig().AUDIT_STORE` **à chaque appel**, jamais d'implémentation cachée), `auditMongo.js`, `auditOracle.js`. Interface : `ajouter`, `lister`, `supprimerTout` (noms français).
- `loadConfig()` met la configuration en cache : les tests basculent le stockage en mutant `loadConfig().AUDIT_STORE` entre les deux suites du fichier de contrat (choix le plus simple, aucun module de config existant modifié).
- `fileParallelism: false` (fichiers exécutés en série) : le test d'intégration fixe `process.env.AUDIT_STORE='oracle'` dans `beforeAll`, importe l'app **après** (dynamic import, la config est mise en cache avec `oracle`), restaure la variable dans `afterAll`.
- Bug signalé, **non corrigé** (règle « ne jamais changer le comportement observable ») : `q` + `role` renvoie les lignes dont l'objet contient `q` quel que soit le rôle, car `objetContient` et `userRefsIn` sont combinés en OU — comportement identique dans les deux implémentations, tests existants intacts.
- LIKE Oracle : valeur minuscule, jokers `% _ \` échappés (`ESCAPE '\'`) et valeur entourée de `%` (équivalent de la regex non ancrée de Mongo) ; `IN` découpé en paquets de 900 (limite Oracle : 1000) ; `userRefsIn` vide = `1 = 0` = aucune ligne.
- knex + oracledb renvoie un **tableau** (pas `{rows}`) → `res.rows || res` ; `TIMESTAMP(3) WITH TIME ZONE` → objet JS `Date` ; `COUNT(*) AS N` → `number`.
- Réserve : dans `backend/src`, seul `repositories/auditMongo.js` importe `models/JournalAudit.js` ; les tests existants (`audit.test.js`, `seed.test.js`, `gabarit.test.js`) l'importent toujours et n'ont pas été modifiés.
- Tests ajoutés : `audit-store-config.test.js` (défaut, enum, refus en production), `audit-repository.test.js` (suite de contrat de 12 cas exécutée pour MongoDB et pour Oracle), `audit-oracle-store.test.js` (`logAudit` → `GET /api/audit` avec `X-Total-Count`).

## [P37] Référentiels et profils sur Oracle (REFERENCE_STORE)

- Variable `REFERENCE_STORE` (`mongo` par défaut, `oracle`), enum zod, lue dans `loadConfig()` ; en production, `oracle` exige `ORACLE_USER`/`ORACLE_PASSWORD` (messages existants du bloc Oracle, aucun nouveau message), exactement comme `AUDIT_STORE`.
- Dépôts dans `backend/src/repositories/` : `referentielRepository.js` (`getReferentielRepository()` relit `loadConfig().REFERENCE_STORE` **à chaque appel**, jamais d'implémentation cachée), `referentielMongo.js`, `referentielOracle.js` ; même triptyque pour les profils (`profilRepository.js` / `profilMongo.js` / `profilOracle.js`, `getProfilRepository()`).
- Interface Referentiel : `lister(type)` (tri `value` croissant), `trouver(type, value)`, `creer({type, value})`, `renommer(type, ancienneValue, nouvelleValue)` (le contrôleur vérifie les doublons avant), `assurer({type, value})` (true si créé, sinon false sans mise à jour), `assurerEpn({value, ministere, regime, acronyme})` (création ou mise à jour des trois champs), `insererPlusieurs(liste)`, `supprimerTout()`. Interface Profil : `assurer({code, label})`, `trouverParCode(code)`, `supprimerTout()`. Un élément restitué = `{ type, value, ministere, regime, acronyme }` (ou `{ code, label }`) avec `''` à la place de `null`.
- Tables **sans dépendance** déjà posées par le schéma de l'étape 35 (`REFERENTIEL`, `PROFIL`) : bindings knex uniquement, `ORDER BY VALEUR`, `assurer`/`assurerEpn` dans une transaction knex (SELECT puis INSERT ou UPDATE, `UPDATED_AT = SYSTIMESTAMP` à l'UPDATE), erreurs Oracle remontées telles quelles (doublon `UQ_REFERENTIEL_TYPE_VALEUR` = ORA-00001, comme l'index unique Mongo).
- Chaîne vide = `NULL` en Oracle à l'écriture (`MINISTERE`/`REGIME`/`ACRONYME`) et relue `''` : comportement observable identique à MongoDB.
- `REGION` volontairement **exclue** : elle est liée à `STRUCTURE` (lecture seule, même collection dédiée) → à porter avec Structure/Utilisateur/Periode/Module.
- Branchement sans changement de réponses HTTP : `routes/referentiels.js` (GET/POST/PUT|PATCH), `moduleMeta.resolveOptions`, `collecteController.exportCollecte`, `routes/config.js` (aperçu), `seed/common.js` (`ensureProfils` → `assurer`, `ensureEpnReference` → `assurer` pour les ministères et `assurerEpn` pour les EPN, mêmes compteurs created/existing), `seed/demo.js` (`supprimerTout`/`insererPlusieurs`), `scripts/create-admin.js` (`trouverParCode`).
- Nuance journalisée : l'aperçu d'export (`routes/config.js`) prend `epnValue = premier élément` de la liste désormais **triée** (avant : premier de l'ordre naturel Mongo, non garanti) ; `buildExampleRow` ne lit que `.value` et `epnDict` est une table de hachage → seul l'EPN d'exemple de l'aperçu peut changer, aucun test ne le fige.
- `closeOracle()` en fin des scripts qui s'arrêtent d'eux-mêmes : `seed/demo.js`, `ensureEpnReference` quand il a ouvert sa propre connexion Mongo, `scripts/create-admin.js` et `seed/reference.js` (appel non prévu à l'origine, ajouté car ce seed ouvre aussi un depot en mode oracle) ; sans effet si Oracle n'a jamais été utilisé (`knexInstance` nul dans `db/oracle.js`).
- Réserve : dans `backend/src`, seul `repositories/referentielMongo.js` importe `models/Referentiel.js` et seul `profilMongo.js` importe `models/Profil.js` ; les tests existants (`init-epn.test.js`, `seed.test.js`, `preview-export.test.js`) les importent toujours et n'ont pas été modifiés.
- Tests ajoutés : `reference-store-config.test.js` (défaut, enum, refus en production), `reference-repository.test.js` (suite de contrat de 13 cas exécutée pour MongoDB sur une base dédiée `sigbd_refcheck` — les données semées de `sigbd_test` ne sont jamais touchées — et pour Oracle, plus la comparaison T1 des deux ordres de tri), `reference-oracle-store.test.js` (`POST` developpeur → `GET` → `PUT` avec `REFERENCE_STORE=oracle`).

## [P38] Noyau sur Oracle (CORE_STORE) : régions, structures, périodes

- Variable `CORE_STORE` (`mongo` par défaut, `oracle`), enum zod lue dans `loadConfig()` ; en production, `oracle` exige `ORACLE_USER`/`ORACLE_PASSWORD` (messages existants du bloc Oracle, aucun nouveau message), exactement comme `AUDIT_STORE` et `REFERENCE_STORE`.
- Dépôts dans `backend/src/repositories/` : `regionRepository.js` (`getRegionRepository()` relit `loadConfig().CORE_STORE` **à chaque appel**, jamais d'implémentation cachée), `regionMongo.js`/`regionOracle.js` ; même triptyque pour les structures (`structureRepository.js` / `structureMongo.js` / `structureOracle.js`, `getStructureRepository()`) et pour les périodes (`periodeRepository.js` / `periodeMongo.js` / `periodeOracle.js`, `getPeriodeRepository()`). Préparation seule : aucun fichier applicatif existant n'est modifié (routes, contrôleurs, seeds, modèles, `vitest.config.js` inchangés).
- `repositories/ids.js` : `estIdValide(valeur)` relit `loadConfig().CORE_STORE` à chaque appel — mongo → 24 chiffres hexadécimaux, oracle → 1 à 18 chiffres sans zéro initial ; toute valeur non chaîne est refusée dans les deux modes.
- `repositories/doublon.js` : violation d'unicité normalisée en `Error` `code = 'DOUBLON'` (mongo `code 11000` + `writeErrors`, oracle `errorNum 1`, recherche récursive dans `cause`/`originalError`), message d'origine conservé et erreur d'origine dans `cause` ; toute autre erreur est remontée telle quelle.
- `repositories/listeIn.js` : `IN` découpé en paquets de 900 reliés par OR (limite Oracle : 1000), `colonne` toujours une constante SQL de l'application (aucun texte utilisateur concaténé) ; liste vide → `1 = 0`.
- Ambiguïtés tranchées (choix le plus simple, testées dans les deux modes) :
  - `types: []` ou `regionIds: []` → aucune ligne (équivalent `$in: []` de MongoDB), comme pour `regionIds` à l'étape 37 ; `actives` est appliqué tel quel quand il est fourni ; plusieurs filtres sont combinés en ET (`$and` côté Mongo, `AND` côté Oracle) ;
  - ordres non spécifiés par l'énoncé → ordre de création (`_id`/`ID` croissant) ; `lister()` de Region trié par `name` croissant, `lister()` de Periode par `start` décroissant (dégagement par création décroissante), `listerTerminees` et `listerParCles` gardent ce tri ;
  - `regionId` non convertible en nombre en Oracle → aucune ligne ; `regionId` absent d'une structure → `?? null` dans les assertions ; `trouverParId` renvoie `null` (jamais d'exception) pour un id mal formé ou absent ;
  - forme des objets = `.lean()` Mongo actuel (l'`__v` y figure, tests de forme le tolérant côté Mongo seulement) ; en Oracle `_id`/`regionId` sont des chaînes `String(ID)`, `ACTIVE` 0/1 → booléen, renommages `NAME_REGION→name`, `TYPE_STRUCTURE→type`, `DATE_DEBUT→start`, `DATE_FIN→end`, `DATE_LIMITE→deadline`, `PERIODICITE→periodicity`, dates relues en objets `Date` (round-trip vérifié à la milliseconde, y compris les `TIMESTAMP(3)`) ;
  - `assurer`/`creerSiAbsent` ne modifient jamais l'enregistrement existant (retour `{ …, cree: false }`) ; un vrai conflit d'unicité (par exemple deux appels concurrents) devient `DOUBLON`.
- Écritures transactionnelles côté Oracle (SELECT puis INSERT dans une transaction knex, relecture par clé unique pour obtenir l'`_id`) ; `supprimerTout` = `DELETE` simple, une violation de clé étrangère est laissée telle quelle.
- Tests ajoutés : `core-config.test.js` (défaut, enum, refus en production, formes d'id selon le stockage), `core-repository-geo.test.js` (Region + Structure, 17 cas), `core-repository-periode.test.js` (Periode, 9 cas) ; chaque suite tourne sur MongoDB (base dédiée `sigbd_corecheck`, jamais `sigbd_test`, index uniques recréés dans `beforeAll`) et sur Oracle (`describe.skipIf` sans `ORACLE_TEST_*`), même ordre de nettoyage `Structure` → `Region` → `Periode`.
- Purgement des dépendants dans les `beforeAll` Oracle : `SAISIE_VALIDATION`, `SAISIE`, `REMARQUE` et `UTILISATEUR` finissent toutes sur `STRUCTURE` ou `PERIODE` par clé étrangère et bloqueraient le `supprimerTout` de `beforeEach` (ordre imposé par `FK_STRUCTURE_REGION_ID`) ; ces lignes viennent des autres suites, qui repartent d'un `--reset` ou de leurs propres inserts.
- `vitest.config.js` inchangé : `fileParallelism: false` → les fichiers de test tournent en série, aucun verrou nécessaire entre `sigbd_corecheck` et les autres bases.
- Aucune dépendance nouvelle.

## [P39] Noyau : utilisateurs et modules (CORE_STORE)

- Deux nouveaux triptyques dans `backend/src/repositories/` : `utilisateurRepository.js` (`getUtilisateurRepository()` relit `loadConfig().CORE_STORE` **à chaque appel**, jamais d'implémentation cachée) + `utilisateurMongo.js`/`utilisateurOracle.js`, et `moduleRepository.js` (`getModuleRepository()`) + `moduleMongo.js`/`moduleOracle.js`. Préparation seule : aucun contrôleur, route, service, middleware, script, seed, modèle ou `vitest.config.js` modifié ; aucune dépendance nouvelle ; aucun fichier existant touché.
- Interfaces Utilisateur : `trouverParId`, `trouverParIm`, `trouverPremierParRole`, `listerAvecStructure({role,status,structureId,q,limite})`, `listerParRole`, `rechercher(q)`, `trouverParRefs(refs)`, `creer`, `mettreAJour`, `mettreAJourParIm`, `debloquerExpires(maintenant)`, `supprimerTout`.
- Interfaces Module : `lister({actifs,typeStructure,codes})`, `trouverParId`, `trouverParCode`, `creer(doc)` (transaction), `mettreAJour(id,champs)`, `supprimer(id)`, `assurer(doc)` → `{module, cree}`, `mettreAJourFields(code,fields)`, `completerPeriodicitesAutorisees(code,valeurs)`, `supprimerTout`.
- Forme = `.lean()` Mongo actuel (l'`__v` y figure, tests de forme le tolérant côté Mongo seulement) ; en Oracle `_id`/`structureId` sont des chaînes `String(ID)`, renommages `ROLE_CODE→role`, `STATUT→status`, `GENRE→kind`, `PERIODICITE→periodicity`, `VERSION_MODULE→version`, `FIELDS_JSON→fields`, `NUMBER(1)` → booléen, dates relues en objets `Date` ; `allowedPeriodicities`/`structureTypes` reconstruits depuis `MODULE_PERIODICITE`/`MODULE_TYPE_STRUCTURE` **en ordre alphabétique** (Mongo garde l'ordre fourni) — les tests comparent donc ces deux tableaux sans tenir compte de l'ordre.
- `trouverParId` → `null` (jamais d'exception) pour id invalide (`estIdValide`) ou absent ; doublons → `Error` `code = 'DOUBLON'` via `erreurDoublonSi`.
- Whitelist de champs modifiables — Utilisateur : `nom, prenom, direction, service, role, structureId, passwordHash, status, mustChangePassword, failedAttempts, lockedUntil` (**jamais `im`**) ; Module : `label, periodicity, allowedPeriodicities, kind, structureTypes, fields, version, active` (**jamais `code`**) ; tout champ hors liste lève `Error` « Champ non modifiable : <clés> » avant toute écriture (côté Oracle, la clé est mappée vers la colonne interne, `UPDATED_AT = SYSTIMESTAMP` à chaque UPDATE, même sans scalaire).
- Ambiguïtés tranchées (choix le plus simple, testées dans les deux modes) :
  - `listerAvecStructure` : filtres combinés en ET ; `q` est **littéral** et insensible à la casse sur `im`/`nom`/`prenom` (regex échappée côté Mongo, `LOWER(...) LIKE ... ESCAPE '\'` côté Oracle — `%`, `_`, `\` échappés) ; tri `nom` → `prenom` → `_id`/`ID` ; `limite` défaut 500 ; `structureId` peuplé en `{ _id, label }` ou `null` (structure absente → `null`) ;
  - `trouverParRefs` : chaque référence est un id valide **ou** un im (les deux modes) ; `[]` → `[]` ;
  - `debloquerExpires` : Mongo ajoute `$ne: null` (`$lte` seul matche aussi les `lockedUntil` null, bracketing de types) ; Oracle = transaction SELECT COUNT puis UPDATE (knex+oracledb ne renvoie pas `rowsAffected` sur `db.raw`) → les deux modes retournent le nombre de comptes débloqués ;
  - `mettreAJour` Oracle : UPDATE puis relecture (absent → `null`) ; les tableaux fournis **remplacent intégralement** les lignes enfants (transaction DELETE + INSERT), identique au `$set` de MongoDB ; `mettreAJourParIm` ne retourne rien (`void`) ;
  - `lister()` de Module : ET, tri `code` croissant (binaire Oracle = JS/UTF-8 exact, accents compris — vérifié) ; `codes: []` ou typeStructure inconnu → aucune ligne (cohérent avec `$in: []` de MongoDB) ;
  - `supprimer` Module → `bool` (Oracle : SELECT existence puis DELETE dans une transaction, violation de clé étrangère remontée telle quelle) ; `supprimerTout` : Mongo `deleteMany`, Oracle `DELETE MODULE_SIGBD` (enfants par `ON DELETE CASCADE`) ;
  - `assurer` ne modifie jamais l'existant (`{module, cree:false}`) ; `mettreAJourFields(code, fields)` → `bool` ; `completerPeriodicitesAutorisees` n'agit que si **aucune** périodicité n'est enregistrée et `valeurs` n'est pas vide — **limite connue** : côté Mongo le défaut Mongoose `[]` et un champ absent se confondent (équivalent pratique d'une table sans ligne enfant côté Oracle), sinon `false` sans écriture.
- Écritures JSON : `FIELDS_JSON` lié en **chaîne** `JSON.stringify(...)` (la liaison d'un objet échoue en NJS-044) ; round-trip vérifié jusqu'à ~70 Ko, test d'un gabarit ~50 Ko (au-delà des 4000 octets) sur les chemins INSERT et UPDATE ; **l'ordre des clés JSON est préservé** à l'écriture comme à la lecture (y compris clés numériques, unicode, après UPDATE) — asserté dans les tests.
- Tests ajoutés : `core-repository-utilisateur.test.js` (16 cas) et `core-repository-module.test.js` (15 cas) ; le même contrat tourne sur MongoDB (base dédiée `sigbd_corecheck`, jamais `sigbd_test`, index unique `modules.code` recréé dans `beforeAll`) et sur Oracle (`describe.skipIf` sans `ORACLE_TEST_*`), ordre de nettoyage `Utilisateur` → `Module` → `Structure` → `Region`.
- Purgement des dépendants dans les `beforeAll` Oracle : `SAISIE_VALIDATION` → `SAISIE`/`REMARQUE` → `UTILISATEUR` et `MODULE_SIGBD` finissent toutes sur l'une de ces trois tables (clés étrangères du schéma) et bloqueraient le `supprimerTout` de `beforeEach` ; ces lignes viennent des autres suites, qui repartent d'un `--reset` ou de leurs propres inserts.
- `vitest.config.js` inchangé : `fileParallelism: false` → les fichiers de test tournent en série, aucun verrou nécessaire entre `sigbd_corecheck` et les autres bases (signalement : fichier à ne modifier que sur instruction explicite).
- Suite prévue : étape 40 (Saisie + Remarque sur `CORE_STORE`), étape 41 (bascule des contrôleurs/routes), étape 42 (migration des données), étape 43 (documents).
- Aucune dépendance nouvelle.

## [P40] Noyau : saisies et remarques

- Deux nouveaux triptyques dans `backend/src/repositories/` : `saisieRepository.js` (`getSaisieRepository()` relit `loadConfig().CORE_STORE` **à chaque appel**, jamais d'implémentation cachée) + `saisieMongo.js`/`saisieOracle.js`, et `remarqueRepository.js` (`getRemarqueRepository()`) + `remarqueMongo.js`/`remarqueOracle.js`. Préparation seule : aucun contrôleur, route, service, middleware, script, seed, modèle ou test existant modifié, les dépôts ne sont pas encore appelés par l'application ; `SAISIE` (+ `SAISIE_VALIDATION`) et `REMARQUE` deviennent les dernières tables portées sur les deux stockages.
- Seule modification **additive** dans des fichiers existants : `listerParIds(ids)` ajoutée aux 8 dépôts Structure/Periode/Utilisateur/Module × Mongo/Oracle (rien d'autre dans ces fichiers) — `[]` pour une liste vide, non-tableau ou sans id valide (`estIdValide`), ids invalides et en double ignorés, ordre de création (`_id`/`ID` croissant), listes IN découpées par `construireIn` en Oracle, objets au **format habituel** de chaque dépôt (tableaux enfants de Module reconstruits, `passwordHash` présent — le retrait n'a lieu qu'au moment de construire un lien).
- Interface Saisie : `trouverParId(id, {avecLiens})`, `trouverParCle({structureId,moduleId,periodeId})`, `creer(doc)`, `mettreAJour(id,champs,validation?)`, `lister({avecLiens,statuts,structureIds,moduleId,moduleIds,periodeId,ids,tri,limite})`, `listerResume({moduleId,periodeId})`, `existePourModule(moduleId)`, `archiverExportees(periodeIds)`, `insererPlusieurs(docs)`, `supprimerTout()`. Interface Remarque : `creer({authorId,context,text,state?})`, `lister({avecAuteur,limite})`, `listerParAuteur(authorId,{avecAuteur,limite})`, `changerEtat(id,etat)`, `supprimerTout()`.
- `creer` : défauts `status='brouillon'`, `values={}`, `dates={created:maintenant, submitted:null, exported:null}` ; violation de l'index unique (structure, module, période) → `Error` `code='DOUBLON'` via `erreurDoublonSi` (Mongo `11000`, Oracle ORA-00001 sur l'index fonctionnel `UQ_SAISIE_PERIODE`) ; les saisies d'événement (sans `periodeId`) restent multiples : en Mongo le champ est **retiré** du document (`partialFilterExpression` ne voit que les documents qui l'ont), en Oracle la relecture utilise `NVL(PERIODE_ID, -1)`.
- `mettreAJour` : liste blanche interne `values, status, moduleVersion, dates` (clé applicatif → colonne **constante**, jamais le texte d'entrée dans le SQL) ; toute autre clé lève `Error` « Champ non modifiable : <clés> » **avant toute écriture** ; `dates` se **fusionne clé par clé** (seules les clés fournies parmi `created/submitted/exported` changent) ; la `validation` optionnelle `{decision, motif?, actorId?, actorLabel?, date?}` est ajoutée à la fin de l'historique **dans la MÊME opération** (Oracle : une transaction `UPDATE` + `INSERT` ; Mongo : `$set` + `$push` d'un seul `findOneAndUpdate`), `date` par défaut = maintenant ; `UPDATED_AT = SYSTIMESTAMP` à chaque écriture — sans champ ni validation, rien n'est écrit (parité avec MongoDB, qui n'émet aucun `$set`).
- Forme = `.lean()` Mongo actuel (l'`__v` y figure, tests de forme le tolérant côté Mongo seulement) ; en Oracle `_id` et **toutes** les références sont des chaînes `String(ID)`, `eventDate`/`periodeId` en `null` (côté Mongo `periodeId` reste absent sans liens), `VALEURS_JSON` relu comme `FIELDS_JSON` de `moduleOracle.js` (chaîne/Buffer/objet, écriture `JSON.stringify`, ordre des clés préservé, round-trip ~50 Ko testé), `validations` lues dans `SAISIE_VALIDATION` **triées par `ID` croissant** (= ordre d'insertion, comme le tableau Mongo), `dates` reconstruites depuis `DATE_CREATION`/`DATE_SOUMISSION`/`DATE_EXPORT`.
- Liens `{avecLiens: true}` : `moduleId`, `periodeId`, `authorId`, `structureId` sont **remplacés** par l'objet lié complet (`.populate()` + `.lean()` en Mongo ; en Oracle reconstruits avec `listerParIds` des quatre dépôts — **jamais un JOIN**, chaque dépôt garde sa propre conversion) ; une référence introuvable devient `null` (en Oracle impossible sous FK : le `null` y signifie « pas de référence », cas des saisies d'événement) ; l'utilisateur lié est **privé de `passwordHash` dans les deux modes** (dépôts Saisie et Remarque), de même pour `{avecAuteur: true}` des remarques.
- Ambiguïtés tranchées (choix le plus simple, testées dans les deux modes) :
  - `lister` : tous les filtres sont combinés en ET (`$and` / `AND`) ; toute liste fournie mais vide (ou uniquement des ids invalides) → aucune ligne (cohérent avec `$in: []`) ; `moduleId`/`periodeId` = égalité, id invalide → aucune ligne ;
  - tris : `majDesc` (défaut) = `updatedAt` décroissant puis `_id`/`ID` décroissant ; `structureMajAsc` = `structureId` croissant puis `updatedAt` croissant — **équivalent pratique** : en Oracle l'ordre des structures suit leur ordre de création, en Mongo celui des `ObjectId` (les deux coïncident dans l'usage) ; toute autre valeur → défaut ;
  - `listerResume` : exactement `{structureId, moduleId, periodeId, status}` (sans `_id`), ordre de création ;
  - `trouverParCle` : égalité sur les **seules** clés fournies (le contrôleur de création n'envoie pas `periodeId` pour un module d'événement) ; aucune clé ou id invalide → `null` ;
  - validations : `motif`/`actorId` absents relus `null` (les 5 clés sont toujours présentes), `actorId` toujours une chaîne, l'ordre du tableau est conservé après plusieurs appels ;
  - `archiverExportees` : ne touche que `exportee` **avec période** (les saisies d'événement n'en ont pas), compte pris dans la transaction avant l'`UPDATE` (knex/oracledb n'expose pas `rowsAffected` sur un `raw`), liste vide ou sans id valide → `0` ;
  - `supprimerTout` : Mongo `deleteMany`, Oracle `DELETE FROM SAISIE` (validations par `ON DELETE CASCADE`) puis `DELETE FROM REMARQUE`.
- Tests ajoutés : `core-repository-saisie.test.js` (12 cas : forme, doublon `DOUBLON`, événements identiques, `trouverParId`/`trouverParCle` avec et sans liens, `mettreAJour` (chacun des champs, fusion de dates, refus hors liste, validation atomique, ordre, ~50 Ko, ordre des clés), `lister` (chaque filtre seul et combiné, listes vides, deux tris, limite, liens), `listerResume`, `existePourModule`, `archiverExportees`, `insererPlusieurs`, `supprimerTout` + cascade), `core-repository-remarque.test.js` (6 cas) et `core-repository-ids.test.js` (3 cas sur `listerParIds` des 4 dépôts) ; le même contrat tourne sur MongoDB (base dédiée `sigbd_corecheck`, **jamais** `sigbd_test`, index unique partiel recréé dans `beforeAll`) et sur Oracle (`describe.skipIf` sans `ORACLE_TEST_*`, schéma appliqué seulement si une table manque, **jamais** `--reset`), ordre de nettoyage `Saisie` → `Remarque` → `Utilisateur` → `Module` → `Structure` → `Periode` → `Region`, fixtures créées par les dépôts existants.
- `vitest.config.js` inchangé : `fileParallelism: false` → les fichiers de test tournent en série, aucun verrou nécessaire entre `sigbd_corecheck` et les autres bases (signalement : fichier à ne modifier que sur instruction explicite).
- Plan : étape 41 = bascule des contrôleurs, services et scripts vers `getSaisieRepository()`/`getRemarqueRepository()`, étape 42 = migration des données MongoDB → Oracle, étape 43 = documents.
- Aucune dépendance nouvelle.

## [P41.1] Bascule : connexion et comptes sur les dépôts

- **6 fichiers source modifiés** (et rien d'autre hors tests/docs) : `services/auth.js` (plus d'import `models/Utilisateur.js`), `middleware/auth.js`, `middleware/scope.js`, `controllers/authController.js`, `controllers/userController.js`, `controllers/auditController.js`. Aucun modèle Mongoose supprimé ; Region, Periode, Module, Referentiel, Saisie, Remarque et leurs usages sont intacts (sous-étapes suivantes). Aucune nouvelle dépendance, aucun test existant modifié : tous restent verts en mode `mongo`.
- `services/auth.js` : `handleFailedAttempt(im)` lit `trouverParIm`, incrémente `failedAttempts` localement, ajoute `lockedUntil` dès `MAX_FAILED_ATTEMPTS` (5) puis écrit par `mettreAJourParIm` ; `resetFailedAttempts(im)` → `mettreAJourParIm(im, { failedAttempts: 0, lockedUntil: null })` ; `unlockExpiredAccounts()` → `debloquerExpires(new Date())`. Mêmes constantes (`MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_DURATION_MINUTES = 30`), mêmes règles.
- `middleware/auth.js` : `UtilisateurModel.findById` → `getUtilisateurRepository().trouverParId`. **Un token dont l'id n'a pas la forme du stockage actif est refusé avant même la recherche** : `!estIdValide(String(decoded.id))` → 401 `Token invalide` — même réponse que le `CastError` d'avant (test existant `hardening.test.js` : id `not-an-object-id` → 401). Le `try/catch` autour de la lecture est conservé (il ne capturait que le CastError, mais aussi toute erreur de lecture → 401). Désactivé → 403, `mustChangePassword`, compte verrouillé et session glissante inchangés.
- **`req.user` devient un objet simple** (document `.lean()` du dépôt, ou forme convertie d'Oracle) au lieu d'un document Mongoose : vérifié par grep, **aucun appelant** n'utilise `save()`, `toObject()` ni l'id virtuel sur `req.user` — uniquement `_id`, `im`, `nom`, `prenom`, `direction`, `service`, `role`, `structureId`, `mustChangePassword`, `status`, `passwordHash`, `lockedUntil`.
- `controllers/authController.js` : `login` lit `trouverParIm`, `changePassword` écrit par `mettreAJour(utilisateur._id, { passwordHash, mustChangePassword: false, failedAttempts: 0, lockedUntil: null })`, `me` lit `getStructureRepository().trouverParId(String(req.user.structureId))` (l'import dynamique de Structure et son `.catch` disparaissent : `trouverParId` renvoie `null` au lieu de lever). `new Date(utilisateur.lockedUntil.getTime() + 60000)` reste valable : `lockedUntil` est une `Date` dans les deux modes. Réponses HTTP strictement identiques.
- `middleware/scope.js` : `StructureModel.findById` → `trouverParId(String(...))` ; la requête admin2 devient `getStructureRepository().lister({ regionId, types: ['SRB','SRSP','SRPE','CIRBF','DRBF'] }).map((s) => s._id)` — la nature des valeurs ne change pas (en Mongo des `ObjectId`, que les appelants comparent déjà avec `String()`). `RegionModel` (jamais utilisé) importé pour rien : supprimé.
- `controllers/userController.js` : `OBJECT_ID` remplacé partout par `estIdValide` (`repositories/ids.js`), y compris `profileFields.structureId = z.string({ required_error: REQUIRED }).refine(estIdValide, 'Structure invalide.')` (même message) ; `listUsers` valide les filtres avec les messages d'erreur d'avant puis appelle `listerAvecStructure({ role, status, structureId, q, limite: 500 })` (le `q` est passé **trimé** et absent s'il est vide, pour garder le comportement « espace seule = pas de filtre »), `escapeRegex` supprimé, `serializeUser` inchangé (le dépôt renvoie `structureId` peuplé `{ _id, label }`) ; `createUser` : `trouverParId` (structure) + `trouverParIm` (existant) + `repo.creer(...)` ; `updateProfil` / `desactiverUser` / `reinitialiserMdp` : `trouverParId` puis `mettreAJour(id, champs)` avec des listes de champs fermées — plus de `.save()`. Journaux d'audit et réponses inchangés (`id: String(user._id)`).
- **`DOUBLON` normalisé** : le `catch` de `createUser` teste `error.code === 'DOUBLON'` (le dépôt convertit le `11000` de MongoDB comme l'ORA-00001 d'Oracle) → 409 `Cet IM existe déjà.` ; le chemin ordinaire reste le contrôle `trouverParIm` (409 identique).
- `controllers/auditController.js` : import `Utilisateur` remplacé par `getUtilisateurRepository` ; filtre rôle → `listerParRole(role)` et recherche → `rechercher(q)`, tous deux `flatMap(([String(u._id), u.im])` ; libellés de la page → `trouverParRefs(pageUserIds)` (la construction locale `oids`/`ims` + `Utilisateur.find` et `isObjectIdString` disparaissent, la regex échappée locale aussi). Cartes `labelById`/`labelByIm`/`roleById`/`roleByIm` et corps de réponse inchangés.
- **Nuance à surveiller (collision théorique identifiant/IM dans le journal)** : en Oracle, `USER_REF` reçoit tantôt un id numérique, tantôt un IM (les échecs de connexion sont journalisés **avec l'IM**). Les deux sont des suites de chiffres → un IM pourrait être pris pour un id. **Négligeable** : les `ID` Oracle des tables commencent à 1 (identité) alors que les IM font 6 chiffres (format `XXXNNN`), aucune collision plausible aujourd'hui — **à surveiller** si le format des IM ou l'amorçage des identités change.
- Test ajouté : `backend/tests/auth-core-oracle.test.js` (8 cas, `describe.skipIf` sans `ORACLE_TEST_USER/PASSWORD`, même montage que `audit-oracle-store.test.js`) avec `CORE_STORE=oracle` **et** `AUDIT_STORE=oracle` (les deux remis à leur valeur d'origine en `afterAll`) : login admin1, `/me` avec `structureLabel`, mauvais mot de passe (400), 5 échecs → 403 verrouillage (+ `failedAttempts = 5` et `lockedUntil` futur relu par le dépôt), token 24 hex → 401 `Token invalide`, changement de mot de passe (`mustChangePassword`), parcours admin1 (`201`, doublon `409`, `GET /api/users` avec `q` + rôle, `PATCH` profil, désactivation → 403 connexion, réinitialisation), `GET /api/audit?q=<nom>` → `userLabel`/`userRole` corrects. Fixtures créées par les dépôts Region/Structure/Utilisateur (mots de passe hachés avec `hashPassword`), schéma appliqué si une table manque (jamais `--reset`), nettoyage `Saisie` → `Remarque` → `Utilisateur` → `Module` → `Structure` → `Periode` → `Region` (+ journal) en entrée et en sortie. Pas de `audit-core-*.test.js` : ce seul fichier suffit.
- Plan restant : **41.2** structures, régions, périodes, modules et référentiels (collecte, export, dashboards, modules, périodes, référentiels) ; **41.3** saisies et remarques (contrôleurs `saisie`/`consultation`/`collecte`, sérialiseurs) ; **41.4** scripts et seeds (création admin, init, archive, seed démo/référence).
- Aucune dépendance nouvelle ; `vitest.config.js` inchangé (`fileParallelism: false` → fichiers en série).

## [P41.2] Bascule : modules, structures, régions, périodes sur les dépôts

- **5 fichiers source modifiés** (et rien d'autre hors tests/docs) : `routes/config.js`, `routes/modules.js`, `routes/periodes.js`, `routes/referentiels.js`, `services/moduleMeta.js`. Les imports de `models/Module.js`, `models/Saisie.js`, `models/Structure.js`, `models/Region.js` et `models/Periode.js` disparaissent de ces fichiers (les modèles Mongoose restent en place pour les contrôleurs et scripts non touchés). La constante locale `OBJECT_ID` (24 hex) est remplacée par `estIdValide(id)` du dépôt : la forme de l'identifiant dépend du stockage actif. Aucune nouvelle dépendance, aucun test existant modifié.
- `routes/config.js` (gabarits, developpeur) : `POST /` lit `trouverParCode(code)` puis écrit `creer({...})` — **un `catch` renvoie 409 « Ce code de gabarit existe déjà. » si `error.code === 'DOUBLON'`** (le dépôt normalise le `11000` de MongoDB comme l'ORA-00001 d'Oracle), sinon il relance ; la réponse 201 `{ id, code, version }` est inchangée. `PUT /:id` lit `trouverParId(id)` puis **appelle `mettreAJour(id, { label, periodicity, kind, structureTypes, fields, version: doc.version + 1, ...(allowedPeriodicities !== undefined ? { allowedPeriodicities } : {}) })` au lieu du `save()`** : la version N+1 est calculée depuis la version relue, et `allowedPeriodicities` reste omis quand le corps ne le porte pas (champ laissé intact). `PATCH /:id/active` → `mettreAJour(id, { active })` (null → 404, réponse `{ id, active }` inchangée). `DELETE /:id` : `trouverParId`, règle des rapports de départ (403), `getSaisieRepository().existePourModule(String(doc._id))` (409), confirmation par recopiage (400), `supprimer(String(doc._id))` — aucun ordre ni message ne change. `POST /preview-export` reste sur le dépôt Referentiel (inchangé).
- `routes/modules.js` : `GET /` construit des **options de dépôt** au lieu d'un filtre Mongoose — client → `{ actifs: true, typeStructure: structure.type }`, developpeur → `{}` (tout, y compris inactif), tous les autres rôles → `{ actifs: true }` — et lit `lister(options)` ; **le tri code croissant est déjà fait par le dépôt** (`ORDER BY CODE` / `.sort({ code: 1 })`). `GET /:id` remplace le regex 24 hex par `estIdValide(id)` (404 « Module introuvable. » inchangé, identique en mongo) et lit `trouverParId`.
- `routes/periodes.js` : `Periode.find({}).sort({ start: -1 })` → `getPeriodeRepository().lister()` (tri `start` décroissant, puis création décroissante — dégagement des égalités seulement). `routes/referentiels.js` **lecture uniquement** (l'écriture restait déjà sur le dépôt) : `structures` → `lister({ actives: true, trierParLabel: true })` et, avec `?full=1`, `getRegionRepository().lister()` pour la carte `regionName` ; `regions` → `getRegionRepository().lister()` (tri `name` croissant déjà fait). `services/moduleMeta.js` : `resolveOptions(['structures'])` → même appel `lister({ actives: true, trierParLabel: true })`.
- **Ordre des deux tableaux en mode oracle** : `structureTypes` et `allowedPeriodicities` sont reconstruits depuis les tables de jonction **en ordre alphabétique** (`ORDER BY` de la valeur), alors que MongoDB garde l'ordre fourni — les assertions de test comparent ces deux tableaux sans tenir compte de l'ordre (tri avant comparaison). Voir DECISIONS.md [P39] pour l'origine de ce choix.
- **`CORE_STORE=oracle` n'est pas encore utilisable pour tout le site** : `dashboardController`, `collecteController`, `saisieController`, `consultationController`, `remarque*` et les scripts/seeds restent sur les modèles Mongoose jusqu'aux sous-étapes **41.3** (saisies et remarques) et **41.4** (scripts et seeds). Basculer l'interrupteur avant ces étapes ferait lire les modules/structures côté Oracle et les saisies côté MongoDB.
- Test ajouté : `backend/tests/config-core-oracle.test.js` (9 cas, `describe.skipIf` sans `ORACLE_TEST_USER/PASSWORD`, même montage que `auth-core-oracle.test.js`) avec **`CORE_STORE=oracle`, `REFERENCE_STORE=oracle` et `AUDIT_STORE=oracle`** (les trois remis à leur valeur d'origine en `afterAll`) : création 201 puis code dupliqué 409, `GET /api/modules` (developpeur : les trois gabarits triés par code dont l'inactif ; client SRSP : uniquement l'actif de son type), `GET /api/modules/:id` (200 avec `fields`, id 24 hex → 404, client hors type → 404), `PUT` version 2 puis relecture (version, champs), `PATCH /active` (le client ne voit plus le gabarit), `DELETE` (confirmation fausse → 400, gabarit avec une saisie créée par le dépôt → 409, succès → 200, rapport de départ `RA` → 403), `GET /api/periodes` (start décroissant, dates ISO), `GET /api/referentiels/structures`, `?full=1` (région « Analamanga ») et `/regions`, et `resolveOptions(['structures','epn'])`. Fixtures par les dépôts : une région, deux structures de types différents, un developpeur et un client (mots de passe hachés avec `hashPassword`), trois périodes, un référentiel `epn` ; schéma appliqué si une table manque (jamais `--reset`) ; nettoyage journal + `Saisie` → `Remarque` → `Utilisateur` → `Module` → `Structure` → `Periode` → `Region` en entrée et en sortie.
- Plan restant : **41.3** saisies et remarques (contrôleurs `saisie`, `consultation`, `collecte`, sérialiseurs), **41.4** scripts et seeds (création admin, init, archive, seed démo/référence), **42** migration des données MongoDB → Oracle puis suite complète sur Oracle.
- Aucune dépendance nouvelle ; `vitest.config.js` inchangé (`fileParallelism: false` → fichiers en série).

## [P41.3] Bascule : saisies et remarques sur les dépôts

- **5 fichiers source modifiés** (et rien d'autre hors tests/docs) : `controllers/saisieController.js`, `controllers/collecteController.js`, `controllers/consultationController.js`, `controllers/dashboardController.js`, `routes/remarques.js`. Les imports de `models/Module.js`, `models/Saisie.js`, `models/Periode.js`, `models/Structure.js`, `models/Region.js` et `models/Remarque.js` disparaissent de ces fichiers (les modèles Mongoose restent en place pour les dépôts Mongo et les scripts/seeds non touchés). La constante locale `OBJECT_ID` (24 hex) — y compris dans les `z.string().regex(...)` de `createSchema` — devient `estIdValide` : la forme de l'identifiant dépend du stockage actif. Aucune nouvelle dépendance, aucun test existant modifié.
- `controllers/saisieController.js` : `structureLabelAndRegion` lit structure et région par `trouverParId(String(...))` ; `scopeFilterFor` retourne des **options de dépôt** `{ statuts: statusesInScope(role), structureIds: ids.map(String) }` (`structureIds` absent = toutes) ; `listSaisies` garde ses contrôles (`status` hors périmètre → `200 []`, messages `Module invalide.` / `Période invalide.`) puis appelle `lister({ ...options, avecLiens: true, tri: 'majDesc', limite: 500 })`. `loadSaisieForRead` : `estIdValide` + `trouverParId(id, { avecLiens: true })`. `getHistorique` n'appelle plus `toObject()` (l'objet du dépôt est déjà simple). `createSaisie` : module/structure/période par les dépôts, doublon par `trouverParCle({ structureId, moduleId, periodeId })` → 409 `existingId`, création par `creer({...})` avec identifiants en `String(...)` ; **le `catch` teste `error.code === 'DOUBLON'`** (course entre deux requêtes) → même 409, `existingId` relu par la clé. `updateSaisie` / `soumettreSaisie` / `validerSaisie` / `rejeterSaisie` / `exporterSaisie` écrivent par **`mettreAJour(id, champs, validation)`** (validation d'historique poussée dans la MÊME opération, atomique côté Oracle comme `$push` côté Mongo) au lieu de `values = …; save()` / `validations.push(…); save()` ; réponses et journaux d'audit strictement identiques.
- **Id mal formé → 404 au lieu d'une erreur serveur** : `updateSaisie`, `soumettreSaisie` et `remarques PATCH /:id/etat` valident l'id par `estIdValide` avant lecture. Auparavant, un id de 24 hexadécimaux en mode Oracle passait le regex local, `findById`/`findOneAndUpdate` levait un `CastError` non rattrapé → **500** ; désormais c'est `404 Ressource introuvable.` (comportement voulu, testé en S8/S20).
- `controllers/collecteController.js` : **`buildFilter` retourne un objet d'options du dépôt** (`{ statuts, structureIds, moduleIds, periodeId }`) au lieu de `{ $and: [...] }`, avec les conventions de retour inchangées (`null` = rôle refusé → 403, `'invalid'` = filtre invalide → 400, `{}` = aucun filtre). **Les conditions de même nature sont en ET : les listes sont INTERSECTÉES** par la nouvelle fonction locale exportée `intersecterListes(...listes)` (ordre de la première, doublons retirés, `undefined` si aucune liste, `[]` si intersection vide → le dépôt ne renvoie aucune ligne, comme `$in: []` avant) : périmètre admin2 ∩ `structure` ∩ structures des `regions` (`listerParNoms` + `lister({ regionIds })`) ∩ structures des `types` ; `module` ∩ `modules` ; statuts visibles de l'admin2 ∩ `statut` ; `periodeId`. `listCollecte` / `listHistorique` → `lister({ ...filtre, avecLiens: true, tri: 'majDesc', limite: 1000 })`. `loadExportRows` : avec `ids`, `options.ids = ids` **sans restriction de statut au-delà de celle de l'admin2** (comme avant) ; sans `ids`, `statuts = intersecterListes(filter.statuts, ['exportee','archivee'])` ; `lister({ ..., avecLiens: true, tri: 'structureMajAsc', limite: 5000 })` — `none_selected` / `too_many` / `invalid` inchangés.
- `controllers/consultationController.js` : `lister({ avecLiens: true, statuts: ['exportee','archivee'], moduleId, periodeId, tri: 'majDesc', limite: 1000 })`, `estIdValide` pour module et periode (message `Filtre invalide.` inchangé). `controllers/dashboardController.js` : `Periode.find({})` → `getPeriodeRepository().lister()`, `Module/Structure.find({ active: true })` → `lister({ actifs: true })` / `lister({ actives: true })`, `Region.find({})` → `lister()`, `Saisie.find(...).select(...)` → **`listerResume({ moduleId, periodeId })`** (exactement les 4 champs du tableau de bord) ; `OBJECT_ID` → `estIdValide` ; tout le calcul (attendues / soumises / en retard / taux) reste inchangé.
- `routes/remarques.js` : `Remarque.create` → `creer({ authorId: String(req.user._id), context, text, state: 'nouvelle' })` (réponse 201 `id: String(remarque._id)` inchangée) ; `GET /mes` → `listerParAuteur(String(req.user._id), { avecAuteur: true, limite: 200 })` ; `GET /` → `lister({ avecAuteur: true, limite: 500 })` ; `PATCH /:id/etat` : `estIdValide` puis `changerEtat(id, etat)` (null → 404). `serialize()` fonctionne déjà sur des objets simples.
- **Limites conservées** : 500 (`/api/saisies`), 1000 (`/api/collecte`, `/api/collecte/historique`, `/api/consultation`), 5000 (export), 200/500 (remarques). **Tri `structureMajAsc`** conservé pour l'export (STRUCTURE_ID croissant puis UPDATED_AT croissant, ordre de création des structures en Oracle).
- Tests ajoutés : `backend/tests/saisies-core-oracle.test.js` (23 cas, `describe.skipIf` sans `ORACLE_TEST_USER/PASSWORD`, même montage que `config-core-oracle.test.js`) avec **`CORE_STORE=oracle`, `REFERENCE_STORE=oracle` et `AUDIT_STORE=oracle`** (les trois remis à leur valeur d'origine en `afterAll`) : parcours complet en 21 étapes — création 201, doublon 409 `existingId`, deux saisies d'événement identiques 201, PUT brouillon (`savedAt`), liste client (les siennes seulement), détail avec `module.fields`, historique, id 24 hex → 404 (GET **et** PUT), soumission, liste admin2 (soumise de sa région, jamais brouillon, rien de l'autre région — miroir de l'autre admin2), validation, rejet 400 sans motif puis 200 avec motif, resoumission, collecte admin1 avec chaque filtre seul et combinés (dont intersections vides → `[]`), historique de collecte (`values: null`), export xlsx 200 avec/sans `ids` + `none_selected` (id inexistant pour admin1, id hors région pour admin2), export admin2, consultation consultant (uniquement `exportee`/`archivee`), tableau de bord (attendues 6 / soumises 2 / en retard 4 / taux 33,3 %), remarques (POST 201, `/mes`, boîte developpeur avec auteur résolu, PATCH 200 + 404 inconnu + 404 id 24 hex) et `DELETE` d'un module avec saisies → 409. Fixtures par les dépôts : deux régions avec chacune une structure régionale, un client par structure, un admin2 par région, un admin1, un consultant, un developpeur, un module périodique et un module d'événement, trois périodes mensuelles échues ; schéma appliqué si une table manque (jamais `--reset`) ; nettoyage journal + `Saisie` → `Remarque` → `Utilisateur` → `Module` → `Structure` → `Periode` → `Region` en entrée et en sortie. `backend/tests/collecte-intersection.test.js` (5 cas, **jamais ignoré**, sans Oracle) : test unitaire de `intersecterListes` (aucune liste → `undefined`, dédoublonnage, ordre, intersections vides → `[]`, entrées non tableaux ignorées).
- Plan restant : **41.4** scripts et seeds (création admin, init, archive, seed démo/référence), **42** migration des données MongoDB → Oracle puis suite complète sur Oracle.
- Aucune dépendance nouvelle ; `vitest.config.js` inchangé (`fileParallelism: false` → fichiers en série).

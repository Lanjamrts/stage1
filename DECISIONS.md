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

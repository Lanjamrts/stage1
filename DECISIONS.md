# DECISIONS.md

Journal des choix ambigus. Une ligne par décision, la plus simple chaque fois.

- [P1] Structure monorepo: dossiers /server et /client à la racine, chacun avec son package.json et ses scripts.
- [P1] Fichiers de seed centralisés dans /server/src/seed/ et exécutés par `npm run seed` (idempotent: purge puis ré-insertion complète).
- [P1] structures.code non unique (SRB existe dans 3 régions); l'identifiant réel est code+région, libellé unique « SRB – Analamanga ».
- [P1] Les listes de référence (directions, services, grades, EPN, STD) sont stockées dans une collection `referentiels` {type, value} (la spécification compte 9 collections sans emplacement pour ces listes; /referentiels/:type en a besoin — choix le plus simple).
- [P1] Le seed de la Phase 1 couvre: profils, régions, structures, référentiels, périodes, utilisateurs. Modules et saisies arrivent en Phase 3 (déroulé prescrit par la spécification).
- [P2] journal_audit.userId stocké en String (permet d'auditer les échecs de connexion d'un IM inconnu; la spécification n'impose pas d'ObjectId).
- [P2] Rate limiting désactivé si NODE_ENV=test (sinon la suite de tests RBAC serait bloquée par les limites).
- [P2] « Différent du mot de passe provisoire » implémenté comme « nouveau ≠ actuel » (le serveur ne stocke jamais le mot de passe provisoire en clair).
- [P2] requireAuth(options) : allowPasswordChange=true pour logout/me/change-password; toutes les autres routes /api passent par requireAuth strict (403 PASSWORD_CHANGE_REQUIRED).
- [P1] Tokens de design définis dans tailwind.config.js (couleurs, espacements, rayon, police Inter), conformes à DESIGN.md.
- [P1] AppShell = Sidebar (emblème + SIGBD + menu du rôle + footer DGBF · SSEBF) + TopBar (64px blanche) + bandeau national 4px (rouge/gauche, vert/droite).
- [P1] Seule une structure par région et par type (SRB, SRSP, SRPE, CIRBF) est créée pour les 3 régions Analamanga, Atsinanana, Diana (cohérent avec les utilisateurs du seed).
- [P1] Les utilisateurs du seed utilisent le mot de passe commun « Test@2026 » (spécifié), hashé avec bcrypt.
- [P1] L'auteur « système » du seed est un utilisateur technique de rôle developpeur (im SYS-0000) créé en base.
- [P1] L'environnement utilise ES modules ("type": "module") côté serveur; Vite côté client.
- [P1] Le cookie de session sera httpOnly + sameSite=strict + secure selon NODE_ENV (décision Phase 2, consignée maintenant).

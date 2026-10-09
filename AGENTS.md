# AGENTS.md

- Stack: React + Vite + Tailwind (client) · Node.js + Express + Mongoose (server) · MongoDB local mongodb://127.0.0.1:27017/sigbd.
- Monorepo: /server et /client. Tout le texte utilisateur est en FRANÇAIS; code, commentaires, noms de fichiers en ANGLAIS
- Cinq rôles: client (saisit), admin2 (valide/rejette/exporte, région), admin1 (utilisateurs/collecte/journal, central), developpeur (paramétrage/remarques/journal), consultant (lecture seule).
- Machine à états: brouillon -> soumise (client), rejetee -> soumise (client), soumise -> validee|rejetee(admin2), validee -> exportee(admin2), exportee -> archivee( système). Tout autre => 409.
- Permissions appliquées par le serveur sur chaque requête (rôle + périmètre): 403 mauvais rôle, 404 hors périmètre.

- Les 13 modules génèrent les formulaires depuis modules.fields (moteur de gabarits, pas de formulaires en dur). Règles partagées navigateur/serveur
- SPEC.md gagne sur tout écran du zip et sur tout autre document.

- Appels API sous /api, JSON, tout protégé sauf login. Lignes d'audit append-only pour chaque action sensible.

- Ne pas construire: mobile, notifications, e-mail, rappels, pièces jointes, auto-inscription, « mot de passe oublié », second niveau de validation, suppression de rapports/d'audit
- Après chaque phase: lancer l'app et les tests, git commit, imprimer la liste de contrôle, STOP. Attendre « continue »
- Ne jamais ajouter une fonctionnalité absente de la spécification. Ambiguïté: choix le plus simple, journaliser dans DECISIONS.md
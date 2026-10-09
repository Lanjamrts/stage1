# SIGBD — Système Informatisé de Gestion de la Base de Données

Application web du Ministère de l'Économie et des Finances ( DGBF / SSEBF ). Tous les textes utilisateur sont en FRANÇAIS. Le code, les commentaires et les noms de fichiers sont en ANGLAIS.

## STACK (IMPOSÉ, NE PAS CHANGER)

- Frontend: React (WEB, avec Vite) + React Router + Tailwind CSS. ( PAS React Native, PAS Next.js.)
- Backend: Node.js + Express ( REST API, JSON ).
- Base de données: MongoDB locale à mongodb://127.0.0.1:27017/sigbd, accédée avec Mongoose.
- Bibliothèques: bcrypt, jsonwebtoken, cookie-parser, helmet, express-rate-limit, express-mongo-sanitize, zod, exceljs, pdfkit, supertest + vitest ou jest.
- Monorepo: /server et /client. Git dès le premier commit. Un README avec les instructions d'exécution.

## RÉFÉRENCE VISUELLE
- Les écrans exportés par le designer sont dans un zip: ~/sigbd/stitch_sigbd_design_system_guide.zip. Dézippé dans ./design (lecture seule). Chaque dossier contient code.html (Tailwind HTML) et screen.png. Lire design/syst_me_de_design_sigbd_dgbf/DESIGN.md pour les couleurs, polices et tokens.
- Reproduire les mises en page, textes, couleurs et composants de ces écrans en React ( extraire les composants partagés: AppShell, Sidebar, TopBar, StatusBadge, RoleChip, DataTable, Modal, Drawer, Toast, FormField, RepeatableTable, Banner ).
- L'emblème du Ministère est le PNG dans design/. Le copier vers client/public/emblem.png et l'utiliser de là ( jamais de hotlink externe).
- QUAND UN ÉCRAN ENTRE EN CONFLIT AVEC CETTE SPÉCIFICATION, CETTE SPÉCIFICATION GAGNE. Défauts connus du zip à NE PAS copier:
 1. « Portail Client/Régional/Bénéficiaire/Déconcentré », « Exercice budgétaire… », « Ministère Éco & Fin », « Direction Générale » dans les sidebars: sidebar = emblème + « SIGBD » + menu du rôle + pied de page « DGBF · SSEBF » uniquement.

 2. Le dossier e_consultant montre le menu Admin 1 et utilisateur: faux. Le menu Consultant a 2 items(voir ci-dessous).
 3. Un bouton « Exporter le journal » dans le tiroir d'audit et une ligne « ERR_AUTH_403 »: ne pas les construire
 
 4. Noms de modules inventés (« Exécution Budgétaire », « Situation de Trésorerie »…): utiliser uniquement les 13 noms de modules de cette spéci
 
 5. Le nom du système est toujours « Système Informatisé de Gestion de la Base de Données »。
 6. Les écrans « Admin 2 » des pages export / consultation / remarques sont manquants dans le zip: les construire en réutilisant les écrans existants les plus proches
 
## NON-OBJECTIFS (NE PAS CONSTRUIRE)
Application mobile, notifications, e-mail, rappels automatiques (« Relancer »), pièces jointes ( option EF-14: à ignorer dans cette version ), auto-inscription, lien « Mot de passe oublié », un deuxième niveau de validation, toute validation par le SSEBF, suppression de rapports, suppression de lignes d'audit

## 1. LES CINQ RÔLES ( NE JAMAIS LES CONFONDRE)
Codes de rôle en base: client, admin2, admin1, developpeur, consultant
- client = un service d'une région ( agents des DRBF, SRB, SRSP, SRPE, CIRBF ). Il SAISIT des données. Il ne valide jamais, ne télécharge jamais, ne gère jamais les utilisateurs
 
- admin2 = administrateur RÉGIONAL( chefs des SRB/SRSP/SRPE/CIRBF ou cellule de coordination ). C'est le SEUL rôle qui VALIDE, REJETTE et EXPORTE les rapports vers la base centrale. Périmètre: sa propre région
 
- admin1 = administrateur CENTRAL( SSEBF ). Il gère les UTILISATEURS, COLLECTE et TÉLÉCHARGE les données, suit les soumissions( tableau de bord ) et lit le journal d'audit. Il ne VALIDE jamais, ne rejette jamais, n'exporte jamais, ne modifie jamais un rapport
 
- developpeur = équipe technique( Cellule Informatique ). Il configure les gabarits et listes de référence, traite les remarques, lit le journal d'audit. Il ne voit jamais les données de rapports et ne gère jamais les utilisateurs
 
- consultant = décideur de la DGBF. LECTURE SEULE. Il ne télécharge jamais, n'écrit jamais rien
 
Vocabulaire pour éviter les erreurs:« valider / rejeter / exporter » appartiennent UNIQUEMENT à admin2. « utilisateurs / télécharger / collecte » appartiennent à admin1( admin2 télécharge seulement sa propre région ). « paramétrage » appartient UNIQUEMENT à developpeur
 
## 2. CYCLE DE VIE DU RAPPORT( MACHINE À ÉTATS, UN SEUL NIVEAU DE VALIDATION)
Statuts( codes exacts et libellés français ): brouillon « Brouillon », soumise « Soumise », rejetee « Rejetée », validee « Validée », exportee « Exportée », archivee « Archivée »。
Transitions autorisées, et rien d'autre( tout autre renvoie 409):
- brouillon -> soumise: client de la même structure
 
- rejetee -> soumise: client de la même structure( après correction, « Corriger et resoumettre »)。
- soumise -> validee: admin2 de la même région
 
- soumise -> rejetee: admin2 de la même région, avec un motif OBLIGATOIRE( « motif », 1 à 500 caractères ).
- validee -> exportee: admin2 de la même région( « Exporter vers la base »). Exportée = publiée dans la base centrale
 
- exportee -> archivee: système uniquement( script `npm run archive` archive les rapports exportés dont la période est terminée ). Pas de bouton d'interface
 
L'édition du contenu n'est autorisée qu'en brouillon et rejetee, par un client de la même structure
Un rapport soumis est en lecture seule pour tout le monde
 
Chaque transition écrit une entrée dans saisie.validations( decision, motif, actor, date ) pour les statuts soumise, validee, rejetee, exportee, plus une ligne d'audit
 
RÈGLES DE VISIBILITÉ DES DONNÉES
- brouillon: visible uniquement aux clients de la même structure
 
- admin2: voit les rapports de sa région avec statuts soumise, validee, rejetee, exportee, archivee( JAMAIS brouillon ).
- admin1: voit statut, module, structure, période et dates de TOUS les rapports( pour historique et tableau de bord ). Il voit le CONTENU des rapports seulement quand statut est exportee ou archivee
 
- consultant: voit le contenu des rapports exportee et archivee, toutes régions, lecture seule
 
- developpeur: pas d'accès aux rapports
 
## 3. MATRICE DES PERMISSIONS( APPLIQUÉE PAR LE SERVEUR SUR CHAQUE REQUÊTE)
Le masquage côté front est uniquement cosmétique. Le serveur doit vérifier le rôle ET le périmètre( structure pour client, région pour admin2 ) dans un middleware réutilisable: requireRole([...]) et helpers de périmètre
 
| Action | client | admin2 | admin1 | developpeur | consultant |
| Connexion, déconnexion, changement de son mot de passe | oui | oui | oui | oui | oui |
| Créer / éditer un brouillon, soumettre | sa structure | non | non | non | non |
| Voir la liste des rapports | sa structure | sa région( pas brouillon )| tous( métadonnées )| non | exportee+archivee |
| Valider / rejeter / exporter | non | sa région | non | non | non |
| Télécharger Excel/PDF | non | sa région( exportee, archivee )| toutes régions | non | non |
| Utilisateurs: lister, créer, modifier profil, désactiver, réinitialiser mot de passe | non | non | oui | non | non |
| Collecte par région et type, historique des soumissions | non | non | oui | non | non |
| Tableau de bord( taux de soumission, retards, taux de rejet )| non | non | oui | non | oui( lecture seule )|
| Journal d'audit( lecture seule )| non | non | oui | oui | non |
| Envoyer une remarque à l'équipe technique | non | oui | oui | non | non |
| Recevoir et traiter les remarques | non | non | non | oui | non |
| Configurer les gabarits et listes de référence | non | non | non | oui | non |
Les appels interdits doivent renvoyer 403( mauvais rôle ) ou 404( hors périmètre ), jamais 200
 
## 4. MENUS ET PAGES PAR RÔLE( LIBELLÉS EXACTS, ORDRE EXACT)
- menu client( 2 ):« Tableau de bord »,« Mes saisies »。
  Pages: tableau de bord( alertes, 4 compteurs, tableau des 13 modules avec période, échéance, statut, boutons d'action ),« Nouvelle saisie » modal( choisir période, ou date d'événement ), formulaire dynamique( brouillon, autosave, soumission avec confirmation ), bannière de rejet avec motif et « Corriger et resoumettre »,« Mes saisies »( filtres, tableau, détail avec historique des étapes ), états vides, pages session expirée et accès refusé
 
- menu admin2( 3 ):« Données saisies »,« Consultation et téléchargement »,« Remarques »。
  Pages: liste avec onglets( À examiner, Validées, Rejetées, Exportées, Toutes ), page de revue( contenu en lecture seule, boutons « Valider » et « Rejeter », modale de rejet avec motif obligatoire ),« Exporter vers la base »( confirmation, toast de succès ), consultation de sa région avec filtres et boutons « Télécharger en Excel (.xlsx)» / « Télécharger en PDF », page remarques( envoyer une remarque + liste de ses propres remarques avec état ).
  PAS de tableau de bord pour admin2
 
- menu admin1( 5 ):« Tableau de bord »,« Utilisateurs »,« Collecte et téléchargement »,« Journal d'audit »,« Remarques »。
  Pages: tableau de bord( taux par région, retards, taux de rejet, structures en retard ), utilisateurs( tableau, tiroir d'ajout, modifier profil, désactiver, réinitialiser mot de passe avec mot de passe provisoire affiché une fois ), collecte( cases régions et types -> résultats -> téléchargement; onglet « Historique des soumissions »), journal d'audit( filtres, lecture seule ), remarques( envoi + ses propres remarques ). AUCUN bouton valider/rejeter nulle part
 
- menu developpeur( 3 ):« Paramétrage »,« Remarques »,« Journal d'audit »。
  Pages: liste des gabarits, éditeur de gabarit( champs, types, règles, aperçu, « Publier la version N » ), listes de référence( Régions, Structures, Directions, Services, Grades, Périodes, plus listes EPN et STD ), boîte de réception des remarques( état Nouvelle / En cours / Traitée ), journal d'audit
 
- menu consultant( 2 ):« Tableau de bord »,« Consultation des données »。
  Pages: tableau de bord en lecture seule( pilule « Lecture seule »), table de consultation et page rapport en lecture seule. PAS de bouton de téléchargement, PAS de bouton d'action
 
Gardes de route: un utilisateur authentifié ouvrant une route d'un autre rôle obtient la page « Accès refusé »( aucun code technique affiché )。Après connexion chaque rôle atterrit sur: client -> Tableau de bord, admin2 -> Données saisies, admin1 -> Tableau de bord, developpeur -> Paramétrage, consultant -> Tableau de bord
 
## 5. RÈGLES D'AUTHENTIFICATION
- Connexion avec IM + mot de passe. Mots de passe hachés avec bcrypt. JWT dans un cookie httpOnly, sameSite=strict. Délai d'inactivité 30 minutes( glissant ), configurable dans .env; le client montre une modale « Votre session va expirer » avec un compte à rebours de 60 secondes, puis la page « Votre session a expiré »
- 5 tentatives échouées verrouillent le compte( « Votre compte est temporairement verrouillé…» )。Un compte désactivé ne peut pas se connecter( « Ce compte est désactivé. Contactez votre administrateur. »)。Erreur pour mauvais identifiants:「 Identifiant ou mot de passe incorrect. 」Pas de création de compte et pas de lien « mot de passe oublié »: seul admin1 crée les comptes et réinitialise les mots de passe
 
- Admin1 crée un utilisateur: le serveur génère un mot de passe provisoire( format Xxx-Xxx-Xxx ), le renvoie UNE FOIS, stocke uniquement le hash et met mustChangePassword=true. Lors de la première connexion l'utilisateur est forcé vers la page « Changez votre mot de passe »( actuel, nouveau, confirmation; règles: au moins 8 caractères, une majuscule, une minuscule, un chiffre, différent du provisoire )。Jusqu'au changement, toute autre route renvoie 403 avec code PASSWORD_CHANGE_REQUIRED
 
- Les utilisateurs sont désactivés, jamais supprimés( statut « actif » / « desactive »)。
- Sécurité: helmet, limitation de débit sur la connexion, express-mongo-sanitize, validation zod sur chaque body, échapper les textes affichés, pas de stack traces au client
 
##  ́6. BASE DE DONNÉES( MongoDB, 9 collections )
- regions {name} 
- structures {code, label, type: SRB|SRSP|SRPE|CIRBF|DRBF|SSEBF|DGBF|CELLULE_INFO, regionId?, active} 
- profils {code, label}( les 5 rôles )
- utilisateurs {im( unique ), nom, prenom, direction, service, passwordHash, role, structureId, status, mustChangePassword, failedAttempts, lockedUntil}
- modules {code, label, periodicity, kind: "periodic"|"event", structureTypes[], version, active, fields[]}
- periodes {label, start, end, deadline, periodicity}
- saisies {structureId, moduleId, moduleVersion, periodeId?, eventDate?, authorId, status, values{}, validations[{decision, motif, actorId, date}], dates{created, submitted, exported}}
- remarques {authorId, context, text, state: nouvelle|en_cours|traitee, createdAt}
- journal_audit {userId, action, object, ip, createdAt}( append-only: pas de route de mise à jour ni de suppression, pas de suppression dans le code
 
- Index unique: une saisie par( structureId, moduleId, periodeId ) pour les modules périodiques. Les modules d'événements( CRGP, assistance, formation, nominations, régie, transfert ) n'ont pas cette limite
 
- Une saisie conserve la moduleVersion avec laquelle elle a été créée
 
##  ́7. MOTEUR DE GABARITS( FORMULAIRES DYNAMIQUES, PAS DE FORMULAIRES EN DUR)
Tous les 13 formulaires sont générés depuis modules.fields. Types de champ: text, textarea, integer, decimal, date, select, multiselect, table( lignes répétables avec sous-champs ), auto( lecture seule, rempli par le serveur: région, structure, author, total ). Règles: required, maxLength, min, max, noFuture( date pas après aujourd'hui ), afterField( date pas avant un autre champ ), unique( dans une colonne de table ), inList. Les MÊMES règles tournent dans le navigateur( messages instantanés ) et sur le serveur( vérité finale; le serveur rejette la soumission avec les messages français: « Ce champ est obligatoire. »,« La date ne peut pas être dans le futur. »,« La valeur doit être supérieure ou égale à 0. »,« Ce numéro de série existe déjà dans votre recensement. » etc. )。Enregistrer un brouillon ne requiert pas toutes les règles; soumettre oui
 
DSL de champ: key:type! = obligatoire; ( opts ) = règle ou liste
 
Seeder ces 13 modules( structures autorisées entre crochets ):
1 RA « Rapport d'activités » périodique mensuel-ou-trimestriel [SRB,SRSP,CIRBF]: periode:auto, activites:table!(intitule:text!max200, date:date!noFuture, statut:select!(Réalisée,En cours,Non réalisée)), indicateurs:table(indicateur:text!, valeur:decimal!min0), difficultes:textarea max2000, perspectives:textarea max2000
2 CRGP « Compte rendu CRGP » événement [SRB]: date_reunion:date!noFuture, lieu:text!, theme:text!, nb_participants:integer!min0, structures_presentes:multiselect!(structures), points_abordes:textarea!, decisions:textarea!, recommandations:textarea, actions:table!(action:text!, responsable:text!, echeance:date!), prochaine_reunion:date
3 ASS « Compte rendu d'assistance » événement [SRB,CIRBF]: date_intervention:date!noFuture, agent:text!, type_beneficiaire:select!(CLD,EPN,Autre), nom_beneficiaire:text!, nature_objet:textarea!, resultats:textarea!, suites:textarea
4 FOR « Compte rendu de formation » événement [SRB,SRSP,CIRBF]: intitule:text!, date_debut:date!, date_fin:date!afterField(date_debut), lieu:text!, formateur:text!, public_cible:text!, nb_hommes:integer!min0, nb_femmes:integer!min0, total:auto(nb_hommes+nb_femmes), themes:textarea!, evaluation:textarea!, recommandations:textarea
5 RH « Ressources humaines » périodique trimestriel [SRB,SRSP,CIRBF]: effectif:table!(categorie:select!(Catégorie A,Catégorie B,Catégorie C,Catégorie D), grade:text!, sexe:select!(Homme,Femme), effectif:integer!min0), mouvements:table(type:select!(Arrivée,Départ,Affectation), nombre:integer!min1), besoins:textarea max2000. NE JAMAIS stocker de noms d'agents dans ce module
 
6 NOS « Nomination Ordonnateur Secondaire » événement [SRB,SRSP,CIRBF]: titulaire_nom, titulaire_prenom, titulaire_im, suppleant_nom, suppleant_prenom, suppleant_im( tous text!), ref_arrete:text!, date_arrete:date!noFuture, date_prise_fonction:date!afterField(date_arrete), statut:select!(En fonction,Remplacé)
7 NPR « Nomination PRMP » événement [DRBF,SRB]: nom, prenom, im, fonction( text!), ref_arrete:text!, date_arrete:date!noFuture, date_prise_fonction:date!afterField(date_arrete), statut:select!(En fonction,Remplacé)
8 NCA « Nomination membres du Conseil d'Administration EPN » événement [SRB]: epn:select!(ref EPN), membres:table!(nom:text!, prenom:text!, qualite:text!), ref_arrete:text!, date_arrete:date!noFuture, duree_mandat:integer!min1, statut:select!(En fonction,Remplacé
9 RMB « Recensement mobilier de bureau » périodique trimestriel [DRBF,SRB,SRSP,CIRBF]: articles:table!(designation:text!, quantite:integer!min1, date_acquisition:date!noFuture, etat:select!(Bon,Moyen,Hors service), service:text, agent:text)
10 RMI « Recensement matériel informatique » périodique trimestriel [DRBF,SRB,SRSP,SRPE,CIRBF]: equipements:table!(designation:text!, type:select!(Ordinateur,Imprimante,Serveur,Onduleur,Autre), marque:text, modele:text, numero_serie:text!unique, date_acquisition:date!noFuture, etat:select!(Bon,Moyen,Hors service), service:text, agent:text)
11 RMR « Recensement matériels roulants » périodique trimestriel [DRBF,SRB,SRSP,SRPE,CIRBF]: vehicules:table!(type:select!(Voiture,Camionnette,Moto,Autre), marque:text!, modele:text!, immatriculation:text!unique, annee:integer!max(currentYear), etat:select!(Bon,Moyen,Hors service), service:text, agent:text)
12 RAV « Régie d'avances STD » événement [SRB]: std:select!(ref STD), intitule:text!, statut:select!(Active,Suspendue,Clôturée), montant:integer!min0, ref_acte:text!, date_acte:date!noFuture, regisseur_nom:text!, regisseur_prenom:text!, regisseur_im:text!, regisseur_fonction:text!
13 TSE « Transfert salaires et accessoires EPN » événement [SRB]: epn:select!(ref EPN), date_demande:date!noFuture, nature:select!(Salaires,Accessoires), periode_concernee:text!, montant:integer!min0, statut:select!(Demandé,En cours,Effectué), ref_piece:text!
Nominations( modules 6, 7, 8 ):le formulaire montre une carte en lecture seule « Historique des changements » listant les saisies EXPORTÉES antérieures de la même structure et module. NE PAS modifier automatiquement les anciennes saisies
 
Chaque module a une « Période » ou une date d'événement comme décrit. La modale « Nouvelle saisie » le demande. Une deuxième saisie périodique pour la même structure, module et période est refusée avec le message « Une saisie existe déjà pour cette période. » et l'app propose « Continuer la saisie existante »
 
Versionnage des gabarits: éditer un gabarit crée la version N+1; les saisies existantes gardent leur version
 
##  ́8. API( tout sous /api, JSON, tout protégé sauf connexion )
- auth: POST /auth/login · POST /auth/logout · GET /auth/me · POST /auth/change-password
- modules: GET /modules( client: modules autorisés pour son type de structure; developpeur: tous )· GET /modules/:id
- config( developpeur uniquement ): POST /config/modules · PUT /config/modules/:id( crée une nouvelle version )· PATCH /config/modules/:id/active
- referentiels: GET /referentiels/:type( tout rôle authentifié )· POST|PUT|PATCH /referentiels/:type( developpeur uniquement )
- saisies: GET /saisies · GET /saisies/:id · POST /saisies( client )· PUT /saisies/:id( client, brouillon|rejetee )· POST /saisies/:id/soumettre( client )· POST /saisies/:id/valider( admin2 )· POST /saisies/:id/rejeter( admin2, body {motif})· POST /saisies/:id/exporter( admin2 )· GET /saisies/:id/historique
- collecte: GET /collecte( admin1: filtres regions[], modules[], periode, structure, statut; admin2: région forcée depuis sa structure )· GET /collecte/export?format=xlsx|pdf( mêmes périmètres; uniquement lignes exportee et archivee )· GET /collecte/historique( admin1: tous statuts, métadonnées uniquement )
- consultation: GET /consultation( consultant uniquement, JSON uniquement, exportee et archivee )
- dashboard: GET /dashboard?module=&periode=( admin1 et consultant )
- users( admin1 uniquement ): GET /users · POST /users · PATCH /users/:id/profil · POST /users/:id/desactiver · POST /users/:id/reinitialiser-mdp
- remarques: POST /remarques( admin1, admin2; body {context, text})· GET /remarques/mes( admin1, admin2 )· GET /remarques( developpeur )· PATCH /remarques/:id/etat( developpeur; nouvelle|en_cours|traitee )
- audit: GET /audit( admin1, developpeur; filtres action, role, from, to)
Les lignes d'audit sont écrites automatiquement pour: connexion réussie et échouée, création d'utilisateur, changement de profil, désactivation, réinitialisation de mot de passe, création de saisie, modification, soumission, validation, rejet, export, publication de gabarit, changement d'état de remarque, téléchargements
 
Calcul du tableau de bord: attendues = pour chaque période dont l'échéance est atteinte et chaque module, une saisie par structure autorisée; soumises = saisies avec statut soumise ou ultérieur; en retard = attendues sans aucune telle saisie après l'échéance; taux de rejet = rejetee /( soumise ou ultérieur, comptées une fois ); regroupement par région
 
##  ́9. DONNÉES DE DÉPART( npm run seed, idempotent )
Régions: Alaotra-Mangoro, Analamanga, Atsimo-Andrefana, Atsinanana, Boeny, Diana, Haute Matsiatra, Itasy, Menabe, Sava, Sofia, Vakinankaratra
Structures: SRB, SRSP, SRPE, CIRBF pour Analamanga, Atsinanana, Diana( libellés comme « SRB – Analamanga »); SSEBF, DGBF,« DGBF – Cellule Informatique » sans région
Listes de référence: Directions, Services, Grades( Attaché d'administration, Secrétaire de bureau, Agent d'exécution ), EPN( Centre de formation professionnelle d'Analamanga + 2 exemples ), STD( Direction Régionale de l'Éducation Nationale – Analamanga + 2 exemples
 
Périodes: Septembre 2026( mensuelle, échéance 2026-10-05 ), T3 2026( trimestrielle, échéance 2026-10-15 ), Octobre 2026
Utilisateurs( mot de passe « Test@2026 », mustChangePassword=false, sauf le dernier ):
 104562 Rakotoarivelo Hery client SRB–Analamanga · 112470 Randriamampionona Jean client SRSP–Analamanga · 115908 Raharimalala Voahangy client CIRBF–Analamanga · 108231 Rasoamanana Lalao admin2 SRB–Analamanga · 120344 Andrianarisoa Mamy admin1 SSEBF · 121775 Rakotomalala Fanja consultant DGBF · 123009 Ratsimba Tiana developpeur Cellule Informatique · 098716 Rabemananjara Solo client SRB–Atsinanana, statut desactive · 125430 Rakotonirina Haja client SRSP–Analamanga avec mustChangePassword=true
 
Seeder aussi ~10 saisies dans divers statuts pour que chaque écran ait des données( dont une rejetee avec un motif et quelques exportee dans Atsinanana et Diana, saisies par un auteur système seedé
 
##  ́10. FLUX DE TRAVAIL POUR VOUS( L'AGENT ): 8 PHASES, STOP APRÈS CHACUNE
Première action: écrire toute cette spécification dans SPEC.md, créer AGENTS.md( un résumé de 20 lignes: stack, les cinq rôles, la machine à états,« SPEC.md gagne »), créer DECISIONS.md( journaliser chaque choix ambigu en une ligne ), puis commencer la Phase 1
Après chaque phase: lancer l'app et les tests, commit avec git, imprimer une courte liste de contrôle( fait / pas fait / décisions prises ), puis STOP et attendre le mot « continue ». Ne jamais commencer la phase suivante seul. Ne jamais ajouter une fonctionnalité qui n'est pas dans cette spécification. Si quelque chose est ambigu, choisir l'option la plus simple et l'écrire dans DECISIONS.md
 
Phase 1 – Mise en place du projet: monorepo, Express + Mongoose connectés au MongoDB local, Vite + Tailwind, tokens de design depuis DESIGN.md, emblème, AppShell avec menus de rôles( statiques ), script de seed( utilisateurs, structures, régions, périodes, référentiels ).
Phase 2 – Authentification: connexion, verrouillage, compte désactivé, changement forcé de mot de passe, session cookie avec expiration glissante, modale d'avertissement d'expiration, déconnexion, middleware d'auth requireRole + helpers de périmètre, page accès refusé, gardes de route par rôle, helper de journalisation d'audit. Écrans: connexion( +3 états d'erreur ), première connexion( 4 états ), session expirée / avertissement, accès refusé
 
Phase 3 – Moteur de gabarits + Client: API modules, renderer de formulaire dynamique, règles( client + serveur ),« Nouvelle saisie », autosave de brouillon, soumission avec confirmation, tableau de bord Client et « Mes saisies »( liste, détail, historique des étapes, états vides ). Seeder les modules 1, 5 et 10 d'abord, puis les autres 10
 
Phase  ́4 – Admin 2: liste avec onglets, page de revue, valider, rejeter avec motif, exporter vers la base, périmètre régional, consultation régionale et téléchargement Excel/PDF, envoi de remarques
 
Phase  ́5 – Admin 1: utilisateurs( créer, lister, filtrer, changer profil, désactiver, réinitialiser mot de passe, mot de passe provisoire affiché une fois ), page collecte avec téléchargements, historique des soumissions, tableau de bord, envoi de remarques
 
Phase  ́6 – Consultant et Developpeur: tableau de bord consultant et consultation( lecture seule ),éditeur de gabarit developpeur avec versions, listes de référence, boîte de réception des remarques avec états, écran journal d'audit( partagé avec admin1 ).
Phase  ́7 – Suite de tests RBAC( supertest ): tests automatisés qui PROUVENT la matrice des permissions. Au minimum ces appels doivent échouer: client valide, client télécharge, client lit une autre structure, admin2 crée un utilisateur, admin2 lit une autre région, admin2 voit un brouillon, admin1 valide, admin1 rejette, admin1 exporte, admin1 édite une saisie, admin1 édite un gabarit, developpeur lit une saisie, developpeur crée un utilisateur, consultant télécharge, consultant écrit quoi que ce soit, tout utilisateur avec mustChangePassword appelant une route sauf change-password et logout, transitions d'état invalides( ex. exportee -> soumise, brouillon -> validee ), rejet sans motif, soumission avec champs obligatoires manquants, mise à jour d'une saisie soumise, suppression ou mise à jour d'une ligne d'audit. Aussi des tests que chaque action autorisée fonctionne pour le bon rôle
 
Phase  ́8 – Dernière passe: comparer chaque écran avec le zip( libellés, ordre des colonnes, boutons ), retirer tout ce qui est interdit dans la section 1 et dans « Défauts connus », écrire README( installation, exécution, seed, test, comptes ), liste de contrôle finale par rôle: pour chaque rôle lister les pages et les actions qui fonctionnent
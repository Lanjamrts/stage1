# ARCHITECTURE TECHNIQUE – SIGBD (Système Informatisé de Gestion de la Base de Données)
**Ministère de l'Économie et des Finances · DGBF · SSEBF**

---

## 1. PRINCIPE GÉNÉRAL
* **Application web accessible par navigateur**, sans installation préalable sur le poste client (`NF-07`).
* **Sécurité & Intégrité** : L'utilisateur ne communique jamais directement avec la base de données. Toute action passe impérativement par le serveur d'application, qui valide l'authentification et contrôle les droits d'accès à chaque requête (`EF-02`, `NF-02`).

---

## 2. SCHÉMA GLOBAL D'ARCHITECTURE

```
  ┌─────────────────────────────────────────────────────────────┐
  │                Utilisateur (Navigateur Web)                 │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 │  HTTPS / TLS 1.3 (NF-01)
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │     Interface Web (Présentation) ··········· React          │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 │  Requêtes API REST / JSON
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  Serveur d'Application ··············· Node.js / Express     │
  │  ├─ Authentification et gestion des sessions                │
  │  ├─ Contrôle d'accès basé sur les rôles (RBAC)              │
  │  ├─ Moteur dynamique de canevas et contrôles de saisie      │
  │  ├─ Circuit de validation : saisie ➔ validation ➔ export    │
  │  ├─ Génération et export de documents Excel (.xlsx) / PDF   │
  │  ├─ Journalisation d'audit immuable                         │
  │  └─ Module d'assistance et remarques à l'équipe technique   │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 │  Driver / Connexion sécurisée
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │     Base de Données ····················· MongoDB           │
  │     (Hébergée sur l'infrastructure sécurisée DGBF)          │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 │  Snapshots automatiques quotidiens
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │   Sauvegardes quotidiennes + Copie distante hors site (NF-05)│
  └─────────────────────────────────────────────────────────────┘
```

---

## 3. LES 4 COUCHES DE L'APPLICATION (Cahier des charges §13.2)

1. **Couche Présentation (Frontend)** :
   * Interface Web développée en **React** (SPA réactive, composants accessibles).
   * Rendu fidèle des maquettes institutionnelles et adaptation ergonomique aux écrans de saisie et de consultation.
2. **Couche Application / Traitement (Backend)** :
   * Serveur développé sous environnement **Node.js / Express**.
   * Exécution de l'ensemble de la logique métier, contrôle de validité des formulaires, gestion des workflows et ordonnancement des exports.
3. **Couche Données (Persistance)** :
   * Système de gestion de base de données **MongoDB** (modèle orienté documents pour s'adapter à la flexibilité des canevas).
   * Hébergement exclusif au sein du centre de serveurs de la **DGBF** en environnement de production.
4. **Couche Sécurité & Transverse** :
   * Chiffrement des flux de bout en bout (**HTTPS / TLS**).
   * Filtrage strict des accès par profil et structure, journalisation exhaustive et protection contre les vulnérabilités applicatives.

---

## 4. MODÉLISATION DES DONNÉES (9 Collections Principales)

Le schéma s'articule autour de 9 collections fondamentales :
1. `regions` : Liste officielle des régions administratives de rattachement.
2. `structures` : Directions régionales, services déconcentrés (SRB, SRSP, CIRBF, etc.) et établissements rattachés (EPN, STD).
3. `profils` : Rôles du système (Client, Admin régional / Admin 2, Admin central / Admin 1, Développeur, Consultant).
4. `utilisateurs` : Comptes agents identifiés par leur IM (Identifiant Matricule), profil et statut de compte.
5. `modules` : Modules de collecte (Mobilier, Matériels roulants, RH, Matériel informatique, CRGP, etc.) avec leurs champs dynamiques et types de saisie.
6. `periodes` : Définition des campagnes et échéances de soumission (trimestrielles, annuelles ou événementielles).
7. `saisies` : Enregistrements des données saisies, valeurs horodatées, historique du circuit de validation et **version exacte du canevas utilisée au moment de la soumission**.
8. `remarques` : Remarques contextuelles et échanges techniques rattachés aux formulaires ou modules.
9. `journal_audit` : Traçabilité immuable des accès et des actions sensibles du système.

---

## 5. MESURES DE SÉCURITÉ APPLICATIVE & SYSTÈME

* **Authentification & Mots de passe** :
  * Authentification unifiée par identifiant matricule (**IM**) et mot de passe haché de manière irréversible via **bcrypt** (`EF-01`, `NF-01`).
  * Changement obligatoire du mot de passe provisoire dès la première connexion (`EF-04`).
* **Gestion des Sessions** :
  * Déconnexion automatique et verrouillage de session en cas d'inactivité prolongée (`EF-03`).
* **Contrôles d'Accès & Ségrégation des Fonctions** :
  * Vérification systématique des autorisations par le serveur à chaque appel d'API (`EF-02`).
  * **Séparation stricte des responsabilités (§14.1)** : un agent saisissant une donnée ne peut pas la valider ; un valideur ne peut pas administrer les comptes utilisateurs.
  * Cloisonnement hermétique des données sensibles (ex. Ressources Humaines) par profil et périmètre géographique (`NF-02`).
* **Résilience & Standards Web** :
  * Application stricte des recommandations de sécurité **OWASP** (protection contre les injections, failles XSS, attaques CSRF) (`NF-01`).
* **Traçabilité & Conservation** :
  * Journal d'audit centralisé consignant toutes les connexions et opérations sensibles, conservé pour une durée minimale de **12 mois** (`NF-09`).

---

## 6. EXIGENCES NON FONCTIONNELLES & QUALITÉ DE SERVICE

* **Performance & Fluidité** : Temps d'affichage et de réponse moyen des pages inférieur à **3 secondes** (`NF-03`).
* **Disponibilité** : Taux de disponibilité garanti de **99 %** sur les jours et plages ouvrés (`NF-04`).
* **Fiabilité des Saisies** : Garantie de zéro perte de données en cas de déconnexion inopinée grâce à l'enregistrement automatique à chaque étape (`NF-11`).
* **Génération de Rapports** : Exports bureautiques **Excel (.xlsx)** et **PDF** strictement conformes aux modèles et canevas réglementaires (`NF-08`).

---

## 7. GESTION DES ENVIRONNEMENTS (`NF-10`)

| Environnement | Destination & Rôle | Données hébergées | Gestionnaire |
| :--- | :--- | :--- | :--- |
| **Développement** | Poste local de conception et d'intégration | Jeux d'essais fictifs | Développeur / Stagiaire |
| **Test & Recette** | Plateforme de recette fonctionnelle (`T-01` à `T-12`) et démonstration | Jeux d'essais fictifs | Équipe projet & Référents métier |
| **Production** | Exploitation réelle du système | Données réelles institutionnelles | Cellule Informatique DGBF |

* **Ingénierie logicielle** : Code source entièrement documenté et versionné sous gestionnaire de versions **Git**.

---

## 8. STRATÉGIE DE SAUVEGARDE ET DE REPRISE D'ACTIVITÉ (`NF-05`)

* **Fréquence** : Sauvegarde automatisée quotidienne de la base de données de production.
* **Redondance** : Copie de sauvegarde déportée hors site pour pallier tout sinistre physique ou incident infrastructurel.
* **Plan de Continuité** : Procédure de restauration testée et vérifiée chaque trimestre.
* **Outillage technique** : Outils natifs standardisés d'extraction et de réinjection (`mongodump` et `mongorestore`).

---

## 9. POINTS TECHNIQUES À VALIDER

1. **Validation du SGBD cible** : Arbitrage définitif entre **MongoDB** (flexibilité des schémas de canevas) et **Oracle Database** (conformité avec le SI existant) par le *Comité technique*.
2. **Compétences et transfert** : Évaluation de la montée en compétences et de l'autonomie de la *Cellule Informatique* sur les technologies proposées (**React** et **Node.js**).
3. **Dimensionnement infrastructure** : Spécification des prérequis d'hébergement, CPU, mémoire vive et stockage pour le serveur d'application à la DGBF.
4. **Paramètres de sécurité** : Définition formelle par l'administration du délai de timeout d'inactivité (ex. 15 ou 30 min) et de la politique de complexité des mots de passe.

# Analysis Power — Basalte-Web

**Version 5.0.0 POWER** — cockpit local de **Decision Intelligence** pour les extractions TGM / Rezomatic.

Analysis Power ne cherche pas à afficher le plus de statistiques possible. Son principe est :

> **Constat → Pourquoi → Solution → Preuves**

L’écran principal montre ce qui mérite une décision. Les explications, actions, calculs et sources restent accessibles à la demande, sans transformer le cockpit en tableau de bord illisible.

## Les 5 briques Power

1. **Explain Engine** — explique les variations de CA, fréquentation, panier, marge, clients, produits et zones au lieu de seulement les constater.
2. **Money Impact** — priorise les diagnostics selon leur poids économique et évite de mettre sur le même plan un petit écart et une perte structurante.
3. **Customer Recovery** — détecte les clients à risque, fenêtres de revisite et opportunités de récupération, avec listes d’action.
4. **Stock Decision** — transforme stock, rotation, couverture et ventes récentes en alertes et décisions de réassort/déstockage.
5. **Local & Causal Intelligence** — confronte les constats à des facteurs externes (travaux, accès, parking, mobilité, événements, météo…) avec seuil de preuve, chronologie et source.

## Règle causale fondamentale

Une donnée peut être **collectée et testée sans être affichée**.

Analysis Power n’affiche une cause que si son propre signal franchit le seuil de restitution et si elle est cohérente avec le diagnostic concerné. Une hypothèse faible ou non pertinente reste dans **Audit & preuves** et ne pollue jamais le cockpit.

Exemple : un chantier n’est pas mentionné pour une baisse produit simplement parce qu’il existe dans la ville. Pour qu’un facteur d’accès remonte, il faut notamment un diagnostic compatible, une concentration géographique exploitable et une chronologie suffisamment cohérente.

Les statuts visibles sont :

- **Explication fortement compatible** ;
- **Explication compatible** ;
- ou **aucune cause affichée**.

Power préfère afficher zéro cause plutôt qu’une explication séduisante mais faible.

## Preuves et sources officielles

Lorsqu’un chantier ou événement public est retenu, la fiche de preuve conserve séparément :

- organisme source ;
- URL officielle ;
- lieu ;
- dates disponibles ;
- distance au commerce lorsqu’elle peut être calculée ;
- **extrait/descriptif officiel conservé sans reformulation** ;
- date de collecte ;
- interprétation Analysis, distincte du texte source.

L’interprétation statistique n’est jamais présentée comme une déclaration de l’organisme public.

## Local Context Engine

Le profil du point de vente contient :

- nom ;
- adresse complète ;
- rayon immédiat ;
- zone commerciale ;
- zone étendue.

L’adresse est géocodée via **Géoplateforme / Base Adresse Nationale**. Une fois le profil enregistré, l’analyse déjà ouverte est recalculée automatiquement.

Le collecteur GitHub Actions utilise `config/store.json` pour ancrer son contexte public et peut enrichir les événements avec coordonnées/distance lorsqu’une localisation exploitable est disponible.

### Important — édition GitHub Pages

Cette édition est volontairement **single-store et sans backend métier** :

- le profil saisi dans l’interface est local au navigateur ;
- le collecteur planifié GitHub Actions lit `config/store.json` ;
- pour un déploiement TGM multi-magasins, l’étape suivante consiste à injecter le profil de chaque établissement via l’API/plateforme TGM ou un service de contexte centralisé.

Le moteur est donc prêt pour une démonstration réelle et une exploitation locale, sans prétendre qu’un site statique GitHub Pages peut à lui seul assurer une collecte multi-enseigne nationale en temps réel.

## Import TGM

L’utilisateur charge :

- `Clients.xlsx`, `Clients(3).xlsx`, etc. ;
- un ou plusieurs `Ventes.csv`, `Ventes(1).csv`, etc. ;
- `Catalogue.xlsx`, `Catalogue(14).xlsx`, etc.

Après validation, Power exécute automatiquement : croisement → diagnostic → priorisation → clients → produits → stock → fidélisation → géographie → contexte local → causalité → actions → historique.

Le nom de fichier ne suffit jamais : schéma, colonnes, dates, identifiants, doublons, contradictions et cohérence financière sont contrôlés.

## Interface Power

- **Cockpit Power** : situation en 30 secondes + Power Score + 3 priorités.
- **Power Lens** : un clic sur un KPI ouvre son sens et son explication.
- **Pourquoi ?** : révèle uniquement les causes réellement retenues.
- **Solution** : ouvre les actions proposées sans encombrer le diagnostic.
- **Preuves** : calculs, faits et sources officielles à la demande.
- **Audit & preuves** : hypothèses testées mais rejetées, qualité des rapprochements et limites de couverture.

## Contexte public

Le connecteur fourni avec cette édition est optimisé pour la démonstration clermontoise et collecte, selon disponibilité :

- Clermont Auvergne Métropole / jeux Open Data pertinents ;
- pages officielles des travaux ;
- agenda public ;
- T2C GTFS-RT ;
- stationnement ;
- C.vélo / comptages ;
- Open-Meteo ;
- calendrier Zone A / jours fériés.

Le collecteur est résilient : une source indisponible ne bloque pas l’analyse TGM.

## Confidentialité

Clients, Ventes et Catalogue sont traités **dans le navigateur**. Aucune ligne client n’est envoyée à GitHub, Basalte-Web, au géocodeur ou aux sources publiques.

L’adresse du **commerce** peut être envoyée au géocodeur public afin d’obtenir ses coordonnées. Les adresses clients ne sont jamais envoyées à ce service.

IndexedDB conserve, si disponible, la dernière session et des snapshots locaux. Le bouton **Effacer les données locales** supprime ces éléments sur le navigateur utilisé.

Le `.gitignore` bloque les principaux formats d’extractions afin d’éviter un commit accidentel de données métier.

## Installation GitHub Pages

1. Envoyer tout le contenu du dossier à la racine d’un dépôt GitHub.
2. Vérifier `config/store.json` pour le point de vente utilisé par le collecteur planifié.
3. Activer **GitHub Pages** sur `main` / `/ (root)`.
4. Dans **Actions**, lancer une première fois **Analysis Power · Local Context Sentinel**.
5. Si nécessaire : `Settings → Actions → General → Workflow permissions → Read and write permissions`.
6. Vérifier que l’application affiche **v5.0.0 POWER**.

Aucune compilation front-end n’est nécessaire.

## Tests fournis

- `python tests/test_public_context.py`
- `node tests/test_causal_context.js`
- `node tests/test_power_causality.js`
- `node --check js/*.js sw.js`
- `python -m py_compile scripts/*.py`

`test_power_causality.js` contient notamment un anti-faux-positif : un chantier fort ne doit pas devenir la cause d’une baisse produit sans lien géographique/métier suffisant.

## Fichiers clés

- `js/intelligence.js` — diagnostics et actions ;
- `js/causal-context.js` — causes retenues/rejetées, scoring et anti-faux-positifs ;
- `js/power.js` — profil commerce, géocodage, preuves et Local Context ;
- `js/geo.js` — segmentation géographique ;
- `js/ui.js` — Cockpit, Power Lens, Pourquoi/Solution/Preuves ;
- `scripts/update_public_context.py` — collecte publique et enrichissement local ;
- `config/store.json` — profil magasin du collecteur ;
- `docs/POWER_ENGINE.md` — principes fonctionnels et architecture.

## Limite fondamentale

Analysis Power peut identifier des convergences solides ; il ne doit jamais transformer une corrélation en certitude. Une donnée source erronée ne devient pas vraie parce qu’elle a été analysée. Les libellés, seuils, preuves et audits sont conçus précisément pour préserver cette distinction.

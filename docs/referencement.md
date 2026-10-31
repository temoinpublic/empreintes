# Referencement de temoinpublic.fr

Un changement en vol par famille de pages ; chacun porte sa date de jugement.

| Famille | Changement | Mis en ligne | Jugement | Mesure |
| --- | --- | --- | --- | --- |
| `/collectivite/<INSEE>` (pages de communes) | D-178 : l'entrepot lit la page des actes de chaque commune de l'annuaire et remplit sa page avant qu'on le demande ; index `/collectivite` et `/collectivite/departement/<code>`, plan `sitemap-communes.xml` | 2026-10-14 | **2026-12-15** | Search Console : impressions sur au moins 1 000 pages de commune distinctes ; requetes « conseil municipal <commune> », « deliberations <commune> », « proces-verbal <commune> ». Critere D-178 : 8 000 communes avec un acte date, 100 000 actes, 3 communes deposantes hors flotte (`/api/bilan`) |


| Famille | Changement | Mis en ligne | Jugement | Mesure |
| --- | --- | --- | --- | --- |
| `/besoin/<besoin>` (D-177, chantier 5) | une page par besoin cherche, le geste sur la page : `prouver-une-page-web`, `anteriorite-d-une-creation`, `avis-ou-annonce-supprime` ; liees de l'accueil, au plan du site. Le besoin « date de publication d'un acte » est `/acte` | a la mise en ligne de la PR | **2026-11-30** | Search Console : impressions et clics des six pages ; requetes « prouver qu'une page web existait », « preuve d'anteriorite », « preuve avis supprime » ; depots du jour (`/api/bilan`) apres une visite de ces pages |

| Famille | Changement | Mis en ligne | Jugement | Mesure |
| --- | --- | --- | --- | --- |
| offres sans prix (`/marches-publics`, `/publicite-des-actes`, `/date-de-publication`, `/dossier-de-sinistre`, `/versions-d-un-acte`, `/documents-du-personnel` ; D-200, D-195) | famille nee le 2026-10-16 : une page par milieu, une liste d'attente commune ; liees de l'accueil (une phrase), au plan du site, et `/publicite-des-actes` depuis chaque page de commune | 2026-10-16 | **2026-12-15** | Search Console : impressions et clics des trois pages ; `/health` `attente` par offre |

## Pari 2026-10-16 - les offres sans prix

- Ce qui change : la famille nait (six pages au plan du site, `/dossier-de-sinistre`, `/versions-d-un-acte` et `/documents-du-personnel` ajoutees le meme soir, avant toute mesure) et se maille depuis l'accueil, par une phrase qui lie les six pages, et depuis chaque page de commune vers `/publicite-des-actes` (PR #76). Pas de lien en pied de page : il toucherait tout le site, et deux paris sont en vol (`/collectivite/<INSEE>` au 2026-12-15, `/besoin/<besoin>` au 2026-11-30).
- Mesure de depart : 0 impression et 0 clic sur tout le domaine (Search Console, 11 au 13/10/2026, releve du 16/10) ; `/health` `attente` a 0 pour chaque offre au 16/10.
- Critere de jugement, chiffre et date : au 2026-12-15, au moins deux des six pages ont des impressions dans Search Console, et au moins une adresse attend sur une liste (`/health`). Sinon : la phrase de l'accueil cede la place a un lien depuis la page du geste voisin (`/besoin/prouver-une-page-web` vers `/date-de-publication`, `/acte` vers `/publicite-des-actes`).
- Comment il se leve (le fichier) : `OFFRES_DE_L_ACCUEIL` dans `src/offre.mjs` (vide, la phrase disparait de l'accueil) ; les pages restent au plan.

| Famille | Changement | Mis en ligne | Jugement | Mesure |
| --- | --- | --- | --- | --- |
| `/actes/<INSEE>/<jour>/<nature>-<hex>` (adresses perennes des actes, D-205) | D-174 : la masse nait `noindex` (balise et en-tete `x-robots-tag` sur la page, la fiche JSON et la liste d'un prefixe ambigu), `sitemap-actes.xml` reste servi mais sort de `robots.txt` ; l'adresse se cite, elle ne se cherche pas | 2026-10-25 | **2026-12-15** | Search Console : les familles ecrites de temoinpublic (`/collectivite/`, `/besoin/`, offres) passent J+45 (le 2026-11-25) sans chute d'impressions ; `/actes/` a 0 impression, par construction |

## Pari 2026-10-25 - la masse des actes hors de l'index a la naissance

- Ce qui change : 46 490 pages `/actes/` etaient indexables a J+14 sur un domaine ne le 2026-10-11 (aucun `noindex`, aucun `x-robots-tag`, plan declare dans `robots.txt`). C'est la configuration qui a retire aucadastre (34 933 pages), lesbancs (124 786), edifiable et auregistre de l'index entre J+14 et J+29 (1 a 2 % du pic a J+21, sans remontee, D-174), et pas celle des survivants (murparmur 3 513, everytownland 2 124). La regle du 2026-10-17 (« la masse se garde `noindex` jusqu'a ce que les pages ecrites aient passe leur reevaluation ») s'applique ici ; la famille `/collectivite/` (1 591 pages) garde son pari tel quel.
- Mesure de depart : 0 impression sur toute adresse `/actes/` du 11 au 16/10 (D-205, releve du 17/10) ; 29 impressions sur le domaine le 21/10, toutes hors `/actes/`.
- Critere de jugement, chiffre et date : au 2026-12-15, si les familles ecrites ont passe le 2026-11-25 (J+45) sans tomber sous la moitie de leur pic de 28 jours, la famille `/actes/` rouvre a l'index par lots (un departement, puis jugement a J+28). Sinon elle reste `noindex`, et D-205 vit de la citation (llms.txt, schema, API), jamais de la recherche.
- Comment il se leve (le fichier) : `indexer: false` dans `pageAdresse` et `SANS_INDEX` dans `reponseAdresse` (`src/collectivite.mjs`), puis la ligne `Sitemap: .../sitemap-actes.xml` dans `robots` (`src/pages.mjs`).

| Famille | Changement | Mis en ligne | Jugement | Mesure |
| --- | --- | --- | --- | --- |
| `/promesses/<INSEE>` (promesses municipales 2026, D-202) | famille nee le 2026-10-31 : une page par commune relue, les phrases de promesse des sites de campagne des municipales de mars 2026 avec leur source et leur date de lecture ; index `/promesses`, au plan du site, indexable des la naissance (quelques dizaines de pages pleines, pas une masse) | 2026-10-31 | **2026-12-15** | Search Console : impressions sur au moins 10 pages de commune distinctes ; requetes « promesses <commune> municipales 2026 », « programme <liste> » ; sinon la famille passe `noindex` et vit de la citation |

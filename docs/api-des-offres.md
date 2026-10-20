# L'API des offres (D-195)

Ce qu'un client des six offres appelle, et rien de plus. **Fermee** : la
variable `OFFRE_API` du projet Pages n'existe pas en production, `/health` le
dit (`apiDesOffres.etat: "fermee"`). Aucune cle n'est remise, aucun prix n'est
pose, rien ne se facture avant le 2027-08-14.

## Les trois appels

| Geste | Appel | Reponse |
| --- | --- | --- |
| Dater | `POST /api/depots` avec `authorization: Bearer <cle>`, le meme corps que le depot gratuit (`sha256`, `url`, `libelle`, `type`, `signature`) | 201 : `jour`, `place`, `ligne`, `id`, `recu`, plus `client` et `portee` |
| Garder | le `recu` de la reponse, tel quel (JSON) | |
| Verifier | `POST /api/verifications` avec le `recu` en corps | 200 : `authentique`, `id`, `empreinte`, `jour`, `place`, `depose`, `source`, `inscription`, `signature` (recu signe), `produit` (recu d'un produit de la flotte : `nom`, `url`, `relecture` des octets a l'adresse, `identique`, `different` ou `illisible`), `page`, `portee` |

La verification ne demande pas de cle : celui qui recoit un recu doit pouvoir
le relire. Elle recalcule l'identifiant du recu, relit sa ligne publique, lit
son inscription dans le journal publie (`etat` : `inscrit` avec `tour`,
`racine` et `bloc` Bitcoin, `attente`, `non conforme`, `illisible`) et verifie la
signature du deposant a l'instant du depot. Un recu modifie d'un seul champ
rend `authentique: false`, `raison: "recu inconnu du registre"`. Un corps qui
n'a pas la forme d'un recu rend 400.

## Ce que le recu vaut

`portee` est la meme dans chaque reponse (`PORTEE_DU_RECU`, `src/client.mjs`),
dans les termes des pages d'offre et de l'article 8 des conditions en
brouillon : le document existait tel quel a la date inscrite. Pas l'auteur,
pas la date certaine d'un acte sous seing prive (art. 1377 du code civil), pas
la remise a un destinataire, et `qualifie: false` tant que le service n'est sur
aucune liste de confiance. Une phrase qui promet plus ne s'ajoute pas ici avant
la qualification (D-164).

## La cle d'un client

- Registre : la variable secrete `CLIENTS_API`, un tableau JSON
  `[{"id":"<a-z0-9->","offre":"<offre>","jeton":"<sha256 de la cle>","plafond":<n>}]`.
  `offre` est une cle de `CHEMINS_DES_OFFRES`. La cle remise n'est jamais
  ecrite, seul son sha256. Une entree hors format ferme tout le registre.
- Plafond : celui de l'entree, par jour UTC (au plus 50 000), 429
  `plafond du client atteint` au-dela. Un client ne prend ni le plafond public
  du jour ni celui d'une adresse, et ne compte pas au bilan public des
  deposants (cle de compte `client:<id>`, comme `flotte`).
- Fermee, une cle presentee rend 401 `jeton inconnu` et `/api/verifications`
  rend 404.

## Ouvrir

Le jour ou une offre se vend, et pas avant : poser `CLIENTS_API` puis
`OFFRE_API=ouverte` sur le projet Pages, ajouter les deux appels a
`public/openapi.json` et a la documentation (`src/documentation.mjs`), et
verifier `/health`. Ce qui manque encore au statut : le cachet du service sur
le recu lui-meme, avec un certificat qualifie (palier 2 de D-164), et les recus
groupes sous la reference d'un dossier que promettent les pages.

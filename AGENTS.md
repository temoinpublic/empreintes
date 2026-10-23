# empreintes

Surface publique et miroir du journal des empreintes de l'entrepot (D-158).

- `npm run gate` avant tout commit : `node --check`, construction, tests avec
  plancher de couverture (95 %). Il ne baisse jamais.
- Deploiement : vps5 (OVH, Varsovie, D-265) tire la tete de `main` toutes les
  2 min (`empreintes-suivre.timer`), la construit et la sert sans coupure par
  `wrangler pages dev` (workerd) derriere Caddy et le tunnel Cloudflare `vps5` ;
  D1 y est un SQLite local. `publier.yml` ne joue plus que la gate. Les scripts
  de la machine vivent dans le depot `assistant` (`setup/vps/vps5/`). Le journal `donnees/empreintes/` est POUSSE par
  l'entrepot depuis le VPS (cle de deploiement de ce seul depot) : c'est la
  seule ecriture directe admise sur `main`. Ce depot public ne detient aucun
  identifiant de la Box, jamais. Tant que la poussee n'existe pas,
  `donnees/copie.json` dit `suspendue` et `/health` le dit en `attention`.
- Le code passe par une branche et une PR. Commits en anglais, conventional,
  auteur Florian Mousseau <florian.mousseau@gmail.com>, aucune trace d'outil.
- `src/chaine.mjs` est l'ecriture INDEPENDANTE des formules de l'entrepot
  (`src/empreintes.mjs` la-bas) : ne pas importer le code du producteur. Le
  test de conformite est le journal reel de `donnees/` : chaque racine
  recalculee egale son fichier `.racine`.
- L'horodatage eIDAS d'une racine (`<tour>.racine.tsr`, RFC 3161, sur les octets
  de `<tour>.racine`) se relit dans `src/horodatage.mjs`, seconde ecriture sans
  dependance comme `chaine.mjs` : l'autorite est EPINGLEE par le sha256 de son
  certificat (`AUTORITES_QUALIFIEES`, lu sur la liste de confiance de son pays).
  Une autorite nouvelle chez l'entrepot s'AJOUTE a la liste, les anciens `.tsr`
  restent a verifier. `/health` passe `attention` quand le dernier horodatage a
  plus de 36 h. Les pages ne disent ni « qualifie » ni « certifie »
  (`tests/pages.test.mjs`) : « horodatage eIDAS ».
- La signature post-quantique d'une racine (D-201, `<tour>.racine.slh`) :
  SLH-DSA-SHA2-128s (FIPS 205) pure, contexte vide, 7 856 octets bruts, sur le
  texte hexadecimal de la racine (le meme message que la charge du JWS). Elle se
  relit dans `src/slh.mjs`, sans dependance et synchrone (WebCrypto n'a pas
  SLH-DSA) ; le test est contre des signatures d'OpenSSL figees et les vecteurs
  ACVP du NIST de ce jeu, cas valides et refuses (`tests/fixtures/slh/`, la
  source et son commit dans le fichier). Le contexte et l'interface interne ne
  servent qu'a relire ces vecteurs : le journal signe sans contexte. La cle publique est servie en
  `/empreintes/cle-slh-dsa.pub` (32 octets bruts, poussee par l'entrepot) et
  EPINGLEE par son sha256 dans `CLES_SLH_DU_JOURNAL`, avec le premier tour
  qu'elle signe : tant que la liste est vide rien n'est exige ; ensuite `/health`
  passe `attention` sur tout tour couvert sans sa signature. Une cle nouvelle
  s'ajoute (`cle-slh-dsa-<n>.pub`), l'ancienne reste.
- Le cahier imprime d'un trimestre (D-201, depot legal) : `node scripts/cahier.mjs
  [--trimestre 2026-T4] [--issn ...]` ecrit `dist/cahiers/<trimestre>.pdf`, A5,
  une ligne par tour (instant UTC, racine en huit groupes), couverture avec
  premiere et derniere racine et les empreintes du signataire. Le PDF est ecrit a
  la main (`src/cahier.mjs`, polices standard en WinAnsi) et ne porte aucune date
  de fabrication : le meme trimestre rend les memes octets. Le cahier 1 est le
  4e trimestre 2026.
- Rien que des empreintes : `FICHIER_PUBLIE` fixe ce qui se publie de
  `donnees/empreintes/`.
- Un tour se publie PLEIN (`<id>.json`) ou EN DELTA (`<id>.delta.json`, D-158 :
  un releve plein par jour, celui du `.tsr`, des deltas entre). Le delta porte
  les memes champs sans `feuilles`, plus `base` (l'identifiant du releve plein
  dont il part), `ajoutees` (chaque feuille ajoutee, changee ou deplacee, avec
  `index`, sa place dans la liste reconstruite) et `retirees` (les cles sorties).
  `reconstruireReleve` et `lecteurDeReleves` (`src/chaine.mjs`, MIT) rendent le
  releve plein ; l'arbre et la racine ne changent pas, donc `verifierReleve` juge
  la reconstruction. Toute lecture d'un releve (construction, verificateur, script,
  recu) passe par le lecteur, jamais par `<id>.json` en dur ; `tours.json` porte
  `base` par tour (null pour un releve plein) et la sonde mesure le mur de Pages
  sur le dernier releve PLEIN.
- Une page affiche, elle n'explique pas ; deux-points soudes (` `),
  tenu par `tests/pages.test.mjs`.
- Sonde : `/health` (Pages Function), 200 toujours, `alerte` sur l'age du
  dernier tour (12 h, 36 h) et les preuves restees aux calendriers (48 h) ;
  copie suspendue : `attention`, un seul constat qui la nomme.
- Le depot d'une empreinte par un tiers (D-163) : le FORMAT de la ligne
  publique `/depots/<jour>.jsonl` et du recu est ecrit en tete de
  `src/depot.mjs`, et l'entrepot le relit (feuille `depots:<n>`) : il ne
  change que par une version de recu nouvelle, jamais en place. Les gardes du
  temoin d'URL sont dans `src/temoin.mjs`, pures ; la Function ne fait que les
  brancher. Pour un DEPOT (pas pour un flux suivi), `contenuAdmis` refuse aussi
  ce qui n'est pas le document : moins de 512 octets, page web a la place d'un
  fichier annonce par l'extension (jugee sur les octets, pas l'en-tete), `.pdf`
  sans `%PDF-`, defi anti-robot, captcha ou mot de passe dans une page mince
  (moins de 3 000 caracteres de texte). Le service ne juge jamais le FOND d'un
  document : il atteste qu'il existait tel quel.
- Le depot vit dans une Function (`functions/api/depots.js`, POST) et la base
  D1 `empreintes-depots` (liaison `DEPOTS`, `wrangler.toml`) ; le schema est
  `SCHEMA` dans `src/service.mjs`, rejouable, applique par l'API D1 `query`.
  `functions/depots/[fichier].js` sert `/depots/<jour>.jsonl`. L'adresse d'un
  deposant n'est jamais ecrite : son hache sale du jour, sel jete le lendemain.
  Les tests jouent le vrai SQL sur `node:sqlite` (`tests/d1.mjs`).
- Un acte de collectivite (D-165) est un depot de type `acte` (`src/acte.mjs`) :
  temoin d'URL obligatoire, `collectivite` (INSEE ou SIREN a cle juste),
  `nature` ; le libelle passe `nommeUnePersonne` (`src/personne.mjs`, copie
  de truecopydev/corpus et de verites, a corriger des trois cotes). Sa ligne
  publique reste a QUATRE champs (l'entrepot refuse toute ligne elargie) : la
  collectivite, la nature et le rattachement vivent dans le recu, version 2.
- L'affichage d'un permis de construire (D-166, edifiable) est un depot de type
  `affichage` (`src/affichage.mjs`) : empreinte DECLAREE seulement (la photo
  reste sur le telephone, pas d'URL), libelle = le numero du permis lu par sa
  forme (`PC 069 123 24 A0001`), `nommeUnePersonne` dessus, memes plafonds que
  tout depot ; recu version 3 (`affichage.permis`), ligne publique a quatre
  champs. Aucune table, aucune serie, aucune regle « un depot par numero et par
  jour » cote serveur : un tiers qui lit le numero sur le panneau prendrait la
  place du petitionnaire.
- Un acte n'est RATTACHE a sa collectivite (`rattachement: site-officiel`, une
  ligne dans la table D1 `acte`) que si l'adresse demandee et l'adresse lue
  sont sur un site que l'annuaire Service-Public lui donne. La table se
  construit a la publication (`scripts/annuaire.mjs`, plancher 10 000 sites,
  `dist/annuaire/<fragment>.json`) ; un export muet publie sans elle et tout
  acte reste `declaree`. Un hote partage ou une plateforme (`PLATEFORMES`,
  ecrite a la main) ne rattache que sous le chemin propre a la commune.
- Les communes (D-178) : `/collectivite` (departements), `/collectivite/departement/<code>`
  (ses communes) et `sitemap-communes.xml` se lisent dans la table `acte` ; une commune
  sans acte rattache ne figure nulle part, sa page reste `noindex`. Un acte depose sous
  un SIREN compte a la commune que l'annuaire lui donne. `lecteurDeCommunes`
  (`src/annuaire.mjs`) n'analyse chaque fragment qu'une fois par requete. Date de
  jugement de la famille dans `docs/referencement.md`.
- Les besoins (D-177) : `src/besoins.mjs`, une page statique par besoin cherche sous
  `/besoin/`, francais seulement, le geste de dater sur la page (`lien` : l'adresse
  seule ; `fichier` : le formulaire de Dater) ; au plan du site, lies de l'accueil.
- Un lien colle dans Dater sur le site officiel d'une commune propose d'en
  faire un acte, la commune deja reconnue : `communeDeLAdresse`
  (`src/annuaire.mjs`) lit l'index inverse `dist/annuaire/hotes/hote-<3
  premiers caracteres>.json`, ecrit par `scripts/annuaire.mjs`. Une adresse a
  deux communes n'en propose aucune. Le rattachement reste juge par le serveur.
- Le suivi des flux (D-170) : `src/flux.mjs` decide (lecture RSS 2.0 et Atom
  1.0, plan du jour), pur ; `src/suivi.mjs` branche la base et le temoin ; le
  Worker horaire `empreintes-flux` (`flux.wrangler.toml`, `workers/flux.mjs`,
  deploye par `publier.yml` apres Pages) tourne sur la MEME base D1. Une
  version est un depot ordinaire, ligne publique a quatre champs, hors du
  plafond des depots exterieurs ; adresse et recu dans `version`, jamais un
  titre. Tables nouvelles : appliquer `SCHEMA` par l'API D1 AVANT le merge.
- L'edition allemande, « Datumszeuge » sur datumszeuge.de (`src/edition.mjs`) :
  meme moteur, meme API, meme base ; l'HOTE choisit la langue
  (`functions/_middleware.js`, decision pure dans `src/hote.mjs`, `_routes.json`
  tient les fichiers partages hors de la Function). Les pages allemandes vivent
  dans `dist/de/`, jamais servies en clair ; textes des pages dans
  `src/textes.mjs` (une table, les deux langues cote a cote, lue par `vue`),
  adresses et formules de la documentation dans `src/documentation.mjs`,
  textes des scripts dans `public/textes.js` par `<html lang>`. Une page ou une
  adresse nouvelle se donne aux deux editions (`src/textes.mjs`, `src/hote.mjs`,
  `_routes.json` pour un fichier partage). Pas d'acte de collectivite en allemand (renvoi 301 vers le
  francais). La typographie francaise (insecable avant `:;?!`) ne vaut que pour
  les pages francaises. `de.empreintes.pages.dev` est la voie de controle avant
  le domaine, `noindex` sur tout hote pages.dev. Le francais ne change pas d'un
  octet visible, hors `hreflang`.
- Un depot SIGNE par son deposant (D-164, REQ-7.5-03) : champ `signature`, un
  JWS compact JAdES dont la charge utile est l'empreinte du document (64 hex,
  jointe ou detachee) et le certificat dans `x5c`, ou une signature CAdES
  DETACHEE en base64 (un signataire, SHA-256, `messageDigest` = l'empreinte ;
  recu `signature.cades` au lieu de `signature.jws`). `src/origine.mjs` (MIT, sans
  dependance) verifie la signature sous la cle du certificat et sa validite a
  l'instant du depot ; il ne juge PAS l'emetteur (aucune chaine vers une liste
  de confiance encore) et la page n'ecrit jamais « qualifie ». Une signature
  refusee rend 400 et libere la lecture du temoin. Recu version 4 (`signature`
  : jws, certificat, sujet, emetteur), ligne publique a quatre champs ; rien
  n'est garde en base. `/verifier` relit la signature d'un recu telecharge.
- L'autorite d'un depot signe : `src/confiance.mjs` (MIT, pur) lit la LOTL et les
  listes nationales, retient les services CA/QC qui ont ete en vigueur (`granted`,
  et avant juillet 2016 `accredited`, `undersupervision`, `supervisionincessation`),
  historique compris, et indexe leurs certificats par sha256 avec leurs `periodes`
  en vigueur ; `scripts/confiance.mjs` l'ecrit a chaque publication
  dans `dist/confiance/autorites.json` (plancher 500, `continue-on-error` : sans
  lui, la signature se verifie sans juger l'emetteur). `autoriteDuCertificat`
  remonte `x5c`, chaque certificat verifie sous le suivant (RSA PKCS#1, ECDSA),
  jusqu'au premier inscrit, qui ne compte que s'il etait en vigueur au debut de
  validite du maillon qu'il a signe (`inscriteA`, ETSI TS 119 615 : le statut a
  l'emission, pas celui du jour) ; le recu version 4 porte alors `signature.autorite`
  (pays, nom). Le deposant doit joindre la chaine jusqu'a l'autorite dans `x5c`.
- Le certificat d'une serie d'affichage (D-166) se depose sur `/verifier` : un
  JSON `type: certificat-affichage`, format en tete de `src/serie.mjs` (pur),
  ecrit par la page du certificat d'edifiable. Chaque recu se relit contre sa
  ligne publique (`/api/recus/<id>`, six lectures en vol au plus) ; la periode
  se RECALCULE depuis la pose (deux mois), un jour passe sans photo interrompt
  la serie ; le numero du permis n'est dit relu que dans un recu complet joint
  dont l'identifiant se recalcule, la ligne publique ne le portant pas.
- La glane des actes des communes (D-178) : `src/glane.mjs` (pur) trouve sur le
  site officiel la page des actes (libelle ou chemin du lien, un second saut
  depuis la page du conseil), ses PDF, et lit nature et objet dans le libelle
  puis le nom du fichier ; sans indice de nature, ou pour un arrete du prefet,
  une convocation, un bulletin, rien n'est depose. Un objet qui nommerait une
  personne devient « Sans objet ». `scripts/glaner-actes.mjs` branche la
  politesse (robots.txt, jeton `temoinpublic`, un appel par hote toutes les
  5 s, 403/418/429/503 laisse l'hote pour le passage, agent nomme) et depose
  par `POST /api/depots` sous `authorization: Bearer <JETON_FLOTTE>` (secret
  du projet Pages). La flotte ne depose que des actes, lus sur le site
  officiel (sinon 422), sous son plafond (`ACTES_DE_LA_FLOTTE_PAR_JOUR`), hors
  du bilan public des deposants (cle de compte `flotte`), et un acte deja date
  pour sa commune rend son recu (200, `deja`). Etat et releves hors du depot.
- Sous le meme jeton, un PRODUIT de la flotte (D-167, `src/produit.mjs` :
  auregistre, quivad, titelia, murparmur, rendita) depose l'empreinte DECLAREE
  d'un recu de consultation qu'il sert, `produit: { nom, url }` avec `sha256`
  (jamais `url` a lire : le recu reste chez le produit, public a son adresse).
  Recu version 5, plafond par produit (`RECUS_PAR_PRODUIT_PAR_JOUR`), cle de
  compte `produit:<nom>`, hors du plafond du jour et du bilan public. Sans le
  jeton, `produit` rend 403. Le produit et l'adresse de son recu entrent dans
  la table D1 `produit` : la page `/recu/<id>` et `/api/recus/<id>` les
  donnent, et `POST /api/verifications` relit les octets a cette adresse par
  le temoin (`produit.relecture` : `identique`, `different`, `illisible`).
- La glane tourne chaque nuit sur le VPS : `vps/glane-actes.service` et
  `.timer` (toutes les communes, `--departements tous`, memoire bornee a
  512 Mo), clone public a jour avant chaque passage, jeton dans
  `/etc/glane-actes.env`. Releve du jour : `/var/lib/glane-actes/etat/glane-<jour>.tsv`.
  Chaque lecture, chaque appel au service et chaque commune (30 min) ont leur
  echeance tenue par leur propre horloge (`sousEcheance`, `src/echeance.mjs`) : la
  nuit du 2026-10-17, 29 ouvriers sur 30 sont restes deux heures sur une page malgre
  le delai du `fetch` ; `accueil` dit `echeance` au releve quand c'est elle qui tombe.
  Le repartiteur de `fetch` se renouvelle toutes les 500 communes
  (`src/connexions.mjs`) : il gardait 16 Ko par origine, 203 Mo pour 12 366 origines.
  Relance le meme jour, un passage reprend apres les communes deja au releve.
  Le tour fini, une garde a part tue le processus apres 30 s s'il ne s'arrete pas
  seul (`src/garde-arret.mjs`) : un thread du pool coince dans un appel bloquant
  suffit a bloquer l'arret de Node, et le tour suivant ne partirait pas.
- Un refus de lecture du temoin (422 `lecture impossible`) se classe sur son motif
  (`refusDeDepot`, `src/glane.mjs`) et se compte au releve par classe (`422-disparu`,
  `422-contenu`, `422-trop-gros`, `422-adresse`, `422-source-4xx` : definitifs ;
  `422-delai`, `422-source-5xx`, `422-transitoire` : redemandes a un autre passage,
  `ESSAIS_MAX` fois). L'etat garde le motif (`detail`). Mesure du 2026-10-17 : sur 186
  refus de la nuit, 57 liens morts, 3 fichiers de plus de 20 Mo, 1 DNS en `fe80::`, et
  ~125 PDF lisibles depuis un poste que le service n'a pas lus (14 hotes refuses en entier).
- Les documents budgetaires (D-185) : la glane les RELEVE, elle ne les depose pas
  (un compte administratif n'est pas un acte du registre). `documentBudgetaireDe`
  (`src/glane.mjs`, pur) lit dans le libelle puis le nom du fichier le genre (CA,
  CFU, BP, NOTE, ROB ; une note ou un rapport avant la maquette dont il parle, un
  sigle de deux lettres seul exige une annee ou le mot budget/compte), l'exercice
  (jamais le chemin des envois ni un horodatage), le budget (principal, annexe,
  sinon `inconnu`) ; une deliberation qui vote un budget reste un acte, sa piece
  jointe est le document. Sources : les pages d'actes, l'accueil et jusqu'a trois
  pages « budget / finances » (`pagesBudget`), dont les lectures ne comptent pas
  dans le passage des actes ; les liens de telechargement sans `.pdf` comptent
  (`estUnTelechargement`). Chaque document est lu UNE fois (etat `budgets`, 15
  par commune et par nuit, quatre lectures a la fois, 15 Mo au plus) pour
  `coucheTexte` (police ou operateur de texte, flux FlateDecode decompresses).
  Releve : `glane-<jour>-budgets.jsonl` et les colonnes `budgets`, `genres`,
  `page_budget` du TSV. `--communes` restreint un passage a une liste INSEE.
- La glane ne depose pas un acte qui POURRAIT nommer une personne (`pourraitNommer`,
  `src/glane.mjs`) : acte individuel (delegation, nomination, occupation du domaine
  public, permission de voirie...), mot en capitales dans un texte qui ne l'est pas,
  arrete ou decision tout en capitales avec un mot hors des sigles connus ; le
  libelle, l'objet ET le nom du fichier sont lus, car l'adresse est montree sur la
  page de la commune. Mesure du 2026-10-15 : `nommeUnePersonne` laissait passer
  « occupation du domaine public SIMON » et « DELEGATION-SIGNATURE-MAINGOT » ; 272
  actes deja publies ont eu objet « Sans objet » et adresse retiree en base.
- L'adresse perenne d'un acte (D-205) : `/actes/<code>/<jour>/<nature>-<12 hex>`,
  composee et lue dans `src/adresse.mjs` (pur) ; `<code>` la collectivite du depot,
  `<jour>` celui de la DATATION (jamais la date de l'acte, qui se devine), les hex le
  debut du sha256 du document. Une version, une adresse. Un prefixe d'au moins 8 hex
  ou une ecriture voisine renvoie en 301, un prefixe ambigu rend la liste (300).
  La page (`reponseAdresse`, `src/collectivite.mjs`) sert la preuve, la source et les
  versions vues a la meme source ; l'objet et la source y repassent
  `nommeUnePersonne` ET `pourraitNommer`. `/api/recus/<id>` et `lire_recu` portent
  `acte`, l'adresse ; la page de la commune et le recu la lient. Aucune migration :
  elle se lit dans `acte` et `depot`. `sitemap-actes.xml` (declare par `robots.txt`)
  porte chaque adresse, datee du jour de sa datation : une adresse ne nomme personne.
  Au-dela de 50 000 adresses il devient un index de `?page=<n>`, dans l'ordre des datations.
  La page porte la date de l'acte LUE dans l'objet garde puis le nom du fichier
  (`src/datelue.mjs`, pur ; au jour ou au mois, jamais apres la datation), dite
  « lue », jamais dans l'adresse ni dans `Legislation`. L'etat de la source vient
  de la glane : apres une commune dont chaque page s'est lue en 200, elle poste a
  `POST /api/passages` (jeton de la flotte) les recus encore lies (`vue`) et non
  retrouves (`absente`), table `passage` ; une version plus recente a la meme
  source l'emporte sur la page.
- Le schema ouvert de l'adresse (D-205, morceau 5) : `src/schemaadresse.mjs` (pur) le
  construit depuis les constantes du resolveur, jamais recopie ; la construction ecrit
  `dist/schema/adresse-des-actes/<version>.json` (JSON Schema de la fiche, forme et
  resolution en `x-`) et la page `/adresse-des-actes`. Un fichier de version publie ne
  change jamais en place : un changement de forme ou de champ requis fait une version
  neuve. La meme adresse sert la page ou la fiche JSON (`Accept: application/json`,
  `vary: accept`), l'objet et la source gardes comme sur la page.
- Ce qui a disparu (D-193) : `/disparus` (les sites, les plus recents), `/disparus/<hote, points en tirets>`
  et le flux `/disparus.xml`, construits depuis `donnees/disparus/<jour>.json`. L'entrepot les ecrit en jouant
  `scripts/disparus.mjs` de CE depot sur ses `deltas/<jour>.json` prives, avant chaque copie : le filtre
  (`src/disparus.mjs`, pur) decide ce qui entre dans l'historique public, et la construction le rejoue. Ne
  passent que les sources de `SOURCES_PUBLIEES` (une source dont le retrait repond a un droit par nature en
  reste dehors), une adresse que ni `nommeUnePersonne` ni `pourraitNommer` ne refusent, hors `RETENUES` (sha256
  de l'adresse, retrait sur un droit instruit par `docs/legal/demandes.md` du cockpit), avec une empreinte
  d'avant presente dans l'index du journal publie ; la preuve est `/verifier?empreinte=<sha256>`. `retire` se
  dit « Sorti de la liste », jamais supprime (un test le refuse).
- La relecture des actes de la glane (D-193) : avant les communes, chaque passage redemande la datation des
  actes deja dates les plus anciennement lus (`aRelire`, `--relectures` 3 000 par passage, tous les 7 jours ;
  l'etat garde nature et libelle pour cela). Le TEMOIN du service relit la source, jamais la glane : les memes
  octets un autre jour donnent 200 et `relecture.statut` 200 ; un 404 ou 410 donne 422 et `relecture.statut`
  404/410 pour les actes de cette adresse, `depuis` au premier jour de ce statut ; d'autres octets datent une
  version nouvelle. Table `relecture` (appliquer `SCHEMA` AVANT le merge). Le plafond de la flotte ne compte que
  les actes nouveaux : il se juge APRES la lecture, une relecture passe au plafond. La page de l'acte le dit
  (« Relecture ») ; la fiche JSON ne le porte pas encore (champ requis = version 2 du schema).
- Les actes des communes sur `/disparus` (D-193) : la Function `functions/disparus.js` sert la page publiee et met
  a la place de `MARQUE_DES_ACTES` la section lue dans D1 (`actesDisparus`) : `disparu`, une relecture 404/410
  (date = `depuis`) ; `remplace`, chaque version nouvelle datee a la meme adresse et la precedente (`LAG`). Le
  filtre est `src/disparusactes.mjs` (pur) : adresse que `adresseNommante` refuse ou retenue (`RETENUES`, sha256
  de l'adresse, partages avec `disparus.mjs` par `src/retenues.mjs`, sans `node:`) ne parait pas, objet qui
  pourrait nommer ne s'affiche pas ; la preuve est l'adresse perenne de la version d'avant.
  Le flux `/disparus.xml` suit le meme chemin (`functions/disparus.xml.js`, `itemsDesActes`) : un item par acte a
  la place de la marque du flux statique, servi en `application/rss+xml`.
- Les offres pas encore ouvertes (D-195, D-200) : une page statique par milieu, en francais
  seulement, SANS PRIX (le prix est a Florian) : `/marches-publics`, `/publicite-des-actes`, `/date-de-publication`, `/dossier-de-sinistre`, `/versions-d-un-acte`, `/documents-du-personnel`
  (les communes, les editeurs, les assureurs, les notaires, les DRH). Une seule liste d'attente pour toutes : `src/attente.mjs`
  (`PROFILS_DES_OFFRES`, le nom de l'offre est la cle de la table D1 `attente`), formulaire
  sans script poste a `/api/attente`, la page de reponse renvoie a son offre
  (`CHEMINS_DES_OFFRES`, `src/offre.mjs`). Une offre nouvelle s'ajoute aux deux tables, pas
  a une seconde liste. `/health` compte les adresses par offre.
- L'API des offres (D-195) : `src/client.mjs` (pur) et `docs/api-des-offres.md`. FERMEE tant
  que `OFFRE_API` ne vaut pas `ouverte` (absente en production, `/health` dit
  `apiDesOffres.etat`). Ouverte : `Bearer <cle>` d'un client du registre `CLIENTS_API`
  (sha256 de la cle, offre, plafond) depose sous son plafond, hors du plafond public et du
  bilan (cle de compte `client:<id>`), et la reponse porte `portee` ; `POST /api/verifications`
  relit un recu (identifiant, ligne, inscription au journal, signature). `PORTEE_DU_RECU` ne
  promet ni date certaine ni qualification : elle ne change qu'avec les pages d'offre et les
  conditions, jamais avant la liste de confiance.

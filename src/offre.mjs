// L'offre des marches publics (D-200), preparee sans prix : ce qu'un acheteur
// public a demande la derniere fois. L'entrepot garde le reglement de chaque
// consultation nouvelle publiee au BOAMP sur une plateforme Atexo ; la page en
// montre un echantillon : l'acheteur, l'objet, le jour de l'avis, les criteres
// lus dans le reglement, le lien de l'avis. Archiver n'est pas republier : aucun
// dossier n'est servi.

export const CHEMIN_OFFRE_MARCHES = '/marches-publics';

/** L'offre des communes (D-195) : leurs actes dates le jour de leur mise en ligne. */
export const CHEMIN_OFFRE_COMMUNES = '/publicite-des-actes';

/** L'offre des editeurs (D-195, D-170) : chaque version de leurs articles datee a sa mise en ligne. */
export const CHEMIN_OFFRE_EDITEURS = '/date-de-publication';

/** L'offre des assureurs (D-195) : les pieces d'un dossier de sinistre datees le jour ou elles sont prises. */
export const CHEMIN_OFFRE_ASSUREURS = '/dossier-de-sinistre';

/** L'offre des notaires (D-195) : chaque version d'un projet d'acte datee quand elle circule. */
export const CHEMIN_OFFRE_NOTAIRES = '/versions-d-un-acte';

/** L'offre des DRH (D-195) : chaque version d'un document du personnel datee le jour de sa diffusion. */
export const CHEMIN_OFFRE_DRH = '/documents-du-personnel';

/** L'offre de la conformite (D-195, D-237) : l'etat date d'un registre financier au jour d'un controle. */
export const CHEMIN_OFFRE_CONFORMITE = '/historique-des-registres';

/** La page de chaque offre qui tient une liste d'attente (`src/attente.mjs`). */
export const CHEMINS_DES_OFFRES = { 'marches-publics': CHEMIN_OFFRE_MARCHES, communes: CHEMIN_OFFRE_COMMUNES, editeurs: CHEMIN_OFFRE_EDITEURS, assureurs: CHEMIN_OFFRE_ASSUREURS, notaires: CHEMIN_OFFRE_NOTAIRES, drh: CHEMIN_OFFRE_DRH, conformite: CHEMIN_OFFRE_CONFORMITE };

/** Ce que le registre tenait au jour de la page (accueil de temoinpublic.fr, 16/10/2026). */
export const COUVERTURE_DU_REGISTRE = { au: '2026-10-16', dates: 5999, depuis: '2026-10-11' };

/** Les offres liees de l'accueil, dans l'ordre de la phrase : la page et son milieu (D-200, D-195). */
export const OFFRES_DE_L_ACCUEIL = [
	{ chemin: CHEMIN_OFFRE_MARCHES, nom: 'les marchés publics' },
	{ chemin: CHEMIN_OFFRE_COMMUNES, nom: 'les communes' },
	{ chemin: CHEMIN_OFFRE_EDITEURS, nom: 'les éditeurs' },
	{ chemin: CHEMIN_OFFRE_ASSUREURS, nom: 'les assureurs' },
	{ chemin: CHEMIN_OFFRE_NOTAIRES, nom: 'les notaires' },
	{ chemin: CHEMIN_OFFRE_DRH, nom: 'les services du personnel' },
	{ chemin: CHEMIN_OFFRE_CONFORMITE, nom: 'la conformité' }
];

/** Les registres financiers que l'entrepot relit avec un temoin tiers (`sources-temoin.json`, 28/10/2026), par autorite. */
export const REGISTRES_DE_CONFORMITE = [
	{ autorite: 'ESMA', registres: ['prestataires de services sur crypto-actifs agréés (MiCA)', 'prestataires non conformes (MiCA)', 'livres blancs des autres crypto-actifs (MiCA)', 'émetteurs de jetons se référant à des actifs (MiCA)', 'émetteurs de jetons de monnaie électronique (MiCA)', 'entreprises d’investissement et sociétés de gestion agréées', 'administrateurs d’indices de référence', 'actions exemptées des règles de vente à découvert'] },
	{ autorite: 'AMF', registres: ['prestataires sur actifs numériques enregistrés (PSAN)', 'sociétés de gestion de portefeuille agréées', 'décisions de la Commission des sanctions'] },
	{ autorite: 'ACPR', registres: ['décisions de la Commission des sanctions'] },
	{ autorite: 'HATVP', registres: ['répertoire des représentants d’intérêts'] }
];

/** La piece de demonstration : le registre MiCA des prestataires agrees sur 30 jours (fiche d'acheteur de l'entrepot, 21/10/2026). */
export const PIECE_MICA = { du: '2026-09-21', au: '2026-10-21', versions: 5, lignesAvant: 352, lignesApres: 379, datesReecrites: 11, absentJours: 3 };

/** Un flux suivi, montre en exemple : son registre public (ni adresse ni titre), lu en prod le 16/10/2026. */
export const EXEMPLE_DE_REGISTRE = { id: '90bfb8a65ae28b58', depuis: '2026-10-12', articles: 13 };

/** Ce que le registre des communes tenait au jour de la page (`/collectivite`, 16/10/2026). */
export const COUVERTURE_COMMUNES = { au: '2026-10-16', communes: 835, actes: 10006 };

/** Un acte date par la glane, montre en exemple : sa page de preuve, lue en prod le 16/10/2026. */
export const EXEMPLE_D_ACTE = {
	commune: 'Amboise',
	nature: 'Délibération',
	objet: 'Liste des délibérations du Conseil Municipal du 16 janvier 2025',
	jour: '2026-10-15',
	adresse: '/actes/37003/2026-10-15/deliberation-916330351e01'
};

/** L'avis au BOAMP, par son numero : la seule adresse publique qui reste apres la cloture. */
export const lienDeLAvis = (numero) => `https://www.boamp.fr/pages/avis/?q=idweb:${numero}`;

/** Ce que la capture tenait au jour de la page (entrepot, `serie.jsonl` du 16/10/2026). */
export const COUVERTURE = { au: '2026-10-16', depuis: '2026-10-13', consultations: 252, reglements: 183 };

/**
 * L'echantillon : six consultations de communes et d'intercommunalites, prises
 * au vol. Les criteres sont lus dans le reglement garde (son sha256 en tete) ;
 * ils se disent en phrase, jamais recopies.
 */
export const ECHANTILLON = [
	{
		acheteur: 'Ville de Nevers',
		objet: 'Fourniture et livraison de signalisation routière verticale',
		jour: '2026-10-13',
		boamp: '26-98309',
		reglement: '0305306ed23e41cd0011353c97fb81861e1e602ed55a24c1b5ff4749aa8975c1',
		criteres: 'Le prix compte pour 50 points sur 100, la valeur technique pour 40 et la performance environnementale pour 10.'
	},
	{
		acheteur: 'Commune de Saint-Jean-de-Luz',
		objet: 'Marché public d’assurances',
		jour: '2026-10-13',
		boamp: '26-98442',
		reglement: '9cf8200b1e0f62e6bfa8518aceb9064ac470d89d5f2b7f996c976dfeba2d0ad0',
		criteres: 'Les garanties comptent pour 45 points sur 100, le prix pour 40, la gestion du contrat et des sinistres pour 10 et l’environnement pour 5.'
	},
	{
		acheteur: 'Commune de Saint-Médard-en-Jalles',
		objet: 'Aménagement d’un terrain de football en gazon synthétique',
		jour: '2026-10-13',
		boamp: '26-98922',
		reglement: '391533029e5557446f2d0d2d748959ee7e150d440be34ef7caac12aa3ab50560',
		criteres: 'La valeur technique compte pour 60 points sur 100, dont 30 pour la qualité des fournitures, et le prix pour 40.'
	},
	{
		acheteur: 'Grand Verdun',
		objet: 'Maintenance de l’éclairage public',
		jour: '2026-10-14',
		boamp: '26-98905',
		reglement: 'dc742dda0ebd878db273771527c7786347ad0bbc0f06e92c10d8c8029056fed7',
		criteres: 'La valeur technique compte pour 60 points sur 100, dont 40 pour la méthodologie, et le prix pour 40.'
	},
	{
		acheteur: 'Commune de Châtillon-sur-Seine',
		objet: 'Entretien des espaces verts de la ville',
		jour: '2026-10-15',
		boamp: '26-100050',
		reglement: '41d6b47740de3e88bbaa611b85e30cb473aff8b58a8b7b0b5e8cc01e7b8383b9',
		criteres: 'La valeur technique compte pour 60 % de la note et le prix pour 40 %.'
	},
	{
		acheteur: 'Lorient Agglomération',
		objet: 'Fourniture de carburants par cartes accréditives',
		jour: '2026-10-15',
		boamp: '26-99292',
		reglement: '7f4ed68317eec00f5fb66927e9eeae5ede877bee2f1906b45cadd9bf8b49c363',
		criteres: 'Le prix compte pour 65 % de la note, la valeur technique pour 30 % et la valeur environnementale pour 5 %.'
	}
];

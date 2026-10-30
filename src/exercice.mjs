// L'exercice de panne EN PROD (D-128) : `POST /health/exercice` rejoue la sonde
// avec une source coupee, pour cette seule reponse, et dit si la sonde l'a VUE.
// Rien n'est ecrit, aucun visiteur ne voit la coupure.

/** La marque de toute raison qu'une coupure produit. */
export const MARQUE = '(exercice)';

/**
 * Ce qu'on peut couper, le niveau que la sonde doit atteindre, ou la raison doit
 * paraitre, et ce que la coupure emporte vraiment avec elle (`aussi`).
 * verificateur : les fichiers du journal servis au verificateur (404) ;
 * depot : la base D1 du parcours (chaque requete leve) ; journal : `tours.json`
 * (404) ; tete : le flux des commits de `main`.
 */
export const COUPURES = {
	verificateur: { niveau: 'rouge', champ: 'constats', prefixe: 'parcours verificateur casse : ' },
	depot: { niveau: 'attention', champ: 'echecs_des_sondes', prefixe: 'parcours depot : ' },
	journal: { niveau: 'rouge', champ: 'constats', prefixe: 'aucun tour publie', aussi: ['parcours verificateur casse : '] },
	tete: { niveau: 'attention', champ: 'echecs_des_sondes', prefixe: 'tete de main : ', aussi: ['la tete de main est illisible'] }
};

const NIVEAUX = ['ok', 'attention', 'rouge'];

/** Les coupures demandees (`{"couper": ["depot"]}`), ou la raison de refuser la demande. */
export function lireLesCoupures(corps) {
	const demande = corps?.couper;
	if (!Array.isArray(demande)) return { refus: 'couper doit etre une liste' };
	const inconnues = demande.filter((c) => !(c in COUPURES));
	if (inconnues.length) return { refus: `coupure inconnue : ${inconnues.join(', ')} (connues : ${Object.keys(COUPURES).join(', ')})` };
	return { coupe: [...new Set(demande)] };
}

/** Une base dont chaque methode leve, avec la marque. */
export const baseCoupee = () =>
	new Proxy(
		{},
		{
			get: () => () => {
				throw new Error(`base coupee ${MARQUE}`);
			}
		}
	);

/** Une lecture de la surface qui rend 404, avec la marque. */
export const lectureCoupee = (chemin) => Promise.resolve(new Response(`${chemin} coupe ${MARQUE}`, { status: 404 }));

const raisons = (corps) => [...corps.constats, ...corps.echecs_des_sondes];

/**
 * VUE : la sonde coupee atteint le niveau de la coupure, une raison nouvelle
 * parait au bon endroit, et rien d'autre ne tombe avec elle (une coupure qui
 * emporte une source voisine accuse l'instrument, pas la sonde). Juge contre
 * le corps INTACT, relu juste avant.
 */
export function jugerLesCoupures(coupe, intact, coupee) {
	const avant = new Set(raisons(intact));
	const attendues = coupe.flatMap((nom) => [COUPURES[nom].prefixe, ...(COUPURES[nom].aussi ?? [])]);
	const emportees = raisons(coupee).filter((r) => !avant.has(r) && !attendues.some((p) => r.startsWith(p)));
	const verdicts = {};
	for (const nom of coupe) {
		const { niveau, champ, prefixe } = COUPURES[nom];
		const nouvelle = coupee[champ].find((r) => r.startsWith(prefixe) && !avant.has(r));
		if (NIVEAUX.indexOf(coupee.alerte) < NIVEAUX.indexOf(niveau)) verdicts[nom] = { vu: false, raison: `la sonde reste ${coupee.alerte}, ${niveau} attendu` };
		else if (!nouvelle) verdicts[nom] = { vu: false, raison: `aucune raison nouvelle dans ${champ}` };
		else if (emportees.length) verdicts[nom] = { vu: false, raison: `la coupure a aussi fait tomber : ${emportees.join(' ; ')}` };
		else verdicts[nom] = { vu: true, niveau: coupee.alerte, raison: nouvelle };
	}
	return verdicts;
}

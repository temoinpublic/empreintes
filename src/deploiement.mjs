// Le commit servi juge contre la tete de `main` (D-128, point 6). Le depot est
// public : la tete se lit dans le flux Atom des commits, sans jeton et hors du
// quota de l'API. Pur, sauf `lireLaTete`, qui ne fait que brancher `fetch`.

/** Le flux Atom des commits de `main`, le plus recent en premier. */
export const FLUX_DE_MAIN = 'https://github.com/temoinpublic/empreintes/commits/main.atom';

/**
 * vps5 tire `main` toutes les 2 min et construit en quelques minutes ; au-dela,
 * un commit de `main` toujours pas servi veut dire que le suivi est arrete.
 */
export const RETARD_TOLERE_MIN = 20;

const MINUTE = 60_000;
const ECHEANCE_MS = 8_000;
const TENTATIVES = 2;

/** Les commits du flux, dans son ordre ; leve sur un flux sans commit lisible. */
export function commitsDuFlux(xml) {
	const commits = [];
	for (const [, entree] of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
		const sha = /<id>tag:github\.com,2008:Grit::Commit\/([0-9a-f]{7,40})<\/id>/.exec(entree)?.[1];
		const date = /<updated>([^<]+)<\/updated>/.exec(entree)?.[1];
		if (!sha || !date || Number.isNaN(Date.parse(date))) throw new Error('entree du flux illisible');
		commits.push({ sha, date });
	}
	if (commits.length === 0) throw new Error('flux sans aucun commit');
	return commits;
}

/** La tete de `main` lue dans le flux ; une lecture qui casse est refaite une fois. */
export async function lireLaTete(chercher = fetch) {
	let derniere;
	for (let i = 0; i < TENTATIVES; i += 1) {
		try {
			const r = await chercher(FLUX_DE_MAIN, { headers: { 'user-agent': 'temoinpublic-sonde' }, signal: AbortSignal.timeout(ECHEANCE_MS) });
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return commitsDuFlux(await r.text());
		} catch (e) {
			derniere = e;
		}
	}
	throw new Error(`${derniere?.message ?? derniere} apres ${TENTATIVES} tentatives : github.com`);
}

const meme = (a, b) => a.startsWith(b) || b.startsWith(a);
const court = (sha) => sha.slice(0, 7);

/**
 * Le retard du commit servi sur `main`. `depuis` est l'arrivee du premier commit
 * de `main` que la prod ne sert pas. Un commit servi absent du flux (plus vieux
 * que ses vingt entrees, ou construit d'une branche) court depuis le premier
 * commit arrive apres la construction ; une construction plus recente que la
 * tete attend la suivante au lieu d'un faux retard.
 */
export function juger({ servi, construit, commits, maintenant }) {
	if (!servi || servi === 'inconnu') {
		return { retard: { mesure: false, raison: 'commit servi inconnu' }, niveau: 'attention', constat: 'le commit servi est inconnu : la construction ne l a pas ecrit' };
	}
	const tete = commits[0];
	const rang = commits.findIndex((c) => meme(c.sha, servi));
	if (rang === 0) return { retard: { mesure: true, main: tete.sha, depuis: null }, niveau: 'ok', constat: null };
	const fait = Date.parse(construit ?? '');
	const apres = commits.filter((c) => Number.isNaN(fait) || Date.parse(c.date) > fait);
	if (rang === -1 && apres.length === 0) return { retard: { mesure: true, main: tete.sha, depuis: null, tete_attendue: true }, niveau: 'ok', constat: null };
	const depuis = rang > 0 ? commits[rang - 1].date : apres.at(-1).date;
	const retard = { mesure: true, main: tete.sha, depuis };
	const minutes = Math.floor((maintenant - Date.parse(depuis)) / MINUTE);
	if (minutes <= RETARD_TOLERE_MIN) return { retard, niveau: 'ok', constat: null };
	return { retard, niveau: 'attention', constat: `sert ${court(servi)}, main porte ${court(tete.sha)} depuis ${minutes} min : le suivi de vps5 ne deploie plus` };
}

/** Le jugement quand la tete n'a pas pu etre lue : rien n'est juge, et la sonde le dit. */
export function sansTete(raison) {
	return { retard: { mesure: false, raison: `tete de main illisible : ${raison}` }, niveau: 'attention', constat: 'la tete de main est illisible : le retard du deploiement n est pas juge' };
}

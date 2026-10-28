// Memento (RFC 7089) sur les sources temoin de l'entrepot (D-205) : pour une
// adresse reecrite en place, la serie de ses versions datees, chacune une
// empreinte du journal. Temoin public ne sert aucun contenu : une version est
// une empreinte, un tour et le renvoi vers la copie du temoin tiers (Internet
// Archive). Pur : la construction ecrit `memento/index.json`, la Function le lit.
//
//   /memento/timemap/link/<adresse>   la TimeMap, toutes les versions (application/link-format)
//   /memento/timegate/<adresse>       302 vers la version la plus proche de `Accept-Datetime`
//   /memento/<tour>/<adresse>         une version : `Memento-Datetime`, liens original, timegate, timemap

import { instantDe } from './journal.mjs';
import { pageMemento } from './pages.mjs';

export const CHEMIN = '/memento';
/** La liste des sources temoin que l'entrepot publie avec le journal. */
export const SOURCES_TEMOIN = 'sources-temoin.json';
/** L'index des versions, ecrit par la construction. */
export const INDEX_MEMENTO = 'memento/index.json';
export const LINK_FORMAT = 'application/link-format';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const ID_DE_TOUR = /^\d{8}T\d{6}Z$/;

const listeDe = (sources) => (Array.isArray(sources) ? sources : (sources?.sources ?? []));

/**
 * Les versions des sources temoin, tour apres tour : une empreinte qui change
 * sous le nom de la source ouvre une version, datee du tour qui l'a vue la
 * premiere fois ; `dernier` suit le dernier tour qui la montre encore.
 */
export function creerLesVersions(sources) {
	const index = {};
	for (const s of listeDe(sources)) {
		if (!s?.nom || !s?.url) continue;
		index[s.nom] = { url: s.url, famille: s.famille ?? null, theme: s.theme ?? null, pourquoi: s.pourquoi ?? null, versions: [] };
	}
	const noms = Object.keys(index);
	return {
		ajouter(releve) {
			if (!noms.length) return;
			const parCle = new Map();
			for (const f of releve.feuilles) if (index[f.cle]) parCle.set(f.cle, f);
			for (const nom of noms) {
				const f = parCle.get(nom);
				if (!f) continue;
				const versions = index[nom].versions;
				const derniere = versions.at(-1);
				if (derniere && derniere.sha256 === f.sha256) {
					derniere.dernier = releve.id;
					continue;
				}
				versions.push({ sha256: f.sha256, jour: f.jour ?? null, tour: releve.id, instant: instantDe(releve.id), racine: releve.racine, dernier: releve.id });
			}
		},
		index: () => index
	};
}

/**
 * L'adresse de la requete avec le `//` du schema reduit a `/` dans le chemin :
 * le routeur des Functions ne sert pas un chemin a segment vide, le middleware
 * joue alors la Function lui-meme sur cette adresse et `adresseDe` retablit
 * l'originale. Null s'il n'y a rien a reduire.
 */
export function cheminMementoRetabli(url) {
	const u = new URL(url);
	const m = /^(\/memento\/(?:timemap\/link|timegate|\d{8}T\d{6}Z)\/https?:)\/\/(.*)$/s.exec(u.pathname);
	if (!m) return null;
	u.pathname = `${m[1]}/${m[2]}`;
	return u.toString();
}

/** L'adresse d'origine telle qu'elle est ecrite dans le chemin ; un `//` reduit a `/` par le chemin se retablit. */
export function adresseDe(brut) {
	const adresse = String(brut ?? '').replace(/^(https?:)\/(?!\/)/, '$1//');
	return /^https?:\/\/[^/\s]+/.test(adresse) ? adresse : null;
}

/** La demande lue dans l'adresse de la requete : `{ genre, uri, tour }`, ou null si ce n'est pas une adresse Memento. */
export function lireLaDemande(url) {
	const u = new URL(url);
	if (!u.pathname.startsWith(`${CHEMIN}/`)) return null;
	const m = /^(timemap\/link|timegate|\d{8}T\d{6}Z)\/(.+)$/s.exec(u.pathname.slice(CHEMIN.length + 1) + u.search);
	const uri = m ? adresseDe(m[2]) : null;
	if (!uri) return null;
	if (m[1] === 'timemap/link') return { genre: 'timemap', uri, tour: null };
	if (m[1] === 'timegate') return { genre: 'timegate', uri, tour: null };
	return { genre: 'memento', uri, tour: m[1] };
}

const sansBarre = (a) => a.replace(/\/$/, '');

/** La source temoin qui porte cette adresse (barre finale indifferente), avec son nom ; null sinon. */
export function trouverLaSource(index, uri) {
	for (const [nom, s] of Object.entries(index ?? {})) if (sansBarre(s.url) === sansBarre(uri)) return { nom, ...s };
	return null;
}

/** La version en vigueur a l'instant demande : la derniere avant lui, la premiere s'il les precede toutes, la derniere sans date lisible. */
export function choisirLaVersion(versions, acceptDatetime) {
	if (!versions.length) return null;
	const voulu = Date.parse(acceptDatetime ?? '');
	if (Number.isNaN(voulu)) return versions.at(-1);
	let choisie = null;
	for (const v of versions) if (Date.parse(v.instant) <= voulu) choisie = v;
	return choisie ?? versions[0];
}

/** Un instant ISO au format des en-tetes HTTP (RFC 7231). */
export const dateHttp = (iso) => new Date(iso).toUTCString();

const lienFormat = (uri, attributs) => `<${uri}>; ${attributs.join('; ')}`;
const adresses = (base, url) => ({
	timemap: `${base}${CHEMIN}/timemap/link/${url}`,
	timegate: `${base}${CHEMIN}/timegate/${url}`,
	memento: (tour) => `${base}${CHEMIN}/${tour}/${url}`
});

/** La TimeMap d'une source, au format `application/link-format`. */
export function timeMap(base, source) {
	const { url, versions } = source;
	const a = adresses(base, url);
	const self = [`rel="self"`, `type="${LINK_FORMAT}"`];
	if (versions.length) self.push(`from="${dateHttp(versions[0].instant)}"`, `until="${dateHttp(versions.at(-1).instant)}"`);
	const lignes = [lienFormat(url, [`rel="original"`]), lienFormat(a.timemap, self), lienFormat(a.timegate, [`rel="timegate"`])];
	versions.forEach((v, i) => {
		const rel = versions.length === 1 ? 'first last memento' : i === 0 ? 'first memento' : i === versions.length - 1 ? 'last memento' : 'memento';
		lignes.push(lienFormat(a.memento(v.tour), [`rel="${rel}"`, `datetime="${dateHttp(v.instant)}"`]));
	});
	return `${lignes.join(',\n')}\n`;
}

/** La copie du temoin tiers au plus pres de l'instant : l'Internet Archive resout vers sa capture la plus proche. */
export const copieDuTemoin = (url, instant) => `https://web.archive.org/web/${instant.replace(/\D/g, '').slice(0, 14)}/${url}`;

const texte = (statut, corps) => ({ statut, entetes: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, corps: `${corps}\n` });

/**
 * La reponse a une adresse Memento, depuis l'index construit : `{ statut, entetes, corps }`.
 * `acceptDatetime` et `accept` sont les en-tetes de la requete.
 */
export function reponse(index, url, { acceptDatetime = null, accept = '' } = {}) {
	const demande = lireLaDemande(url);
	if (!demande) return texte(404, 'Adresse Memento inconnue : /memento/timemap/link/<adresse>, /memento/timegate/<adresse>, /memento/<tour>/<adresse>.');
	const source = trouverLaSource(index, demande.uri);
	if (!source) return texte(404, `Cette adresse n'est pas une source temoin de l'entrepot : ${demande.uri}`);
	const u = new URL(url);
	// Derriere le mandataire de vps5, la Function voit `http:` ; le site ne se sert qu'en https.
	const base = `${LOCAL.test(u.hostname) ? u.protocol : 'https:'}//${u.host}`;
	const a = adresses(base, source.url);
	const liens = [lienFormat(source.url, [`rel="original"`]), lienFormat(a.timemap, [`rel="timemap"`, `type="${LINK_FORMAT}"`])];
	if (demande.genre === 'timemap') {
		return { statut: 200, entetes: { 'content-type': `${LINK_FORMAT}; charset=utf-8`, 'cache-control': 'public, max-age=300' }, corps: timeMap(base, source) };
	}
	if (demande.genre === 'timegate') {
		const v = choisirLaVersion(source.versions, acceptDatetime);
		if (!v) return texte(404, `Aucune version encore pour ${source.url}`);
		// Relatif : `wrangler pages dev` reecrit en http un Location absolu.
		return { statut: 302, entetes: { location: adresses('', source.url).memento(v.tour), vary: 'accept-datetime', link: liens.join(', '), 'cache-control': 'no-store' }, corps: '' };
	}
	const position = source.versions.findIndex((v) => v.tour === demande.tour);
	if (position < 0) return texte(404, `Aucune version de ${source.url} au tour ${demande.tour}`);
	const v = source.versions[position];
	const entetes = {
		'memento-datetime': dateHttp(v.instant),
		link: [...liens, lienFormat(a.timegate, [`rel="timegate"`]), lienFormat(a.memento(v.tour), [`rel="memento"`, `datetime="${dateHttp(v.instant)}"`])].join(', '),
		'cache-control': 'public, max-age=3600'
	};
	if (/application\/json/.test(accept)) {
		const corps = { source: source.nom, url: source.url, tour: v.tour, instant: v.instant, jour: v.jour, sha256: v.sha256, racine: v.racine, dernier: v.dernier, releve: `${base}/empreintes/${v.tour}.json`, temoin: copieDuTemoin(source.url, v.instant) };
		return { statut: 200, entetes: { ...entetes, 'content-type': 'application/json; charset=utf-8' }, corps: `${JSON.stringify(corps, null, 1)}\n` };
	}
	const corps = pageMemento({ nom: source.nom, url: source.url, version: v, position: position + 1, total: source.versions.length, temoin: copieDuTemoin(source.url, v.instant) });
	return { statut: 200, entetes: { ...entetes, 'content-type': 'text/html; charset=utf-8' }, corps };
}

export { ID_DE_TOUR };

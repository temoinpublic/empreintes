// Les promesses municipales 2026 (D-202, point 3) : ce que les listes des
// municipales de mars 2026 ont ecrit au futur sur leur site de campagne, phrase
// par phrase, avec sa source et sa date de lecture. L'entrepot mesure (son
// `src/promesses.mjs`, prive, avec les noms des tetes de liste) ; CE module
// decide ce qui s'en publie, et la construction le rejoue sur
// `donnees/promesses/<insee>.json`. Pur.
//
// Une commune ne se sert que RELUE (`relue_le`) : la mesure garde des phrases
// d'ambiance et des intertitres, la relecture les sort avant que rien ne
// paraisse. Ce qui ne se publie jamais : une phrase ou un site qui nommerait
// une personne, une phrase trop courte ou trop longue pour etre entiere, une
// commune sous `PHRASES_MIN` phrases. Jamais un jugement : la phrase, sa
// source, sa date.

import { nommeUnePersonne } from './personne.mjs';

export const CHEMIN_PROMESSES = '/promesses';
/** Une commune parait a partir de cinq phrases relues : en dessous, la page ne dit rien du programme. */
export const PHRASES_MIN = 5;
export const PHRASE_MIN = 40;
export const PHRASE_MAX = 320;

const INSEE = /^(\d{5}|2[AB]\d{3})$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HOTE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** L'adresse de la page d'une commune, a son code INSEE. */
export const cheminDeLaCommune = (insee) => `${CHEMIN_PROMESSES}/${insee}`;

const adresseLisible = (url) => {
	try {
		return ['http:', 'https:'].includes(new URL(url).protocol);
	} catch {
		return false;
	}
};

/** Vrai quand une phrase peut paraitre : entiere, datee, sourcee, sans personne nommee. */
export function phrasePubliable(p) {
	const texte = String(p?.texte ?? '').trim();
	if (texte.length < PHRASE_MIN || texte.length > PHRASE_MAX) return false;
	if (!adresseLisible(p.source) || !JOUR.test(String(p.lue_le ?? '').slice(0, 10))) return false;
	return !nommeUnePersonne(texte);
}

/** Ce qui se publie d'une phrase : le texte, sa source, son jour de lecture. */
const reduirePhrase = (p) => ({ texte: String(p.texte).trim(), source: p.source, lue_le: String(p.lue_le).slice(0, 10) });

/** Les mots d'un hote, en capitales initiales, tels qu'un nom s'y lirait : « jean-dupont-2026.fr » donne « Jean Dupont 2026 ». */
const motsDeLHote = (hote) =>
	hote
		.split('.')
		.slice(0, -1)
		.join(' ')
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.map((m) => m[0].toUpperCase() + m.slice(1))
		.join(' ');

/** Vrai quand un site de liste peut paraitre : un hote, qui ne nomme personne. */
export function sitePubliable(site) {
	const hote = String(site ?? '').toLowerCase();
	return HOTE.test(hote) && !nommeUnePersonne(motsDeLHote(hote));
}

/** La liste reduite a ses phrases publiables, ou null si rien ne reste. */
export function listePubliable(l) {
	if (!sitePubliable(l?.site)) return null;
	const vues = new Set();
	const phrases = (Array.isArray(l.phrases) ? l.phrases : [])
		.filter(phrasePubliable)
		.map(reduirePhrase)
		.filter((p) => !vues.has(p.texte) && vues.add(p.texte));
	return phrases.length ? { site: String(l.site).toLowerCase(), phrases } : null;
}

/** Le nombre de phrases d'une fiche. */
export const nombreDePhrases = (fiche) => fiche.listes.reduce((n, l) => n + l.phrases.length, 0);

/**
 * La fiche publique d'une commune depuis son fichier `donnees/promesses/<insee>.json`,
 * ou null : sans relecture datee, sans nom, sans code INSEE juste, ou sous `PHRASES_MIN`
 * phrases publiables, rien ne parait.
 */
export function fichePubliable(brute) {
	if (!INSEE.test(brute?.insee ?? '') || !String(brute.commune ?? '').trim()) return null;
	if (!JOUR.test(brute.relue_le ?? '')) return null;
	const listes = (Array.isArray(brute.listes) ? brute.listes : []).map(listePubliable).filter(Boolean);
	const fiche = { insee: brute.insee, commune: String(brute.commune).trim(), relue_le: brute.relue_le, listes };
	return nombreDePhrases(fiche) >= PHRASES_MIN ? fiche : null;
}

/** Les fiches publiables, dans l'ordre des noms de commune. */
export const fichesPubliables = (brutes) =>
	(Array.isArray(brutes) ? brutes : [])
		.map(fichePubliable)
		.filter(Boolean)
		.sort((a, b) => a.commune.localeCompare(b.commune, 'fr') || a.insee.localeCompare(b.insee));

/** Le lastmod des pages de la famille : chaque commune a sa relecture, l'index a la plus recente. */
export function datesDesPromesses(fiches) {
	const dates = {};
	for (const f of fiches) dates[cheminDeLaCommune(f.insee)] = f.relue_le;
	if (fiches.length) dates[CHEMIN_PROMESSES] = fiches.map((f) => f.relue_le).sort().at(-1);
	return dates;
}

/**
 * Les fiches A RELIRE tirees d'une mesure de l'entrepot (`{ lu_le, sites }`),
 * une par commune, sans relecture, sans population ni nom de tete de liste ;
 * seules les communes qui atteignent `PHRASES_MIN` phrases publiables sont rendues.
 */
export function fichesDeLaMesure(mesure, min = PHRASES_MIN) {
	const parCommune = new Map();
	for (const s of Array.isArray(mesure?.sites) ? mesure.sites : []) {
		if (!INSEE.test(s?.commune?.code ?? '')) continue;
		const liste = listePubliable({ site: s.domaine, phrases: s.phrases });
		if (!liste) continue;
		const fiche = parCommune.get(s.commune.code) ?? { insee: s.commune.code, commune: s.commune.nom, lue_le: String(mesure.lu_le ?? '').slice(0, 10), relue_le: null, listes: [] };
		fiche.listes.push(liste);
		parCommune.set(s.commune.code, fiche);
	}
	return [...parCommune.values()].filter((f) => nombreDePhrases(f) >= min).sort((a, b) => a.insee.localeCompare(b.insee));
}

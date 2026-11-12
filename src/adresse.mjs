// L'adresse perenne d'un acte date (D-205) :
// `/actes/<code>/<jour>/<nature>-<12 hex>`. `<code>` est la collectivite du
// depot (INSEE, ou SIREN d'un groupement), `<jour>` le jour de la datation (un
// fait prouve, jamais la date de l'acte, qui se devine), `<nature>` celle du
// depot, et les 12 hex le debut de l'empreinte SHA-256 du document. Une
// version, une adresse : une source dont l'empreinte change en donne une neuve.
// Tout prefixe d'au moins 8 hex renvoie (301) vers la forme canonique ; un
// prefixe ambigu rend la liste (300). Pur pour la lecture et la decision.

import { estUnInsee, estUnSiren, NATURES } from './acte.mjs';

/** Les hex de l'empreinte dans l'adresse canonique. */
export const HEX_CANONIQUES = 12;
/** Le plus court prefixe d'empreinte qu'une adresse resout. */
export const HEX_MINIMUM = 8;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const DERNIER = /^(?:([a-z]+)-)?([0-9a-f]{8,64})$/;

/** Le chemin canonique d'un acte, depuis sa collectivite, son jour, sa nature et son empreinte. */
export const cheminDeLActe = ({ collectivite, jour, nature, sha256 }) => `/actes/${collectivite}/${jour}/${nature}-${sha256.slice(0, HEX_CANONIQUES)}`;

/**
 * Lit les segments d'une adresse sous `/actes/` : `{ code, jour, prefixe }`, ou
 * null quand elle ne peut designer aucun acte. Le code se lit en capitales, le
 * prefixe en minuscules ; la nature ecrite ne sert pas a la recherche.
 */
export function lireAdresse(segments) {
	if (!Array.isArray(segments) || segments.length !== 3) return null;
	const [brut, jour, dernier] = segments.map(String);
	const code = brut.toUpperCase();
	const m = DERNIER.exec(dernier.toLowerCase());
	if (!(estUnInsee(code) || estUnSiren(code)) || !JOUR.test(jour) || Number.isNaN(Date.parse(jour)) || !m) return null;
	if (m[1] && !Object.hasOwn(NATURES, m[1])) return null;
	return { code, jour, prefixe: m[2] };
}

/**
 * La decision pour une adresse lue et les actes qui y repondent :
 * `{ statut: 404 }`, `{ statut: 300, actes }` (prefixe ambigu),
 * `{ statut: 301, vers }` (forme non canonique) ou `{ statut: 200, acte }`.
 */
export function resoudre(chemin, actes) {
	if (actes.length === 0) return { statut: 404 };
	// Deux depots des memes octets, meme collectivite, nature et jour (deux URL qui
	// servent le meme fichier), ont la meme adresse : ce n'est pas une ambiguite,
	// c'est un acte, et le premier date le porte. Une liste de liens identiques
	// ramenait au meme choix (audit Codex du 2026-11-11).
	const distincts = [...new Map(actes.map((a) => [cheminDeLActe(a), a])).values()];
	if (distincts.length > 1) return { statut: 300, actes: distincts.map((d) => actes.find((a) => cheminDeLActe(a) === cheminDeLActe(d))) };
	const [acte] = actes;
	const canonique = cheminDeLActe(acte);
	return canonique === chemin ? { statut: 200, acte } : { statut: 301, vers: canonique };
}

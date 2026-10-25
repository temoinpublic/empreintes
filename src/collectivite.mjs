// Les pages publiques des collectivites (D-165, D-178) : `/collectivite/<code>`,
// les actes d'une commune lus sur son site officiel, une page par commune a son
// code INSEE (le SIREN et l'ecriture en minuscules y renvoient) ; `/collectivite`,
// les departements ; `/collectivite/departement/<code>`, ses communes. Une
// commune sans acte date ne figure dans aucune liste.

import { estUnInsee, estUnSiren } from './acte.mjs';
import { cheminDeLActe, lireAdresse, resoudre } from './adresse.mjs';
import { dateLue } from './datelue.mjs';
import { ficheDeLActe } from './schemaadresse.mjs';
import { DEPARTEMENTS, departementDe, nomDuDepartement } from './departements.mjs';
import { pourraitNommer } from './glane.mjs';
import { nommeUnePersonne } from './personne.mjs';
import { EDITIONS } from './edition.mjs';
import { entreesDesActes } from './disparusactes.mjs';
import { avecLesActes, itemsDesActes, pageAdresse, pageAdresses, pageCollectivite, pageCommunes, pageDepartement, pageIntrouvable, sectionDesActes } from './pages.mjs';
import { actesAuPrefixe, actesDisparus, actesParCollectivite, DISPARUS_DES_ACTES_MAX, adressesDesActes, adressePublique, nombreDActes, PLAN_DES_ACTES_MAX, passageDeLActe, relectureDeLActe, serieDeLaCollectivite, versionsDeLaSource } from './service.mjs';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const LISTE = { ...HTML, 'cache-control': 'public, max-age=300' };
const XML = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' };
const FLUX = { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' };
const introuvable = () => ({ statut: 404, corps: pageIntrouvable(), entetes: { ...HTML, 'cache-control': 'public, max-age=300' } });
const renvoi = (location) => ({ statut: 301, corps: '', entetes: { location, 'cache-control': 'public, max-age=3600' } });

/**
 * La reponse a `/collectivite/<code>` : `{ statut, corps, entetes }`.
 * `commune(code)` rend `{ nom, insee, siren }` ou null.
 */
export async function reponseCollectivite({ db, code, commune }) {
	const lu = String(code ?? '').toUpperCase();
	if (!estUnInsee(lu) && !estUnSiren(lu)) return introuvable();
	const fiche = await commune(lu);
	const canonique = fiche?.insee ?? lu;
	if (canonique !== code) return renvoi(`/collectivite/${canonique}`);
	const codes = [canonique, fiche?.siren].filter(Boolean);
	const serie = await serieDeLaCollectivite({ db, codes });
	const departement = estUnInsee(canonique) ? departementDe(canonique) : null;
	return { statut: 200, corps: pageCollectivite({ code: canonique, commune: fiche, serie, departement }), entetes: { ...HTML, 'cache-control': 'public, max-age=60' } };
}

/**
 * Les communes qui ont au moins un acte date, `[{ insee, departement, actes }]`
 * par code INSEE : un acte depose sous le SIREN compte a la commune qu'il
 * designe, un SIREN qui n'en designe aucune ne compte nulle part.
 */
export async function communesAvecActes({ db, commune }) {
	const parInsee = new Map();
	for (const { code, actes, jour } of await actesParCollectivite({ db })) {
		const insee = estUnInsee(code) ? code : (await commune(code))?.insee;
		if (!insee) continue;
		const avant = parInsee.get(insee) ?? { actes: 0, jour: null };
		parInsee.set(insee, { actes: avant.actes + actes, jour: plusRecent(avant.jour, jour) });
	}
	return [...parInsee]
		.map(([insee, { actes, jour }]) => ({ insee, departement: departementDe(insee), actes, jour }))
		.sort((a, b) => a.insee.localeCompare(b.insee));
}

/** Les departements qui portent au moins une commune, `[{ code, nom, communes, actes }]`, dans l'ordre des codes. */
export function departementsDe(communes) {
	const parCode = new Map();
	for (const c of communes) {
		const d = parCode.get(c.departement) ?? { code: c.departement, nom: nomDuDepartement(c.departement), communes: 0, actes: 0 };
		d.communes += 1;
		d.actes += c.actes;
		parCode.set(c.departement, d);
	}
	return [...parCode.values()];
}

/** Les comptes publics des communes, `{ communes, actes, departements }` : ce que mesure le critere de D-178. */
export async function bilanDesCommunes({ db, commune }) {
	const departements = departementsDe(await communesAvecActes({ db, commune }));
	return {
		communes: departements.reduce((n, d) => n + d.communes, 0),
		actes: departements.reduce((n, d) => n + d.actes, 0),
		departements
	};
}

/** La reponse a `/collectivite` : les departements, chacun avec son compte de communes et d'actes. */
export async function reponseCommunes({ db, commune }) {
	const departements = departementsDe(await communesAvecActes({ db, commune }));
	return { statut: 200, corps: pageCommunes({ departements }), entetes: LISTE };
}

/** La reponse a `/collectivite/departement/<code>` : ses communes, chacune avec son nom et son compte d'actes. */
export async function reponseDepartement({ db, code, commune }) {
	const lu = String(code ?? '').toUpperCase();
	if (!Object.hasOwn(DEPARTEMENTS, lu)) return introuvable();
	if (lu !== code) return renvoi(`/collectivite/departement/${lu}`);
	const communes = (await communesAvecActes({ db, commune })).filter((c) => c.departement === lu);
	const nommees = await Promise.all(communes.map(async (c) => ({ ...c, nom: (await commune(c.insee))?.nom ?? null })));
	return { statut: 200, corps: pageDepartement({ code: lu, nom: DEPARTEMENTS[lu], communes: nommees }), entetes: LISTE };
}

/** Le plus recent de deux jours ISO, null ignore. */
const plusRecent = (a, b) => (a && b ? (a > b ? a : b) : (a ?? b));

/** Le plus recent jour de datation d'un groupe de communes, null s'il n'y en a aucun. */
const dernierJour = (communes) => communes.reduce((j, c) => plusRecent(j, c.jour), null);

/**
 * Le plan des pages de communes : l'index, chaque departement et chaque commune qui ont au moins un acte,
 * chacune datee (lastmod) du jour de son dernier acte date.
 */
export function planDesCommunes(communes) {
	const adresse = EDITIONS.fr.adresse;
	const entrees = [
		['/collectivite', dernierJour(communes)],
		...departementsDe(communes).map((d) => [`/collectivite/departement/${d.code}`, dernierJour(communes.filter((c) => c.departement === d.code))]),
		...communes.map((c) => [`/collectivite/${c.insee}`, c.jour])
	];
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entrees.map(([c, jour]) => `<url><loc>${adresse}${c}</loc>${jour ? `<lastmod>${jour}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

/** La reponse a `/sitemap-communes.xml`. */
export async function reponsePlanDesCommunes({ db, commune }) {
	return { statut: 200, corps: planDesCommunes(await communesAvecActes({ db, commune })), entetes: XML };
}

/**
 * Le plan des adresses perennes des actes (D-205), chacune datee du jour de sa
 * datation. Une adresse ne porte que le code, le jour, la nature et l'empreinte :
 * aucun nom, quel que soit l'objet de l'acte.
 */
export function planDesActes(actes) {
	const adresse = EDITIONS.fr.adresse;
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${actes.map((a) => `<url><loc>${adresse}${cheminDeLActe(a)}</loc><lastmod>${a.jour}</lastmod></url>`).join('\n')}
</urlset>
`;
}

/** L'index des plans d'actes quand ils passent la limite d'un fichier : `?page=1` a `?page=<pages>`. */
export function indexDesPlansDActes(pages) {
	const adresse = EDITIONS.fr.adresse;
	return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: pages }, (_, i) => `<sitemap><loc>${adresse}/sitemap-actes.xml?page=${i + 1}</loc></sitemap>`).join('\n')}
</sitemapindex>
`;
}

/**
 * La reponse a `/sitemap-actes.xml` : le plan lui-meme tant qu'il tient dans un
 * fichier (50 000 adresses), un index de pages au-dela ; `?page=<n>` sert la page,
 * dans l'ordre des datations, qui ne bouge pas puisqu'un acte s'ajoute a la fin.
 */
export async function reponsePlanDesActes({ db, page = null, parPage = PLAN_DES_ACTES_MAX }) {
	const total = await nombreDActes({ db });
	const pages = Math.max(1, Math.ceil(total / parPage));
	if (page === null) return { statut: 200, corps: pages === 1 ? planDesActes(await adressesDesActes({ db, limite: parPage })) : indexDesPlansDActes(pages), entetes: XML };
	const n = /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 0;
	if (n < 1 || n > pages) return introuvable();
	return { statut: 200, corps: planDesActes(await adressesDesActes({ db, limite: parPage, decalage: (n - 1) * parPage })), entetes: XML };
}

/** L'objet d'un acte s'il ne peut nommer personne, null sinon. */
const objetMontrable = (acte) => (acte.objet && !nommeUnePersonne(acte.objet) && !pourraitNommer(acte.objet, acte.nature) ? acte.objet : null);

/** L'adresse lue d'un acte si ni son chemin ni son nom de fichier ne peuvent nommer personne, null sinon. */
function sourceMontrable(acte) {
	const url = acte.url ? adressePublique(acte.url) : null;
	if (!url) return null;
	const fichier = decodeURIComponent(new URL(url).pathname.split('/').pop()).replace(/[-_+.]+/g, ' ');
	return pourraitNommer(fichier, acte.nature) ? null : url;
}

const garde = (acte) => ({ ...acte, objet: objetMontrable(acte), url: sourceMontrable(acte) });

/** L'en-tete qui tient la famille `/actes/` hors de l'index, HTML comme JSON (D-174). */
const SANS_INDEX = { 'x-robots-tag': 'noindex' };

/**
 * La reponse a `/actes/<code>/<jour>/<nature>-<hex>` (D-205) : la page de l'acte
 * a sa forme canonique, 301 vers elle depuis un prefixe ou une ecriture voisine,
 * la liste des adresses pour un prefixe ambigu, 404 sinon. Tout ce qui se sert
 * porte `x-robots-tag: noindex` (D-174) : l'adresse perenne se cite, la
 * recherche ne la porte pas.
 */
export async function reponseAdresse({ db, segments, commune, json = false }) {
	const lu = lireAdresse(segments);
	const r = lu ? resoudre(`/actes/${segments.join('/')}`, await actesAuPrefixe({ db, ...lu })) : { statut: 404 };
	if (r.statut === 301) return renvoi(r.vers);
	const forme = json ? FORME_JSON : FORME_HTML;
	if (r.statut === 404) return forme.introuvable();
	if (r.statut === 300) return { statut: 300, corps: forme.liste(r.actes), entetes: { ...forme.entetes, ...SANS_INDEX, 'cache-control': 'public, max-age=60' } };
	const versions = await versionsDeLaSource({ db, collectivite: r.acte.collectivite, url: r.acte.url });
	const passage = await passageDeLActe({ db, recu: r.acte.recu });
	const acte = garde(r.acte);
	const corps = json
		? enJson(ficheDeLActe({ adresse: `${EDITIONS.fr.adresse}${cheminDeLActe(acte)}`, acte, versions, passage, date: dateLue(acte), cheminDe: cheminDeLActe }))
		: pageAdresse({ acte, commune: await commune(r.acte.collectivite), versions, passage, relecture: await relectureDeLActe({ db, recu: r.acte.recu }), date: dateLue(acte) });
	return { statut: 200, corps, entetes: { ...forme.entetes, ...SANS_INDEX, 'cache-control': 'public, max-age=300' } };
}

const enJson = (valeur) => `${JSON.stringify(valeur, null, 1)}\n`;

/** La meme adresse sert la page ou la fiche du schema (D-205), selon `Accept` ; `vary` le dit aux caches. */
const avecVary = (r) => ({ ...r, entetes: { ...r.entetes, vary: 'accept' } });
const FORME_HTML = { entetes: { ...HTML, vary: 'accept' }, introuvable: () => avecVary(introuvable()), liste: pageAdresses };
const JSON_ADRESSE = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', vary: 'accept' };
const FORME_JSON = {
	entetes: JSON_ADRESSE,
	introuvable: () => ({ statut: 404, corps: enJson({ erreur: 'adresse inconnue' }), entetes: { ...JSON_ADRESSE, 'cache-control': 'public, max-age=300' } }),
	liste: (actes) => enJson({ adresses: actes.map((a) => `${EDITIONS.fr.adresse}${cheminDeLActe(a)}`) })
};

/** Vrai quand la requete prefere JSON a HTML : `application/json` nomme dans `Accept`, sans `text/html` avant lui. */
export function veutDuJson(accept) {
	const types = String(accept ?? '').toLowerCase().split(',').map((t) => t.split(';')[0].trim());
	const json = types.indexOf('application/json');
	const html = types.indexOf('text/html');
	return json >= 0 && (html < 0 || json < html);
}

/**
 * La reponse a `/disparus` (D-193) : la page publiee (`publiee`, sa Response),
 * la section des actes des communes disparus ou remplaces a sa place.
 * `commune(code)` rend `{ nom }` ou null.
 */
export const reponseDisparus = ({ db, publiee, commune }) => avecLesActesDeLaBase({ db, publiee, commune, rendre: sectionDesActes, entetes: LISTE });

/** La reponse a `/disparus.xml` (D-193) : le flux publie, les actes des communes a la place de leur marque. */
export const reponseFluxDisparus = ({ db, publiee, commune }) => avecLesActesDeLaBase({ db, publiee, commune, rendre: itemsDesActes, entetes: FLUX });

/** Le document publie, `rendre({ entrees, nomDe })` des actes disparus ou remplaces a la place de `MARQUE_DES_ACTES`. */
async function avecLesActesDeLaBase({ db, publiee, commune, rendre, entetes }) {
	if (!publiee.ok) return { statut: publiee.status, corps: await publiee.text(), entetes: Object.fromEntries(publiee.headers) };
	const texte = await publiee.text();
	const entrees = await entreesDesActes(await actesDisparus({ db }), DISPARUS_DES_ACTES_MAX);
	const codes = [...new Set(entrees.map((e) => e.collectivite))];
	const noms = new Map(await Promise.all(codes.map(async (code) => [code, (await commune(code))?.nom ?? null])));
	return { statut: 200, corps: avecLesActes(texte, rendre({ entrees, nomDe: (code) => noms.get(code) })), entetes };
}

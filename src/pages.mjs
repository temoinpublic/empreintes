// Les pages de la surface. Elles affichent ; la methode vit dans le code. Chaque
// page se rend dans la langue d'une edition (`src/edition.mjs`), le francais par
// defaut ; les actes de collectivite ne se rendent qu'en francais.

import { NATURES } from './acte.mjs';
import { cheminDeLActe } from './adresse.mjs';
import { nomDuDepartement } from './departements.mjs';
import { BESOINS } from './besoins.mjs';
import { EDITIONS, cheminsDe, planDe } from './edition.mjs';
import { ADRESSES, FORMULES } from './documentation.mjs';
import { CHEMIN_OFFRE_ASSUREURS, CHEMIN_OFFRE_COMMUNES, CHEMIN_OFFRE_CONFORMITE, CHEMIN_OFFRE_DRH, CHEMIN_OFFRE_EDITEURS, CHEMIN_OFFRE_MARCHES, CHEMIN_OFFRE_NOTAIRES, CHEMINS_DES_OFFRES, COUVERTURE, COUVERTURE_COMMUNES, COUVERTURE_DU_REGISTRE, ECHANTILLON, EXEMPLE_D_ACTE, EXEMPLE_DE_REGISTRE, OFFRES_DE_L_ACCUEIL, PIECE_MICA, REGISTRES_DE_CONFORMITE, lienDeLAvis } from './offre.mjs';
import { PROFILS_DES_OFFRES } from './attente.mjs';

const NBSP = '\u00A0';
const DEPOT = 'https://github.com/temoinpublic/empreintes';
export const MARQUE = EDITIONS.fr.marque;

/** Les actes du site en francais : un nom court pour chaque lien, partout, et le titre de sa page. */
export const ACTES = EDITIONS.fr.actes;

/** Les pages statiques francaises que les moteurs lisent, dans l'ordre du plan du site. */
export const PLAN = planDe('fr');

/** Le plan du site d'une edition, au format sitemaps.org ; `dates` donne le lastmod d'un chemin, une page sans date n'en porte pas. */
export const planDuSite = (chemins = PLAN, langue = 'fr', dates = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${chemins.map((c) => `<url><loc>${EDITIONS[langue].adresse}${c}</loc>${dates[c] ? `<lastmod>${dates[c]}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;

/**
 * Le lastmod des pages statiques dont la donnee est datee, jamais la date de
 * construction : l'accueil et le registre a l'instant du dernier tour, ce qui a
 * disparu a sa derniere entree (en francais).
 */
export function datesDuPlan(tours, entrees = [], langue = 'fr') {
	const dates = {};
	const dernier = tours.at(-1)?.instant;
	if (dernier) Object.assign(dates, { '/': dernier, [EDITIONS[langue].actes.journal.chemin]: dernier });
	if (langue !== 'fr' || !entrees.length) return dates;
	dates[CHEMIN_DISPARUS] = entrees.map((e) => e.date).sort().at(-1);
	for (const e of entrees) if (!(dates[cheminDuSite(e.site)] >= e.date)) dates[cheminDuSite(e.site)] = e.date;
	return dates;
}

/**
 * Les consignes aux robots d'une edition : tout, sauf l'index des empreintes, et son plan des communes (en francais).
 * Le plan des actes n'y figure pas : la famille `/actes/` nait `noindex` (D-174, `docs/referencement.md`).
 */
export const robots = (langue = 'fr') => `User-agent: *
Allow: /
Disallow: /index/

Sitemap: ${EDITIONS[langue].adresse}/sitemap.xml
${EDITIONS[langue].actes.communes ? `Sitemap: ${EDITIONS[langue].adresse}/sitemap-communes.xml\n` : ''}`;

/** Le service decrit pour les moteurs : gratuit, sans compte, dans la langue de l'edition. */
export const donneesStructurees = (langue = 'fr') => {
	const e = EDITIONS[langue];
	return {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: e.marque,
		url: `${e.adresse}/`,
		description: e.structure.description,
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Web',
		inLanguage: langue,
		isAccessibleForFree: true,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }
	};
};
export const DONNEES_STRUCTUREES = donneesStructurees('fr');

/** Un bloc JSON-LD sur, meme si une chaine contient `</script>`. */
const jsonLd = (objet) => `<script type="application/ld+json">${JSON.stringify(objet).replace(/</g, '\\u003c')}</script>\n`;

/** Echappe un texte pour le HTML. */
export const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const lien = (e, acte, classe = '') => `<a${classe ? ` class="${classe}"` : ''} href="${e.actes[acte].chemin}">${e.actes[acte].nom}</a>`;

/** Un instant ISO en « 12/10/2026 10:13 UTC ». */
export const dateHeure = (iso, langue = 'fr') => EDITIONS[langue].dateHeure(iso);

/** L'ancrage d'un tour, en clair, avec le lien du bloc quand il existe. */
export function ancrageDe(t, langue = 'fr') {
	const a = EDITIONS[langue].ancrage;
	if (t.ots === 'bitcoin' && t.bloc) return `<a href="https://mempool.space/block/${t.bloc}">${a.bitcoin(t.bloc)}</a>`;
	if (t.ots === 'calendrier') return a.calendrier;
	return t.ots ? echapper(t.ots) : a.aucun;
}

const liensDe = (e, t) =>
	t.fichiers.map((f) => `<a href="/empreintes/${echapper(f)}">${e.fichiers[f.slice(t.id.length + 1)] ?? echapper(f)}</a>`).join(' ');

/** Le sceau de la marque, dessine a la main : un cachet et sa coche. */
export const SCEAU = `<svg class="sceau" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#b42318"/><circle cx="16" cy="16" r="11.6" fill="none" stroke="#fff" stroke-width="1.1" stroke-dasharray="1.8 1.5"/><path d="M10.6 16.4l3.7 3.7 7.2-7.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICONE_DOCUMENT = `<svg class="zone-icone" viewBox="0 0 48 48" aria-hidden="true"><path d="M13 5h15l10 10v26a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M28 5v10h10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 35V22m-5.5 5.5L24 22l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** La zone de depot : glisser le document, ou le choisir ; le bouton natif parle la langue du navigateur. */
export const choixDeFichier = (texte, langue = 'fr') => `<input type="file" id="fichier" class="masque">
<label class="zone" for="fichier" id="zone">
${ICONE_DOCUMENT}
<span class="zone-titre">${texte}</span>
<span class="zone-aide"><span class="souris">${EDITIONS[langue].zone.glisser}</span><span class="lien">${EDITIONS[langue].zone.choisir}</span></span>
<span id="nom-fichier" class="zone-nom">${EDITIONS[langue].zone.aucun}</span>
</label>`;

/** Les gestes du menu, le courant marque pour les lecteurs d'ecran ; dater un acte reste dater, une page de commune reste Communes. */
const navigation = (e, chemin) => {
	const communes = e.actes.communes?.chemin;
	let courant = chemin === e.actes.acte?.chemin ? e.actes.dater.chemin : chemin;
	if (communes && chemin.startsWith(`${communes}/`)) courant = communes;
	return ['dater', 'verifier', 'communes', 'journal']
		.filter((a) => e.actes[a])
		.map((a) => `<a href="${e.actes[a].chemin}"${e.actes[a].chemin === courant ? ' aria-current="page"' : ''}>${e.actes[a].nom}</a>`)
		.join(' ');
};

/** Les liens hreflang d'une page qui existe dans chaque edition ; `x-default` sur le francais. */
const alternatives = (chemins) =>
	chemins
		? Object.entries(chemins)
				.concat([['x-default', chemins.fr]])
				.map(([l, c]) => `\n<link rel="alternate" hreflang="${l}" href="${EDITIONS[l === 'x-default' ? 'fr' : l].adresse}${c}">`)
				.join('')
		: '';

function gabarit(e, { titre, description, chemin, corps, script = '', indexer = true, structure = null, chemins = null }) {
	const titreComplet = `${titre} | ${e.marque}`;
	return `<!doctype html>
<html lang="${e.langue}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titreComplet}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${e.adresse}${chemin}">${alternatives(chemins)}${indexer ? '' : '\n<meta name="robots" content="noindex">'}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e.marque}">
<meta property="og:locale" content="${e.locale}">
<meta property="og:title" content="${titreComplet}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${e.adresse}${chemin}">
${structure ? jsonLd(structure) : ''}
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/icone.svg" type="image/svg+xml">
${script}</head>
<body>
<header><div class="barre"><a class="marque" href="/">${SCEAU}<span>${e.marque}</span></a><nav aria-label="${e.navigation}">${navigation(e, chemin)}</nav></div></header>
<main>
${corps}
</main>
<footer><div class="pied">
<p class="pied-marque">${SCEAU}<span>${e.marque}</span></p>
<p class="pied-liens">${lien(e, 'dater')} ${lien(e, 'verifier')} ${lien(e, 'journal')}${e.actes.communes ? ` ${lien(e, 'communes')}` : ''} ${lien(e, 'preuve')} ${lien(e, 'documentation')} ${lien(e, 'mentions')} <a href="${DEPOT}">${e.codeSource}</a></p>
</div></footer>
</body>
</html>
`;
}

/** Les conditions, lues avant tout depot (ETSI EN 319 401, 6.2). */
const accepterConditions = (e) => `<p class="recoit">${e.formulaire.accepter} ${lien(e, 'conditions')}.</p>`;

const champEmpreinte = (e) => `<details>
<summary>${e.empreinte.question}</summary>
<label for="empreinte">${e.empreinte.libelle}</label>
<input type="text" id="empreinte" autocomplete="off" spellcheck="false">
</details>`;

const optionsDeNature = () =>
	Object.entries(NATURES)
		.map(([valeur, nom]) => `<option value="${valeur}">${majuscule(nom)}</option>`)
		.join('');

/** Le bloc qui s'ouvre quand le lien est sur le site officiel d'une commune : il en fait un acte. Francais seulement. */
const blocActe = (e) =>
	e.actes.acte
		? `<div id="acte" class="acte" hidden>
<p class="acte-titre">Un acte de <strong id="acte-commune"></strong>${NBSP}?</p>
<input type="hidden" id="collectivite">
<label for="nature">Nature</label>
<select id="nature"><option value="">Non, un autre document</option>${optionsDeNature()}</select>
<label for="objet">Objet de l’acte</label>
<input type="text" id="objet" maxlength="200" autocomplete="off">
<p class="avertir">À faire le jour de la mise en ligne${NBSP}: le reçu porte le jour où vous cliquez.</p>
</div>
`
		: '';

/**
 * Le formulaire de datation, le meme a l'accueil et sur sa page : un fichier, ou
 * un lien ; un lien sur le site d'une commune propose d'en faire un acte.
 * L'empreinte nue hors de l'accueil.
 */
const formulaireDater = (e, avecEmpreinte = true) => `<form id="formulaire" class="carte">
${choixDeFichier(e.formulaire.deposez, e.langue)}
<p id="deja" class="deja" aria-live="polite" hidden></p>
<p class="ou"><span>${e.formulaire.ou}</span></p>
<label for="url">${e.formulaire.lien}</label>
<input type="text" id="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="${e.formulaire.exemple}">
${blocActe(e)}<details>
<summary>${e.formulaire.nommer}</summary>
<label for="libelle">${e.formulaire.nom}</label>
<input type="text" id="libelle" maxlength="200" autocomplete="off">
</details>
${avecEmpreinte ? champEmpreinte(e) : ''}
<button type="submit" class="principal large-bouton">${e.formulaire.bouton}</button>
<p class="recoit">${e.formulaire.recoit}</p>
${accepterConditions(e)}
</form>
<div id="resultat" aria-live="polite"></div>`;

const etapes = (e) => `<ol class="etapes">
${e.etapes.map(([geste, exemple]) => `<li><strong>${geste}</strong><span>${exemple}</span></li>`).join('\n')}
</ol>`;

/** L'accueil : le geste de dater, tout de suite. */
export function pageAccueil(tours, langue = 'fr') {
	const e = EDITIONS[langue];
	const dernier = tours.at(-1);
	const compte = dernier ? `<p class="compte">${e.accueil.compte(dernier.objets, e.jour(tours[0].instant.slice(0, 10)))}</p>` : '';
	return gabarit(e, {
		titre: e.accueil.titre,
		description: e.accueil.description,
		chemin: '/',
		chemins: cheminsDe('accueil'),
		structure: donneesStructurees(langue),
		script: '<script type="module" src="/deposer.js"></script>\n',
		corps: `<section class="une">
<h1>${e.accueil.h1}</h1>
<p class="chapeau">${e.accueil.chapeau}</p>
</section>
${formulaireDater(e, false)}
<p class="suite">${e.accueil.deja} ${lien(e, 'verifier')}.</p>
${etapes(e)}
${lignePour(e)}${ligneDesOffres(e)}${compte}`
	});
}

/** Le journal public : les chiffres, la derniere racine, chaque tour, et la chaine. */
export function pageJournal(tours, langue = 'fr') {
	const e = EDITIONS[langue];
	const dernier = tours.at(-1);
	const lignes = [...tours]
		.reverse()
		.map(
			(t) =>
				`<tr><td>${e.dateHeure(t.instant)}</td><td class="n">${e.nombre(t.objets)}</td><td class="large"><code title="${t.racine}">${t.racine.slice(0, 16)}</code></td><td>${ancrageDe(t, langue)}</td><td class="large">${liensDe(e, t)}</td></tr>`
		)
		.join('\n');
	const [documents, nTours, depuis] = e.journal.chiffres;
	const tete = dernier
		? `<dl class="chiffres">
<div><dt>${documents}</dt><dd>${e.nombre(dernier.objets)}</dd></div>
<div><dt>${nTours}</dt><dd>${e.nombre(tours.length)}</dd></div>
<div><dt>${depuis}</dt><dd>${e.jour(tours[0].instant.slice(0, 10))}</dd></div>
</dl>
<section class="carte">
<h2>${e.journal.derniereRacine(e.dateHeure(dernier.instant))}</h2>
<p><code class="racine">${dernier.racine}</code></p>
<p>${ancrageDe(dernier, langue)}</p>
<p><button type="button" id="chaine">${e.journal.verifierChaine}</button></p>
<div id="resultat-chaine" aria-live="polite"></div>
</section>`
		: `<p>${e.journal.aucunTour}</p>`;
	const [tour, docs, racine, bitcoin, fichiers] = e.journal.colonnes;
	return gabarit(e, {
		titre: e.actes.journal.titre,
		description: e.journal.description,
		chemin: e.actes.journal.chemin,
		chemins: cheminsDe('journal'),
		script: '<script type="module" src="/verifier.js"></script>\n',
		corps: `<h1>${e.actes.journal.titre}</h1>
<p class="sous-titre">${e.journal.sousTitre}</p>
${tete}
<h2>${e.journal.tours(tours.length)}</h2>
<div class="defile">
<table>
<thead><tr><th>${tour}</th><th class="n">${docs}</th><th class="large">${racine}</th><th>${bitcoin}</th><th class="large">${fichiers}</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>
</div>
<p><a href="${DEPOT}/blob/main/scripts/verifier.mjs">${e.journal.script}</a></p>${langue === 'fr' ? `\n<p><a href="${CHEMIN_DISPARUS}">Documents disparus</a></p>` : ''}`
	});
}

/** Verifier : un document, ou son empreinte. */
export function pageVerifier(langue = 'fr') {
	const e = EDITIONS[langue];
	return gabarit(e, {
		titre: e.actes.verifier.titre,
		description: e.verifier.description,
		chemin: e.actes.verifier.chemin,
		chemins: cheminsDe('verifier'),
		script: '<script type="module" src="/verifier.js"></script>\n',
		corps: `<section class="une une-page"><h1>${e.actes.verifier.titre}</h1></section>
<form id="formulaire" class="carte">
${choixDeFichier(e.verifier.deposez, langue)}
<details>
<summary>${e.verifier.autrement}</summary>
<label for="empreinte">${e.empreinte.libelle}</label>
<input type="text" id="empreinte" autocomplete="off" spellcheck="false">
</details>
<button type="submit" class="principal large-bouton">${e.verifier.bouton}</button>
</form>
<div id="resultat" aria-live="polite"></div>`
	});
}

/** Dater : le fichier par defaut, les deux autres voies repliees. */
export function pageDeposer(langue = 'fr') {
	const e = EDITIONS[langue];
	return gabarit(e, {
		titre: e.actes.dater.titre,
		description: e.deposer.description,
		chemin: e.actes.dater.chemin,
		chemins: cheminsDe('dater'),
		script: '<script type="module" src="/deposer.js"></script>\n',
		corps: `<section class="une une-page"><h1>${e.actes.dater.titre}</h1></section>
${formulaireDater(e)}
<p class="compte">${e.deposer.compte(lien(e, 'preuve'))}</p>`
	});
}

/** La page d'un besoin cherche : son titre, une phrase, et le geste de dater sur la page. */
export function pageBesoin(besoin) {
	const e = EDITIONS.fr;
	return gabarit(e, {
		titre: besoin.titre,
		description: besoin.description,
		chemin: besoin.chemin,
		script: '<script type="module" src="/deposer.js"></script>\n',
		corps: `<section class="une une-page"><h1>${besoin.titre}</h1>
<p class="chapeau">${besoin.chapeau}</p></section>
${besoin.geste === 'lien' ? formulaireDuLien(e) : formulaireDater(e, false)}
<p class="compte">${e.deposer.compte(lien(e, 'preuve'))}</p>`
	});
}

/** Le formulaire d'un besoin qui se date par son adresse : le lien seul, le nom replie. */
const formulaireDuLien = (e) => `<form id="formulaire" class="carte">
<label for="url">Adresse de la page</label>
<input type="text" id="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" required>
<details>
<summary>${e.formulaire.nommer}</summary>
<label for="libelle">${e.formulaire.nom}</label>
<input type="text" id="libelle" maxlength="200" autocomplete="off">
</details>
<button type="submit" class="principal large-bouton">Dater cette page</button>
<p class="recoit">Vous recevez un reçu et la copie de la page lue, à garder ensemble. Ils attestent que cette page était en ligne à cette adresse à cet instant.</p>
</form>
<div id="resultat" aria-live="polite"></div>`;

/** Les besoins, pour l'accueil : chacun lie a sa page. Francais seulement. */
const lignePour = (e) => (e.actes.acte ? `<p class="suite">Pour ${BESOINS.map((b) => `<a href="${b.chemin}">${b.nom}</a>`).join(', ')}.</p>\n` : '');

/** Les offres pas encore ouvertes, pour l'accueil : chacune liee a sa page. Francais seulement. */
const ligneDesOffres = (e) => {
	if (!e.actes.acte || !OFFRES_DE_L_ACCUEIL.length) return '';
	const liens = OFFRES_DE_L_ACCUEIL.map((o) => `<a href="${o.chemin}">${o.nom}</a>`);
	return `<p class="suite">Des offres ouvriront bientôt, pour ${liens.slice(0, -1).join(', ')} et ${liens.at(-1)}.</p>\n`;
};

/** Dater un acte de collectivite : l'adresse ou il est publie, la collectivite, la nature. */
export function pageActe() {
	const e = EDITIONS.fr;
	return gabarit(e, {
		titre: ACTES.acte.titre,
		description: "Dater la mise en ligne d'un acte d'une collectivité, délibération, arrêté ou décision : le service lit l'acte à son adresse et délivre un reçu.",
		chemin: ACTES.acte.chemin,
		script: '<script type="module" src="/deposer.js"></script>\n',
		corps: `<section class="une une-page"><h1>${ACTES.acte.titre}</h1></section>
<form id="formulaire" class="carte">
<label for="url">Lien du fichier de l’acte (le PDF)</label>
<input type="text" id="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" required>
<label for="collectivite">Code INSEE de la commune, ou SIREN de la collectivité</label>
<input type="text" id="collectivite" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="11" required>
<label for="nature">Nature</label>
<select id="nature">${optionsDeNature()}</select>
<label for="objet">Objet de l’acte</label>
<input type="text" id="objet" maxlength="200" autocomplete="off" required>
<p class="avertir">À faire le jour de la mise en ligne${NBSP}: le reçu porte le jour où vous cliquez.</p>
<button type="submit" class="principal large-bouton">Dater cet acte</button>
<p class="recoit">Vous recevez un reçu à imprimer ou à télécharger. Il atteste que ce fichier était en ligne à cette adresse à cet instant.</p>
${accepterConditions(e)}
</form>
<div id="resultat" aria-live="polite"></div>
<p class="compte">Gratuit, sans compte, jusqu’à 20 actes par jour.</p>`
	});
}

const jourFr = EDITIONS.fr.jour;
const nombre = EDITIONS.fr.nombre;

const majuscule = (t) => `${t[0].toUpperCase()}${t.slice(1)}`;
const marqueDuPluriel = (n) => (n > 1 ? 's' : '');

/** Le titre d'une serie : le compte et la nature. */
const titreDeSerie = (n) => (n ? `${nombre(n)} acte${marqueDuPluriel(n)} daté${marqueDuPluriel(n)}` : 'Aucun acte daté');

/** La ligne qui dit qu'une serie est coupee, vide sinon. */
const coupe = (serie) => (serie.total > serie.actes.length ? `<p class="compte">Les ${nombre(serie.actes.length)} plus récents sur ${nombre(serie.total)}.</p>` : '');

/** L'objet d'un acte, lie a l'acte en ligne quand son adresse est connue. */
const objetDe = (a, sansObjet = 'Sans objet') => {
	const objet = a.objet ? echapper(a.objet) : sansObjet;
	return a.url ? `<a href="${echapper(a.url)}">${objet}</a>` : objet;
};

const lienDuDepartement = (code) => `<a href="/collectivite/departement/${code}">${nomDuDepartement(code)}</a>`;

/** La serie d'une collectivite : ses actes lus sur son site officiel, chacun avec son reçu. */
export function pageCollectivite({ code, commune, serie, departement = null }) {
	const nom = commune ? echapper(commune.nom) : `Collectivité ${code}`;
	const codes = `${commune?.siren ? `Code INSEE ${code}, SIREN ${commune.siren}` : `Code ${code}`}${departement ? `, ${lienDuDepartement(departement)}` : ''}`;
	const lignes = serie.actes
		.map(
			(a) =>
				`<tr><td>${jourFr(a.jour)}</td><td>${majuscule(NATURES[a.nature] ?? a.nature)}</td><td>${objetDe(a)}</td><td><a href="${cheminDeLActe({ collectivite: code, ...a })}">Preuve</a></td></tr>`
		)
		.join('\n');
	const tableau = serie.actes.length
		? `<table>
<thead><tr><th>En ligne le</th><th>Nature</th><th>Objet</th><th>Preuve</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>
${coupe(serie)}`
		: '';
	return gabarit(EDITIONS.fr, {
		titre: `${nom}, actes datés`,
		description: `Actes de ${nom} datés à leur adresse sur le site officiel de la commune${NBSP}: date de mise en ligne, nature, objet, reçu.`,
		chemin: `/collectivite/${code}`,
		indexer: serie.total > 0,
		corps: `<h1>${nom}</h1>
<p class="sous-titre">${codes}</p>
<h2>${titreDeSerie(serie.total)}</h2>
${tableau}
<p class="compte">${serie.depuis ? `Actes datés ici depuis le ${jourFr(serie.depuis)}, lus` : 'Actes lus'} sur le site officiel de la commune. ${lien(EDITIONS.fr, 'preuve')}</p>
<p class="appel">Cette page est celle de votre commune${NBSP}? Datez vos actes le jour de leur mise en ligne.</p>
<p><a class="bouton principal" href="${ACTES.acte.chemin}">${ACTES.acte.titre}</a></p>
<p class="recoit">Vos actes pourront se dater seuls, depuis votre outil de publication${NBSP}: <a href="${CHEMIN_OFFRE_COMMUNES}">être prévenu à l’ouverture</a>.</p>`
	});
}

const communeAbsente = `<p class="appel">Votre commune n’y figure pas${NBSP}? Datez la mise en ligne d’un de ses actes.</p>
<p><a class="bouton principal" href="${ACTES.acte.chemin}">${ACTES.acte.titre}</a></p>`;

const communesEtActes = (communes, actes) => `${nombre(communes)} commune${marqueDuPluriel(communes)}, ${nombre(actes)} acte${marqueDuPluriel(actes)} daté${marqueDuPluriel(actes)}`;

/** L'index des communes : chaque departement qui en porte au moins une, avec ses comptes. */
export function pageCommunes({ departements }) {
	const communes = departements.reduce((n, d) => n + d.communes, 0);
	const actes = departements.reduce((n, d) => n + d.actes, 0);
	const lignes = departements
		.map((d) => `<tr><td>${lienDuDepartement(d.code)}</td><td>${d.code}</td><td>${nombre(d.communes)}</td><td>${nombre(d.actes)}</td></tr>`)
		.join('\n');
	return gabarit(EDITIONS.fr, {
		titre: ACTES.communes.titre,
		description: `Les communes dont les actes sont datés à leur mise en ligne${NBSP}: ${communesEtActes(communes, actes)}, par département.`,
		chemin: ACTES.communes.chemin,
		indexer: communes > 0,
		corps: `<h1>${ACTES.communes.titre}</h1>
<h2>${communes ? communesEtActes(communes, actes) : 'Aucune commune'}</h2>
${
	communes
		? `<table>
<thead><tr><th>Département</th><th>Code</th><th>Communes</th><th>Actes</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>`
		: ''
}
${communeAbsente}`
	});
}

/** Les communes d'un departement qui ont un acte date, chacune avec son compte. */
export function pageDepartement({ code, nom, communes }) {
	const actes = communes.reduce((n, c) => n + c.actes, 0);
	const lignes = communes
		.map((c) => `<tr><td><a href="/collectivite/${c.insee}">${c.nom ? echapper(c.nom) : `Commune ${c.insee}`}</a></td><td>${c.insee}</td><td>${nombre(c.actes)}</td></tr>`)
		.join('\n');
	return gabarit(EDITIONS.fr, {
		titre: `${nom}, actes des communes`,
		description: `Actes des communes de ${nom} datés à leur mise en ligne${NBSP}: ${communesEtActes(communes.length, actes)}.`,
		chemin: `/collectivite/departement/${code}`,
		indexer: communes.length > 0,
		corps: `<h1>${nom}</h1>
<p class="sous-titre">Département ${code}</p>
<h2>${communes.length ? communesEtActes(communes.length, actes) : 'Aucune commune'}</h2>
${
	communes.length
		? `<table>
<thead><tr><th>Commune</th><th>Code INSEE</th><th>Actes</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>`
		: ''
}
${communeAbsente}`
	});
}

/** Les lignes propres a un acte rattache, dans son reçu. */
const lignesDActe = (e, acte, ligne) => {
	if (!acte) return '';
	const adresse = `${EDITIONS.fr.adresse}${cheminDeLActe({ ...acte, jour: ligne.jour, sha256: ligne.sha256 })}`;
	return `<div><dt>${e.recu.acte}</dt><dd>${e.recu.natures[acte.nature] ?? acte.nature}, ${objetDe(acte, e.recu.sansObjet)}</dd></div>
<div><dt>${e.recu.collectivite}</dt><dd><a href="${e.recu.adresseCollectivite(echapper(acte.collectivite))}">${echapper(acte.collectivite)}</a></dd></div>
<div><dt>${e.recu.adresseActe}</dt><dd><a href="${adresse}">${adresse}</a></dd></div>
`;
};

/** Les lignes propres au recu d'un produit de la flotte (D-167) : le produit, et l'adresse du recu qu'il sert. */
const lignesDeProduit = (e, produit) => {
	if (!produit) return '';
	const url = echapper(produit.url);
	return `<div><dt>${e.recu.produit}</dt><dd>${echapper(produit.nom)}</dd></div>
<div><dt>${e.recu.recuDuProduit}</dt><dd><a href="${url}">${url}</a></dd></div>
`;
};

/**
 * Le recu d'un depot, a son adresse : ce que la ligne publique engage, et son
 * inscription au registre. `acte` pour un acte rattache, `produit` pour le recu
 * d'un produit de la flotte.
 */
export function pageRecu(ligne, acte = null, langue = 'fr', produit = null) {
	const e = EDITIONS[langue];
	const jour = e.jour(ligne.jour);
	const chemin = `/recu/${ligne.recu}`;
	return gabarit(e, {
		titre: e.recu.titre(jour),
		description: e.recu.description(acte, jour, ligne.place),
		chemin,
		chemins: { fr: chemin, de: chemin },
		script: '<script type="module" src="/recu.js"></script>\n',
		corps: `<h1>${e.recu.h1}</h1>
<article class="ok recu" id="recu" data-recu="${ligne.recu}">
<h2>${acte ? e.recu.enLigne(jour) : e.recu.date(jour)}</h2>
<dl>
${lignesDActe(e, acte, ligne)}${lignesDeProduit(e, produit)}<div><dt>${e.recu.empreinte}</dt><dd><code class="racine">${ligne.sha256}</code></dd></div>
<div><dt>${e.recu.ligne}</dt><dd><a href="/depots/${ligne.jour}.jsonl">${e.recu.place(ligne.place, jour)}</a></dd></div>
<div><dt>${e.recu.registre}</dt><dd id="inscription">${e.recu.lecture}</dd></div>
</dl>
<p class="imprime">${e.hote}${chemin}</p>
</article>
<p class="gestes"><button type="button" id="imprimer" class="principal">${e.recu.imprimer}</button> ${lien(e, 'verifier', 'bouton')}</p>`
	});
}

/** Le nom d'une collectivite sur une page d'acte : celui de sa fiche, son code sinon. */
const nomDeCollectivite = (code, commune) => (commune ? echapper(commune.nom) : `Collectivité ${code}`);

/** Les donnees structurees d'un acte a son adresse : `Legislation`, identifie par l'adresse elle-meme. */
const structureDeLActe = (acte, adresse, commune) => ({
	'@context': 'https://schema.org',
	'@type': 'Legislation',
	legislationIdentifier: adresse,
	url: adresse,
	legislationType: majuscule(NATURES[acte.nature]),
	...(acte.objet ? { name: acte.objet } : {}),
	legislationJurisdiction: { '@type': 'AdministrativeArea', name: commune?.nom ?? acte.collectivite, identifier: commune?.insee ?? acte.collectivite }
});

/** Les versions vues a la meme source, la page courante marquee. */
function tableDesVersions(acte, versions) {
	if (versions.length === 0) return '';
	const lignes = versions
		.map((v) => {
			const chemin = cheminDeLActe(v);
			const courante = v.recu === acte.recu;
			return `<tr><td>${jourFr(v.jour)}</td><td><code>${v.sha256.slice(0, 12)}</code></td><td>${courante ? 'Cette page' : `<a href="${chemin}">${chemin}</a>`}</td></tr>`;
		})
		.join('\n');
	return `<h2>${nombre(versions.length)} version${marqueDuPluriel(versions.length)} à cette source</h2>
<table>
<thead><tr><th>Datée le</th><th>Empreinte</th><th>Adresse</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>`;
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const OU_LUE = { libelle: 'dans le libellé', fichier: 'dans le nom du fichier' };

/** La date lue d'un acte, affichee comme lue : ou elle a ete lue, au jour ou au mois. */
function ligneDeLaDateLue(date) {
	if (!date) return '';
	const [an, mois] = date.date.split('-');
	const texte = date.precision === 'jour' ? jourFr(date.date) : `${MOIS_FR[Number(mois) - 1]} ${an}`;
	return `<div><dt>Date lue</dt><dd><time datetime="${date.date}">${texte}</time>, ${OU_LUE[date.dans]}</dd></div>\n`;
}

/** L'etat de la source : remplacee par une version plus recente, sinon ce que la glane y a vu a son dernier passage, et sa relecture. */
function ligneDeLaSource(acte, versions, passage, relecture) {
	const derniere = versions.at(-1);
	if (derniere && derniere.recu !== acte.recu) return `<div><dt>À la source</dt><dd>Nouvelle version datée le <a href="${cheminDeLActe(derniere)}">${jourFr(derniere.jour)}</a></dd></div>\n`;
	const vu = passage ? `<div><dt>À la source</dt><dd>${passage.etat === 'vue' ? 'Lien publié' : 'Lien non retrouvé'} au passage du ${jourFr(passage.jour)}</dd></div>\n` : '';
	return `${vu}${ligneDeLaRelecture(relecture)}`;
}

/** La derniere relecture de la source (D-193) : les memes octets, ou une adresse qui ne sert plus le document depuis tel jour. */
function ligneDeLaRelecture(relecture) {
	if (!relecture) return '';
	if (relecture.statut === 200) return `<div><dt>Relecture</dt><dd>Même document relu à la source le ${jourFr(relecture.jour)}</dd></div>\n`;
	const encore = relecture.jour === relecture.depuis ? '' : `, relue le ${jourFr(relecture.jour)}`;
	return `<div><dt>Relecture</dt><dd>L’adresse ne sert plus le document${NBSP}: réponse ${relecture.statut} depuis le ${jourFr(relecture.depuis)}${encore}</dd></div>\n`;
}

/**
 * La page d'un acte a son adresse perenne (D-205) : la preuve, la date lue, la
 * source et son etat au dernier passage de la glane, les versions vues a la
 * meme source. `acte.objet` et `acte.url` arrivent deja gardes (null quand ils
 * pourraient nommer une personne). La page nait `noindex` (D-174) : l'adresse
 * se cite, elle ne se cherche pas.
 */
export function pageAdresse({ acte, commune = null, versions = [], passage = null, relecture = null, date = null }) {
	const e = EDITIONS.fr;
	const chemin = cheminDeLActe(acte);
	const adresse = `${e.adresse}${chemin}`;
	const nature = majuscule(NATURES[acte.nature]);
	const nom = nomDeCollectivite(acte.collectivite, commune);
	const jour = jourFr(acte.jour);
	const source = acte.url ? `<div><dt>Source</dt><dd><a href="${echapper(acte.url)}">${echapper(acte.url)}</a></dd></div>\n` : '';
	return gabarit(e, {
		titre: `${nature} en ligne le ${jour}, ${nom}`,
		description: `${nature} de ${nom}, en ligne le ${jour}${NBSP}: empreinte SHA-256, entrée du registre public, adresse de la source.`,
		chemin,
		indexer: false,
		structure: structureDeLActe(acte, adresse, commune),
		script: '<script type="module" src="/recu.js"></script>\n',
		corps: `<h1>${nature}, ${nom}</h1>
<p class="sous-titre">${acte.objet ? echapper(acte.objet) : e.recu.sansObjet}</p>
<article class="ok recu" id="recu" data-recu="${acte.recu}">
<h2>${e.recu.enLigne(jour)}</h2>
<dl>
<div><dt>${e.recu.empreinte}</dt><dd><code class="racine">${acte.sha256}</code></dd></div>
<div><dt>${e.recu.ligne}</dt><dd><a href="/depots/${acte.jour}.jsonl">${e.recu.place(acte.place, jour)}</a></dd></div>
<div><dt>${e.recu.registre}</dt><dd id="inscription">${e.recu.lecture}</dd></div>
<div><dt>Reçu</dt><dd><a href="/recu/${acte.recu}">${acte.recu.slice(0, 12)}</a></dd></div>
<div><dt>${e.recu.collectivite}</dt><dd><a href="/collectivite/${commune?.insee ?? acte.collectivite}">${nom}</a></dd></div>
${ligneDeLaDateLue(date)}${source}${ligneDeLaSource(acte, versions, passage, relecture)}</dl>
<p class="imprime">${e.hote}${chemin}</p>
</article>
${tableDesVersions(acte, versions)}`
	});
}

/** Un prefixe d'empreinte qui designe plusieurs actes : la liste de leurs adresses. */
export function pageAdresses(actes) {
	const lignes = actes.map((a) => `<li><a href="${cheminDeLActe(a)}">${cheminDeLActe(a)}</a></li>`).join('\n');
	return gabarit(EDITIONS.fr, {
		titre: `${nombre(actes.length)} actes à cette adresse`,
		description: `${nombre(actes.length)} actes datés le même jour dont l’empreinte commence de même.`,
		chemin: '/actes/',
		indexer: false,
		corps: `<h1>${nombre(actes.length)} actes à cette adresse</h1>
<ul>
${lignes}
</ul>`
	});
}

/** Le registre public d'un editeur : chaque version datee de ses articles, sans adresse ni titre. */
export function pageEditeur({ flux, total, versions }, langue = 'fr') {
	const e = EDITIONS[langue];
	const parArticle = new Map();
	for (const v of versions) parArticle.set(v.article, (parArticle.get(v.article) ?? 0) + 1);
	const lignes = versions
		.map(
			(v) =>
				`<tr><td><code>${v.article.slice(0, 12)}</code></td><td class="n">${parArticle.get(v.article)}</td><td><a href="/recu/${v.recu}">${e.jour(v.jour)}</a></td><td class="n">${v.place}</td><td class="large"><code title="${v.sha256}">${v.sha256.slice(0, 16)}</code></td></tr>`
		)
		.join('\n');
	const [article, nVersions, datee, ligne, empreinte] = e.editeur.colonnes;
	const tableau = versions.length
		? `<table>
<thead><tr><th>${article}</th><th class="n">${nVersions}</th><th>${datee}</th><th class="n">${ligne}</th><th class="large">${empreinte}</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>
${total > versions.length ? `<p class="compte">${e.editeur.coupe(versions.length, total)}</p>` : ''}`
		: '';
	const inscrit = e.jour(flux.inscrit.slice(0, 10));
	const etat = flux.retire ? e.editeur.suiviDuAu(inscrit, e.jour(flux.retire.slice(0, 10))) : e.editeur.suiviDepuis(inscrit);
	const chemin = `/editeur/${flux.id}`;
	return gabarit(e, {
		titre: e.editeur.titre(flux.id),
		description: e.editeur.description(flux.id),
		chemin,
		chemins: { fr: chemin, de: chemin },
		indexer: total > 0,
		script: '<script type="module" src="/editeur.js"></script>\n',
		corps: `<h1>${e.editeur.h1}</h1>
<p class="sous-titre">${e.editeur.flux(flux.id, etat)}</p>
<h2>${total ? e.editeur.compte(parArticle.size, total) : e.editeur.aucune}</h2>
${tableau}
<section id="prive" data-flux="${flux.id}" hidden></section>`
	});
}

/** Une adresse de recu qui ne nomme aucun depot. */
export function pageRecuInconnu(langue = 'fr') {
	const e = EDITIONS[langue];
	return gabarit(e, {
		titre: e.recuInconnu.titre,
		description: e.recuInconnu.description,
		chemin: '/recu/',
		corps: `<h1>${e.recuInconnu.titre}</h1>
<p>${lien(e, 'verifier', 'bouton')}</p>`
	});
}

/** Toute adresse sans page : un vrai 404, jamais l'accueil servi a la place d'un fichier absent. */
export function pageIntrouvable(langue = 'fr') {
	const e = EDITIONS[langue];
	return gabarit(e, {
		titre: e.introuvable.titre,
		description: e.introuvable.description,
		chemin: '/404',
		corps: `<h1>${e.introuvable.titre}</h1>
<p>${lien(e, 'dater', 'bouton principal')} ${lien(e, 'verifier', 'bouton')}</p>`
	});
}

const tableDoc = (titre, lignes) => `<h2>${titre}</h2>
<table class="doc">
<tbody>
${lignes.map(([gauche, droite]) => `<tr><td><code>${gauche}</code></td><td>${droite}</td></tr>`).join('\n')}
</tbody>
</table>`;

/** Les adresses qu'une edition explique, avec leur explication. */
const lignesDAdresses = (adresses, textes) => adresses.filter(([cle]) => textes[cle]).map(([cle, adresse]) => [adresse, textes[cle]]);

/** Chaque formule derriere son nom, suivie de ce que l'edition en dit. */
const lignesDeFormules = (textes) => Object.entries(FORMULES).map(([cle, formule]) => [textes[cle][0], `${formule}${textes[cle][1] ?? ''}`]);

/** La documentation : les adresses, les limites et les formules, pour verifier sans ce site. */
export function pageDocumentation(langue = 'fr') {
	const e = EDITIONS[langue];
	const [dater, agents, lire, verifier, textes, textesArchivage] = e.documentation.titres;
	return gabarit(e, {
		titre: e.actes.documentation.titre,
		description: e.documentation.description,
		chemin: e.actes.documentation.chemin,
		chemins: cheminsDe('documentation'),
		corps: `<h1>${e.actes.documentation.titre}</h1>
${tableDoc(dater, lignesDAdresses(ADRESSES.dater, e.documentation.dater))}
${tableDoc(agents, lignesDAdresses(ADRESSES.agents, e.documentation.agents))}
${tableDoc(lire, lignesDAdresses(ADRESSES.lire, e.documentation.lire))}
${tableDoc(verifier, lignesDeFormules(e.documentation.verifier))}
<h2>${textes}</h2>
${elements(TEXTES_DU_REGISTRE.map((acte) => lien(e, acte)))}
<h2>${textesArchivage}</h2>
${elements(TEXTES_DE_L_ARCHIVAGE.map((acte) => lien(e, acte)))}`
	});
}

/** Les textes de reference du registre, chacun sur sa page. */
export const TEXTES_DU_REGISTRE = ['pratiques', 'conditions', 'roles'];

/** Les textes de reference du service d'archivage (l'entrepot), chacun sur sa page. */
export const TEXTES_DE_L_ARCHIVAGE = ['archivage', 'conditionsArchivage'];

/** La version en vigueur des textes du registre ; une version nouvelle ne remplace jamais un texte en place. */
export const VERSION_DES_TEXTES = { numero: 1, jour: '2026-10-14' };

/** La version en vigueur des textes de l'archivage, publies apres ceux du registre. */
export const VERSION_DES_TEXTES_D_ARCHIVAGE = { numero: 1, jour: '2026-10-15' };

/** Le debut d'une page de texte : son titre et sa version. */
const enTeteDeTexte = (e, acte) => {
	const v = TEXTES_DE_L_ARCHIVAGE.includes(acte) ? VERSION_DES_TEXTES_D_ARCHIVAGE : VERSION_DES_TEXTES;
	return `<h1>${e.actes[acte].titre}</h1>
<p class="sous-titre">${e.version(v.numero, e.jour(v.jour))}</p>`;
};

const pageDeTexte = (e, acte, corps) =>
	gabarit(e, { titre: e.actes[acte].titre, description: e[acte].description, chemin: e.actes[acte].chemin, chemins: cheminsDe(acte), corps: `${enTeteDeTexte(e, acte)}\n${corps}` });

/** Une page de texte faite de sections : un titre, un paragraphe ; un paragraphe peut citer une autre page. */
export function pageSections(acte, langue = 'fr') {
	const e = EDITIONS[langue];
	const liens = { documentation: lien(e, 'documentation'), mentions: lien(e, 'mentions'), roles: lien(e, 'roles') };
	return pageDeTexte(e, acte, e[acte].sections.map(([titre, texte]) => `<h2>${titre}</h2>\n<p>${typeof texte === 'function' ? texte(liens) : texte}</p>`).join('\n'));
}

/** Les roles de confiance : chacun, ce qu'il fait, son garde-fou, qui les tient, et les formations. */
export function pageRoles(langue = 'fr') {
	const e = EDITIONS[langue];
	const [role, fait, garde] = e.roles.colonnes;
	const lignes = e.roles.liste.map(([nom, mission, gardeFou]) => `<tr><td><strong>${nom}</strong></td><td>${mission}</td><td>${gardeFou}</td></tr>`).join('\n');
	return pageDeTexte(
		e,
		'roles',
		`<table>
<thead><tr><th>${role}</th><th>${fait}</th><th>${garde}</th></tr></thead>
<tbody>
${lignes}
</tbody>
</table>
<p>${e.roles.titulaire(lien(e, 'mentions'), e.jour('2026-10-11'))}</p>
<h2>${e.roles.formations}</h2>`
	);
}

/** Les copies du registre hors de ce site. */
export const COPIES = [
	{ nom: 'Dépôt Git public', adresse: DEPOT },
	{ nom: 'Software Heritage', adresse: `https://archive.softwareheritage.org/browse/origin/?origin_url=${DEPOT}` },
	{ nom: 'Bitcoin, par OpenTimestamps', adresse: 'https://opentimestamps.org' }
];

/** Le premier jour d'un horodatage qualifie, null tant qu'aucun tour n'en porte. */
export function premierHorodatageQualifie(tours, langue = 'fr') {
	const tour = tours.find((t) => t.fichiers.some((f) => f.endsWith('.racine.tsr')));
	return tour ? EDITIONS[langue].jour(tour.instant.slice(0, 10)) : null;
}

/** Le premier jour d'une signature post-quantique des racines (D-201), null tant qu'aucun tour n'en porte. */
export function premiereSignaturePostQuantique(tours, langue = 'fr') {
	const tour = tours.find((t) => t.fichiers.some((f) => f.endsWith('.racine.slh')));
	return tour ? EDITIONS[langue].jour(tour.instant.slice(0, 10)) : null;
}

const elements = (lignes) => `<ul>\n${lignes.map((l) => `<li>${l}</li>`).join('\n')}\n</ul>`;

/** Ce qu'un recu prouve, ce qu'il ne prouve pas, les textes, et ce qui reste si le site disparait. */
export function pagePreuve(tours, copies = COPIES, langue = 'fr') {
	const e = EDITIONS[langue];
	const qualifie = premierHorodatageQualifie(tours, langue);
	const postQuantique = premiereSignaturePostQuantique(tours, langue);
	return gabarit(e, {
		titre: e.actes.preuve.titre,
		description: e.preuve.description,
		chemin: e.actes.preuve.chemin,
		chemins: cheminsDe('preuve'),
		corps: `<h1>${e.actes.preuve.titre}</h1>
<h2>${e.preuve.prouve}</h2>
${elements([e.preuve.existait, e.preuve.lien, qualifie ? e.preuve.ancrageQualifie(qualifie) : e.preuve.ancrage])}
<h2>${e.preuve.neProuvePas}</h2>
${elements(e.preuve.limites)}
<h2>${e.preuve.textes}</h2>
${elements(e.preuve.lois)}
<h2>${e.preuve.dureeTitre}</h2>
${elements([...(postQuantique ? [e.preuve.signeePq(postQuantique, lien(e, 'verifier'))] : []), e.preuve.chaineDuree, e.preuve.bitcoinDuree])}
<h2>${e.preuve.disparait}</h2>
<p>${e.preuve.suffisent(lien(e, 'documentation'))}</p>
${elements(copies.map((c, i) => `<a href="${c.adresse}">${e.preuve.copies[i] ?? c.nom}</a>`))}
<p><code>node scripts/verifier.mjs &lt;document&gt;</code> ${e.preuve.et} <code>ots verify &lt;tour&gt;.racine.ots</code></p>`
	});
}

/** Les mentions legales, ou l'Impressum : l'editeur, l'hebergeur, et ce que le service garde. */
export function pageMentions(langue = 'fr') {
	const e = EDITIONS[langue];
	return gabarit(e, {
		titre: e.actes.mentions.titre,
		description: e.mentions.description(e.marque),
		chemin: e.actes.mentions.chemin,
		corps: `<h1>${e.actes.mentions.titre}</h1>
${e.mentions.sections.map(([titre, texte]) => `<h2>${titre}</h2>\n<p>${texte}</p>`).join('\n')}
<h2>${e.mentions.code}</h2>
<p><a href="${DEPOT}">${DEPOT.replace('https://', '')}</a></p>`
	});
}

/* ------------------------------------------------------------ ce qui a disparu (D-193) */

/** Le nom d'un evenement : un document sorti de sa liste n'est jamais dit supprime. */
export const EVENEMENTS = { disparu: 'Disparu', remplace: 'Remplacé à la même adresse', retire: 'Sorti de la liste' };

export const CHEMIN_DISPARUS = '/disparus';
export const FLUX_DISPARUS = '/disparus.xml';
/** L'adresse de la page d'un site : son hote, les points en tirets (un `.com` final se lirait comme une extension). */
export const cheminDuSite = (site) => `${CHEMIN_DISPARUS}/${site.replaceAll('.', '-')}`;

/** Le dernier segment de l'adresse, decode, pour la lire dans une cellule. */
export function nomDuDocument(url) {
	const segment = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? url;
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

const lienDePreuve = (sha256) => `/verifier?empreinte=${sha256}`;

const ligneDisparu = (d, avecSite) =>
	`<tr><td>${jourFr(d.date)}</td><td>${EVENEMENTS[d.classe]}</td>${avecSite ? `<td><a href="${cheminDuSite(d.site)}">${echapper(d.site)}</a></td>` : ''}<td><a href="${echapper(d.url)}">${echapper(nomDuDocument(d.url))}</a></td><td class="n">${d.http ?? ''}</td><td><a href="${lienDePreuve(d.avant.sha256)}">${d.avant.jour ? `Version du ${jourFr(d.avant.jour)}` : 'Version d’avant'}</a></td></tr>`;

const tableDesDisparus = (entrees, avecSite) => `<div class="defile">
<table>
<thead><tr><th>Vu le</th><th>Événement</th>${avecSite ? '<th>Site</th>' : ''}<th>Document</th><th class="n">HTTP</th><th>Preuve</th></tr></thead>
<tbody>
${entrees.map((d) => ligneDisparu(d, avecSite)).join('\n')}
</tbody>
</table>
</div>`;

const titreDesDisparus = (n) => (n ? `${nombre(n)} document${marqueDuPluriel(n)}` : 'Aucun document');
const lienDuFlux = `<link rel="alternate" type="application/rss+xml" title="Documents disparus" href="${FLUX_DISPARUS}">\n`;
const PLAFOND_DISPARUS = 100;

/** Les documents disparus, remplaces ou sortis de leur liste : les sites, puis les plus recents. */
export function pageDisparus({ entrees, sites }) {
	const lignesSites = sites.map((s) => `<tr><td><a href="${cheminDuSite(s.site)}">${echapper(s.site)}</a></td><td class="n">${nombre(s.n)}</td></tr>`).join('\n');
	const recents = entrees.slice(0, PLAFOND_DISPARUS);
	return gabarit(EDITIONS.fr, {
		titre: 'Documents disparus',
		description: `Documents disparus, remplacés ou sortis de leur liste sur ${nombre(sites.length)} site${marqueDuPluriel(sites.length)} surveillé${marqueDuPluriel(sites.length)}${NBSP}: date, adresse, code HTTP, preuve de la version d’avant.`,
		chemin: CHEMIN_DISPARUS,
		indexer: entrees.length > 0,
		script: lienDuFlux,
		corps: `<h1>Documents disparus</h1>
<h2>${entrees.length ? `${titreDesDisparus(entrees.length)}, ${nombre(sites.length)} site${marqueDuPluriel(sites.length)}` : 'Aucun document disparu'}</h2>
${
	sites.length
		? `<table>
<thead><tr><th>Site</th><th class="n">Documents</th></tr></thead>
<tbody>
${lignesSites}
</tbody>
</table>
<h2>Les plus récents</h2>
${tableDesDisparus(recents, true)}
${entrees.length > recents.length ? `<p class="compte">Les ${nombre(recents.length)} plus récents sur ${nombre(entrees.length)}.</p>` : ''}`
		: ''
}
${MARQUE_DES_ACTES}
<p><a href="${FLUX_DISPARUS}">Flux RSS</a></p>`
	});
}

/** La place des actes des communes dans `/disparus` : la Function la remplit depuis la base. */
export const MARQUE_DES_ACTES = '<!-- actes-des-communes -->';

const ligneDActe = (d, nomDe) =>
	`<tr><td>${jourFr(d.date)}</td><td>${EVENEMENTS[d.classe]}</td><td><a href="/collectivite/${d.collectivite}">${echapper(nomDe(d.collectivite) ?? d.collectivite)}</a></td><td><a href="${echapper(d.url)}">${echapper(d.objet ?? nomDuDocument(d.url))}</a></td><td class="n">${d.http ?? ''}</td><td><a href="${d.preuve}">Version du ${jourFr(d.avant.jour)}</a></td></tr>`;

/** La section des actes des communes disparus ou remplaces ; vide sans entree. `nomDe(code)` rend le nom de la commune ou null. */
export function sectionDesActes({ entrees, nomDe = () => null }) {
	if (!entrees.length) return '';
	return `<h2>${nombre(entrees.length)} acte${marqueDuPluriel(entrees.length)} de commune${marqueDuPluriel(entrees.length)}</h2>
<div class="defile">
<table>
<thead><tr><th>Vu le</th><th>Événement</th><th>Commune</th><th>Acte</th><th class="n">HTTP</th><th>Preuve</th></tr></thead>
<tbody>
${entrees.map((d) => ligneDActe(d, nomDe)).join('\n')}
</tbody>
</table>
</div>`;
}

/** La page `/disparus` publiee, la section des actes a sa place. */
export const avecLesActes = (html, section) => html.replace(MARQUE_DES_ACTES, section);

/** Les documents d'un site. */
export function pageDisparusDuSite({ site, entrees }) {
	return gabarit(EDITIONS.fr, {
		titre: `${site}, documents disparus`,
		description: `Documents de ${site} disparus, remplacés ou sortis de leur liste${NBSP}: date, adresse, code HTTP, preuve de la version d’avant.`,
		chemin: cheminDuSite(site),
		script: lienDuFlux,
		corps: `<h1>${echapper(site)}</h1>
<h2>${titreDesDisparus(entrees.length)}</h2>
${tableDesDisparus(entrees, false)}
<p><a href="${CHEMIN_DISPARUS}">Tous les sites</a> <a href="${FLUX_DISPARUS}">Flux RSS</a></p>`
	});
}

const xml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const dateRss = (jour) => new Date(`${jour}T00:00:00Z`).toUTCString();

/** Le flux RSS 2.0 des entrees, les plus recentes d'abord. */
export function fluxDisparus(entrees) {
	const e = EDITIONS.fr;
	const items = entrees
		.slice(0, PLAFOND_DISPARUS)
		.map(
			(d) => `<item>
<title>${xml(`${EVENEMENTS[d.classe]}, ${d.site}, ${nomDuDocument(d.url)}`)}</title>
<link>${xml(`${e.adresse}${lienDePreuve(d.avant.sha256)}`)}</link>
<guid isPermaLink="false">${xml(`${d.classe}:${d.avant.sha256}:${d.url}`)}</guid>
<pubDate>${dateRss(d.date)}</pubDate>
<description>${xml(`${d.url}${d.http ? `, HTTP ${d.http}` : ''}, version d’avant ${d.avant.sha256}`)}</description>
</item>`
		)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${xml(`Documents disparus, ${e.marque}`)}</title>
<link>${e.adresse}${CHEMIN_DISPARUS}</link>
<description>Documents disparus, remplacés ou sortis de leur liste sur les sites surveillés.</description>
<language>fr</language>
${MARQUE_DES_ACTES}
${items}
</channel>
</rss>
`;
}

/** Les items RSS des actes des communes, a la place de `MARQUE_DES_ACTES` dans le flux ; `nomDe(code)` rend le nom de la commune ou null. */
export function itemsDesActes({ entrees, nomDe = () => null }) {
	const e = EDITIONS.fr;
	return entrees
		.map(
			(d) => `<item>
<title>${xml(`${EVENEMENTS[d.classe]}, ${nomDe(d.collectivite) ?? d.collectivite}, ${d.objet ?? nomDuDocument(d.url)}`)}</title>
<link>${xml(`${e.adresse}${d.preuve}`)}</link>
<guid isPermaLink="false">${xml(`acte:${d.classe}:${d.avant.sha256}:${d.url}`)}</guid>
<pubDate>${dateRss(d.date)}</pubDate>
<description>${xml(`${d.url}${d.http ? `, HTTP ${d.http}` : ''}, version du ${jourFr(d.avant.jour)}`)}</description>
</item>`
		)
		.join('\n');
}

/**
 * La page du schema ouvert des adresses d'actes (D-205) : forme, segments,
 * resolution, invariants, fiche JSON, API. `s` est le module `schemaadresse.mjs`.
 */
export function pageSchemaAdresse(s) {
	const ligne = (cellules) => `<tr>${cellules.map((c) => `<td>${c}</td>`).join('')}</tr>`;
	const table = (entetes, lignes) => `<table>
<thead><tr>${entetes.map((t) => `<th>${t}</th>`).join('')}</tr></thead>
<tbody>
${lignes.map(ligne).join('\n')}
</tbody>
</table>`;
	const code = (t) => `<code>${echapper(t)}</code>`;
	// Le fichier de schema reste plat (une donnee) ; la page soude ce qu'elle en affiche.
	const souder = (t) => t.replace(/ ([:;?!])/g, `${NBSP}$1`);
	return gabarit(EDITIONS.fr, {
		titre: `Adresse pérenne d’un acte local, version ${s.VERSION_DU_SCHEMA}`,
		description: `Schéma ouvert de l’adresse pérenne d’un acte de collectivité${NBSP}: forme, segments, règles de résolution, fiche JSON, profil local d’ELI.`,
		chemin: s.CHEMIN_DE_LA_PAGE,
		corps: `<h1>Adresse pérenne d’un acte local</h1>
<p class="sous-titre">Version ${s.VERSION_DU_SCHEMA}, licence ouverte Etalab 2.0, <a href="${s.CHEMIN_DU_SCHEMA}">${s.CHEMIN_DU_SCHEMA}</a></p>
<p><code class="racine">${echapper(s.GABARIT)}</code></p>
<p><a href="${s.EXEMPLE}">${s.EXEMPLE}</a></p>
<h2>Segments</h2>
${table(['Segment', 'Motif', 'Valeur', 'ELI'], s.SEGMENTS.map((g) => [code(`{${g.nom}}`), code(g.motif), souder(g.porte), code(g.eli)]))}
<h2>Résolution</h2>
${table(['Adresse demandée', 'Statut', 'Réponse'], s.RESOLUTION.map((r) => [souder(r.cas), String(r.statut), souder(echapper(r.rend))]))}
<h2>Invariants</h2>
<ul>
${s.INVARIANTS.map((i) => `<li>${souder(i)}</li>`).join('\n')}
</ul>
<h2>Fiche JSON</h2>
${table(['Champ', 'Type', 'Valeur'], s.CHAMPS.map(([nom, type, porte]) => [code(nom), code(type), souder(porte)]))}
<h2>API</h2>
${table(['Adresse', 'Champ', 'Valeur'], s.API.map(([adresse, champ, porte]) => [code(adresse), code(champ), souder(porte)]))}
<h2>Résolveurs</h2>
<ul>
<li><a href="${EDITIONS.fr.adresse}/sitemap-actes.xml">${EDITIONS.fr.adresse}</a></li>
</ul>`
	});
}

/* ------------------------------------------------------------ l'offre des marches publics (D-200) */

/** Le formulaire de la liste d'attente : l'adresse, le profil, un champ cache aux personnes ; sans script. */
const formulaireDAttente = (offre) => `<form method="post" action="/api/attente" class="carte">
<h2>Être prévenu à l’ouverture</h2>
<p class="recoit">L’offre n’est pas encore ouverte. Laissez votre adresse${NBSP}: vous recevrez un seul message, le jour où elle ouvre.</p>
<input type="hidden" name="offre" value="${offre}">
<label for="adresse">Adresse électronique</label>
<input type="email" id="adresse" name="adresse" autocomplete="email" maxlength="254" required>
<fieldset class="profils">
<legend>Vous êtes</legend>
${Object.entries(PROFILS_DES_OFFRES[offre])
	.map(([valeur, nom], i) => `<label><input type="radio" name="profil" value="${valeur}"${i ? '' : ' checked'}> ${nom}</label>`)
	.join('\n')}
</fieldset>
<div hidden><label for="site">Ne pas remplir</label><input type="text" id="site" name="site" tabindex="-1" autocomplete="off"></div>
<button type="submit" class="principal large-bouton">Me prévenir</button>
<p class="recoit">Votre adresse ne sert qu’à ce message. Elle s’efface sur simple demande à <a href="mailto:contact@florianmousseau.com">contact@florianmousseau.com</a>.</p>
</form>`;

const ligneDEchantillon = (c) =>
	`<tr><td>${echapper(c.acheteur)}</td><td>${echapper(c.objet)}</td><td>${jourFr(c.jour)}</td><td>${echapper(c.criteres)}</td><td><a href="${lienDeLAvis(c.boamp)}">BOAMP ${c.boamp}</a></td></tr>`;

/** Ce qu'un acheteur public a demande la derniere fois : l'offre, un echantillon, ce qui est garde, la liste d'attente. Sans prix. */
export function pageOffreMarches(echantillon = ECHANTILLON, couverture = COUVERTURE) {
	const jours = echantillon.map((c) => c.jour).sort();
	return gabarit(EDITIONS.fr, {
		titre: 'Ce qu’un acheteur public a demandé la dernière fois',
		description: 'Le règlement de chaque consultation publiée au BOAMP sur une plateforme Atexo, gardé après la clôture et relié à l’avis d’attribution. Liste d’attente ouverte.',
		chemin: CHEMIN_OFFRE_MARCHES,
		corps: `<section class="une une-page"><h1>Ce qu’un acheteur public a demandé la dernière fois</h1>
<p class="chapeau">Le dossier d’une consultation quitte la plateforme de l’acheteur à la clôture. Témoin public garde son règlement et le relie à l’avis d’attribution quand celui-ci paraît.</p></section>
${formulaireDAttente('marches-publics')}
<h2>Ce que vous y lirez</h2>
<ul>
<li>Le règlement de la consultation tel que l’acheteur l’a publié${NBSP}: les critères et leur poids, les pièces demandées, la durée du marché.</li>
<li>L’avis d’attribution du BOAMP${NBSP}: le titulaire et le montant, quand l’avis les donne.</li>
<li>La suite des consultations d’un même acheteur pour un même objet, d’une année sur l’autre.</li>
</ul>
<h2>Un échantillon</h2>
<div class="defile">
<table>
<thead><tr><th>Acheteur</th><th>Objet</th><th>Avis du</th><th>Ce que le règlement demande</th><th>Avis</th></tr></thead>
<tbody>
${echantillon.map(ligneDEchantillon).join('\n')}
</tbody>
</table>
</div>
<p class="compte">${nombre(echantillon.length)} consultations prises au vol entre le ${jourFr(jours[0])} et le ${jourFr(jours.at(-1))}. Chaque règlement est gardé tel que la plateforme l’a servi.</p>
<h2>Ce qui est gardé</h2>
<p>Témoin public suit les consultations publiées au BOAMP sur une plateforme Atexo, soit environ un avis de marché sur trois. Au ${jourFr(couverture.au)}, il suit ${nombre(couverture.consultations)} consultations depuis le ${jourFr(couverture.depuis)} et garde ${nombre(couverture.reglements)} règlements.</p>
<p>Le reste du dossier, dont le CCAP et le CCTP, n’est pas encore gardé.</p>
<p>Le dossier d’un acheteur n’est pas republié${NBSP}: la page en donne l’objet, la date, ce qui est demandé et le lien de l’avis.</p>`
	});
}

/* ------------------------------------------------------------ l'offre des communes (D-195) */

/** Les actes d'une commune dates le jour de leur mise en ligne : l'offre, ce qui existe deja sans compte, la liste d'attente. Sans prix. */
export function pageOffreCommunes(couverture = COUVERTURE_COMMUNES, exemple = EXEMPLE_D_ACTE) {
	const titre = 'Les actes de votre commune, datés le jour de leur mise en ligne';
	return gabarit(EDITIONS.fr, {
		titre,
		description: 'Chaque acte publié sur le site de la commune, daté au moment de sa mise en ligne, avec son reçu. Liste d’attente ouverte.',
		chemin: CHEMIN_OFFRE_COMMUNES,
		corps: `<section class="une une-page"><h1>${titre}</h1>
<p class="chapeau">Une commune qui publie ses actes sur son site fait courir le délai de recours du jour de leur mise en ligne. Témoin public date la mise en ligne de chaque acte qu’il lit sur le site officiel, à son adresse.</p></section>
${formulaireDAttente('communes')}
<h2>Ce que l’offre ajoutera</h2>
<ul>
<li>Chaque acte est daté depuis votre outil de publication, au moment où il part en ligne, sans que personne ait à cliquer.</li>
<li>Chaque acte a son reçu, à classer avec lui${NBSP}: son adresse, le jour et l’heure de sa mise en ligne.</li>
<li>Vous êtes averti quand un acte quitte votre site avant la fin de ses deux mois de publication.</li>
<li>Vous recevez le relevé de vos actes datés, mois par mois.</li>
</ul>
<h2>Déjà en ligne, sans compte</h2>
<p>Au ${jourFr(couverture.au)}, ${nombre(couverture.communes)} communes ont ${nombre(couverture.actes)} actes datés, lus sur leur site officiel.</p>
<p>Un exemple${NBSP}: <a href="${exemple.adresse}">${echapper(exemple.nature)}, ${echapper(exemple.commune)}, en ligne le ${jourFr(exemple.jour)}</a>, «${NBSP}${echapper(exemple.objet)}${NBSP}».</p>
<p><a class="bouton principal" href="${ACTES.acte.chemin}">${ACTES.acte.titre}</a> <a class="bouton" href="${ACTES.communes.chemin}">Voir les communes</a></p>`
	});
}

/* ------------------------------------------------------------ l'offre des editeurs (D-195, D-170) */

/** Chaque version des articles d'un editeur datee a sa mise en ligne : l'offre, ce qui existe deja sans compte, la liste d'attente. Sans prix. */
export function pageOffreEditeurs(exemple = EXEMPLE_DE_REGISTRE) {
	const titre = 'La date de chaque version de vos articles';
	return gabarit(EDITIONS.fr, {
		titre,
		description: 'Chaque article d’un flux RSS ou Atom daté à sa mise en ligne, et chaque modification datée à son tour, avec son reçu. Liste d’attente ouverte.',
		chemin: CHEMIN_OFFRE_EDITEURS,
		corps: `<section class="une une-page"><h1>${titre}</h1>
<p class="chapeau">Le délai pour agir contre un article court du jour de sa première mise en ligne. Témoin public lit le flux de votre site chaque heure et date chaque article nouveau ou modifié, à son adresse.</p></section>
${formulaireDAttente('editeurs')}
<h2>Ce que l’offre ajoutera</h2>
<ul>
<li>Chaque modification d’un article est datée, même plusieurs fois le même jour.</li>
<li>Le texte de chaque version est gardé avec sa date, pour la retrouver après une correction.</li>
<li>Vous êtes averti quand un article quitte votre site.</li>
<li>Vous recevez le relevé de vos versions datées, mois par mois.</li>
</ul>
<h2>Déjà en ligne, sans compte</h2>
<p>Le suivi d’un flux RSS ou Atom est ouvert${NBSP}: chaque heure, chaque article nouveau ou modifié est lu et daté, une version par jour au plus. Le registre public du flux ne montre ni adresse ni titre${NBSP}; les adresses et les reçus restent dans son registre privé.</p>
<p>Un exemple${NBSP}: <a href="/editeur/${exemple.id}">le registre d’un site suivi depuis le ${jourFr(exemple.depuis)}</a>, ${nombre(exemple.articles)} articles datés.</p>
<p><a class="bouton principal" href="${BESOINS[0].chemin}">Dater un article</a> <a class="bouton" href="${ACTES.documentation.chemin}">Suivre un flux</a></p>
<h2>Ce que la date ne dit pas</h2>
<p>Le registre prouve qu’une version existait à cette date. Il ne dit ni qui l’a écrite, ni si elle dit vrai.</p>`
	});
}

/* ------------------------------------------------------------ l'offre des assureurs (D-195) */

/** Les pieces d'un dossier de sinistre datees le jour ou elles sont prises : l'offre, ce qui existe deja sans compte, la liste d'attente. Sans prix. */
export function pageOffreAssureurs(couverture = COUVERTURE_DU_REGISTRE) {
	const titre = 'Les pièces d’un dossier de sinistre, datées le jour où elles sont prises';
	return gabarit(EDITIONS.fr, {
		titre,
		description: 'Photos, rapports et pages web d’un sinistre datés au moment où ils sont pris, chacun avec son reçu, vérifiable par tous. Liste d’attente ouverte.',
		chemin: CHEMIN_OFFRE_ASSUREURS,
		corps: `<section class="une une-page"><h1>${titre}</h1>
<p class="chapeau">Une photo, un rapport d’expertise ou une page web prouvent l’état d’un bien ou d’un site à une date. Témoin public date chacune au registre public, le jour même, sans que le fichier quitte votre appareil, et remet un reçu à classer au dossier.</p></section>
${formulaireDAttente('assureurs')}
<h2>Ce que l’offre ajoutera</h2>
<ul>
<li>Chaque pièce est datée depuis votre outil de gestion des sinistres, au moment où elle entre au dossier.</li>
<li>Les reçus d’un dossier se regroupent sous son numéro, à joindre en une fois.</li>
<li>Une page web se relit chaque jour pendant la durée que vous fixez, chaque version datée.</li>
<li>Vous recevez le relevé de vos pièces datées, mois par mois.</li>
</ul>
<h2>Déjà en ligne, sans compte</h2>
<p>Au ${jourFr(couverture.au)}, le registre porte ${nombre(couverture.dates)} dates enregistrées depuis le ${jourFr(couverture.depuis)}.</p>
<p><a class="bouton principal" href="${ACTES.dater.chemin}">Dater une pièce</a> <a class="bouton" href="${BESOINS[0].chemin}">Dater une page web</a></p>
<h2>Ce que la date ne dit pas</h2>
<p>Le reçu prouve qu’une pièce existait telle quelle à cette date. Il ne dit ni qui l’a prise, ni où, ni ce qu’elle montre.</p>`
	});
}

/* ------------------------------------------------------------ l'offre des notaires (D-195) */

/** Chaque version d'un projet d'acte datee quand elle circule : l'offre, ce qui existe deja sans compte, la liste d'attente. Sans prix. */
export function pageOffreNotaires(couverture = COUVERTURE_DU_REGISTRE) {
	const titre = 'Chaque version d’un projet d’acte, datée le jour où elle circule';
	return gabarit(EDITIONS.fr, {
		titre,
		description: 'Chaque version d’un projet d’acte et chaque pièce reçue datées le jour où elles circulent, chacune avec son reçu, vérifiable par tous. Liste d’attente ouverte.',
		chemin: CHEMIN_OFFRE_NOTAIRES,
		corps: `<section class="une une-page"><h1>${titre}</h1>
<p class="chapeau">Un projet d’acte change de main en main avant la signature. Témoin public date chaque version au registre public, le jour où elle part, sans que le fichier quitte votre poste, et remet un reçu à classer au dossier.</p></section>
${formulaireDAttente('notaires')}
<h2>Ce que l’offre ajoutera</h2>
<ul>
<li>Chaque version est datée depuis votre logiciel de rédaction, au moment où elle est envoyée.</li>
<li>Les reçus d’un dossier se regroupent sous sa référence, de la première version à l’acte signé.</li>
<li>Une version reçue se compare en un geste aux versions datées du dossier.</li>
<li>Vous recevez le relevé de vos versions datées, mois par mois.</li>
</ul>
<h2>Déjà en ligne, sans compte</h2>
<p>Au ${jourFr(couverture.au)}, le registre porte ${nombre(couverture.dates)} dates enregistrées depuis le ${jourFr(couverture.depuis)}.</p>
<p><a class="bouton principal" href="${ACTES.dater.chemin}">Dater une version</a> <a class="bouton" href="${ACTES.verifier.chemin}">Vérifier une version reçue</a></p>
<h2>Ce que la date ne dit pas</h2>
<p>Le reçu prouve qu’une version existait telle quelle à cette date. Il ne donne pas date certaine à un acte sous seing privé${NBSP}: l’enregistrement ou l’acte authentique restent nécessaires.</p>`
	});
}

/* ------------------------------------------------------------ l'offre des DRH (D-195) */

/** Chaque version d'un document du personnel datee le jour de sa diffusion : l'offre, ce qui existe deja sans compte, la liste d'attente. Sans prix. */
export function pageOffreDrh(couverture = COUVERTURE_DU_REGISTRE) {
	const titre = 'Chaque version d’un document du personnel, datée le jour de sa diffusion';
	return gabarit(EDITIONS.fr, {
		titre,
		description: 'Règlement intérieur, chartes et notes de service datés à chaque version, le jour de leur diffusion, chacun avec son reçu, vérifiable par tous. Liste d’attente ouverte.',
		chemin: CHEMIN_OFFRE_DRH,
		corps: `<section class="une une-page"><h1>${titre}</h1>
<p class="chapeau">Le règlement intérieur, une charte ou une note de service changent d’une année sur l’autre. Témoin public date chaque version au registre public, le jour où elle est diffusée, sans que le fichier quitte votre poste, et remet un reçu à classer avec elle.</p></section>
${formulaireDAttente('drh')}
<h2>Ce que l’offre ajoutera</h2>
<ul>
<li>Chaque version est datée depuis votre outil de diffusion, au moment où elle part.</li>
<li>Les versions d’un même document se suivent, de la première à celle en vigueur.</li>
<li>Une version produite par un salarié ou son conseil se compare en un geste aux versions datées.</li>
<li>Vous recevez le relevé de vos versions datées, mois par mois.</li>
</ul>
<h2>Déjà en ligne, sans compte</h2>
<p>Au ${jourFr(couverture.au)}, le registre porte ${nombre(couverture.dates)} dates enregistrées depuis le ${jourFr(couverture.depuis)}.</p>
<p><a class="bouton principal" href="${ACTES.dater.chemin}">Dater une version</a> <a class="bouton" href="${ACTES.verifier.chemin}">Vérifier une version</a></p>
<h2>Ce que la date ne dit pas</h2>
<p>Le reçu prouve qu’une version existait telle quelle à cette date. Il ne prouve pas qu’un salarié l’a reçue${NBSP}: la remise se prouve par une décharge signée ou un recommandé.</p>`
	});
}

/* ------------------------------------------------------------ l'offre de la conformite (D-195, D-237) */

const ligneDeRegistres = ({ autorite, registres }) => `<li><strong>${autorite}</strong>${NBSP}: ${registres.join(', ')}.</li>`;

/** L'etat d'un registre financier a la date d'un controle : l'offre, les registres suivis, la piece MiCA, la liste d'attente. Sans prix. */
export function pageOffreConformite(registres = REGISTRES_DE_CONFORMITE, piece = PIECE_MICA) {
	const titre = 'Ce que disait un registre financier, le jour de votre contrôle';
	const nombreDeRegistres = registres.reduce((n, r) => n + r.registres.length, 0);
	return gabarit(EDITIONS.fr, {
		titre,
		description: `Chaque version de ${nombreDeRegistres} registres de l’ESMA, de l’AMF, de l’ACPR et de la HATVP, gardée avec sa date et un témoin tiers, pour retrouver l’état d’un registre au jour d’une entrée en relation. Liste d’attente ouverte.`,
		chemin: CHEMIN_OFFRE_CONFORMITE,
		corps: `<section class="une une-page"><h1>${titre}</h1>
<p class="chapeau">Les registres de l’ESMA, de l’AMF et de la HATVP sont réécrits en place et ne gardent aucune version passée. Témoin public date chaque version lue au registre public, avec l’empreinte du fichier et la copie d’un témoin tiers, l’Internet Archive.</p></section>
${formulaireDAttente('conformite')}
<h2>Ce que l’offre ajoutera</h2>
<ul>
<li>La version d’un registre à la date de votre choix, avec sa preuve, à classer au dossier de vigilance.</li>
<li>Ce qui a changé pour une contrepartie entre deux dates${NBSP}: entrée, sortie, services, pays.</li>
<li>Vous êtes averti quand une contrepartie suivie quitte un registre ou change de ligne.</li>
<li>Vous recevez le relevé de vos contreparties suivies, mois par mois.</li>
</ul>
<h2>Les ${nombreDeRegistres} registres suivis</h2>
<ul>
${registres.map(ligneDeRegistres).join('\n')}
</ul>
<h2>Déjà en ligne, sans compte</h2>
<p>Du ${jourFr(piece.du)} au ${jourFr(piece.au)}, le registre MiCA des prestataires agréés a connu ${piece.versions} versions${NBSP}: ${nombre(piece.lignesAvant)} lignes puis ${nombre(piece.lignesApres)}, ${piece.datesReecrites} dates d’agrément réécrites, un prestataire absent ${piece.absentJours} jours puis revenu. Le registre du jour n’en montre aucune trace.</p>
<p>Chaque version est inscrite le jour même au registre des dates, chaînée aux précédentes et ancrée dans Bitcoin.</p>
<p><a class="bouton principal" href="${ACTES.journal.chemin}">Voir le registre des dates</a> <a class="bouton" href="${ACTES.verifier.chemin}">Vérifier un fichier</a></p>
<h2>Ce que la date ne dit pas</h2>
<p>La date prouve qu’un registre servait ce fichier à cette date. Il ne dit pas si son contenu est exact${NBSP}: les registres des autorités nationales restent la référence.</p>`
	});
}

/** Ce que dit la page de reponse de la liste d'attente, selon l'issue. */
export const ISSUES_DE_L_ATTENTE = {
	inscrit: ['Votre adresse est notée', 'Vous recevrez un seul message, le jour où l’offre ouvre.'],
	adresse: ['Cette adresse ne se lit pas', 'Vérifiez l’adresse électronique et recommencez.'],
	offre: ['Cette liste n’existe pas', 'Revenez à la page de l’offre et recommencez.'],
	plafond: ['La liste est pleine pour aujourd’hui', 'Recommencez demain.']
};

/** La page rendue apres l'envoi du formulaire d'attente ; elle ne s'indexe pas. */
export function pageAttente(issue, offre = 'marches-publics') {
	const [titre, phrase] = ISSUES_DE_L_ATTENTE[issue];
	return gabarit(EDITIONS.fr, {
		titre,
		description: phrase,
		chemin: CHEMINS_DES_OFFRES[offre],
		indexer: false,
		corps: `<h1>${titre}</h1>
<p>${phrase}</p>
<p><a class="bouton" href="${CHEMINS_DES_OFFRES[offre]}">Revenir à l’offre</a></p>`
	});
}

/** Une version d'une source temoin (Memento, D-205) : l'empreinte datee, le tour, et la copie du temoin tiers. Francais seulement. */
export function pageMemento({ nom, url, version, position, total, temoin }) {
	const e = EDITIONS.fr;
	const quand = dateHeure(version.instant);
	const adresse = echapper(url);
	return gabarit(e, {
		titre: `${echapper(nom)}, version du ${quand}`,
		description: `L’empreinte de ${adresse} au ${quand}, dans le journal de ${e.marque}.`,
		chemin: `/memento/${version.tour}/${adresse}`,
		indexer: false,
		corps: `<h1>${echapper(nom)}</h1>
<p>Version ${position} sur ${total}${NBSP}: ${quand}</p>
<table class="doc">
<tr><th>Adresse</th><td><a href="${adresse}" rel="nofollow">${adresse}</a></td></tr>
<tr><th>Empreinte SHA-256</th><td><code>${version.sha256}</code></td></tr>
<tr><th>Tour du journal</th><td><a href="/empreintes/${version.tour}.json">${version.tour}</a></td></tr>
<tr><th>Jour de lecture</th><td>${version.jour ?? '-'}</td></tr>
<tr><th>Copie du témoin</th><td><a href="${echapper(temoin)}" rel="nofollow">Internet Archive, au plus près de cet instant</a></td></tr>
</table>
<p>${e.marque} ne garde pas le contenu, seulement son empreinte datée${NBSP}: le fichier se relit chez son éditeur ou chez le témoin, et son SHA-256 doit être celui-ci.</p>
<p><a class="bouton" href="/verifier?empreinte=${version.sha256}">Vérifier cette empreinte</a> <a class="bouton" href="/memento/timemap/link/${adresse}">Toutes les versions</a></p>`
	});
}

// La glane des actes des communes (D-178) : sur le site officiel d'une commune,
// trouver la page de ses actes et les PDF qu'elle publie, et dire de chacun sa
// nature et son objet. Pur : ni reseau, ni base ; `scripts/glaner-actes.mjs`
// branche la politesse, `robots.txt` et le depot.
//
// Une nature ne se devine pas : sans indice dans le libelle du lien ou le nom du
// fichier, le PDF n'est pas depose (une page courte vaut mieux qu'une nature
// fausse). Un objet qui nommerait une personne devient « Sans objet ».

import { surSiteOfficiel } from './acte.mjs';
import { nommeUnePersonne } from './personne.mjs';

/** Le nom par lequel un `robots.txt` designe la glane, et l'agent qu'elle annonce. */
export const JETON_ROBOT = 'temoinpublic';
export const AGENT_GLANE = 'temoinpublic-glane (+https://temoinpublic.fr/collectivite)';
export const SANS_OBJET = 'Sans objet';
const OBJET_MAX = 200;
const ROBOTS_REGLES_MAX = 2000;

/** Minuscules, sans accents ni apostrophe typographique : ce que les motifs lisent. */
export const normaliser = (texte) =>
	String(texte)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[’‘]/g, "'")
		.toLowerCase();

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î', rsquo: '’' };

/** Le texte d'un fragment HTML : balises retirees, entites courantes rendues, espaces reduits. */
export function texteDuHtml(html) {
	return String(html)
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
		.replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m)
		.replace(/\s+/g, ' ')
		.trim();
}

/** Les liens d'une page, `{ href, texte }`, adresses absolues sans ancre ; `title` quand le lien n'a pas de texte. */
export function liensDe(html, base) {
	const liens = [];
	for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
		const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[1]);
		if (!href) continue;
		const brut = texteDuHtml(href[1] ?? href[2]);
		if (!brut || /^(?:#|mailto:|tel:|javascript:)/i.test(brut)) continue;
		let url;
		try {
			url = new URL(brut, base);
		} catch {
			continue;
		}
		if (!/^https?:$/.test(url.protocol)) continue;
		url.hash = '';
		const titre = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[1]);
		liens.push({ href: url.href, texte: texteDuHtml(m[2]) || texteDuHtml(titre?.[1] ?? titre?.[2] ?? '') });
	}
	return liens;
}

const decoder = (texte) => {
	try {
		return decodeURIComponent(texte);
	} catch {
		return texte;
	}
};
const cheminDe = (href) => decoder(new URL(href).pathname);
const estUnPdf = (href) => /\.pdf$/i.test(new URL(href).pathname);

// Une page d'actes, par ordre de preference : celle qui les porte, puis celle du conseil (un saut de plus).
const PAGES = [
	[3, /(deliberation|proces[- ]?verba|publication des actes|actes? administratif|recueil des actes|registre des actes|actes? (?:de la commune|municipaux|reglementaires|publies)|arretes? (?:municipaux|du maire|permanents|temporaires)|\barretes\b)/],
	[2, /(comptes?[- ]rendus?|seances? du conseil|conseils? municipa)/],
	[1, /(vie municipale|\bmairie\b|conseil\b)/]
];
const PAS_UNE_PAGE_D_ACTES = /(prefe[ct]|etat[- ]civil|naissance|mariage|deces|pacs|demarche|recrutement|offre d'emploi|marche public|appel d'offre)/;

/** Le score d'un lien comme page d'actes, 0 quand il n'en est pas une. */
export function scoreDePage({ href, texte }) {
	const lu = normaliser(`${texte} ${cheminDe(href).replace(/[-_/]+/g, ' ')}`);
	if (PAS_UNE_PAGE_D_ACTES.test(lu)) return 0;
	return PAGES.find(([, motif]) => motif.test(lu))?.[0] ?? 0;
}

/**
 * Les pages d'actes candidates d'une page : liens du site officiel, hors PDF et
 * hors de la page elle-meme, du meilleur score au moins bon, `max` au plus.
 * `plancher` ecarte les liens trop generaux (1 : « mairie », « vie municipale »).
 */
export function pagesCandidates(liens, { sites, ici, max = 3, plancher = 2 }) {
	const vues = new Set([ici]);
	return liens
		.filter((l) => surSiteOfficiel(l.href, sites) && !estUnPdf(l.href))
		.map((l) => ({ ...l, score: scoreDePage(l) }))
		.filter((l) => l.score >= plancher && !vues.has(l.href) && vues.add(l.href))
		.sort((a, b) => b.score - a.score)
		.slice(0, max);
}

/** Les PDF d'une page publies sur le site officiel, chacun une fois, dans l'ordre de la page. */
export function pdfsDe(liens, sites) {
	const vus = new Set();
	return liens.filter((l) => estUnPdf(l.href) && surSiteOfficiel(l.href, sites) && !vus.has(l.href) && vus.add(l.href));
}

const NATURES = [
	['arrete', /\barr[e]tes?\b/],
	['decision', /\bdecisions?\b/],
	['deliberation', /(deliberation|deliberations|proces[- ]?verba|\bpv\b|comptes?[- ]rendus?|\bcr\b|seance|conseil municipal|\bcm\b)/]
];
const PAS_UN_ACTE = /(prefe[ct]|convocation|ordre du jour|\bodj\b|bulletin|magazine|journal|menu|cantine|formulaire|tarif|horaire|plaquette|affiche|flyer|guide)/;

function natureDuTexte(texte) {
	const lu = normaliser(texte).replace(/[-_+.]+/g, ' ');
	if (PAS_UN_ACTE.test(lu)) return { exclu: true };
	let premiere = null;
	for (const [nature, motif] of NATURES) {
		const m = motif.exec(lu);
		if (m && (!premiere || m.index < premiere.index)) premiere = { nature, index: m.index };
	}
	return premiere ? { nature: premiere.nature } : {};
}

/** La nature d'un acte lue dans le libelle de son lien, sinon dans le nom de son fichier ; null sans indice ou pour ce qui n'est pas un acte. */
export function natureDe({ href, texte }) {
	const fichier = cheminDe(href).split('/').pop();
	const duLibelle = natureDuTexte(texte);
	const duFichier = natureDuTexte(fichier);
	if (duLibelle.exclu || duFichier.exclu) return null;
	return duLibelle.nature ?? duFichier.nature ?? null;
}

const GENERIQUE = /^(?:telecharger|telecharger le (?:document|fichier|pdf)|ici|cliquez|cliquez ici|lire|lire la suite|voir|consulter|consulter (?:le|la|les)(?: document| fichier| pdf)?|(?:document|fichier|pdf|piece jointe)s?(?: a telecharger| joints?)?|annexes?|lien|en savoir plus|\d+)$/;

const nettoyer = (texte) =>
	texte
		.replace(/\(?\s*(?:pdf|PDF)?\s*[-,]?\s*\d+(?:[.,]\d+)?\s*(?:[kKmM]i?[oObB]|octets)\s*\)?/g, ' ')
		.replace(/\(\s*\d+(?:[.,]\d+)?\s*[kKmM][a-zA-Z]*\s*\)?/g, ' ')
		.replace(/\s*\(\s*pdf\s*\)|\bpdf\b\s*$/gi, ' ')
		.replace(/^\s*t[ée]l[ée]charger\s*(?:le|la)?\s*/i, '')
		.replace(/\s+/g, ' ')
		.trim();

/** L'objet d'un acte : le libelle du lien, sinon le nom du fichier ; « Sans objet » quand l'un ou l'autre nommerait une personne. */
export function objetDe({ href, texte }) {
	let objet = nettoyer(texte);
	if (objet.length < 4 || GENERIQUE.test(normaliser(objet))) {
		objet = cheminDe(href)
			.split('/')
			.pop()
			.replace(/\.pdf$/i, '')
			.replace(/[-_+.]+/g, ' ')
			.replace(/\b[0-9a-f]{12,}\b/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
	if (!objet || nommeUnePersonne(objet)) return SANS_OBJET;
	objet = objet.length > OBJET_MAX ? `${objet.slice(0, OBJET_MAX - 1).trimEnd()}.` : objet;
	return objet[0].toUpperCase() + objet.slice(1);
}

// Les sigles et mots qu'une commune ecrit en capitales sans nommer personne.
const CAPITALES_ADMISES = new Set(
	'CCAS CIAS PLU PLUI SCOT ZAC SDIS EPCI RGPD DETR DSIL FPIC TEOM SIVU SIVOM SDEER SPANC CLECT CAF CNAS ONF CDG SNCF EDF GRDF ENEDIS SAUR ACCA AFR ASA ADS DIA DM BP CA CM PV CR AR RD RN VC CU PC DP CDC SEM SPL OPAH DECI TVA HT TTC ADMR EHPAD ALSH RPI ATSEM'.split(' ')
);
// Un acte individuel nomme presque toujours son beneficiaire : delegation, nomination, permission de voirie.
const ACTE_INDIVIDUEL =
	/(delegation|nomination|nommant|recrutement|stagiairisation|titularisation|disponibilite|reintegration|detachement|avancement d'echelon|mise a la retraite|occupation du domaine public|permission de voirie|permis de stationnement|autorisation de voirie|debit de boissons|buvette|concession|alignement individuel|\bp\.\s|\bm\.\s|\bmme\b|\bmlle\b|monsieur|madame)/;

/**
 * Vrai quand un texte d'acte pourrait nommer une personne au-dela de ce que
 * `nommeUnePersonne` reconnait : un acte individuel, ou un mot en capitales dans un
 * texte qui ne l'est pas (« PETIT Catherine »), ou, pour un arrete ou une decision
 * ecrits tout en capitales, un mot en capitales qui n'est pas un sigle connu.
 */
export function pourraitNommer(texte, nature) {
	const lu = normaliser(texte);
	if (ACTE_INDIVIDUEL.test(lu)) return true;
	const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, '');
	const toutEnCapitales = lettres.length > 0 && lettres === lettres.toUpperCase();
	if (toutEnCapitales && nature === 'deliberation') return false;
	const capitales = (texte.match(/\b[A-ZÀ-Ý]{3,}\b/g) ?? []).filter((m) => !CAPITALES_ADMISES.has(normaliser(m).toUpperCase()) && !NATURE_EN_CAPITALES.test(normaliser(m)));
	return capitales.length > 0;
}
const NATURE_EN_CAPITALES = /^(?:arretes?|decisions?|deliberations?|proces|verbal|compte|rendu|seance|conseil|municipal|liste|des|du|de|la|le|les|et|en|au|aux|par|pour|sur|date|janv|janvier|fevr|fevrier|mars|avril|mai|juin|juillet|aout|sept|septembre|oct|octobre|nov|novembre|dec|decembre|annexe|budget|primitif|travaux|circulation|stationnement|voirie|rue|route|chemin|place|impasse|allee|avenue|temporaire|permanent|reglementant|portant|interdiction|interdisant|maire|commune|municipale|affichage|visee|teletransmis|reunion|extrait|registre)$/;

/**
 * Ce que la glane deposerait d'un PDF : `{ url, nature, libelle }`, ou null sans
 * nature, et null quand le libelle, l'objet retenu ou le nom du fichier pourrait
 * nommer une personne : l'adresse du fichier est montree sur la page de la commune.
 */
export function acteDuLien(lien) {
	const nature = natureDe(lien);
	if (!nature) return null;
	const libelle = objetDe(lien);
	const fichier = cheminDe(lien.href).split('/').pop().replace(/[-_+.]+/g, ' ');
	if (libelle === SANS_OBJET || nommeUnePersonne(fichier) || [lien.texte, libelle, fichier].some((t) => pourraitNommer(t, nature))) return null;
	return { url: lien.href, nature, libelle };
}

// --- robots.txt (RFC 9309), ecrit comme celui de l'entrepot (src/communes.mjs) ---

/** Les regles qu'un `robots.txt` donne a la glane : groupes qui la nomment, sinon `*`, sinon aucune. */
export function reglesRobots(texte, jeton = JETON_ROBOT) {
	const groupes = [];
	let courant = null;
	let dansLesAgents = false;
	for (const brute of String(texte).split(/\r\n|\r|\n/)) {
		const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(brute.replace(/#.*/, '').trim());
		if (!m) continue;
		const cle = m[1].toLowerCase();
		const valeur = m[2].trim();
		if (cle === 'user-agent') {
			if (!dansLesAgents) {
				courant = { agents: [], regles: [] };
				groupes.push(courant);
			}
			courant.agents.push(valeur.toLowerCase());
			dansLesAgents = true;
		} else {
			dansLesAgents = false;
			if ((cle === 'allow' || cle === 'disallow') && courant && valeur && courant.regles.length < ROBOTS_REGLES_MAX) courant.regles.push({ permis: cle === 'allow', motif: valeur.slice(0, 500) });
		}
	}
	const nous = groupes.filter((g) => g.agents.some((a) => a.split('/')[0].trim() === jeton));
	return (nous.length ? nous : groupes.filter((g) => g.agents.includes('*'))).flatMap((g) => g.regles);
}

function motifEnRegExp(motif) {
	const ancre = motif.endsWith('$');
	const corps = (ancre ? motif.slice(0, -1) : motif).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
	return new RegExp(`^${corps}${ancre ? '$' : ''}`);
}

/** Vrai si les regles permettent l'adresse : la regle la plus longue l'emporte, `Allow` a egalite. */
export function robotsPermet(regles, url) {
	const u = new URL(url);
	const chemin = u.pathname + u.search;
	if (chemin === '/robots.txt') return true;
	let meilleure = null;
	for (const r of regles) {
		if (!motifEnRegExp(r.motif).test(chemin)) continue;
		if (!meilleure || r.motif.length > meilleure.motif.length || (r.motif.length === meilleure.motif.length && r.permis)) meilleure = r;
	}
	return meilleure ? meilleure.permis : true;
}

// --- Les documents budgetaires (D-185) : la glane les RELEVE, elle ne les depose pas ---
// Un compte administratif n'est pas un acte du registre : il entre a l'entrepot et
// au corpus. Le releve dit de chacun son genre, son exercice, son budget et s'il
// porte une couche texte ; il reste dans l'etat de la glane, hors du depot.

const PAGE_BUDGET = /(\bbudgets?\b|\bfinances?\b|comptes? administratifs?|compte financier|orientations? budgetaires?|documents? budgetaires?|informations? financieres?|donnees financieres)/;
const PAS_UNE_PAGE_BUDGET = /(participatif|prefe[ct]|marche public|appel d'offre)/;

/** Vrai quand un lien mene a la page « budget » ou « finances » d'une commune. */
export function estUnePageBudget({ href, texte }) {
	const lu = normaliser(`${texte} ${cheminDe(href).replace(/[-_/]+/g, ' ')}`);
	return PAGE_BUDGET.test(lu) && !PAS_UNE_PAGE_BUDGET.test(lu);
}

/** Les pages « budget / finances » d'une page : liens du site officiel, hors fichiers et hors de la page elle-meme, `max` au plus. */
export function pagesBudget(liens, { sites, ici, max = 2 }) {
	const vues = new Set([ici]);
	return liens.filter((l) => surSiteOfficiel(l.href, sites) && !estUnTelechargement(l.href) && estUnePageBudget(l) && !vues.has(l.href) && vues.add(l.href)).slice(0, max);
}

// Un lien de telechargement sans `.pdf` : WordPress Download Manager, `?download=`, `/telecharger/`.
const TELECHARGEMENT = /(?:[?&](?:download|telecharger|wpdmdl|dl|file|fichier)=|\/(?:download|telecharger|telechargement)s?(?:\/|$)|\/getfile|\/docs?\/download)/i;

/** Vrai pour un PDF ou un lien de telechargement (meme sans `.pdf`). */
export function estUnTelechargement(href) {
	const u = new URL(href);
	return /\.pdf$/i.test(u.pathname) || TELECHARGEMENT.test(u.pathname + u.search);
}

/** Les telechargements d'une page publies sur le site officiel, chacun une fois. */
export function telechargementsDe(liens, sites) {
	const vus = new Set();
	return liens.filter((l) => estUnTelechargement(l.href) && surSiteOfficiel(l.href, sites) && !vus.has(l.href) && vus.add(l.href));
}

const ANNEE = /(?<![\d])(20[0-3]\d)(?![\d])/;
// Par ordre : une note ou un rapport PARLE d'un budget avant d'en etre la maquette.
const GENRES = [
	['NOTE', /\bnotes?\b.*(budget|\bbp\b|\bca\b|\bcfu\b|compte|financ)|(budget|\bbp\b|\bca\b|\bcfu\b|compte).*\bnotes?\b|presentation (breve|synthetique)/],
	['ROB', /orientations? budgetaires?|\brob\b|\bdob\b/],
	['CFU', /compte financier unique|\bcfu\b/],
	['CA', /comptes? administratifs?|\bca\b/],
	['BP', /budgets? primitifs?|budgets? previsionnels?|\bbp\b|vote du budget|budget (?:principal |communal |de la commune )?20[0-3]\d/]
];
// Un sigle de deux lettres ne suffit pas seul : « ca » est aussi « ça ».
const SIGLE_SEUL = /^(?:\bca\b|\bbp\b)$/;
// Le budget se dit quand le texte le nomme ; sinon `inconnu`, il ne se devine pas.
const BUDGET_ANNEXE = /(budgets? annexes?|assainissement|eau potable|\beau\b|lotissements?|camping|\bport\b|portuaires?|\bgolf\b|marche couvert|immeuble|\bzae\b|\bzac\b|\bzones?\b|transports?|\bccas\b|regie|cinema|piscine|photovoltai|chaufferie|maison de sante|pompes funebres|multiple rural|caisse des ecoles)/;
const BUDGET_PRINCIPAL = /(budget principal|budget general|\bcommunes?\b|\bmairie\b|\bville\b|communal)/;
// Une deliberation qui vote un budget est un acte : la glane des actes s'en charge. Sa piece jointe, elle, est le document.
const DELIBERATION = /\bdelib/;
const PIECE_JOINTE = /(\bpj\b|piece jointe|\bannexe\b(?! budget))/;

function genreDuTexte(texte) {
	const lu = normaliser(texte).replace(/[-_+.]+/g, ' ');
	for (const [genre, motif] of GENRES) {
		const m = motif.exec(lu);
		if (!m) continue;
		if (SIGLE_SEUL.test(m[0]) && !ANNEE.test(lu) && !/budget|compte/.test(lu)) continue;
		return { genre, exercice: ANNEE.exec(lu)?.[1] ?? null, annexe: BUDGET_ANNEXE.test(lu), principal: BUDGET_PRINCIPAL.test(lu), deliberation: DELIBERATION.test(lu), pieceJointe: PIECE_JOINTE.test(lu) };
	}
	return null;
}

/**
 * Ce que la glane releve d'un lien de telechargement : `{ url, genre, exercice,
 * budget, libelle }` (genre CA, CFU, BP, NOTE ou ROB ; exercice lu dans le libelle
 * puis le nom du fichier, jamais dans le chemin des envois ; budget principal ou
 * annexe), ou null quand ni le libelle ni le fichier n'en disent le genre.
 */
export function documentBudgetaireDe(lien) {
	if (!estUnTelechargement(lien.href)) return null;
	const u = new URL(lien.href);
	const fichier = `${cheminDe(lien.href).split('/').pop().replace(/\.pdf$/i, '')} ${decoder(u.search).replace(/[?&=/]/g, ' ')}`;
	const duLibelle = genreDuTexte(lien.texte);
	const duFichier = genreDuTexte(fichier);
	const lu = duLibelle ?? duFichier;
	if (!lu) return null;
	const textes = [duLibelle, duFichier].filter(Boolean);
	if (textes.some((t) => t.deliberation) && !textes.some((t) => t.pieceJointe)) return null;
	return {
		url: lien.href,
		genre: lu.genre,
		exercice: duLibelle?.exercice ?? duFichier?.exercice ?? null,
		budget: budgetDe(textes),
		libelle: lien.texte.slice(0, OBJET_MAX)
	};
}

function budgetDe(textes) {
	if (textes.some((t) => t.annexe)) return 'annexe';
	return textes.some((t) => t.principal) ? 'principal' : 'inconnu';
}

const OBJET_FLATE = /\/FlateDecode/;
// Un flux se juge sur son debut, borne des deux cotes : un flux d'image d'une page
// scannee se decompresse en dizaines de Mo, et la glane mourait en tas plein (D-178).
const FLUX_LU_OCTETS = 256 * 1024;
const FLUX_CLAIR_MAX = 4 * 1024 * 1024;
// La valeur de `zlib.constants.Z_SYNC_FLUSH` : ce module est lu par les Functions,
// ou `node:zlib` n'existe pas (le deploiement du 2026-10-16 a echoue sur l'import).
const Z_SYNC_FLUSH = 2;
const TEXTE_PDF = /\/Font\b|\/ToUnicode\b|\bBT\b[\s\S]{0,400}?\bT[jJ]\b/;

/** Les flux d'un PDF en clair : tels quels sans filtre, decompresses un a un pour FlateDecode (debut seulement, borne en clair) ; un flux illisible ou d'un autre filtre est saute. */
function* fluxClairs(brut, inflate) {
	for (const m of brut.matchAll(/stream\r?\n/g)) {
		const debut = m.index + m[0].length;
		const fin = brut.indexOf('endstream', debut);
		if (fin < 0) return;
		const objet = brut.slice(Math.max(0, m.index - 300), m.index);
		if (!OBJET_FLATE.test(objet)) {
			if (!/\/Filter\b/.test(objet)) yield brut.slice(debut, fin);
			continue;
		}
		try {
			yield inflate(Buffer.from(brut.slice(debut, Math.min(fin, debut + FLUX_LU_OCTETS)), 'latin1'), { finishFlush: Z_SYNC_FLUSH, maxOutputLength: FLUX_CLAIR_MAX }).toString('latin1');
		} catch {
			continue;
		}
	}
}

/**
 * Le format d'un fichier lu et, pour un PDF, s'il porte une couche texte : une
 * police ou un operateur de texte, dans les octets ou dans un flux decompresse
 * (les objets d'un PDF recent vivent dans des flux). `inconnue` quand le fichier a
 * ete tronque sans rien montrer.
 */
export function coucheTexte(octets, { tronque = false, inflate } = {}) {
	const brut = Buffer.from(octets).toString('latin1');
	if (!brut.startsWith('%PDF')) return { format: formatDe(brut), couche: 'non' };
	if (TEXTE_PDF.test(brut)) return { format: 'pdf', couche: 'oui' };
	for (const clair of fluxClairs(brut, inflate)) {
		if (TEXTE_PDF.test(clair)) return { format: 'pdf', couche: 'oui' };
	}
	return { format: 'pdf', couche: tronque ? 'inconnue' : 'non' };
}

// La page de garde d'une maquette M14, M57 ou M4 (D-185) : les memes lignes que lit le corpus.
const SIRET_IMPRIME = /SIRET\s*:?\s*(\d[\d ]{12,20}\d)/;
const ANNEE_IMPRIMEE = /^\s*ANNEE\s+(20\d\d)\s*$/m;
const LIBELLE_IMPRIME = /^\s*BUDGET\s*:\s*(.+?)\s*(?:\(\d\))?\s*$/m;
// Les chaines des operateurs de texte, et les operateurs qui changent de ligne.
const OPERATEURS_TEXTE = /\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>|\bT(?:[dDm]\b|\*)|\bET\b|'|"/g;
const ECHAPPEMENTS = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
// Les pages d'une maquette ne sont pas dans l'ordre du fichier : la garde se cherche jusqu'ici.
const TEXTE_LU_MAX = 24 * 1024 * 1024;

function chaineLitterale(s) {
	return s.replace(/\\([0-7]{1,3}|.)/g, (_, e) => (/^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : (ECHAPPEMENTS[e] ?? e)));
}

function chaineHexadecimale(h) {
	return h.replace(/../g, (o) => String.fromCharCode(parseInt(o, 16)));
}

/** Le texte imprime par un flux de contenu : une ligne par bloc positionne, les chaines concatenees ; `'` et `"` montrent leur chaine sur la ligne SUIVANTE. */
function texteDuFlux(clair) {
	const lignes = [];
	let ligne = '';
	let derniere = '';
	for (const [t] of clair.matchAll(OPERATEURS_TEXTE)) {
		if (t.startsWith('(') || t.startsWith('<')) {
			derniere = t.startsWith('(') ? chaineLitterale(t.slice(1, -1)) : chaineHexadecimale(t.slice(1, -1).replace(/\s/g, ''));
			ligne += derniere;
		} else if (t === "'" || t === '"') {
			lignes.push(ligne.slice(0, ligne.length - derniere.length));
			ligne = derniere;
		} else {
			lignes.push(ligne);
			ligne = '';
		}
	}
	lignes.push(ligne);
	return lignes.join('\n');
}

/**
 * Ce que la page de garde d'une maquette imprime (D-185) : le SIRET du budget
 * (l'identifiant de sa balance DGFiP, propre a chaque budget principal ou
 * annexe), le libelle de la ligne « BUDGET : » et l'exercice de la ligne
 * « ANNEE N », qui date le compte mieux que son lien ou sa publication. Null
 * pour ce que le texte ne porte pas.
 */
export function identiteImprimee(texte) {
	const siret = texte.match(SIRET_IMPRIME)?.[1].replace(/ /g, '') ?? null;
	return { siret: siret?.length === 14 ? siret : null, budgetImprime: texte.match(LIBELLE_IMPRIME)?.[1].trim() ?? null, exerciceImprime: texte.match(ANNEE_IMPRIMEE)?.[1] ?? null };
}

/**
 * L'identite imprimee d'un PDF lu : la page de garde est le flux qui porte le
 * SIRET ET la ligne « ANNEE N » ensemble (les annexes d'un compte impriment le
 * SIRET d'autres budgets, une ligne « ANNEE N » seule date un emprunt, et la
 * garde d'un CFU n'a pas de ligne « BUDGET : »). Les pages ne sont pas dans
 * l'ordre du fichier : les flux se lisent jusqu'a la garde, ou `texteMax`
 * octets en clair. Tout null sans garde.
 */
export function identiteDuPdf(octets, { inflate, texteMax = TEXTE_LU_MAX }) {
	const brut = Buffer.from(octets).toString('latin1');
	let lus = 0;
	for (const clair of fluxClairs(brut, inflate)) {
		lus += clair.length;
		if (/\bBT\b/.test(clair)) {
			const lue = identiteImprimee(texteDuFlux(clair));
			if (lue.siret && lue.exerciceImprime) return lue;
		}
		if (lus > texteMax) break;
	}
	return identiteImprimee('');
}

function formatDe(debut) {
	if (debut.startsWith('\x89PNG')) return 'png';
	if (debut.startsWith('\xff\xd8')) return 'jpeg';
	if (/^\s*<(?:!doctype|html)/i.test(debut)) return 'html';
	if (debut.startsWith('PK')) return 'zip';
	return 'autre';
}

/**
 * Les actes deja dates a relire ce passage (D-193) : ceux dont la derniere
 * lecture (relecture, sinon datation) date d'au moins `jours`, les plus anciens
 * d'abord, `max` au plus. Il faut le recu, la commune, la nature et l'objet
 * (requis pour un acte) pour redemander la datation ; `[url, entree]` dans
 * l'ordre de relecture.
 */
export function aRelire(pdfs, { jour, jours, max }) {
	const limite = new Date(Date.parse(`${jour}T00:00:00Z`) - jours * 864e5).toISOString().slice(0, 10);
	const dernier = ([, e]) => e.relu ?? e.jour;
	return Object.entries(pdfs)
		.filter(([, e]) => e.id && e.code && e.nature && e.libelle && dernier([, e]) <= limite)
		.sort((a, b) => (dernier(a) < dernier(b) ? -1 : dernier(a) > dernier(b) ? 1 : 0))
		.slice(0, max);
}

/**
 * Ce que dit la reponse du service a une relecture : `inchange` (les memes
 * octets), `remplace` (une version nouvelle datee), `disparu-404` ou
 * `disparu-410`, `illisible` (autre refus de lecture, ou demande refusee :
 * reessayer ne la changerait pas, elle ne doit pas garder la tete de la file) ; null quand il faut
 * reessayer a un autre passage (deja lu ce jour, plafond, erreur du service).
 */
export function issueDeRelecture(statut, corps = {}) {
	if (statut === 200) return 'inchange';
	if (statut === 201) return 'remplace';
	if (statut === 400) return 'illisible';
	if (statut === 422) {
		const disparu = (corps.details ?? []).join(' ').match(/repondu (404|410)\b/);
		return disparu ? `disparu-${disparu[1]}` : 'illisible';
	}
	return null;
}

/**
 * Les familles d'un refus de lecture du temoin, de la plus precise a la plus
 * large ; la premiere qui reconnait le motif donne la classe. `definitif` : la
 * meme adresse relue un autre jour rendrait le meme refus.
 */
const CLASSES_DE_LECTURE = [
	['disparu', true, /repondu (?:404|410)\b/],
	['source-4xx', true, /repondu 4(?!08|29)\d\d\b/],
	['contenu', true, /a la place d|d un autre format|de moins de \d+ octets/],
	['trop-gros', true, /au-dela de \d+ octets/],
	['adresse', true, /adresse privee|non public|redirection|location|seulement|identifiants|url illisible/],
	['source-5xx', false, /repondu (?:5\d\d|408|429)\b/],
	['delai', false, /au-dela de \d+ s\b|timeout|timed out|aborted/i]
];

/**
 * Ce qu'est un refus du service a un depot de la glane : `{ classe, definitif }`.
 * Un refus de lecture se classe sur son motif (`details`) ; un refus de
 * lecture sans motif connu (reseau, resolution, motif absent d'un etat ancien)
 * est `transitoire` et se redemande a un autre passage, dans la limite des essais.
 * Tout autre refus (hors du site officiel, demande refusee) est definitif.
 */
export function refusDeDepot(statut, corps = {}) {
	if (statut !== 422 || corps.erreur !== 'lecture impossible') return { classe: corps.erreur === 'hors du site officiel' ? 'hors-site' : 'refus', definitif: true };
	const motif = (corps.details ?? []).join(' ');
	const trouvee = CLASSES_DE_LECTURE.find(([, , re]) => re.test(motif));
	return trouvee ? { classe: trouvee[0], definitif: trouvee[1] } : { classe: 'transitoire', definitif: false };
}

/**
 * Les communes deja inscrites au releve d'un jour (`glane-<jour>.tsv`, en-tete
 * compris) : un passage relance le meme jour reprend apres elles.
 */
export function communesDuReleve(tsv) {
	return new Set(
		tsv
			.split('\n')
			.slice(1)
			.map((ligne) => ligne.split('\t')[0])
			.filter(Boolean)
	);
}

/**
 * Ce qu'une page lue laisse dans les statuts du passage : une page coupee a la
 * borne d'octets n'est pas lue en entier, et un passage n'annonce rien d'absent
 * sur une page dont il n'a pas vu la fin.
 */
export const statutLu = (lecture) => (lecture.tronque ? 'tronque' : lecture.statut);

/**
 * Les envois d'un passage, en lots bornes : tous les recus partent, au plus
 * `vus` et `absents` par envoi (le service en admet 500 a la fois). Couper la
 * liste a la premiere borne laissait les recus suivants d'une grande commune
 * sur l'etat d'un ancien passage, pour toujours.
 */
export function lotsDuPassage(vus, absents, { parVus = 400, parAbsents = 100 } = {}) {
	const lots = [];
	for (let i = 0, j = 0; i < vus.length || j < absents.length; i += parVus, j += parAbsents)
		lots.push({ vus: vus.slice(i, i + parVus), absents: absents.slice(j, j + parAbsents) });
	return lots;
}

/**
 * Ecrit l'etat de la glane d'un bloc : un fichier voisin, puis un renommage.
 * Une interruption laisse l'ancien etat entier, jamais un fichier tronque.
 * `fs` est passe pour que ce module reste sans acces disque.
 */
export function ecrireAtomique(fs, chemin, texte) {
	const voisin = `${chemin}.${process.pid}.tmp`;
	fs.writeFileSync(voisin, texte);
	fs.renameSync(voisin, chemin);
}

/**
 * Une reponse de la passerelle (502, 503, 504) dit que le service est absent, pas
 * que l'acte est en cause : elle ne s'inscrit pas a l'etat de l'acte et ne
 * consomme aucun essai, comme une absence de reponse.
 */
export const estUnePasserelle = (statut) => statut === 502 || statut === 503 || statut === 504;

/** Un echec du service : un 5xx, ou aucune reponse (reseau, echeance). */
const echecDuService = (statut) => typeof statut !== 'number' || statut >= 500;

/**
 * Le disjoncteur des appels au service : apres `seuil` echecs de suite, il
 * s'ouvre et refuse tout appel pendant `pauseMs`, puis laisse passer un seul
 * essai par pause ; la premiere reponse sous 500 le referme. `dire` recoit
 * l'ouverture et la fermeture ; `maintenant` est l'horloge.
 */
export class Disjoncteur {
	constructor({ seuil = 20, pauseMs = 5 * 60000, maintenant = Date.now, dire = () => {} } = {}) {
		Object.assign(this, { seuil, pauseMs, maintenant, dire });
		this.echecs = 0;
		this.reprise = null;
	}

	get ouvert() {
		return this.reprise !== null;
	}

	/** Un appel pourrait-il partir ? Ne consomme pas l'essai : a demander avant les attentes. */
	pourrait() {
		return !this.ouvert || this.maintenant() >= this.reprise;
	}

	/**
	 * Un appel part-il ? Ouvert, un seul par pause : l'accord repousse la reprise
	 * suivante. A demander juste avant l'envoi, sans attente entre les deux, pour
	 * qu'un appel engage avant l'ouverture ne parte pas apres elle.
	 */
	permet() {
		if (!this.ouvert) return true;
		if (!this.pourrait()) return false;
		this.reprise = this.maintenant() + this.pauseMs;
		return true;
	}

	/** Note l'issue d'un appel : un statut HTTP, ou un mot (`reseau`, `echeance`) sans reponse. */
	noter(statut) {
		if (!echecDuService(statut)) {
			this.echecs = 0;
			if (this.ouvert) {
				this.reprise = null;
				this.dire({ disjoncteur: 'ferme', statut });
			}
			return;
		}
		this.echecs++;
		if (this.ouvert || this.echecs < this.seuil) return;
		this.reprise = this.maintenant() + this.pauseMs;
		this.dire({ disjoncteur: 'ouvert', echecs: this.echecs, statut, pauseMs: this.pauseMs });
	}
}

// L'empreinte du TEXTE d'un PDF (D-193) : le sha256 des chaines que ses flux de
// contenu MONTRENT, dans l'ordre du fichier, hors mise en page, polices,
// images et metadonnees. Deux encodages du meme document (flux recompresses,
// autre `Producer`, dates d'objet neuves) ont la meme empreinte ; un texte qui
// change en change. Ne compte que ce qu'un lecteur voit : les operandes de
// `Tj`, `TJ`, `'` et `"` hors des modes de rendu invisibles (`3 Tr`, `7 Tr`,
// la couche OCR d'un scan en fait partie), jamais une chaine d'un dictionnaire
// (`ActualText`, proprietes d'un `BDC`) ni d'une image en ligne. La lecture dit
// son ETENDUE : `complete`, `partielle` (un flux qui peut porter du texte n'a
// pas pu etre lu : autre filtre, zlib abime ou tronque) ou `inconnue` (pas un
// PDF, chiffre, au-dela des plafonds). Seule une lecture complete donne une
// empreinte : annoncer un remplacement sur une comparaison tronquee, ce serait
// annoncer un changement qui n'a pas eu lieu. Limite connue : une police
// re-sous-ensemblee change les codes des glyphes, donc l'empreinte. Pur, sans
// `node:` (les Functions le chargent) ; la decompression passe par
// `DecompressionStream`.

import { sha256 } from './chaine.mjs';

// Un flux de contenu depasse rarement quelques centaines de Ko en clair ; au-dela, ce n'est pas du texte.
export const FLUX_CLAIR_MAX = 16 * 1024 * 1024;
// Le plafond du PDF ENTIER : un petit fichier de mille flux comprimes a 16 Mo
// chacun ferait decompresser des gigaoctets au service partage.
export const TEXTE_CLAIR_TOTAL_MAX = 64 * 1024 * 1024;
export const FLUX_PAR_PDF_MAX = 5000;
export const ETENDUE = Object.freeze({ complete: 'complete', partielle: 'partielle', inconnue: 'inconnue' });
// La methode de l'empreinte, rangee avec elle : 1 = toutes les chaines des flux (jusqu'au 2026-11-03), 2 = les chaines montrees,
// 3 = les memes, un flux coupe au milieu d'un objet texte lu d'un seul tenant avec le suivant (un redecoupage des memes
// instructions ne change plus rien), les flux fermes separes comme avant.
// Deux empreintes ne se comparent qu'a methode egale.
export const METHODE_DU_TEXTE = 3;
const DICTIONNAIRE_LU = 400;
// Ce qu'on lit apres un `EI` candidat pour juger qu'il ferme l'image : des instructions ne portent aucun octet de
// controle, des pixels presque toujours.
const LUS_APRES_EI = 32;
const SUITE_D_INSTRUCTIONS = /^\s*(?:$|[A-Za-z0-9[(<%/.+\-'"])[^\x00-\x08\x0b\x0e-\x1f]*$/;
// Ce que le dictionnaire d'un flux dit quand il ne porte pas de texte imprime.
// (`<< /S n` ouvre le flux d'indices d'un PDF linearise, `/N n` un profil de couleurs ICC.)
const SANS_TEXTE =
	/\/Subtype\s*\/Image\b|\/Length[123]\b|\/Type\s*\/(?:XRef|ObjStm|Metadata|EmbeddedFile|XObject\s*\/Subtype\s*\/Image)\b|\/FontFile|<<\s*\/S\s+\d+\b|\/N\s+\d+\b(?!\s+\d+\s+R)/;
const FLATE = /\/Filter\s*(?:\/FlateDecode\b|\[\s*\/FlateDecode\s*\])/;
// Un filtre d'image : le flux est une image, meme sans `/Subtype /Image` a portee du dictionnaire lu.
const FILTRE_D_IMAGE = /\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)\b/;
const CHIFFRE = /\/Encrypt\b/;
// Les modes de rendu qui ne montrent rien : 3 (invisible) et 7 (decoupe seule).
const MODES_INVISIBLES = new Set([3, 7]);
const OPERATEURS_DE_TEXTE = new Set(['Tj', "'", '"']);
const DELIMITEUR = /[\s()<>[\]{}/%\0]/;
const ECHAPPEMENTS = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
// Des octets apres la fin d'un flux zlib entier (bourrage d'un producteur) : la lecture refuse, le flux est pourtant sorti entier.
const BRUIT_APRES_LA_FIN = /trailing/i;
const latin1 = new TextDecoder('latin1');

const chaineHexadecimale = (h) => {
	const hex = h.replace(/[^0-9A-Fa-f]/g, '');
	return (hex.length % 2 ? `${hex}0` : hex).replace(/../g, (o) => String.fromCharCode(parseInt(o, 16)));
};

/** Les octets en clair d'un flux FlateDecode et s'il est sorti ENTIER : `clair` null au-dela de `max` ou sans rien de lisible, `entier` faux sur une fin tronquee ou abimee. */
export async function degonfler(octets, max = FLUX_CLAIR_MAX) {
	const lecteur = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
	const morceaux = [];
	let total = 0;
	let entier = true;
	try {
		for (;;) {
			const { done, value } = await lecteur.read();
			if (done) break;
			total += value.byteLength;
			if (total > max) {
				await lecteur.cancel();
				return { clair: null, entier: false };
			}
			morceaux.push(value);
		}
	} catch (erreur) {
		// Un flux tronque ou abime : ce qui en est sorti se lit, mais la lecture n'est plus entiere.
		entier = BRUIT_APRES_LA_FIN.test(`${erreur?.code ?? ''} ${erreur?.message ?? ''}`);
	}
	// Un flux vide est entier : il ne montre rien.
	if (!total) return { clair: null, entier };
	const clair = new Uint8Array(total);
	let i = 0;
	for (const m of morceaux) {
		clair.set(m, i);
		i += m.byteLength;
	}
	return { clair, entier };
}

/** Les octets en clair d'un flux FlateDecode, ce qui se lit avant une fin tronquee compris ; null au-dela de `max` ou sans rien de lisible. */
export async function gonfler(octets, max = FLUX_CLAIR_MAX) {
	return (await degonfler(octets, max)).clair;
}

/** Le dictionnaire du flux seul : ce que la fenetre lue porte apres le dernier `obj`, sans le dictionnaire de l'objet d'avant (dont le `/Filter` ferait prendre un flux en clair pour du zlib). */
function dictionnaireDuFlux(fenetre) {
	const obj = fenetre.search(/\bobj\b(?![\s\S]*\bobj\b)/);
	return obj < 0 ? fenetre : fenetre.slice(obj + 3);
}

/** La fin des octets du flux : `/Length` direct quand il tient avant `endstream`, sinon la fin de ligne qui precede `endstream` retiree (elle n'est pas du flux ; laissee, elle passe pour une fin abimee, et un octet de donnee peut lui ressembler). */
function finDuFlux(brut, dictionnaire, debut, fin) {
	const longueur = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionnaire);
	const apres = longueur ? debut + Number(longueur[1]) : fin + 1;
	// Une longueur declaree ne fait foi que si `endstream` la suit : des producteurs la donnent fausse.
	if (apres <= fin && !brut.slice(apres, fin).trim()) return apres;
	if (brut.endsWith('\r\n', fin)) return fin - 2;
	return brut[fin - 1] === '\n' || brut[fin - 1] === '\r' ? fin - 1 : fin;
}

/** La fin d'un flux par son `/Length` direct, quand `endstream` la suit : des octets du flux peuvent ecrire `endstream`. */
function finDeclaree(brut, dictionnaire, debut) {
	const longueur = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionnaire);
	if (!longueur) return -1;
	const apres = debut + Number(longueur[1]);
	return /^[\r\n \t]*endstream/.test(brut.slice(apres, apres + 16)) ? brut.indexOf('endstream', apres) : -1;
}

/** Les flux du PDF qui peuvent porter du texte, `{ octets, flate, illisible }`, dans l'ordre du fichier ; `illisible` quand un filtre que ce lecteur ne sait pas defaire protege peut-etre du texte, `tronque` pour un flux sans `endstream`. */
function* fluxDuPdf(octets, brut) {
	let dejaLu = 0;
	for (const m of brut.matchAll(/(?<!end)stream\r?\n/g)) {
		// Un `stream` dans les octets du flux d'avant n'ouvre rien.
		if (m.index < dejaLu) continue;
		const debut = m.index + m[0].length;
		const dictionnaire = dictionnaireDuFlux(brut.slice(Math.max(0, m.index - DICTIONNAIRE_LU), m.index));
		const declaree = finDeclaree(brut, dictionnaire, debut);
		const fin = declaree >= 0 ? declaree : brut.indexOf('endstream', debut);
		// Un flux sans fin : ce qu'il portait n'est pas lu, la lecture n'est pas complete.
		if (fin < 0) {
			yield { tronque: true };
			return;
		}
		dejaLu = fin;
		if (SANS_TEXTE.test(dictionnaire) || FILTRE_D_IMAGE.test(dictionnaire)) continue;
		const flate = FLATE.test(dictionnaire);
		yield { octets: octets.subarray(debut, finDuFlux(brut, dictionnaire, debut, fin)), flate, illisible: !flate && /\/Filter\b/.test(dictionnaire) };
	}
}

/** La chaine litterale d'un flux de contenu depuis sa parenthese ouvrante : `{ valeur, fin }`, `fin` juste apres la fermante. */
function chaineLitterale(s, debut) {
	let profondeur = 1;
	let valeur = '';
	let i = debut + 1;
	while (i < s.length && profondeur) {
		const c = s[i++];
		if (c === '\\') {
			const octal = /^[0-7]{1,3}/.exec(s.slice(i, i + 3));
			if (octal) {
				valeur += String.fromCharCode(parseInt(octal[0], 8));
				i += octal[0].length;
			} else {
				const e = s[i++];
				// Une barre devant une fin de ligne continue la chaine sans rien imprimer.
				if (e === '\r' && s[i] === '\n') i++;
				if (e !== '\r' && e !== '\n') valeur += ECHAPPEMENTS[e] ?? e ?? '';
			}
		} else if (c === '(') {
			profondeur++;
			valeur += c;
		} else if (c === ')') {
			profondeur--;
			if (profondeur) valeur += c;
		} else valeur += c;
	}
	return { valeur, fin: i };
}

/**
 * La fin des octets d'une image en ligne. Sa longueur quand son dictionnaire la
 * donne (`/L`, `/Length`, PDF 2.0) ; sinon le premier `EI` isole que suit ce qui
 * ressemble a des instructions : un debut de jeton, puis aucun octet de controle
 * (des pixels en portent presque toujours, un texte accentue jamais). Sans un tel
 * `EI`, le premier : au pire, la lecture d'avant.
 */
function finDeLImageEnLigne(s, debut) {
	const longueur = longueurDeLImage(s, debut);
	if (longueur !== null) {
		const fin = debut + 1 + longueur;
		const ei = /^\s*EI(?=\s|$)/.exec(s.slice(fin));
		if (ei) return fin + ei[0].length;
	}
	const ei = /\sEI(?=\s|$)/g;
	ei.lastIndex = debut;
	let premier = null;
	for (let m = ei.exec(s); m; m = ei.exec(s)) {
		const fin = m.index + m[0].length;
		premier ??= fin;
		if (SUITE_D_INSTRUCTIONS.test(s.slice(fin, fin + LUS_APRES_EI))) return fin;
	}
	return premier ?? s.length;
}

/** La longueur declaree d'une image en ligne, lue dans son dictionnaire entre `BI` et `ID` ; null sans elle. */
function longueurDeLImage(s, id) {
	const bi = s.lastIndexOf('BI', id);
	if (bi < 0) return null;
	const m = /\/(?:L|Length)\s+(\d+)\b/.exec(s.slice(bi, id));
	return m ? Number(m[1]) : null;
}

/** Les jetons d'un flux de contenu : `{ type: 'chaine' | 'nombre' | 'nom' | 'delimiteur' | 'operateur', valeur }`, les images en ligne sautees. */
function* jetons(s) {
	let i = 0;
	while (i < s.length) {
		const c = s[i];
		if (/\s|\0/.test(c)) i++;
		else if (c === '%') {
			while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
		} else if (c === '(') {
			const { valeur, fin } = chaineLitterale(s, i);
			yield { type: 'chaine', valeur };
			i = fin;
		} else if (c === '<' && s[i + 1] !== '<') {
			const fin = s.indexOf('>', i);
			if (fin < 0) return;
			yield { type: 'chaine', valeur: chaineHexadecimale(s.slice(i + 1, fin)) };
			i = fin + 1;
		} else if (c === '<' || c === '>') {
			const double = s[i + 1] === c;
			if (double) yield { type: 'delimiteur', valeur: c + c };
			i += double ? 2 : 1;
		} else if (c === '[' || c === ']') {
			yield { type: 'delimiteur', valeur: c };
			i++;
		} else if (c === '{' || c === '}' || c === ')') i++;
		else {
			let fin = i + 1;
			while (fin < s.length && !DELIMITEUR.test(s[fin])) fin++;
			const mot = s.slice(c === '/' ? i + 1 : i, fin);
			i = fin;
			if (c === '/') yield { type: 'nom', valeur: mot };
			else if (/^[+-.\d]/.test(mot)) yield { type: 'nombre', valeur: parseFloat(mot) };
			else {
				yield { type: 'operateur', valeur: mot };
				if (mot === 'ID') i = finDeLImageEnLigne(s, i);
			}
		}
	}
}

const chainesDe = (operandes) =>
	operandes
		.flatMap((o) => (Array.isArray(o) ? o : [o]))
		.filter((o) => o.type === 'chaine')
		.map((o) => o.valeur)
		.join('');
const dernierNombre = (operandes) => operandes.findLast((o) => o.type === 'nombre')?.valeur;

/**
 * Un lecteur des chaines MONTREES par des flux de contenu, les blancs reduits :
 * operandes des operateurs de texte, hors modes de rendu invisibles. Il garde
 * son etat d'un flux au suivant tant qu'un flux se ferme au milieu d'un objet
 * texte ou d'un tableau : le contenu d'une page coupe en plusieurs flux
 * (`/Contents [a b]`) se lit comme un seul. Un flux ferme hors de tout objet
 * texte remet l'etat a neuf, comme une page nouvelle.
 */
export function lecteurDeTexte() {
	let mode = 0;
	let enTexte = false;
	let dictionnaire = 0;
	let pile = [];
	let operandes = [];
	let tableau = null;
	const coupe = () => enTexte || tableau !== null;
	return { lire, coupe };

	/** Les chaines montrees par ce flux. */
	function lire(clair) {
		let texte = '';
		for (const jeton of jetons(clair)) {
			if (jeton.type === 'delimiteur') {
				if (jeton.valeur === '[') tableau = [];
				else if (jeton.valeur === ']') {
					if (tableau) operandes.push(tableau);
					tableau = null;
				} else dictionnaire = Math.max(0, dictionnaire + (jeton.valeur === '<<' ? 1 : -1));
				continue;
			}
			if (jeton.type !== 'operateur') {
				(tableau ?? operandes).push(jeton);
				continue;
			}
			// Un mot dans un dictionnaire en ligne (proprietes d'un `BDC`) est une valeur, pas un operateur.
			if (dictionnaire) continue;
			const op = jeton.valeur;
			if (op === 'BT') enTexte = true;
			else if (op === 'ET') enTexte = false;
			else if (op === 'Tr') mode = dernierNombre(operandes) ?? mode;
			else if (op === 'q') pile.push(mode);
			else if (op === 'Q') mode = pile.length ? pile.pop() : mode;
			else if ((op === 'TJ' || OPERATEURS_DE_TEXTE.has(op)) && enTexte && !MODES_INVISIBLES.has(mode)) texte += chainesDe(operandes);
			operandes = [];
			tableau = null;
		}
		if (!coupe()) {
			mode = 0;
			dictionnaire = 0;
			pile = [];
			operandes = [];
		}
		return texte;
	}
}

const blancsReduits = (texte) => texte.replace(/\s+/g, ' ').trim();

/** Les chaines montrees par un flux de contenu en clair, lu seul, les blancs reduits. */
export const texteImprime = (clair) => blancsReduits(lecteurDeTexte().lire(clair));

/** La lecture du texte montre par un PDF : `{ texte, etendue }`, `texte` null sans chaine montree, `etendue` dans `ETENDUE`. */
export async function lireLeTexte(octets) {
	const inconnu = { texte: null, etendue: ETENDUE.inconnue };
	if (!octets?.byteLength) return inconnu;
	const brut = latin1.decode(octets);
	// Un PDF chiffre : ses chaines et ses flux ne sont pas le texte, et une cle neuve les change tous.
	if (!brut.startsWith('%PDF') || CHIFFRE.test(brut)) return inconnu;
	const morceaux = [];
	let enCours = '';
	let etendue = ETENDUE.complete;
	let reste = TEXTE_CLAIR_TOTAL_MAX;
	let lus = 0;
	const lecteur = lecteurDeTexte();
	for (const flux of fluxDuPdf(octets, brut)) {
		// Au-dela d'un plafond, le texte n'est pas connu : rien, jamais une partie.
		if (++lus > FLUX_PAR_PDF_MAX) return inconnu;
		if (flux.tronque || flux.illisible) {
			etendue = ETENDUE.partielle;
			continue;
		}
		const max = Math.min(FLUX_CLAIR_MAX, reste);
		const { clair, entier } = flux.flate ? await degonfler(flux.octets, max) : { clair: flux.octets, entier: true };
		if (!clair && max < FLUX_CLAIR_MAX) return inconnu;
		if (!entier) etendue = ETENDUE.partielle;
		if (!clair) continue;
		if (flux.flate) reste -= clair.byteLength;
		const lisible = latin1.decode(clair);
		// Un flux sans objet texte ne montre rien, sauf la suite d'un flux coupe.
		if (!lecteur.coupe() && !/\bBT\b/.test(lisible)) continue;
		// Un flux coupe au milieu d'un objet texte continue dans le suivant, sans separateur : les memes instructions
		// coupees en deux se lisent comme un seul flux. Un flux ferme se separe du suivant, comme une page d'une autre.
		enCours += lecteur.lire(lisible);
		if (lecteur.coupe()) continue;
		const morceau = blancsReduits(enCours);
		if (morceau) morceaux.push(morceau);
		enCours = '';
	}
	// Un objet texte ou un tableau encore ouvert a la fin : la suite n'a pas ete lue.
	if (lecteur.coupe()) etendue = ETENDUE.partielle;
	if (blancsReduits(enCours)) morceaux.push(blancsReduits(enCours));
	return { texte: morceaux.length ? morceaux.join('\n') : null, etendue };
}

/** Le texte montre par TOUT le PDF, ou null quand la lecture n'est pas complete ou qu'aucun flux ne montre une chaine. */
export async function texteDuPdf(octets) {
	const { texte, etendue } = await lireLeTexte(octets);
	return etendue === ETENDUE.complete ? texte : null;
}

/** L'empreinte du texte d'un PDF (64 hex), ou null quand il n'en a pas de lisible en entier. */
export async function empreinteDuTexte(octets) {
	const texte = await texteDuPdf(octets);
	return texte === null ? null : sha256(texte);
}

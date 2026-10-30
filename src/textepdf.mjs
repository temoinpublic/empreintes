// L'empreinte du TEXTE d'un PDF (D-193) : le sha256 des chaines que ses flux de
// contenu impriment, dans l'ordre du fichier, hors mise en page, polices,
// images et metadonnees. Deux encodages du meme document (flux recompresses,
// autre `Producer`, dates d'objet neuves) ont la meme empreinte ; un texte qui
// change en change. Null pour ce qui n'est pas un PDF ou n'imprime aucune
// chaine ainsi. Limite connue : une police re-sous-ensemblee change les codes
// des glyphes, donc l'empreinte. Pur, sans `node:` (les Functions le chargent) ;
// la decompression passe par `DecompressionStream`.

import { sha256 } from './chaine.mjs';

// Un flux de contenu depasse rarement quelques centaines de Ko en clair ; au-dela, ce n'est pas du texte.
export const FLUX_CLAIR_MAX = 16 * 1024 * 1024;
const DICTIONNAIRE_LU = 400;
// Ce que le dictionnaire d'un flux dit quand il ne porte pas de texte imprime.
const SANS_TEXTE = /\/Subtype\s*\/Image\b|\/Length[123]\b|\/Type\s*\/(?:XRef|ObjStm|Metadata|EmbeddedFile|XObject\s*\/Subtype\s*\/Image)\b|\/FontFile/;
const FLATE = /\/Filter\s*(?:\/FlateDecode\b|\[\s*\/FlateDecode\s*\])/;
const CHAINES = /\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>/g;
const ECHAPPEMENTS = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
const latin1 = new TextDecoder('latin1');

const chaineLitterale = (s) => s.replace(/\\([0-7]{1,3}|.)/g, (_, e) => (/^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : (ECHAPPEMENTS[e] ?? e)));
const chaineHexadecimale = (h) => h.replace(/\s/g, '').replace(/../g, (o) => String.fromCharCode(parseInt(o, 16)));

/** Les octets en clair d'un flux FlateDecode, ce qui se lit avant une fin tronquee compris ; null au-dela de `max` ou sans rien de lisible. */
export async function gonfler(octets, max = FLUX_CLAIR_MAX) {
	const lecteur = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
	const morceaux = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await lecteur.read();
			if (done) break;
			total += value.byteLength;
			if (total > max) {
				await lecteur.cancel();
				return null;
			}
			morceaux.push(value);
		}
	} catch {
		// Un flux tronque ou abime : ce qui en est sorti compte, comme la glane.
	}
	if (!total) return null;
	const clair = new Uint8Array(total);
	let i = 0;
	for (const m of morceaux) {
		clair.set(m, i);
		i += m.byteLength;
	}
	return clair;
}

/** Les flux du PDF qui peuvent porter du texte, `{ dictionnaire, octets, flate }`, dans l'ordre du fichier. */
function* fluxDuPdf(octets, brut) {
	for (const m of brut.matchAll(/(?<!end)stream\r?\n/g)) {
		const debut = m.index + m[0].length;
		const fin = brut.indexOf('endstream', debut);
		if (fin < 0) return;
		const dictionnaire = brut.slice(Math.max(0, m.index - DICTIONNAIRE_LU), m.index);
		if (SANS_TEXTE.test(dictionnaire)) continue;
		const flate = FLATE.test(dictionnaire);
		if (!flate && /\/Filter\b/.test(dictionnaire)) continue;
		yield { octets: octets.subarray(debut, fin), flate };
	}
}

/** Les chaines imprimees par un flux de contenu en clair, concatenees, les blancs reduits. */
export function texteImprime(clair) {
	let texte = '';
	for (const [t] of clair.matchAll(CHAINES)) texte += t.startsWith('(') ? chaineLitterale(t.slice(1, -1)) : chaineHexadecimale(t.slice(1, -1));
	return texte.replace(/\s+/g, ' ').trim();
}

/** Le texte imprime par tout le PDF, ou null quand ce n'est pas un PDF ou qu'aucun flux n'imprime une chaine. */
export async function texteDuPdf(octets) {
	const brut = latin1.decode(octets);
	if (!brut.startsWith('%PDF')) return null;
	const morceaux = [];
	for (const flux of fluxDuPdf(octets, brut)) {
		const clair = flux.flate ? await gonfler(flux.octets) : flux.octets;
		if (!clair) continue;
		const lisible = latin1.decode(clair);
		if (!/\bBT\b/.test(lisible)) continue;
		const texte = texteImprime(lisible);
		if (texte) morceaux.push(texte);
	}
	return morceaux.length ? morceaux.join('\n') : null;
}

/** L'empreinte du texte d'un PDF (64 hex), ou null quand il n'en a pas de lisible. */
export async function empreinteDuTexte(octets) {
	if (!octets?.byteLength) return null;
	const texte = await texteDuPdf(octets);
	return texte === null ? null : sha256(texte);
}

// Les sources nommees (D-314) : la table que l'entrepot publie avec le journal,
// de la cle d'une feuille vers ce qu'un lecteur reconnait (le document, son
// editeur, son adresse). Pur, servi tel quel au navigateur.

/** La table des sources nommees, publiee par l'entrepot dans `donnees/empreintes/`. */
export const SOURCES_NOMMEES = 'sources-nommees.json';

const texte = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** L'adresse si elle est une adresse web : elle finit dans un `href`. */
function adresseWeb(url) {
	try {
		const u = new URL(url);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
	} catch {
		return null;
	}
}

/**
 * Ce que la table dit de la cle d'une feuille : `{ libelle, editeur, url, hote }`,
 * ou null quand elle ne la nomme pas. La cle d'un document d'une liste
 * (`<source>/<document>`) se lit sous le nom de sa source.
 */
export function nommer(table, cle) {
	if (!Array.isArray(table) || typeof cle !== 'string') return null;
	const nom = cle.split('/')[0];
	const source = table.find((s) => s?.nom === cle) ?? table.find((s) => s?.nom === nom);
	const adresse = adresseWeb(source?.url);
	if (!adresse) return null;
	return { libelle: texte(source.libelle), editeur: texte(source.editeur), url: adresse.href, hote: adresse.hostname.replace(/^www\./, '') };
}

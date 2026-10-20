// Le recu d'un produit de la flotte (D-167) : auregistre, puis les autres,
// deposent l'empreinte de chaque recu de consultation qu'ils servent. Pur :
// ni reseau, ni base.
//
// Le recu du produit est public a son adresse, donc son empreinte est
// DECLAREE : un tiers telecharge le fichier, le hache et retrouve la ligne.
// Le depot passe sous le jeton de la flotte, avec un plafond propre a chaque
// produit, hors des depots exterieurs du jour et hors du bilan public des
// deposants. La ligne publique reste celle de tout depot ; le produit et
// l'adresse de son recu vivent dans le recu, version 5.

/** Les produits de la flotte qui servent un recu, dans l'ordre ou D-167 les branche. */
export const PRODUITS = ['auregistre', 'quivad', 'titelia', 'murparmur', 'rendita'];
/** Au plus autant de recus par produit et par jour. */
export const RECUS_PAR_PRODUIT_PAR_JOUR = 1000;
/** La cle de compte d'un produit : en clair, jamais une adresse, et hors du bilan public. */
export const PREFIXE_PRODUIT = 'produit:';
export const cleDuProduit = (nom) => `${PREFIXE_PRODUIT}${nom}`;

const URL_MAX = 2048;

/**
 * Lit le champ `produit` d'une demande : `{ nom, url }`, le nom d'un produit
 * de la flotte et l'adresse publique de son recu. Rend `{ nom, url }`, ou null
 * quand la demande n'en porte pas ; chaque defaut s'ajoute a `erreurs`.
 */
export function lireProduit(corps, erreurs) {
	const produit = corps.produit;
	if (produit === undefined || produit === null) return null;
	if (typeof produit !== 'object' || Array.isArray(produit)) {
		erreurs.push('produit : un objet { nom, url }');
		return null;
	}
	if (!PRODUITS.includes(produit.nom)) erreurs.push(`produit.nom : ${PRODUITS.map((p) => `"${p}"`).join(', ')}`);
	if (!adressePublique(produit.url)) erreurs.push(`produit.url : l adresse https du recu, ${URL_MAX} caracteres au plus`);
	if (corps.sha256 === undefined) erreurs.push('produit : le sha256 du recu est requis, le recu reste chez le produit');
	if (corps.url !== undefined) erreurs.push('produit : pas d url a lire, seulement le sha256');
	return erreurs.length ? null : { nom: produit.nom, url: produit.url };
}

function adressePublique(url) {
	if (typeof url !== 'string' || url.length > URL_MAX) return false;
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

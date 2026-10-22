// L'API des offres (D-195) : la cle d'un client, son plafond, et ce que le recu
// vaut, dit dans la reponse. Pur : ni reseau, ni base.
//
// FERMEE tant que la variable `OFFRE_API` du projet ne vaut pas `ouverte` :
// aucune cle n'est vendue avant le 2027-08-14, et une cle presentee rend 401
// comme un jeton inconnu. Le registre des clients est la variable secrete
// `CLIENTS_API`, un tableau JSON :
//   [{"id":"<a-z0-9->","offre":"<offre>","jeton":"<sha256 du jeton remis>","plafond":<n>}]
// Le jeton remis au client n'est jamais ecrit : seul son sha256 l'est.

import { sha256 } from './chaine.mjs';
import { CHEMINS_DES_OFFRES } from './offre.mjs';

/** La valeur de `OFFRE_API` qui ouvre l'API des offres ; toute autre la garde fermee. */
export const OFFRE_API_OUVERTE = 'ouverte';
/** Le prefixe de la cle de compte d'un client, hors du plafond public et du bilan des deposants. */
export const PREFIXE_CLIENT = 'client:';
/** Au plus autant de depots par jour pour un client, quel que soit son contrat. */
export const PLAFOND_CLIENT_MAX = 50000;

const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Vrai quand l'environnement ouvre l'API des offres. */
export const offreOuverte = (env) => env?.OFFRE_API === OFFRE_API_OUVERTE;

/** L'etat de l'API des offres pour la sonde : ouverte ou fermee, et le nombre de clients (null sur un registre hors format). */
export function etatDeLApi(env) {
	if (!offreOuverte(env)) return { etat: 'fermee' };
	try {
		return { etat: OFFRE_API_OUVERTE, clients: lireRegistre(env.CLIENTS_API).length };
	} catch {
		return { etat: OFFRE_API_OUVERTE, clients: null };
	}
}

/**
 * Lit le registre des clients ; leve sur la premiere entree hors format, pour
 * qu'une erreur de saisie ferme la porte au lieu d'en ouvrir une autre.
 */
export function lireRegistre(texte) {
	if (!texte) return [];
	const liste = JSON.parse(texte);
	if (!Array.isArray(liste)) throw new Error('clients : un tableau JSON est attendu');
	const ids = new Set();
	return liste.map((c, i) => {
		const ok =
			ID.test(c?.id ?? '') &&
			Object.hasOwn(CHEMINS_DES_OFFRES, c.offre) &&
			HEX64.test(c.jeton ?? '') &&
			Number.isInteger(c.plafond) &&
			c.plafond >= 1 &&
			c.plafond <= PLAFOND_CLIENT_MAX;
		if (!ok || ids.has(c.id)) throw new Error(`clients entree ${i + 1} : hors format`);
		ids.add(c.id);
		return { id: c.id, offre: c.offre, jeton: c.jeton, plafond: c.plafond };
	});
}

const egaux = (a, b) => {
	let ecart = a.length ^ b.length;
	for (let i = 0; i < Math.min(a.length, b.length); i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return ecart === 0;
};

/**
 * Le client que designe l'en-tete `authorization` (`Bearer <jeton>`), ou null.
 * Toutes les entrees sont comparees, en temps constant sur leurs empreintes.
 */
export async function clientDuJeton(entete, registre) {
	if (typeof entete !== 'string' || !entete.startsWith('Bearer ')) return null;
	const jeton = entete.slice(7).trim();
	if (!jeton) return null;
	const empreinte = await sha256(jeton);
	let trouve = null;
	for (const c of registre) if (egaux(empreinte, c.jeton)) trouve = c;
	return trouve && { id: trouve.id, offre: trouve.offre, plafond: trouve.plafond };
}

/** La cle de compte d'un client : son identifiant, jamais son jeton. */
export const cleDuClient = (client) => `${PREFIXE_CLIENT}${client.id}`;

/**
 * Ce que le recu vaut et ne vaut pas, dans les termes des pages d'offre et de
 * l'article 8 des conditions en brouillon. Rendu avec chaque depot d'un client
 * et chaque verification : un recu ne promet rien de plus.
 */
export const PORTEE_DU_RECU = Object.freeze({
	prouve: 'Le document existait tel quel à la date inscrite : son empreinte, son rang dans le relevé du jour et l’ancrage du relevé.',
	ne_prouve_pas: [
		'qui a écrit le document, ce qu’il montre, ni s’il dit vrai',
		'une date certaine pour un acte sous seing privé (article 1377 du code civil)',
		'qu’un destinataire a reçu le document'
	],
	date_certaine: false,
	qualifie: false,
	qualification: 'Le service n’est inscrit sur aucune liste de confiance : le reçu n’est pas qualifié au sens du règlement (UE) n° 910/2014.'
});

/**
 * Jusqu'ou la verification est allee, a cote du booleen : `authentique` reste
 * vrai quand le journal n'a pas pu etre lu, et un integrateur ne doit pas
 * confondre ce cas avec une inscription relue. `complete` : inscrit au journal ;
 * `attente` : pas encore dans un tour ; `indeterminee` : le journal n'a pas pu
 * etre lu ; `refusee` : le recu n'est pas authentique.
 */
const VERIFICATION_DE_L_INSCRIPTION = { inscrit: 'complete', attente: 'attente' };

/**
 * Le verdict d'une verification de recu, depuis ce que le service a relu :
 * `ligne` la ligne publique (null si le registre ne connait pas l'identifiant),
 * `inscription` l'etat du recu dans le journal publie, `signature` la
 * signature du deposant relue (null sans signature), `produit` le recu d'un
 * produit de la flotte relu a son adresse (null sans produit, D-167).
 */
export function verdictDuRecu({ id, recu, ligne, inscription, signature, produit = null }) {
	if (!ligne) return { authentique: false, verification: 'refusee', id, raison: 'recu inconnu du registre', portee: PORTEE_DU_RECU };
	const authentique = (signature?.ok ?? true) && inscription?.etat !== 'non conforme';
	return {
		authentique,
		verification: authentique ? (VERIFICATION_DE_L_INSCRIPTION[inscription?.etat] ?? 'indeterminee') : 'refusee',
		id,
		empreinte: ligne.sha256,
		jour: ligne.jour,
		place: Number(ligne.place),
		depose: recu.depose,
		source: recu.source,
		inscription,
		...(signature ? { signature } : {}),
		...(produit ? { produit } : {}),
		page: `https://temoinpublic.fr/recu/${id}`,
		portee: PORTEE_DU_RECU
	};
}

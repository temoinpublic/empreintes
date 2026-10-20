// Le depot d'une empreinte par un tiers : sa demande, son recu et la ligne
// publique qui entre dans le journal. Pur : ni reseau, ni base.
//
// Ce qui se publie, une ligne par depot dans `/depots/<jour>.jsonl` :
//   {"sha256":"<64 hex>","jour":"AAAA-MM-JJ","place":<n>,"recu":"<64 hex>"}
// cles dans cet ordre, sans espace, terminee par "\n" ; `place` est le rang de
// la ligne dans le fichier du jour, a partir de 1 ; `recu` est le sha256 du
// recu canonique. Le libelle, l'URL et ce que le temoin a lu restent dans le
// recu rendu au deposant, jamais sur une page publique. Un acte de collectivite
// (D-165, `src/acte.mjs`) a la MEME ligne : sa collectivite et sa nature sont
// dans le recu, version 2, et l'entrepot refuse toute ligne elargie. De meme
// l'affichage d'un permis (D-166, `src/affichage.mjs`) : le numero du permis
// est dans le recu, version 3. Un depot SIGNE par son deposant (D-164,
// `src/origine.mjs`) porte sa signature (`jws` ou `cades`) et le certificat qu'elle nomme dans le
// recu, version 4, quel que soit son type ; la ligne publique reste la meme.
// Le recu d'un produit de la flotte (D-167, `src/produit.mjs`) porte le produit
// et l'adresse publique de son recu, version 5.

import { lireActe } from './acte.mjs';
import { lireAffichage } from './affichage.mjs';
import { sha256 } from './chaine.mjs';
import { estUnJws, estUneSignature } from './origine.mjs';
import { lireProduit, RECUS_PAR_PRODUIT_PAR_JOUR } from './produit.mjs';

/** Au plus autant de depots par adresse et par jour. */
export const DEPOTS_PAR_ADRESSE = 20;
/** Au plus autant de depots par jour, toutes adresses confondues. */
export const DEPOTS_PAR_JOUR = 2000;
/** Au plus autant d'actes par jour deposes par la glane de la flotte (D-178), hors des deux plafonds ci-dessus. */
export const ACTES_DE_LA_FLOTTE_PAR_JOUR = 5000;
/** La cle de compte de la glane : en clair, jamais une adresse, et hors du bilan public des deposants. */
export const CLE_DE_LA_FLOTTE = 'flotte';
export const LIBELLE_MAX = 200;
export const URL_MAX = 2048;
/** La version du recu ; une forme nouvelle prend un numero nouveau. */
export const VERSION_DU_RECU = 1;
/** Le recu d'un acte de collectivite, qui porte en plus son champ `acte`. */
export const VERSION_DU_RECU_ACTE = 2;
/** Le recu d'un affichage de permis, qui porte en plus son champ `affichage`. */
export const VERSION_DU_RECU_AFFICHAGE = 3;
/** Le recu d'un depot signe par son deposant, qui porte en plus son champ `signature`. */
export const VERSION_DU_RECU_SIGNE = 4;
/** Le recu d'un produit de la flotte, qui porte en plus son champ `produit`. */
export const VERSION_DU_RECU_PRODUIT = 5;
/** Les types de depot, hors le depot ordinaire qui n'en a pas. */
export const TYPES = ['acte', 'affichage'];

const HEX64 = /^[0-9a-f]{64}$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
// Les caracteres de controle, et les deux separateurs qui coupent une ligne JSON lue en JavaScript.
const CONTROLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** Le jour UTC d'un instant. */
export const jourDe = (instant) => new Date(instant).toISOString().slice(0, 10);

/**
 * Lit la demande d'un deposant : une empreinte declaree OU une URL a lire par
 * le temoin, et un libelle facultatif. Rend `{ demande }` ou `{ erreurs }`.
 */
export function lireDemande(corps) {
	const erreurs = [];
	if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return { erreurs: ['corps : un objet JSON est attendu'] };
	const inconnus = Object.keys(corps).filter((k) => !['sha256', 'url', 'libelle', 'type', 'collectivite', 'nature', 'signature', 'produit'].includes(k));
	if (inconnus.length) erreurs.push(`champs inconnus : ${inconnus.join(', ')}`);
	const type = typeof corps.type === 'string' ? corps.type.trim() : corps.type;
	if (type !== undefined && !TYPES.includes(type)) erreurs.push(`type : ${TYPES.map((t) => `"${t}"`).join(', ')} ou rien`);
	const empreinte = typeof corps.sha256 === 'string' ? corps.sha256.trim().toLowerCase() : corps.sha256;
	const url = typeof corps.url === 'string' ? corps.url.trim() : corps.url;
	if (empreinte === undefined && url === undefined && corps.type === undefined) erreurs.push('sha256 ou url : l un des deux est requis');
	if (empreinte !== undefined && url !== undefined) erreurs.push('sha256 ou url : pas les deux, le temoin calcule l empreinte lui-meme');
	if (empreinte !== undefined && !(typeof empreinte === 'string' && HEX64.test(empreinte))) erreurs.push('sha256 : 64 caracteres hexadecimaux');
	if (url !== undefined && !(typeof url === 'string' && url.length > 0 && url.length <= URL_MAX)) erreurs.push(`url : texte de 1 a ${URL_MAX} caracteres`);
	const libelle = lireLibelle(corps.libelle, erreurs);
	const acte = lireActe(corps, erreurs);
	const affichage = lireAffichage(corps, erreurs);
	const produit = lireProduit(corps, erreurs);
	if (corps.signature !== undefined && !estUneSignature(corps.signature)) erreurs.push('signature : un JWS compact (JAdES) ou une signature CAdES detachee en base64, 32 768 caracteres au plus');
	if (erreurs.length) return { erreurs: [...new Set(erreurs)] };
	return { demande: { ...(empreinte !== undefined ? { sha256: empreinte } : { url }), ...(libelle ? { libelle } : {}), ...(acte ? { acte } : {}), ...(affichage ? { affichage } : {}), ...(produit ? { produit } : {}), ...(corps.signature ? { signature: corps.signature } : {}) } };
}

function lireLibelle(valeur, erreurs) {
	if (valeur === undefined || valeur === null) return null;
	if (typeof valeur !== 'string') {
		erreurs.push('libelle : un texte');
		return null;
	}
	const libelle = valeur.trim().replace(/\s+/g, ' ');
	if (libelle.length > LIBELLE_MAX) erreurs.push(`libelle : ${LIBELLE_MAX} caracteres au plus`);
	if (CONTROLE.test(valeur.replace(/[\t\n\r]/g, ' '))) erreurs.push('libelle : aucun caractere de controle');
	return libelle || null;
}

/** La serialisation canonique : cles triees a chaque niveau, aucun espace, champs absents omis. */
export function canonique(valeur) {
	if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur);
	if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(',')}]`;
	const cles = Object.keys(valeur)
		.filter((k) => valeur[k] !== undefined)
		.sort();
	return `{${cles.map((k) => `${JSON.stringify(k)}:${canonique(valeur[k])}`).join(',')}}`;
}

/** Un sel de 128 bits : l'identifiant public du recu ne se devine pas depuis son libelle. */
export function selAleatoire() {
	const octets = new Uint8Array(16);
	globalThis.crypto.getRandomValues(octets);
	return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

/**
 * Le recu d'un depot. `temoin` porte ce que le service a lu lui-meme (url
 * finale, taille, type, instant de lecture) ; sans lui, l'empreinte est
 * declaree par le deposant et le recu le dit (`source`). Il ne porte pas sa
 * place : elle se donne a l'insertion, apres que le recu est fige, et c'est la
 * ligne publique qui lie les deux. `acte` porte la collectivite, la nature et
 * le rattachement (`site-officiel` ou `declaree`) d'un acte de collectivite ;
 * `affichage` porte le numero du permis dont le panneau est photographie ;
 * `produit` le nom du produit de la flotte et l'adresse publique de son recu ;
 * `signature` la signature du deposant (`valeur`, rendue en `jws` ou `cades`)
 * et le certificat qu'elle nomme, deja verifies,
 * avec `autorite` (pays et nom) quand une liste de confiance porte son emetteur.
 */
export function recuDe({ sha256: empreinte, instant, libelle = null, url = null, temoin = null, acte = null, affichage = null, produit = null, signature = null, sel = selAleatoire() }) {
	if (!HEX64.test(empreinte)) throw new Error('recu : sha256 illisible');
	if (acte && !temoin) throw new Error('recu : un acte est toujours lu par le temoin');
	if (affichage && temoin) throw new Error('recu : un affichage est une empreinte declaree, la photo reste sur le telephone');
	if (produit && temoin) throw new Error('recu : le recu d un produit est une empreinte declaree, le recu reste chez le produit');
	return {
		version: versionDuRecu({ acte, affichage, produit, signature }),
		sha256: empreinte,
		jour: jourDe(instant),
		depose: new Date(instant).toISOString(),
		source: temoin ? 'temoin' : 'declare',
		libelle: libelle ?? undefined,
		url: url ?? undefined,
		temoin: temoin ? { url: temoin.url, taille: temoin.taille, type: temoin.type ?? null, lu: temoin.lu } : undefined,
		acte: acte ? { collectivite: acte.collectivite, nature: acte.nature, rattachement: acte.rattachement } : undefined,
		affichage: affichage ? { permis: affichage.permis } : undefined,
		produit: produit ? { nom: produit.nom, url: produit.url } : undefined,
		signature: signature ? { ...(estUnJws(signature.valeur) ? { jws: signature.valeur } : { cades: signature.valeur }), certificat: signature.certificat, sujet: signature.sujet, emetteur: signature.emetteur, autorite: signature.autorite ?? undefined } : undefined,
		sel
	};
}

function versionDuRecu({ acte, affichage, produit, signature }) {
	if (signature) return VERSION_DU_RECU_SIGNE;
	if (acte) return VERSION_DU_RECU_ACTE;
	if (affichage) return VERSION_DU_RECU_AFFICHAGE;
	return produit ? VERSION_DU_RECU_PRODUIT : VERSION_DU_RECU;
}

/** Les versions de recu que le service a emises ; un recu d'une autre version n'en est pas un. */
export const VERSIONS_DU_RECU = [VERSION_DU_RECU, VERSION_DU_RECU_ACTE, VERSION_DU_RECU_AFFICHAGE, VERSION_DU_RECU_SIGNE, VERSION_DU_RECU_PRODUIT];

/** Vrai quand la valeur a la forme d'un recu emis par le service : version connue, empreinte, sel. */
export const estUnRecu = (r) => VERSIONS_DU_RECU.includes(r?.version) && HEX64.test(r.sha256 ?? '') && /^[0-9a-f]{32}$/.test(r.sel ?? '');

/** L'identifiant public d'un recu : le sha256 de sa forme canonique. */
export const idDuRecu = (recu) => sha256(canonique(recu));

/** La ligne publique d'un depot, cles dans l'ordre du format, terminee par un saut de ligne. */
export function ligneDe({ sha256: empreinte, jour, place, recu }) {
	if (!HEX64.test(empreinte) || !HEX64.test(recu)) throw new Error('ligne : sha256 et recu en 64 hex');
	if (!JOUR.test(jour)) throw new Error('ligne : jour AAAA-MM-JJ');
	if (!Number.isInteger(place) || place < 1) throw new Error('ligne : place entiere a partir de 1');
	return `${JSON.stringify({ sha256: empreinte, jour, place, recu })}\n`;
}

/** La ligne publique d'un recu a sa place. */
export async function ligneDuRecu(recu, place) {
	return ligneDe({ sha256: recu.sha256, jour: recu.jour, place, recu: await idDuRecu(recu) });
}

/**
 * Relit un fichier `/depots/<jour>.jsonl` : chaque ligne a la forme exacte du
 * format, son jour est celui du fichier et les places se suivent depuis 1.
 * Rend les lignes, ou leve sur la premiere qui s'ecarte.
 */
export function lireFichierDuJour(texte, jour) {
	if (texte === '') return [];
	if (!texte.endsWith('\n')) throw new Error('depots : le fichier finit par un saut de ligne');
	return texte
		.slice(0, -1)
		.split('\n')
		.map((brute, i) => {
			let ligne;
			try {
				ligne = JSON.parse(brute);
			} catch {
				throw new Error(`depots ligne ${i + 1} : JSON illisible`);
			}
			if (ligne?.jour !== jour || ligne.place !== i + 1 || `${brute}\n` !== ligneOuNull(ligne)) throw new Error(`depots ligne ${i + 1} : hors format`);
			return ligne;
		});
}

function ligneOuNull(ligne) {
	try {
		return ligneDe(ligne);
	} catch {
		return null;
	}
}

/** La cle sous laquelle une adresse est comptee un jour : jamais l'adresse elle-meme. */
export const cleDAdresse = (adresse, selDuJour) => sha256(`${adresse}\n${selDuJour}`);

/** Les secondes jusqu'au prochain minuit UTC, quand les compteurs repartent. */
export function secondesAvantDemain(instant) {
	const t = new Date(instant);
	const minuit = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
	return Math.max(1, Math.ceil((minuit - t.getTime()) / 1000));
}

/**
 * Vrai quand l'en-tete `authorization` porte le jeton de la glane (`Bearer <jeton>`).
 * Compare les empreintes des deux, de meme longueur ; sans jeton configure,
 * personne n'est la flotte.
 */
export async function estLaFlotte(entete, jeton) {
	if (!jeton || typeof entete !== 'string' || !entete.startsWith('Bearer ')) return false;
	const [a, b] = await Promise.all([sha256(entete.slice(7).trim()), sha256(jeton)]);
	let ecart = 0;
	for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return ecart === 0;
}

/**
 * Le verdict des plafonds : `{ ok: true }`, ou le motif et le `retry-after` en
 * secondes. La glane de la flotte, un produit de la flotte (D-167) et un client
 * des offres (D-195) n'ont que le leur, `deCetteAdresse` est alors leur propre
 * compte du jour.
 */
export function plafond({ deCetteAdresse, duJour, instant, flotte = false, client = null, produit = null }) {
	if (produit) return deCetteAdresse >= RECUS_PAR_PRODUIT_PAR_JOUR ? { ok: false, motif: 'plafond du produit atteint', apres: secondesAvantDemain(instant) } : { ok: true };
	if (client) return deCetteAdresse >= client.plafond ? { ok: false, motif: 'plafond du client atteint', apres: secondesAvantDemain(instant) } : { ok: true };
	if (flotte)
		return deCetteAdresse >= ACTES_DE_LA_FLOTTE_PAR_JOUR ? { ok: false, motif: 'plafond de la flotte atteint', apres: secondesAvantDemain(instant) } : { ok: true };
	if (duJour >= DEPOTS_PAR_JOUR) return { ok: false, motif: 'plafond du jour atteint', apres: secondesAvantDemain(instant) };
	if (deCetteAdresse >= DEPOTS_PAR_ADRESSE) return { ok: false, motif: 'plafond de cette adresse atteint', apres: secondesAvantDemain(instant) };
	return { ok: true };
}

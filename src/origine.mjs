// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Florian Mousseau. Ce fichier seul est sous licence MIT
// (LICENSES/MIT.txt) pour que tout logiciel, ouvert ou ferme, puisse verifier.
// La signature du deposant : l'origine d'un depot, prouvee par celui qui le
// fait (D-164, REQ-7.5-03 du reglement d'execution 2025/2531). Un JWS compact
// JAdES dont la charge utile est l'empreinte du document (64 hex minuscules),
// jointe ou detachee, certificat dans `x5c` ; ou une signature CAdES detachee
// (CMS en base64) dont le `messageDigest` signe est cette empreinte. Le service
// verifie la signature sous la cle du certificat et sa validite a l'instant du
// depot, puis remonte la chaine jusqu'a une autorite des listes de confiance
// quand on lui en donne le registre. Le meme fichier tourne dans le navigateur
// et sous Node.

import { sha256 } from './chaine.mjs';
import { certificat, element, enfants } from './horodatage.mjs';

/** Au plus autant de caracteres pour une signature : un certificat et sa chaine y tiennent. */
export const SIGNATURE_MAX = 32768;

/** Les algorithmes admis, ceux de JAdES que WebCrypto relit. */
const ALGORITHMES = {
	ES256: { cle: { name: 'ECDSA', namedCurve: 'P-256' }, verification: { name: 'ECDSA', hash: 'SHA-256' } },
	ES384: { cle: { name: 'ECDSA', namedCurve: 'P-384' }, verification: { name: 'ECDSA', hash: 'SHA-384' } },
	RS256: { cle: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verification: { name: 'RSASSA-PKCS1-v1_5' } },
	PS256: { cle: { name: 'RSA-PSS', hash: 'SHA-256' }, verification: { name: 'RSA-PSS', saltLength: 32 } }
};
/** Les en-tetes critiques que le service comprend ; tout autre fait refuser la signature (RFC 7515, 4.1.11). */
const CRITIQUES_COMPRIS = ['sigT'];
/** QcCompliance (ETSI EN 319 412-5) : le certificat se declare conforme a l'annexe I d'eIDAS. */
const QC_COMPLIANCE = '060604008e460101';
const ATTRIBUTS = { '550403': 'CN', '55040a': 'O' };

const HEX64 = /^[0-9a-f]{64}$/;
const JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$/;
const encodeur = new TextEncoder();
const hex = (octets) => Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');

const depuisBase64 = (texte) => {
	const b64 = texte.replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const versBase64Url = (octets) => btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Vrai quand le texte a la forme d'un JWS compact, charge jointe ou detachee. */
export const estUnJws = (texte) => typeof texte === 'string' && texte.length <= SIGNATURE_MAX && JWS.test(texte);

/** La valeur texte d'un attribut de nom : BMPString en UTF-16, le reste en UTF-8. */
const texteDe = (el) => (el.etiquette === 0x1e ? new TextDecoder('utf-16be').decode(el.contenu) : new TextDecoder().decode(el.contenu));

/** Le nom lisible d'un Name X.509 : son nom commun et son organisation, sans doublon. */
export function nomLisible(nom) {
	const valeurs = {};
	for (const rdn of enfants(nom))
		for (const attribut of enfants(rdn)) {
			const [oid, valeur] = enfants(attribut);
			const cle = ATTRIBUTS[hex(oid.contenu)];
			if (cle && !valeurs[cle]) valeurs[cle] = texteDe(valeur).trim();
		}
	return [...new Set([valeurs.CN, valeurs.O].filter(Boolean))].join(', ') || null;
}

/** L'en-tete et le certificat d'un JWS, ou la raison pour laquelle on ne les lit pas. */
function lireEnTete(morceau) {
	let entete;
	try {
		entete = JSON.parse(new TextDecoder().decode(depuisBase64(morceau)));
	} catch {
		return { refus: 'en-tete illisible' };
	}
	if (!Array.isArray(entete?.x5c) || typeof entete.x5c[0] !== 'string') return { refus: 'certificat absent (x5c)' };
	try {
		const der = depuisBase64(entete.x5c[0]);
		return { entete, der, cert: certificat(der) };
	} catch {
		return { refus: 'certificat illisible' };
	}
}

/** Les ecarts de l'en-tete : algorithme admis, en-tetes critiques compris, `x5t#S256` qui designe le certificat. */
async function ecartsDeLEnTete(entete, der) {
	const raisons = [];
	if (!ALGORITHMES[entete.alg]) raisons.push(`algorithme ${entete.alg} non admis`);
	const critiques = entete.crit ?? [];
	if (!Array.isArray(critiques) || critiques.some((c) => !CRITIQUES_COMPRIS.includes(c) || !(c in entete))) raisons.push('en-tete critique non compris');
	if (entete['x5t#S256'] !== undefined && entete['x5t#S256'] !== versBase64Url(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', der))))
		raisons.push('x5t#S256 ne designe pas le certificat');
	return raisons;
}

async function signatureJuste(algorithme, spki, signature, donnees) {
	try {
		const cle = await globalThis.crypto.subtle.importKey('spki', spki, algorithme.cle, false, ['verify']);
		return await globalThis.crypto.subtle.verify(algorithme.verification, cle, signature, donnees);
	} catch {
		return false;
	}
}

const CONDENSATS_RSA = { '2a864886f70d01010b': 'SHA-256', '2a864886f70d01010c': 'SHA-384', '2a864886f70d01010d': 'SHA-512' };
const CONDENSATS_ECDSA = { '2a8648ce3d040302': 'SHA-256', '2a8648ce3d040303': 'SHA-384', '2a8648ce3d040304': 'SHA-512' };
const COURBES = { '2a8648ce3d030107': ['P-256', 32], '2b81040022': ['P-384', 48], '2b81040023': ['P-521', 66] };

/** Une signature ECDSA X.509 (DER, deux entiers) dans la forme brute r||s que lit WebCrypto. */
function ecdsaBrute(der, taille) {
	const brute = new Uint8Array(2 * taille);
	enfants(element(der, 0)).forEach((entier, i) => {
		const octets = entier.contenu.subarray(Math.max(0, entier.contenu.length - taille));
		brute.set(octets, (i + 1) * taille - octets.length);
	});
	return brute;
}

/** Vrai quand `parent` a signe `enfant` : RSA PKCS#1 v1.5 ou ECDSA, SHA-256 a 512. */
async function signePar(enfant, parent) {
	try {
		const rsa = CONDENSATS_RSA[enfant.algorithme];
		if (rsa) return await signatureJuste({ cle: { name: 'RSASSA-PKCS1-v1_5', hash: rsa }, verification: { name: 'RSASSA-PKCS1-v1_5' } }, parent.spki, enfant.signature, enfant.tbs);
		const hache = CONDENSATS_ECDSA[enfant.algorithme];
		const [courbe, taille] = COURBES[hex(enfants(enfants(element(parent.spki, 0))[0])[1].contenu)] ?? [];
		if (!hache || !courbe) return false;
		return await signatureJuste({ cle: { name: 'ECDSA', namedCurve: courbe }, verification: { name: 'ECDSA', hash: hache } }, parent.spki, ecdsaBrute(enfant.signature, taille), enfant.tbs);
	} catch {
		return false;
	}
}


/**
 * Vrai quand l'autorite etait inscrite a l'instant `t` (millisecondes) : une
 * de ses periodes `[debut, fin]` du registre le contient, `fin` null pour
 * celle qui court. Une entree sans periodes (registre d'avant l'historique)
 * vaut inscrite.
 */
export function inscriteA(autorite, t) {
	if (!Array.isArray(autorite.periodes)) return true;
	return autorite.periodes.some(([debut, fin]) => (debut === null || Date.parse(debut) <= t) && (fin === null || t < Date.parse(fin)));
}

/**
 * L'autorite des listes de confiance au bout d'une chaine de certificats en DER,
 * chacun signe par le suivant, inscrite a l'instant ou elle a emis le maillon
 * d'en dessous (son debut de validite) ; null sinon.
 */
async function autoriteDeLaChaine(ders, autorites) {
	let enfant = null;
	for (const [rang, der] of ders.entries()) {
		let cert;
		try {
			cert = certificat(der);
		} catch {
			return null;
		}
		if (enfant && !(await signePar(enfant, cert))) return null;
		const autorite = enfant ? autorites[await sha256(der)] : null;
		if (autorite) return inscriteA(autorite, enfant.debut) ? { pays: autorite.pays, nom: autorite.nom } : null;
		// Un maillon qui en signe un autre doit etre une autorite de certification :
		// sans cela, le certificat d'un particulier signerait une identite fabriquee.
		if (enfant && !peutCertifier(der, rang - 1)) return null;
		enfant = cert;
	}
	return null;
}

const BASIC_CONSTRAINTS = '551d13';
const KEY_USAGE = '551d0f';
/** keyCertSign, bit 5 de keyUsage (RFC 5280, 4.2.1.3) : 0x04 dans le premier octet. */
const KEY_CERT_SIGN = 0x04;

/** Les extensions d'un certificat en DER : la valeur de chacune (contenu de son OCTET STRING), par OID. */
function extensionsDe(der) {
	const dernier = enfants(enfants(element(der, 0))[0]).at(-1);
	if (dernier.etiquette !== 0xa3) return {};
	return Object.fromEntries(
		enfants(enfants(dernier)[0]).map((extension) => {
			const parties = enfants(extension);
			return [hex(parties[0].contenu), parties.at(-1).contenu];
		})
	);
}

/**
 * Vrai quand le certificat peut en certifier d'autres (RFC 5280, 4.2.1.9 et
 * 6.1.4) : `cA` dans basicConstraints, keyCertSign s'il declare son usage, et
 * un `pathLenConstraint` qui admet les `sous` autorites intermediaires placees
 * en dessous de lui.
 */
function peutCertifier(der, sous) {
	try {
		const extensions = extensionsDe(der);
		const contraintes = extensions[BASIC_CONSTRAINTS];
		if (!contraintes) return false;
		const champs = enfants(element(contraintes, 0));
		if (champs[0]?.etiquette !== 0x01 || champs[0].contenu[0] === 0) return false;
		const longueur = champs.find((c) => c.etiquette === 0x02);
		if (longueur && longueur.contenu.reduce((n, o) => n * 256 + o, 0) < sous) return false;
		const usage = extensions[KEY_USAGE];
		return !usage || (element(usage, 0).contenu[1] & KEY_CERT_SIGN) !== 0;
	} catch {
		return false;
	}
}

/**
 * L'autorite des listes de confiance qui a emis le certificat : on remonte
 * `x5c`, chaque certificat signe par le suivant, jusqu'au premier dont
 * l'empreinte est dans `autorites` (le registre de `src/confiance.mjs`), et
 * qui etait inscrite quand elle a emis le maillon d'en dessous. Le
 * certificat du deposant lui-meme n'en est jamais une. Null sinon.
 */
export async function autoriteDuCertificat(x5c, autorites) {
	if (!autorites || !Array.isArray(x5c)) return null;
	let ders;
	try {
		ders = x5c.map(depuisBase64);
	} catch {
		return null;
	}
	return autoriteDeLaChaine(ders, autorites);
}

/** Ce que le recu dit du certificat du deposant ; `chaine` (DER) mene a l'autorite quand `autorites` est donne. */
async function descriptionDuCertificat(der, cert, chaine, autorites) {
	return {
		empreinte: await sha256(der),
		sujet: nomLisible(cert.nomSujet),
		emetteur: nomLisible(cert.nomEmetteur),
		jusquau: new Date(cert.fin).toISOString(),
		qcCompliance: cert.extensions.includes(QC_COMPLIANCE),
		...(autorites ? { autorite: await autoriteDeLaChaine(chaine, autorites) } : {})
	};
}

const valideA = (cert, instant) => {
	const t = Date.parse(instant);
	return t >= cert.debut && t <= cert.fin;
};
const HORS_VALIDITE = "le certificat n'est pas valide a l'instant du depot";

async function verifierJws(jws, empreinte, instant, autorites) {
	const [h, charge, s] = jws.split('.');
	const lu = lireEnTete(h);
	if (lu.refus) return { ok: false, raisons: [lu.refus], certificat: null };
	const { entete, der, cert } = lu;
	const raisons = await ecartsDeLEnTete(entete, der);
	const detachee = charge === '';
	if (!detachee && new TextDecoder().decode(depuisBase64(charge)) !== empreinte) raisons.push("la charge utile n'est pas l'empreinte du document");
	if (!valideA(cert, instant)) raisons.push(HORS_VALIDITE);
	const signee = encodeur.encode(`${h}.${detachee ? versBase64Url(encodeur.encode(empreinte)) : charge}`);
	if (ALGORITHMES[entete.alg] && !(await signatureJuste(ALGORITHMES[entete.alg], cert.spki, depuisBase64(s), signee))) raisons.push('la signature ne correspond pas');
	let chaine = [];
	try {
		chaine = entete.x5c.map(depuisBase64);
	} catch {
		chaine = [der];
	}
	return { ok: raisons.length === 0, raisons, certificat: await descriptionDuCertificat(der, cert, chaine, autorites) };
}

const OID_CMS = {
	signedData: '2a864886f70d010702',
	data: '2a864886f70d010701',
	contentType: '2a864886f70d010903',
	messageDigest: '2a864886f70d010904',
	sha256: '608648016503040201',
	rsa: '2a864886f70d010101',
	sha256AvecRsa: '2a864886f70d01010b'
};
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Vrai quand le texte a la forme d'une signature CMS en base64 (CAdES), et pas d'un JWS. */
export const estUnCades = (texte) => typeof texte === 'string' && texte.length <= SIGNATURE_MAX && texte.length % 4 === 0 && BASE64.test(texte);

/** Vrai quand le texte est une signature que le service sait lire : JWS compact JAdES ou CAdES en base64. */
export const estUneSignature = (texte) => estUnJws(texte) || estUnCades(texte);

/** Les parties d'un SignedData CMS : contenu joint ou non, signataires, certificats, et ceux du premier signataire. */
function lireCms(der) {
	const [type, enveloppe] = enfants(element(der, 0));
	if (hex(type.contenu) !== OID_CMS.signedData) throw new Error("ce n'est pas un SignedData");
	const signedData = enfants(enfants(enveloppe)[0]);
	const certificats = signedData.filter((e) => e.etiquette === 0xa0).flatMap((e) => enfants(e).filter((c) => c.etiquette === 0x30).map((c) => c.entier));
	const signataires = enfants(signedData.at(-1));
	const champs = enfants(signataires[0]);
	const i = champs.findIndex((e) => e.etiquette === 0xa0);
	return {
		jointe: enfants(signedData[2]).length > 1,
		signataires: signataires.length,
		sid: champs[1],
		condensat: hex(enfants(champs[2])[0].contenu),
		attributs: i < 0 ? null : champs[i],
		algorithme: i < 0 ? null : hex(enfants(champs[i + 1])[0].contenu),
		signature: i < 0 ? null : champs[i + 2].contenu,
		certificats
	};
}

/** Le certificat que designe l'identifiant du signataire : emetteur et numero, ou identifiant de cle. */
const designe = (sid, cert) =>
	sid.etiquette === 0x30 ? cert.emetteur === hex(enfants(sid)[0].entier) && cert.numero === hex(enfants(sid)[1].contenu) : cert.extensions.includes(hex(sid.contenu));

/** La chaine du signataire parmi les certificats du CMS : chacun suivi de celui dont le sujet est son emetteur. */
function chaineDe(signataire, certs) {
	const chaine = [signataire];
	for (let suivant; (suivant = certs.find((c) => !chaine.includes(c) && hex(c.nomSujet.entier) === chaine.at(-1).emetteur)); ) chaine.push(suivant);
	return chaine.map((c) => c.entier);
}

/** Les ecarts d'un CMS a la forme attendue : un signataire, contenu detache, SHA-256, attributs signes. */
function ecartsDeForme(cms) {
	const raisons = [];
	if (cms.signataires !== 1) raisons.push('un seul signataire est lu');
	if (cms.jointe) raisons.push('signature attachee : seul le document garde le contenu, la signature doit etre detachee');
	if (cms.condensat !== OID_CMS.sha256) raisons.push('condensat SHA-256 attendu');
	if (!cms.attributs) raisons.push('attributs signes absents');
	return raisons;
}

async function verifierCades(b64, empreinte, instant, autorites) {
	let cms;
	try {
		cms = lireCms(depuisBase64(b64));
	} catch {
		return { ok: false, raisons: ['signature CAdES illisible'], certificat: null };
	}
	const raisons = ecartsDeForme(cms);
	if (raisons.length) return { ok: false, raisons, certificat: null };
	const certs = cms.certificats.map((c) => certificat(c));
	const signataire = certs.find((c) => designe(cms.sid, c));
	if (!signataire) return { ok: false, raisons: ['certificat du signataire absent'], certificat: null };
	const attributs = Object.fromEntries(enfants(cms.attributs).map((a) => [hex(enfants(a)[0].contenu), enfants(enfants(a)[1])[0]]));
	if (hex(attributs[OID_CMS.contentType]?.contenu ?? []) !== OID_CMS.data) raisons.push("le contenu signe n'est pas un document");
	if (hex(attributs[OID_CMS.messageDigest]?.contenu ?? []) !== empreinte) raisons.push("l'empreinte signee n'est pas celle du document");
	if (!valideA(signataire, instant)) raisons.push(HORS_VALIDITE);
	const algorithme = cms.algorithme === OID_CMS.rsa ? OID_CMS.sha256AvecRsa : cms.algorithme;
	const signes = Uint8Array.of(0x31, ...cms.attributs.entier.subarray(1));
	if (!(await signePar({ algorithme, signature: cms.signature, tbs: signes }, signataire))) raisons.push('la signature ne correspond pas');
	return { ok: raisons.length === 0, raisons, certificat: await descriptionDuCertificat(signataire.entier, signataire, chaineDe(signataire, certs), autorites) };
}

/**
 * Relit la signature d'un deposant contre l'empreinte de son document, a
 * l'instant du depot : un JWS compact JAdES (charge = l'empreinte en hex,
 * certificat dans `x5c`) ou une signature CAdES detachee en base64 (le
 * `messageDigest` signe est l'empreinte du document, certificats dans le CMS).
 * Rend `{ ok, raisons, certificat }` ; `certificat` porte l'empreinte du DER,
 * le nom du sujet et de l'emetteur, la fin de validite, `qcCompliance` et,
 * quand `autorites` est donne, l'autorite des listes de confiance qui l'a
 * emis (null si aucune) ; null quand il ne se lit pas.
 */
export async function verifierSignatureDuDeposant(signature, empreinte, instant, autorites = null) {
	if (!estUneSignature(signature)) return { ok: false, raisons: ['ni JWS compact ni CAdES en base64'], certificat: null };
	if (!HEX64.test(empreinte ?? '')) return { ok: false, raisons: ['empreinte illisible'], certificat: null };
	return estUnJws(signature) ? verifierJws(signature, empreinte, instant, autorites) : verifierCades(signature, empreinte, instant, autorites);
}

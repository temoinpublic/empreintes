// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Florian Mousseau. Ce fichier seul est sous licence MIT (LICENSES/MIT.txt).
// Le dossier de preuve : tout ce qu'il faut pour relire la place d'un document
// dans le journal sans un seul appel au site. Un fichier JSON a garder avec le
// document. Les cles restent epinglees dans le code du verificateur, jamais lues
// dans le dossier : un dossier forge ne peut pas apporter la sienne.

import { chainer, empreinteDeFeuille, lieJusquA, placeDuFichier, racineDepuisChemin, sha256, verifierSignatureDuJournal, certificatDuTour } from './chaine.mjs';
import { cleSlhDuTour, verifierSignatureSlhDuJournal } from './slh.mjs';
import { tourHorodate, verifierHorodatage } from './horodatage.mjs';

export const FORMAT_DU_DOSSIER = 'dossier-de-preuve/1';

/** En-tete d'un fichier OpenTimestamps : la marque, la version 1, puis l'operation SHA-256 et son condensat. */
const MARQUE_OTS = [0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94, 0x01, 0x08];

const versBase64 = (octets) => {
	let binaire = '';
	for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
	return btoa(binaire);
};

/** Les octets d'un champ base64 du dossier ; null quand le champ n'en est pas un. */
function depuisBase64(texte) {
	try {
		return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

const lien = (t) => ({ id: t.id, precedente: t.precedente, arbre: t.arbre, racine: t.racine });
const porte = (tour, suffixe) => Boolean(tour.fichiers?.includes(`${tour.id}.racine.${suffixe}`));

/** L'horodatage qui couvre le tour : le tour horodate, les liens qui y menent, le jeton ; null sans. */
async function horodatageJoint(tours, tour, lireOctets) {
	const horodate = tourHorodate(tours, tour.id);
	if (!horodate) return null;
	const i = tours.findIndex((t) => t.id === tour.id);
	const k = tours.findIndex((t) => t.id === horodate.id);
	return { tour: horodate.id, liens: tours.slice(i + 1, k + 1).map(lien), tsr: versBase64(await lireOctets(`${horodate.id}.racine.tsr`)) };
}

/** La signature post-quantique du tour avec sa cle publique ; null quand le tour n'en porte pas ou qu'aucune cle ne le couvre. */
async function signaturePqJointe(tour, lireOctets) {
	const cle = cleSlhDuTour(tour.id);
	if (!porte(tour, 'slh') || !cle) return null;
	return { signature: versBase64(await lireOctets(`${tour.id}.racine.slh`)), cle: versBase64(await lireOctets(cle.fichier)) };
}

async function pieceDuConstat(vu, empreinte, { tours, lireReleve, lireTexte, lireOctets }) {
	const tour = tours.find((t) => t.id === vu.premier);
	const releve = await lireReleve(vu.premier);
	const place = tour && releve ? await placeDuFichier(releve, empreinte) : null;
	if (!place?.ok) return null;
	return {
		cle: vu.cle,
		jour: vu.jour ?? null,
		premier: vu.premier,
		dernier: vu.dernier ?? vu.premier,
		tour: { ...lien(tour), instant: tour.instant ?? null },
		feuille: place.feuille,
		chemin: place.chemin,
		signature: porte(tour, 'jws') ? await lireTexte(`${tour.id}.racine.jws`) : null,
		signaturePq: await signaturePqJointe(tour, lireOctets),
		horodatage: await horodatageJoint(tours, tour, lireOctets),
		bitcoin: porte(tour, 'ots') ? { ots: versBase64(await lireOctets(`${tour.id}.racine.ots`)), etat: tour.ots ?? null, bloc: tour.bloc ?? null } : null
	};
}

/**
 * Compose le dossier d'une empreinte : `vus` est sa ligne de l'index, `tours`
 * la liste de `/tours.json`, `lireReleve(id)` rend un releve plein,
 * `lireTexte(nom)` et `lireOctets(nom)` un fichier de `/empreintes/`. Rend null
 * quand aucune place ne se relit.
 */
export async function composerDossier({ site, empreinte, vus, tours, lireReleve, lireTexte, lireOctets, maintenant = new Date() }) {
	const constats = [];
	for (const vu of vus) {
		const piece = await pieceDuConstat(vu, empreinte, { tours, lireReleve, lireTexte, lireOctets });
		if (piece) constats.push(piece);
	}
	if (constats.length === 0) return null;
	return { format: FORMAT_DU_DOSSIER, site, compose: maintenant.toISOString().replace(/\.\d{3}Z$/, 'Z'), empreinte, constats };
}

/** Vrai pour un objet qui se presente comme un dossier de preuve. */
export const estUnDossier = (d) => d?.format === FORMAT_DU_DOSSIER && Array.isArray(d?.constats) && typeof d?.empreinte === 'string';

/** Le nom du fichier a garder a cote du document. */
export const nomDuDossier = (empreinte) => `preuve-${empreinte.slice(0, 16)}.json`;

/** L'instant d'un tour, lu dans son identifiant : c'est lui que la racine chainee engage, pas un champ libre du dossier. */
function instantDuTour(id) {
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(id);
	return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

const jourLu = (j) => (/^\d{4}-\d{2}-\d{2}$/.test(j) ? j : null);

async function placeRelue(c, empreinte) {
	const raisons = [];
	if (c.feuille?.sha256 !== empreinte) raisons.push("la feuille ne porte pas l'empreinte du document");
	const arbre = await racineDepuisChemin(await empreinteDeFeuille(c.feuille ?? {}), Array.isArray(c.chemin) ? c.chemin : []);
	if (arbre !== c.tour?.arbre) raisons.push("le chemin d'audit ne rend pas l'arbre du tour");
	if ((await chainer(c.tour ?? {})) !== c.tour?.racine) raisons.push('la racine chainee du tour ne correspond pas');
	return raisons;
}

async function horodatageRelu(c) {
	const h = c.horodatage;
	if (!h) return null;
	const tours = [c.tour, ...(Array.isArray(h.liens) ? h.liens : [])];
	const tsr = depuisBase64(h.tsr);
	if (tours.at(-1).id !== h.tour || !(await lieJusquA(tours, c.tour.id, h.tour, c.tour.racine))) return { ok: false, tour: h.tour ?? null, instant: null, autorite: null, raisons: ['la chaine ne relie pas ce tour au tour horodate'] };
	const v = tsr ? await verifierHorodatage(tsr, tours.at(-1).racine) : { ok: false, instant: null, autorite: null, raisons: ['horodatage illisible'] };
	return { ok: v.ok, tour: h.tour, instant: v.instant, autorite: v.autorite, raisons: v.raisons };
}

/**
 * L'horodatage eIDAS qui couvre le tour `id` de racine `racine`, lu en ligne : le
 * premier tour horodate a partir de lui, relie par une chaine intacte. Rend
 * `{ ok, instant, autorite, nom, raisons }`, ou null tant qu'aucun tour ne l'est.
 */
export async function horodatageQuiCouvre(tours, id, racine, lireOctets) {
	const tour = tourHorodate(tours, id);
	if (!tour) return null;
	const nom = `${tour.id}.racine.tsr`;
	if (!(await lieJusquA(tours, id, tour.id, racine))) return { ok: false, raisons: ['la chaine ne relie pas ce tour au tour horodate'], instant: null, autorite: null, nom };
	return { ...(await verifierHorodatage(await lireOctets(nom), tour.racine)), nom };
}

function signaturePqRelue(c) {
	if (!c.signaturePq) return null;
	const cle = cleSlhDuTour(c.tour.id);
	if (!cle) return { ok: false, raisons: ['aucune cle post-quantique epinglee ne couvre ce tour'] };
	return verifierSignatureSlhDuJournal(depuisBase64(c.signaturePq.signature), c.tour.racine, depuisBase64(c.signaturePq.cle), cle.empreinte);
}

/**
 * La preuve OpenTimestamps jointe : relue ici, elle engage bien la racine du
 * tour. Le bloc reste DECLARE : seul un explorateur Bitcoin (ou `ots verify`
 * sur le fichier) dit que ce bloc porte cette preuve.
 */
async function bitcoinRelu(c) {
	if (!c.bitcoin) return null;
	const ots = depuisBase64(c.bitcoin.ots) ?? new Uint8Array();
	const attendu = await sha256(`${c.tour.racine}\n`);
	const condensat = [...ots.subarray(MARQUE_OTS.length, MARQUE_OTS.length + 32)].map((o) => o.toString(16).padStart(2, '0')).join('');
	const ok = MARQUE_OTS.every((o, i) => ots[i] === o) && condensat === attendu;
	return { ok, etat: c.bitcoin.etat === 'bitcoin' ? 'bitcoin' : null, bloc: Number.isInteger(c.bitcoin.bloc) ? c.bitcoin.bloc : null, raisons: ok ? [] : ["la preuve OpenTimestamps ne porte pas sur la racine du tour"] };
}

async function constatRelu(c, empreinte) {
	const raisonsDeLaPlace = await placeRelue(c, empreinte);
	const signature = c.signature ? await verifierSignatureDuJournal(c.signature, c.tour.racine, certificatDuTour(c.tour.id)) : null;
	const postQuantique = signaturePqRelue(c);
	const horodatage = await horodatageRelu(c);
	const bitcoin = await bitcoinRelu(c);
	const pieces = [signature, postQuantique, horodatage, bitcoin].filter(Boolean);
	// Un chemin d'audit seul ne prouve rien : n'importe qui compose un arbre. Il faut qu'une cle epinglee ou l'autorite qualifiee engage la racine.
	const garantie = [signature, postQuantique, horodatage].some((p) => p?.ok);
	const raisons = [...raisonsDeLaPlace, ...pieces.flatMap((p) => p.raisons), ...(garantie ? [] : ['aucune signature ni horodatage ne garantit la racine'])];
	return {
		// La cle et le jour sont ceux de la feuille, l'instant celui de l'identifiant du tour : les seuls que la racine engage.
		cle: String(c.feuille.cle),
		jour: jourLu(c.feuille.jour),
		tour: c.tour.id,
		racine: c.tour.racine,
		inscrit: instantDuTour(c.tour.id),
		signature: signature && { ok: signature.ok, sigT: signature.sigT },
		postQuantique: postQuantique && { ok: postQuantique.ok },
		horodatage: horodatage && { ok: horodatage.ok, tour: horodatage.tour, instant: horodatage.instant, autorite: horodatage.autorite },
		bitcoin: bitcoin && { ok: bitcoin.ok, etat: bitcoin.etat, bloc: bitcoin.bloc },
		ok: raisons.length === 0,
		raisons
	};
}

/**
 * Relit un dossier sans reseau : la place de l'empreinte jusqu'a la racine du
 * tour, puis chaque piece jointe contre cette racine et les cles epinglees.
 * `empreinte` est celle du document tenu en main ; sans elle, celle du dossier.
 * Rend `{ ok, empreinte, constats, raisons }` ; `ok` quand un constat tient.
 */
export async function verifierDossier(dossier, { empreinte = null } = {}) {
	if (!estUnDossier(dossier)) return { ok: false, empreinte, constats: [], raisons: ["ce fichier n'est pas un dossier de preuve"] };
	const attendue = empreinte ?? dossier.empreinte;
	if (attendue !== dossier.empreinte) return { ok: false, empreinte: attendue, constats: [], raisons: ["le dossier porte sur un autre document"] };
	const constats = [];
	for (const c of dossier.constats) {
		try {
			constats.push(await constatRelu(c, attendue));
		} catch {
			constats.push({ cle: null, jour: null, tour: null, ok: false, raisons: ['constat illisible'] });
		}
	}
	const ok = constats.some((c) => c.ok);
	return { ok, empreinte: attendue, constats, raisons: ok ? [] : ['aucun constat du dossier ne tient'] };
}

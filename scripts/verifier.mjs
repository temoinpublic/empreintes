#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Florian Mousseau. Ce fichier seul est sous licence MIT (LICENSES/MIT.txt).
// Verifie un fichier, ou toute la chaine, contre le journal publie.
//
//   node scripts/verifier.mjs <fichier|sha256> [--site <adresse>]
//   node scripts/verifier.mjs --chaine [--site <adresse>]
//   node scripts/verifier.mjs <fichier|sha256> --garder <dossier.json> [--site <adresse>]
//   node scripts/verifier.mjs --dossier <dossier.json> [fichier|sha256]
//
// `--garder` ecrit le dossier de preuve a conserver avec le document ; `--dossier`
// le relit SANS RESEAU : aucune lecture du site, les cles sont epinglees ici.
//
// Sortie 0 : servi tel quel (ou chaine intacte) ; 1 : inconnu ou rompu ; 2 : usage.

import fs from 'node:fs';
import { sha256, lecteurDeReleves, lieJusquA, placeDuFichier, verifierChaine, verifierSignatureDuJournal, verifierSignatures, certificatDuTour } from '../src/chaine.mjs';
import { CLES_SLH_DU_JOURNAL, cleSlhDuTour, verifierSignatureSlhDuJournal, verifierSignaturesSlh } from '../src/slh.mjs';
import { tourHorodate, verifierHorodatage, verifierHorodatages } from '../src/horodatage.mjs';
import { composerDossier, verifierDossier } from '../src/dossier.mjs';

const SITE = 'https://temoinpublic.fr';

async function lireTexte(site, chemin) {
	const r = await fetch(new URL(chemin, site));
	if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
	return r.text();
}

async function lireOctets(site, chemin) {
	const r = await fetch(new URL(chemin, site));
	if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
	return new Uint8Array(await r.arrayBuffer());
}

/** L'horodatage qualifie qui couvre le tour `id` : le premier a partir de lui, relu contre sa racine ; null sans. */
async function horodatageDu(site, tours, id, racine) {
	const tour = tourHorodate(tours, id);
	if (!tour) return null;
	if (!(await lieJusquA(tours, id, tour.id, racine))) return { ok: false, tour: tour.id, instant: null, autorite: null, raisons: ['la chaine ne relie pas ce tour au tour horodate'] };
	const v = await verifierHorodatage(await lireOctets(site, `/empreintes/${tour.id}.racine.tsr`), tour.racine);
	return { ok: v.ok, tour: tour.id, instant: v.instant, autorite: v.autorite, raisons: v.raisons };
}

/** La signature post-quantique d'un tour, relue contre sa racine et la cle epinglee ; null quand le tour n'en porte pas. */
export async function signatureSlhDu(site, tour, racine, cles = CLES_SLH_DU_JOURNAL) {
	if (!tour?.fichiers?.includes(`${tour.id}.racine.slh`)) return null;
	const cle = cleSlhDuTour(tour.id, cles);
	if (!cle) return { ok: false, raisons: ['aucune cle post-quantique epinglee ne couvre ce tour'] };
	return verifierSignatureSlhDuJournal(await lireOctets(site, `/empreintes/${tour.id}.racine.slh`), racine, await lireOctets(site, `/empreintes/${cle.fichier}`), cle.empreinte);
}

async function lire(site, chemin) {
	const r = await fetch(new URL(chemin, site));
	if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
	return r.json();
}

/** Le lecteur des releves pleins du site : un tour en delta se reconstruit depuis sa base. */
function lecteurDuSite(site, tours) {
	return lecteurDeReleves(async (nom) => {
		const r = await fetch(new URL(`/empreintes/${nom}`, site));
		return r.ok ? r.json() : null;
	}, tours);
}

/** Les constats d'une empreinte : une ligne par objet du journal qui l'a portee. */
export async function verifierEmpreinte(site, empreinte) {
	const r = await fetch(new URL(`/index/${empreinte.slice(0, 2)}.json`, site));
	const vus = r.ok ? ((await r.json())[empreinte] ?? []) : [];
	const constats = [];
	const tours = vus.length ? (await lire(site, '/tours.json')).tours : [];
	const lireReleve = lecteurDuSite(site, tours);
	for (const vu of vus) {
		const releve = await lireReleve(vu.premier);
		const place = await placeDuFichier(releve, empreinte);
		const signee = tours.find((t) => t.id === vu.premier)?.fichiers?.includes(`${vu.premier}.racine.jws`);
		const signature = signee ? await verifierSignatureDuJournal(await lireTexte(site, `/empreintes/${vu.premier}.racine.jws`), releve.racine, certificatDuTour(vu.premier)) : null;
		const postQuantique = await signatureSlhDu(site, tours.find((t) => t.id === vu.premier), releve.racine);
		const horodatage = await horodatageDu(site, tours, vu.premier, releve.racine);
		const ok = Boolean(place?.ok) && signature?.ok !== false && postQuantique?.ok !== false && horodatage?.ok !== false;
		constats.push({ ...vu, racine: releve.racine, signature: signature && { ok: signature.ok, sigT: signature.sigT, raisons: signature.raisons }, postQuantique, horodatage, ok });
	}
	return constats;
}

/** Le dossier de preuve d'une empreinte, compose depuis le site ; null quand le journal ne la porte pas. */
export async function dossierDe(site, empreinte) {
	const r = await fetch(new URL(`/index/${empreinte.slice(0, 2)}.json`, site));
	const vus = r.ok ? ((await r.json())[empreinte] ?? []) : [];
	if (vus.length === 0) return null;
	const { tours } = await lire(site, '/tours.json');
	return composerDossier({ site, empreinte, vus, tours, lireReleve: lecteurDuSite(site, tours), lireTexte: (nom) => lireTexte(site, `/empreintes/${nom}`), lireOctets: (nom) => lireOctets(site, `/empreintes/${nom}`) });
}

/** L'empreinte d'une cible : un sha256 saisi, ou celui du fichier nomme. */
const empreinteDe = async (cible) => (/^[0-9a-f]{64}$/i.test(cible) && !fs.existsSync(cible) ? cible.toLowerCase() : sha256(fs.readFileSync(cible)));

/** Retire `--nom valeur` des arguments et rend la valeur ; undefined sans l'option. */
function option(args, nom) {
	const i = args.indexOf(nom);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
}

/** Relit un dossier de preuve hors ligne ; le document, s'il est donne, doit etre celui du dossier. */
async function relireLeDossier(chemin, cible) {
	let dossier = null;
	try {
		dossier = JSON.parse(fs.readFileSync(chemin, 'utf8'));
	} catch {
		// un fichier absent ou illisible se dit comme un dossier refuse
	}
	const v = await verifierDossier(dossier, { empreinte: cible ? await empreinteDe(cible) : null });
	console.log(JSON.stringify(v, null, 1));
	return v.ok ? 0 : 1;
}

export async function principal(args) {
	const site = option(args, '--site') ?? SITE;
	const dossier = option(args, '--dossier');
	const garder = option(args, '--garder');
	const [cible] = args;
	if (dossier) return relireLeDossier(dossier, cible);
	if (!cible) {
		console.error('usage : node scripts/verifier.mjs <fichier|sha256> [--garder <dossier.json>] | --chaine [--site <adresse>] | --dossier <dossier.json> [fichier|sha256]');
		return 2;
	}
	if (cible === '--chaine') {
		const { tours } = await lire(site, '/tours.json');
		const v = await verifierChaine(
			tours.map((t) => t.id),
			lecteurDuSite(site, tours)
		);
		const s = await verifierSignatures(tours, (chemin) => lireTexte(site, chemin));
		const pq = await verifierSignaturesSlh(tours, (chemin) => lireOctets(site, chemin));
		const h = await verifierHorodatages(tours, (chemin) => lireOctets(site, chemin));
		const ok = v.ok && s.ok && pq.ok && h.ok;
		console.log(JSON.stringify({ ...v, ok, signatures: s.signees, signaturesPostQuantiques: pq.signees, horodatages: h.horodates, raisons: [...v.raisons, ...s.raisons, ...pq.raisons, ...h.raisons] }, null, 1));
		return ok ? 0 : 1;
	}
	const empreinte = await empreinteDe(cible);
	if (garder) {
		const compose = await dossierDe(site, empreinte);
		if (!compose) {
			console.error('aucune place a garder : le journal ne porte pas cette empreinte');
			return 1;
		}
		fs.writeFileSync(garder, `${JSON.stringify(compose)}\n`);
		console.log(JSON.stringify({ empreinte, dossier: garder, constats: compose.constats.length }, null, 1));
		return 0;
	}
	const constats = await verifierEmpreinte(site, empreinte);
	console.log(JSON.stringify({ empreinte, constats }, null, 1));
	return constats.some((c) => c.ok) ? 0 : 1;
}

if (process.argv[1] === import.meta.filename) process.exit(await principal(process.argv.slice(2)));

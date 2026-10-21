// Ce que la surface tire des fichiers du journal : la liste des tours,
// l'index des empreintes et le verdict de fraicheur. Pur : ni disque, ni reseau.

import { CLES_SLH_DU_JOURNAL, toursSansSignatureSlh } from './slh.mjs';

/** Un identifiant de tour, tel que l'entrepot le nomme. */
export const ID_DE_TOUR = /^\d{8}T\d{6}Z$/;

/** Les fichiers du journal qui se publient ; tout le reste (cache, .bak) reste chez l'entrepot. */
export const FICHIER_PUBLIE = /^(\d{8}T\d{6}Z\.(json|racine|racine\.ots|racine\.tsr|racine\.jws|racine\.slh)|cle-slh-dsa(-\d+)?\.pub|ancrages\.json|depots\.jsonl)$/;

/** Une preuve d'objet publiee par l'entrepot : `preuves/<sha256>.json`. */
export const PREUVE_PUBLIEE = /^[0-9a-f]{64}\.json$/;

/** Les feuilles qui sont des objets de l'archive, sans les manifestes ni les listes du tour. */
export const estUnObjet = (f) => !/^(manifeste|liste):/.test(f.cle);

/** L'instant d'un tour, en ISO, depuis son identifiant. */
export function instantDe(id) {
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(id);
	if (!m) throw new Error(`identifiant de tour illisible : ${id}`);
	return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

/** Le resume d'un tour : ce que la page et le verificateur lisent sans ouvrir le releve ; `octets`, la taille du releve publie. */
export function resumeDe(releve, ancrage, fichiers, octets = null) {
	return {
		id: releve.id,
		instant: instantDe(releve.id),
		feuilles: releve.feuilles.length,
		octets,
		objets: releve.feuilles.filter(estUnObjet).length,
		precedente: releve.precedente,
		arbre: releve.arbre,
		racine: releve.racine,
		ots: ancrage?.ots ?? null,
		bloc: ancrage?.bloc ?? null,
		horodatage: ancrage?.horodatage?.etat ?? null,
		depots: Number(/^depots:(\d+)$/.exec(releve.feuilles.find((f) => f.cle.startsWith('depots:'))?.cle ?? '')?.[1] ?? 0),
		fichiers: fichiers.filter((f) => f.startsWith(`${releve.id}.`)).sort()
	};
}

/**
 * L'index des empreintes, tour par tour dans l'ordre : pour chaque sha256,
 * chaque cle qui l'a porte, son jour et le premier et le dernier tour qui
 * l'ont vu. Partage par les deux premiers caracteres hexadecimaux.
 */
export function indexDesEmpreintes(releves) {
	const parSha = new Map();
	for (const releve of releves) {
		for (const f of releve.feuilles) {
			if (!estUnObjet(f)) continue;
			const parCle = parSha.get(f.sha256) ?? new Map();
			const vu = parCle.get(f.cle) ?? { cle: f.cle, jour: f.jour, premier: releve.id };
			vu.dernier = releve.id;
			parCle.set(f.cle, vu);
			parSha.set(f.sha256, parCle);
		}
	}
	const parts = {};
	for (const [sha, parCle] of [...parSha].sort(([a], [b]) => (a < b ? -1 : 1))) {
		(parts[sha.slice(0, 2)] ??= {})[sha] = [...parCle.values()];
	}
	return parts;
}

const HEURE = 3600 * 1000;
/** Au-dela, le dernier tour est vieux : l'entrepot tourne plusieurs fois par jour. */
export const SEUIL_ATTENTION_H = 12;
export const SEUIL_ROUGE_H = 36;
/** Une preuve encore aux calendriers apres ce delai n'atteindra plus Bitcoin seule. */
export const SEUIL_CALENDRIER_H = 48;
/** Un horodatage qualifie par jour : au-dela, le dernier en manque au moins un. */
export const SEUIL_HORODATAGE_H = 36;
/** Cloudflare Pages refuse un fichier au-dela de 25 Mio : un releve qui l'atteint casse le deploiement entier. */
export const LIMITE_FICHIER_PAGES = 25 * 1024 * 1024;
/** Le releve porte l'etat entier et grossit avec lui (D-158) : attention a la moitie de la limite, rouge aux neuf dixiemes. */
export const SEUIL_RELEVE_ATTENTION = LIMITE_FICHIER_PAGES / 2;
export const SEUIL_RELEVE_ROUGE = (LIMITE_FICHIER_PAGES * 9) / 10;

const enMio = (octets) => (octets / (1024 * 1024)).toFixed(1).replace('.', ',');

/** Le constat sur la taille du dernier releve, et son niveau ; null sous le seuil ou sans taille connue. */
export function constatDeTaille(tour) {
	if (!(tour?.octets > SEUIL_RELEVE_ATTENTION)) return null;
	const niveau = tour.octets > SEUIL_RELEVE_ROUGE ? 'rouge' : 'attention';
	return { niveau, constat: `releve ${tour.id} : ${enMio(tour.octets)} Mio, la limite d'un fichier Pages est ${enMio(LIMITE_FICHIER_PAGES)} Mio` };
}

/**
 * Le verdict de la sonde : `ok`, `attention` ou `rouge`, avec ses constats.
 * Une copie SUSPENDUE de propos delibere ne lit plus l'age ni les ancrages, qui
 * ne bougent plus par construction : un seul constat, `attention`, qui la nomme.
 */
export function verdict(tours, maintenant = new Date(), copie = null, clesSlh = CLES_SLH_DU_JOURNAL) {
	if (tours.length === 0) return { alerte: 'rouge', constats: ['aucun tour publie'] };
	if (copie?.etat === 'suspendue') {
		return { alerte: 'attention', constats: [`copie du journal suspendue depuis le ${copie.depuis} : dernier tour publie ${tours.at(-1).id}`] };
	}
	const constats = [];
	let alerte = 'ok';
	const monter = (niveau) => {
		if (niveau === 'rouge' || alerte === 'ok') alerte = niveau;
	};
	const dernier = tours.at(-1);
	const age = (maintenant - new Date(dernier.instant)) / HEURE;
	if (age > SEUIL_ROUGE_H) monter('rouge');
	else if (age > SEUIL_ATTENTION_H) monter('attention');
	if (age > SEUIL_ATTENTION_H) constats.push(`dernier tour ${dernier.id}, il y a ${Math.round(age)} h`);
	for (const t of tours) {
		const enAttente = t.ots !== 'bitcoin' && (maintenant - new Date(t.instant)) / HEURE > SEUIL_CALENDRIER_H;
		if (enAttente) {
			monter('attention');
			constats.push(`${t.id} : preuve ${t.ots ?? 'absente'} depuis plus de ${SEUIL_CALENDRIER_H} h`);
		}
	}
	const horodate = tours.findLast((t) => t.fichiers?.includes(`${t.id}.racine.tsr`));
	const ageHorodatage = horodate ? (maintenant - new Date(horodate.instant)) / HEURE : 0;
	if (ageHorodatage > SEUIL_HORODATAGE_H) {
		monter('attention');
		constats.push(`dernier horodatage qualifie ${horodate.id}, il y a ${Math.round(ageHorodatage)} h`);
	}
	const taille = constatDeTaille(dernier);
	if (taille) {
		monter(taille.niveau);
		constats.push(taille.constat);
	}
	const sansSlh = toursSansSignatureSlh(tours, clesSlh);
	if (sansSlh.length) {
		monter('attention');
		constats.push(`${sansSlh.length} tour(s) sans signature post-quantique, dernier ${sansSlh.at(-1).id}`);
	}
	return { alerte, constats };
}

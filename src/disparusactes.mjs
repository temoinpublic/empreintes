// Les actes des communes qui ont disparu ou change sous la meme adresse
// (D-193) : ce qui s'en publie sur `/disparus`. La glane redemande la datation
// des actes deja dates ; le temoin du service relit la source (`relecture`,
// `acte`, `depot` dans D1, lus par `actesDisparus`). CE module decide ce qui
// parait, comme `disparus.mjs` pour les sources de l'entrepot. Pur.
//
// Ce qui ne parait jamais : une adresse qui pourrait nommer une personne, une
// adresse retenue sur un droit (`RETENUES`), un evenement sans version d'avant
// datee. Un objet qui pourrait nommer une personne ne s'affiche pas.

import { cheminDeLActe } from './adresse.mjs';
import { sha256 } from './chaine.mjs';
import { pourraitNommer } from './glane.mjs';
import { nommeUnePersonne } from './personne.mjs';
import { RETENUES, adresseNommante } from './retenues.mjs';

const HEX64 = /^[0-9a-f]{64}$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

const adresseLisible = (url) => {
	try {
		return ['http:', 'https:'].includes(new URL(url).protocol);
	} catch {
		return false;
	}
};

const objetAffichable = (objet) => (typeof objet === 'string' && objet.trim() && !nommeUnePersonne(objet) && !pourraitNommer(objet) ? objet.trim() : null);

/** L'evenement d'une ligne de `actesDisparus`, ou null quand elle ne peut pas paraitre. */
async function entreeDe(classe, l) {
	if (!adresseLisible(l?.url) || !JOUR.test(l.date ?? '') || !JOUR.test(l.avant_jour ?? '') || !HEX64.test(l.avant ?? '')) return null;
	if (adresseNommante(l.url) || RETENUES.has(await sha256(l.url))) return null;
	return {
		classe,
		date: l.date,
		http: classe === 'disparu' ? Number(l.http) : null,
		url: l.url,
		collectivite: l.collectivite,
		objet: objetAffichable(l.objet),
		avant: { jour: l.avant_jour, sha256: l.avant },
		preuve: cheminDeLActe({ collectivite: l.collectivite, jour: l.avant_jour, nature: l.nature, sha256: l.avant })
	};
}

const recentesDAbord = (a, b) => (a.date === b.date ? a.url.localeCompare(b.url) : a.date < b.date ? 1 : -1);

/**
 * Les entrees de `/disparus` pour les actes des communes, les plus recentes
 * d'abord, au plus `max` PAR CLASSE (un site vide en un jour ne chasse pas les
 * remplacements, plus rares) : `{ classe, date, http, url, collectivite, objet,
 * avant, preuve }`, `preuve` l'adresse perenne de la version d'avant.
 */
export async function entreesDesActes({ disparus = [], remplaces = [] }, max = 100) {
	const deLaClasse = async (classe, lignes) => (await Promise.all(lignes.map((l) => entreeDe(classe, l)))).filter(Boolean).sort(recentesDAbord).slice(0, max);
	return [...(await deLaClasse('disparu', disparus)), ...(await deLaClasse('remplace', remplaces))].sort(recentesDAbord);
}

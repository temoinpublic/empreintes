// La sonde de la surface : 200 dans tous les cas, `alerte` dit si le journal publie est encore frais.
import { avecLaBase, verdict } from '../src/journal.mjs';
import { comptesDAttente } from '../src/attente.mjs';
import { etatDeLApi } from '../src/client.mjs';
import { juger, lireLaTete, sansTete } from '../src/deploiement.mjs';
import { jouerLesParcours } from '../src/parcours.mjs';

async function lireAsset(env, url, chemin) {
	const r = await env.ASSETS.fetch(new URL(chemin, url));
	return r.ok ? r.json() : null;
}

const NIVEAUX = ['ok', 'attention', 'rouge'];
const pire = (a, b) => NIVEAUX[Math.max(NIVEAUX.indexOf(a), NIVEAUX.indexOf(b))];

/** Le commit servi juge contre `main` ; `env.LIRE_TETE` remplace le flux dans les tests. */
async function jugerLeDeploiement(env, version) {
	const servi = version?.commit ?? 'inconnu';
	if (servi === 'inconnu') return { ...juger({ servi }), echec: null };
	try {
		const commits = await (env.LIRE_TETE ?? lireLaTete)();
		return { ...juger({ servi, construit: version?.construit, commits, maintenant: Date.now() }), echec: null };
	} catch (e) {
		return { ...sansTete(e.message), echec: `tete de main : ${e.message}` };
	}
}

export async function onRequestGet({ request, env }) {
	const [liste, version] = await Promise.all([lireAsset(env, request.url, '/tours.json'), lireAsset(env, request.url, '/version.json')]);
	const tours = liste?.tours ?? [];
	const dernier = tours.at(-1) ?? null;
	// null sans base liee ; undefined quand la base liee ne repond pas, et la sonde le dit.
	const attente = env.DEPOTS ? await comptesDAttente(env.DEPOTS).catch(() => undefined) : null;
	const journal = avecLaBase(verdict(tours, new Date(), liste?.copie ?? null), attente !== undefined);
	const lire = (chemin) => env.ASSETS.fetch(new URL(chemin, request.url));
	const [deploiement, parcours] = await Promise.all([jugerLeDeploiement(env, version), jouerLesParcours({ lire, tours, db: env.DEPOTS })]);
	const corps = {
		service: 'empreintes',
		alerte: pire(pire(journal.alerte, deploiement.niveau), parcours.niveau),
		constats: [...journal.constats, ...(deploiement.constat ? [deploiement.constat] : []), ...parcours.constats],
		echecs_des_sondes: [...(deploiement.echec ? [deploiement.echec] : []), ...parcours.echecs],
		// Les parcours du visiteur (D-128, P1), juges sur leur resultat : le verificateur et le depot.
		parcours: parcours.parcours,
		copie: liste?.copie ?? null,
		dernierTour: dernier && { id: dernier.id, racine: dernier.racine, objets: dernier.objets, ots: dernier.ots, bloc: dernier.bloc },
		tours: tours.length,
		// Les adresses en attente de chaque offre (D-200) ; null quand la base ne repond pas, la sonde reste a 200.
		attente: attente ?? null,
		// L'API des offres (D-195) : `fermee` tant qu'aucune cle n'est vendue.
		apiDesOffres: etatDeLApi(env),
		deploye: { commit: version?.commit ?? 'inconnu', construit: version?.construit ?? null, retard: deploiement.retard }
	};
	return new Response(`${JSON.stringify(corps, null, 1)}\n`, {
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
	});
}

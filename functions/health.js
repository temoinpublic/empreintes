// La sonde de la surface : 200 dans tous les cas, `alerte` dit si le journal publie est encore frais.
import { avecLaBase, verdict } from '../src/journal.mjs';
import { comptesDAttente } from '../src/attente.mjs';
import { etatDeLApi } from '../src/client.mjs';

async function lireAsset(env, url, chemin) {
	const r = await env.ASSETS.fetch(new URL(chemin, url));
	return r.ok ? r.json() : null;
}

export async function onRequestGet({ request, env }) {
	const [liste, version] = await Promise.all([lireAsset(env, request.url, '/tours.json'), lireAsset(env, request.url, '/version.json')]);
	const tours = liste?.tours ?? [];
	const dernier = tours.at(-1) ?? null;
	// null sans base liee ; undefined quand la base liee ne repond pas, et la sonde le dit.
	const attente = env.DEPOTS ? await comptesDAttente(env.DEPOTS).catch(() => undefined) : null;
	const corps = {
		service: 'empreintes',
		...avecLaBase(verdict(tours, new Date(), liste?.copie ?? null), attente !== undefined),
		copie: liste?.copie ?? null,
		dernierTour: dernier && { id: dernier.id, racine: dernier.racine, objets: dernier.objets, ots: dernier.ots, bloc: dernier.bloc },
		tours: tours.length,
		// Les adresses en attente de chaque offre (D-200) ; null quand la base ne repond pas, la sonde reste a 200.
		attente: attente ?? null,
		// L'API des offres (D-195) : `fermee` tant qu'aucune cle n'est vendue.
		apiDesOffres: etatDeLApi(env),
		deploye: { commit: version?.commit ?? 'inconnu', construit: version?.construit ?? null }
	};
	return new Response(`${JSON.stringify(corps, null, 1)}\n`, {
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
	});
}

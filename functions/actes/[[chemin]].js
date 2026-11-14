// GET /actes/<code>/<jour>/<nature>-<hex> : l'adresse perenne d'un acte date (D-205), sa page ou sa fiche JSON.
import { communeDesActifs } from '../../src/annuaire.mjs';
import { reponseAdresse, veutDuJson } from '../../src/collectivite.mjs';

export async function onRequestGet({ params, env, request }) {
	const segments = [params.chemin ?? []].flat();
	const r = await reponseAdresse({ db: env.DEPOTS, segments, commune: communeDesActifs(env, request.url), json: veutDuJson(request.headers.get('accept')) });
	return new Response(r.corps || null, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

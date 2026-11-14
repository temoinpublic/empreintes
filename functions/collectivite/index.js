// GET /collectivite : les departements dont au moins une commune a un acte date.
import { communeDesActifs } from '../../src/annuaire.mjs';
import { reponseCommunes } from '../../src/collectivite.mjs';

export async function onRequestGet({ env, request }) {
	const r = await reponseCommunes({ db: env.DEPOTS, commune: communeDesActifs(env, request.url) });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

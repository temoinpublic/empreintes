// GET /collectivite/departement/<code> : les communes d'un departement qui ont un acte date.
import { communeDesActifs } from '../../../src/annuaire.mjs';
import { reponseDepartement } from '../../../src/collectivite.mjs';

export async function onRequestGet({ params, env, request }) {
	const r = await reponseDepartement({ db: env.DEPOTS, code: params.code, commune: communeDesActifs(env, request.url) });
	return new Response(r.corps || null, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

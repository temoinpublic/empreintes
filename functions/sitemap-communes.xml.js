// GET /sitemap-communes.xml : les pages de communes qui ont un acte date, le reste du plan etant statique.
import { communeDesActifs } from '../src/annuaire.mjs';
import { reponsePlanDesCommunes } from '../src/collectivite.mjs';

export async function onRequestGet({ env, request }) {
	const r = await reponsePlanDesCommunes({ db: env.DEPOTS, commune: communeDesActifs(env, request.url) });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

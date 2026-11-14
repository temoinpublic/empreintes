// GET /api/communes : les communes qui ont un acte date, par departement, et leurs totaux.
import { communeDesActifs } from '../../src/annuaire.mjs';
import { bilanDesCommunes } from '../../src/collectivite.mjs';
import { lecturePublique } from '../../src/service.mjs';

export async function onRequestGet({ env, request }) {
	const r = lecturePublique(await bilanDesCommunes({ db: env.DEPOTS, commune: communeDesActifs(env, request.url) }));
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

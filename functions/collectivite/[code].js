// GET /collectivite/<code> : les actes d'une collectivite lus sur son site officiel.
import { communeDesActifs } from '../../src/annuaire.mjs';
import { reponseCollectivite } from '../../src/collectivite.mjs';
import { lireCurseur } from '../../src/curseur.mjs';

export async function onRequestGet({ params, env, request }) {
	const r = await reponseCollectivite({ db: env.DEPOTS, code: params.code, commune: communeDesActifs(env, request.url), avant: lireCurseur(new URL(request.url).searchParams.get('avant')) });
	return new Response(r.corps || null, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

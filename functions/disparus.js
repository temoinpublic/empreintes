// GET /disparus : la page publiee (D-193), plus les actes des communes disparus ou remplaces, lus dans la base.
import { communeDesActifs } from '../src/annuaire.mjs';
import { reponseDisparus } from '../src/collectivite.mjs';

export async function onRequestGet({ env, request }) {
	const publiee = await env.ASSETS.fetch(new URL('/disparus', request.url));
	const r = await reponseDisparus({ db: env.DEPOTS, publiee, commune: communeDesActifs(env, request.url) });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

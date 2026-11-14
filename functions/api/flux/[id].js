// GET /api/flux/<id> : le registre prive d'un flux ; DELETE : le retirer, les versions deja deposees restent.
// Les deux demandent `authorization: Bearer <jeton>`.
import { lireCurseur } from '../../../src/curseur.mjs';
import { registrePrive, retirerFlux } from '../../../src/suivi.mjs';

const jetonDe = (request) => (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');

export async function onRequestGet({ request, params, env }) {
	const r = await registrePrive({ db: env.DEPOTS, id: params.id, jeton: jetonDe(request), apres: lireCurseur(new URL(request.url).searchParams.get('apres')) });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

export async function onRequestDelete({ request, params, env }) {
	const r = await retirerFlux({ db: env.DEPOTS, id: params.id, jeton: jetonDe(request) });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

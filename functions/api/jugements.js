// /api/jugements : le juge des remplacements lit les versions nouvelles a juger (GET) et pose ses verdicts (POST), D-193.
// `authorization: Bearer <jeton>`, jeton `JETON_FLOTTE` ; personne d'autre ne lit ni n'ecrit ici.
import { estLaFlotte } from '../../src/depot.mjs';
import { noterJugements, versionsAJuger } from '../../src/jugement.mjs';

const JSON_UTF8 = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const rendre = (r) => new Response(r.corps, { status: r.statut, headers: r.entetes });

/** La reponse 401 quand le jeton de la flotte manque, sinon null. */
async function sansJeton(request, env) {
	if (await estLaFlotte(request.headers.get('authorization'), env.JETON_FLOTTE)) return null;
	return new Response(`${JSON.stringify({ erreur: 'jeton requis', details: [] })}\n`, { status: 401, headers: JSON_UTF8 });
}

export async function onRequestGet({ request, env }) {
	return (await sansJeton(request, env)) ?? rendre(await versionsAJuger({ db: env.DEPOTS, max: new URL(request.url).searchParams.get('max') }));
}

export { onRequestGet as onRequestHead };

export async function onRequestPost({ request, env }) {
	const non = await sansJeton(request, env);
	if (non) return non;
	return rendre(await noterJugements({ db: env.DEPOTS, corps: await request.json().catch(() => null) }));
}

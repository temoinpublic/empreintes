// GET /memento/... : TimeMap, TimeGate et versions (RFC 7089) des sources temoin, lus dans l'index construit.
import { INDEX_MEMENTO, reponse } from '../../src/memento.mjs';

export async function onRequestGet({ request, env }) {
	const r = await env.ASSETS.fetch(new URL(`/${INDEX_MEMENTO}`, request.url));
	const index = r.ok ? await r.json() : {};
	const rep = reponse(index, request.url, { acceptDatetime: request.headers.get('accept-datetime'), accept: request.headers.get('accept') ?? '' });
	return new Response(rep.corps || null, { status: rep.statut, headers: rep.entetes });
}

// GET /api : l'index de l'API, lu dans `openapi.json` pour ne jamais s'en ecarter.
// C'est l'adresse que data.gouv.fr et les annuaires donnent comme base de l'API.
import { indexDeLApi } from '../../src/documentation.mjs';

const JSON_UTF8 = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' };

export async function onRequestGet({ request, env }) {
	const openapi = await (await env.ASSETS.fetch(new URL('/openapi.json', request.url))).json();
	return new Response(`${JSON.stringify(indexDeLApi(openapi), null, 1)}\n`, { status: 200, headers: JSON_UTF8 });
}

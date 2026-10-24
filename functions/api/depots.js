// POST /api/depots : deposer une empreinte, ou faire lire une URL par le temoin.
// `authorization: Bearer <jeton>` : la glane des actes des communes (D-178), jeton `JETON_FLOTTE`,
// ou un client des offres (D-195) quand `OFFRE_API` les ouvre, registre `CLIENTS_API`.
import { annuaireDesActifs } from '../../src/annuaire.mjs';
import { autoritesDesActifs } from '../../src/confiance.mjs';
import { clientDuJeton, lireRegistre, offreOuverte } from '../../src/client.mjs';
import { estLaFlotte } from '../../src/depot.mjs';
import { deposer } from '../../src/service.mjs';

const JSON_UTF8 = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export async function onRequestPost({ request, env }) {
	const autorisation = request.headers.get('authorization');
	const flotte = await estLaFlotte(autorisation, env.JETON_FLOTTE);
	const client = autorisation && !flotte && offreOuverte(env) ? await clientDuJeton(autorisation, lireRegistre(env.CLIENTS_API)) : null;
	if (autorisation && !flotte && !client) return new Response(`${JSON.stringify({ erreur: 'jeton inconnu', details: [] })}\n`, { status: 401, headers: JSON_UTF8 });
	let corps;
	try {
		corps = await request.json();
	} catch {
		corps = null;
	}
	const r = await deposer({ db: env.DEPOTS, corps, adresse: request.headers.get('cf-connecting-ip'), annuaire: annuaireDesActifs(env, request.url), autorites: autoritesDesActifs(env, request.url), flotte, client, copie: true });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

export const onRequestOptions = () =>
	new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' } });

// `POST /health/exercice` (D-128) : la sonde rejouee avec les sources nommees
// coupees, pour cette seule reponse. 401 sans le jeton OIDC d'un job de `main`.
import { COUPURES, jugerLesCoupures, lireLesCoupures } from '../../src/exercice.mjs';
import { refusDuJeton } from '../../src/oidc.mjs';
import { corpsDeLaSante, enJson } from '../health.js';

export async function onRequestPost({ request, env }) {
	const refus = await refusDuJeton(request, env.LIRE_CLES ? { lireLesCles: env.LIRE_CLES } : {});
	if (refus) return enJson({ refus }, 401);
	const demande = lireLesCoupures(await request.json().catch(() => null));
	if (demande.refus) return enJson(demande, 400);
	const { coupe } = demande;
	const intact = await corpsDeLaSante({ request, env, garder: false });
	const corps = coupe.length ? await corpsDeLaSante({ request, env, coupe, garder: false }) : intact;
	return enJson({ exercice: { coupe, connues: Object.keys(COUPURES), verdicts: jugerLesCoupures(coupe, intact, corps) }, ...corps });
}

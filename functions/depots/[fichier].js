// GET /depots/<jour>.jsonl : les lignes publiques des depots d'un jour.
import { fichierDuJour } from '../../src/service.mjs';

export async function onRequestGet({ params, env }) {
	const r = await fichierDuJour({ db: env.DEPOTS, nom: params.fichier });
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

// GET /api/bilan : depots et deposants distincts, jour par jour.
import { bilanPublic, lecturePublique } from '../../src/service.mjs';

export async function onRequestGet({ env }) {
	const r = lecturePublique(await bilanPublic({ db: env.DEPOTS }));
	return new Response(r.corps, { status: r.statut, headers: r.entetes });
}

// HEAD suit GET : sans ce nom, le routeur de Pages rend un 404 a qui verifie un lien.
export { onRequestGet as onRequestHead };

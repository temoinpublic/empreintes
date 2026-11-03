// Le Worker `empreintes-flux` (D-170) : chaque heure, la tournee des flux suivis,
// sur la meme base D1 que les depots. Aucune adresse publique : pas de `fetch`.
import { avecReprise } from '../src/reprise.mjs';
import { tourneeDesFlux } from '../src/suivi.mjs';

export default {
	async scheduled(_evenement, env, ctx) {
		ctx.waitUntil(tourneeDesFlux({ db: avecReprise(env.DEPOTS) }).then((r) => console.log(`flux : ${r.flux} suivis, ${r.lectures} lectures`)));
	}
};

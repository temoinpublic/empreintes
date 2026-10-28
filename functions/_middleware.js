// Toute requete passe ici (`_routes.json`, hors fichiers partages) : l'hote choisit
// l'edition. Le francais suit son cours ; l'allemand se lit dans `dist/de/`.
import { decider, horsIndex } from '../src/hote.mjs';
import { cheminMementoRetabli } from '../src/memento.mjs';
import { onRequestGet as memento } from './memento/[[chemin]].js';

/** Un fichier de `dist/` par la liaison `ASSETS`, au statut voulu ; le `.html` en second quand le chemin propre ne repond pas. */
async function actif(env, url, chemin, statut) {
	let r = await env.ASSETS.fetch(new URL(chemin, url));
	const fichier = chemin.endsWith('/') ? `${chemin}index` : chemin;
	if (!r.ok) r = await env.ASSETS.fetch(new URL(`${fichier}.html`, url));
	return new Response(r.body, { status: r.ok ? statut : r.status, headers: r.headers });
}

const sansIndex = (r) => {
	const reponse = new Response(r.body, r);
	reponse.headers.set('x-robots-tag', 'noindex');
	return reponse;
};

export async function onRequest({ request, env, next }) {
	const d = decider(request.url);
	let r;
	if (d.action === 'redirection') r = Response.redirect(d.vers, 301);
	else if (d.action === 'statique') r = await actif(env, request.url, d.chemin, 200);
	else if (d.action === 'introuvable') r = await actif(env, request.url, d.langue === 'de' ? '/de/404' : '/404', 404);
	else {
		// Une adresse Memento porte `https://` dans son chemin : le routeur des Functions ne sert pas un segment vide,
		// et `next()` ne reecrit pas la requete sous workerd. La Function se joue ici, sur le chemin reduit.
		const retabli = ['GET', 'HEAD'].includes(request.method) ? cheminMementoRetabli(request.url) : null;
		// Les en-tetes se recopient explicitement : sous workerd, `new Request(url, request)` ne les garde pas.
		r = retabli ? await memento({ request: new Request(retabli, { method: request.method, headers: request.headers }), env }) : await next();
	}
	return horsIndex(request.url) && r.status !== 301 ? sansIndex(r) : r;
}

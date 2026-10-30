// Le jeton OIDC de GitHub Actions, relu sans dependance : seul un job de `main`
// de ce depot ouvre `POST /health/exercice` (D-128), sans aucun secret.

export const EMETTEUR_GITHUB = 'https://token.actions.githubusercontent.com';

/** Ce que le jeton doit porter : l'origine du site en audience, ce depot, la branche `main`. */
export const ATTENDU = { audience: 'https://temoinpublic.fr', depot: 'temoinpublic/empreintes', branche: 'refs/heads/main' };

/** Les cles publiques de GitHub Actions (JWKS). */
export async function lireLesClesDeGithub() {
	const r = await fetch(`${EMETTEUR_GITHUB}/.well-known/jwks`, { signal: AbortSignal.timeout(8_000) });
	if (!r.ok) throw new Error(`cles de GitHub : HTTP ${r.status}`);
	return r.json();
}

const octets = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const lireJson = (s) => JSON.parse(new TextDecoder().decode(octets(s)));

async function signatureValide(entete, morceaux, lireLesCles) {
	if (entete.alg !== 'RS256') return false;
	const cle = ((await lireLesCles()).keys ?? []).find((k) => k.kid === entete.kid);
	if (!cle) return false;
	const publique = await crypto.subtle.importKey('jwk', cle, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
	return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publique, octets(morceaux[2]), new TextEncoder().encode(`${morceaux[0]}.${morceaux[1]}`));
}

function refusDesRevendications(r, attendu, maintenant) {
	if (r.iss !== EMETTEUR_GITHUB) return 'emetteur inattendu';
	if (r.aud !== attendu.audience) return 'audience inattendue';
	if (r.repository !== attendu.depot) return 'depot inattendu';
	if (r.ref !== attendu.branche) return 'branche inattendue';
	if (typeof r.exp !== 'number' || r.exp * 1000 <= maintenant) return 'jeton expire';
	return null;
}

/** `null` quand la requete porte un jeton valide de `attendu` (`Authorization: Bearer`), sinon la raison du refus. */
export async function refusDuJeton(requete, { attendu = ATTENDU, lireLesCles = lireLesClesDeGithub, maintenant = Date.now() } = {}) {
	const morceaux = (requete.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').split('.');
	if (morceaux.length !== 3) return 'jeton absent ou mal forme';
	try {
		if (!(await signatureValide(lireJson(morceaux[0]), morceaux, lireLesCles))) return 'signature invalide';
		return refusDesRevendications(lireJson(morceaux[1]), attendu, maintenant);
	} catch {
		return 'jeton illisible';
	}
}

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

/** Combien de temps des cles lues servent sans relire GitHub. */
export const CLES_GARDEES_MS = 10 * 60_000;
/** L'intervalle minimal entre deux lectures, quelle que soit la cle demandee. */
export const RELECTURE_MIN_MS = 60_000;

/**
 * Les cles de `lire`, gardees en memoire : au plus une lecture par minute,
 * meme sous une rafale de jetons forges sur un `kid` inconnu (D-121). Une
 * lecture qui echoue compte aussi, pour ne pas marteler GitHub en panne.
 */
export function gardeDesCles(lire, horloge = Date.now) {
	let gardees = null;
	let tentee = Number.NEGATIVE_INFINITY;
	return async (kid) => {
		const age = horloge() - tentee;
		const connue = gardees?.keys?.some((k) => k.kid === kid) ?? false;
		const fraiche = gardees !== null && age < CLES_GARDEES_MS && (kid === undefined || connue);
		if (fraiche || age < RELECTURE_MIN_MS) {
			if (gardees === null) throw new Error('cles de GitHub : relecture trop proche');
			return gardees;
		}
		tentee = horloge();
		gardees = await lire(kid);
		return gardees;
	};
}

/** Les cles de GitHub que la route `/health/exercice` partage, une memoire par isolat. */
export const clesDeGithub = gardeDesCles(lireLesClesDeGithub);

const octets = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const lireJson = (s) => JSON.parse(new TextDecoder().decode(octets(s)));

async function signatureValide(entete, morceaux, lireLesCles) {
	if (entete.alg !== 'RS256') return false;
	const cle = ((await lireLesCles(entete.kid)).keys ?? []).find((k) => k.kid === entete.kid);
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
export async function refusDuJeton(requete, { attendu = ATTENDU, lireLesCles = clesDeGithub, maintenant = Date.now() } = {}) {
	const morceaux = (requete.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').split('.');
	if (morceaux.length !== 3) return 'jeton absent ou mal forme';
	try {
		// Les revendications d'abord : un jeton qui ne vise pas ce site ne fait pas sortir vers GitHub.
		const refus = refusDesRevendications(lireJson(morceaux[1]), attendu, maintenant);
		if (refus !== null) return refus;
		if (!(await signatureValide(lireJson(morceaux[0]), morceaux, lireLesCles))) return 'signature invalide';
		return null;
	} catch {
		return 'jeton illisible';
	}
}

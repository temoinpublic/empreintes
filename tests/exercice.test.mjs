import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RACINE_NULLE, arbre, chainer, empreinteDeFeuille } from '../src/chaine.mjs';
import { indexDesEmpreintes } from '../src/journal.mjs';
import { COUPURES, MARQUE, jugerLesCoupures, lireLesCoupures } from '../src/exercice.mjs';
import { ATTENDU, EMETTEUR_GITHUB, lireLesClesDeGithub, refusDuJeton } from '../src/oidc.mjs';
import { jouerLeVerificateur } from '../src/parcours.mjs';
import { onRequestPost as exercice } from '../functions/health/exercice.js';
import { baseDeTest } from './d1.mjs';

const h = (t) => createHash('sha256').update(String(t)).digest('hex');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const paire = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const CLES = { keys: [{ ...(await crypto.subtle.exportKey('jwk', paire.publicKey)), kid: 'k1' }] };
const lireLesCles = async () => CLES;

async function jeton(revendications = {}, entete = {}) {
	const tete = b64({ alg: 'RS256', kid: 'k1', ...entete });
	const corps = b64({ iss: EMETTEUR_GITHUB, aud: ATTENDU.audience, repository: ATTENDU.depot, ref: ATTENDU.branche, exp: 2e9, sha: 'a'.repeat(40), ...revendications });
	const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', paire.privateKey, new TextEncoder().encode(`${tete}.${corps}`));
	return `${tete}.${corps}.${Buffer.from(signature).toString('base64url')}`;
}

const avec = (j) => new Request('https://temoinpublic.fr/health/exercice', { method: 'POST', headers: { authorization: `Bearer ${j}` } });

test('le jeton OIDC d un job de main de ce depot passe, tout autre est refuse avec sa raison', async () => {
	const ouvrir = (j) => refusDuJeton(avec(j), { lireLesCles, maintenant: 1e12 });
	assert.equal(await ouvrir(await jeton()), null);
	assert.equal(await refusDuJeton(new Request('https://x/'), { lireLesCles }), 'jeton absent ou mal forme');
	assert.equal(await ouvrir(await jeton({}, { alg: 'HS256' })), 'signature invalide');
	assert.equal(await ouvrir(await jeton({}, { kid: 'autre' })), 'signature invalide');
	const [t, , s] = (await jeton()).split('.');
	assert.equal(await ouvrir(`${t}.${b64({ iss: EMETTEUR_GITHUB })}.${s}`), 'signature invalide');
	assert.equal(await ouvrir('pas.du.json'), 'jeton illisible');
	assert.equal(await ouvrir(await jeton({ iss: 'https://ailleurs' })), 'emetteur inattendu');
	assert.equal(await ouvrir(await jeton({ aud: 'https://datumszeuge.de' })), 'audience inattendue');
	assert.equal(await ouvrir(await jeton({ repository: 'autre/depot' })), 'depot inattendu');
	assert.equal(await ouvrir(await jeton({ ref: 'refs/heads/feature/x' })), 'branche inattendue');
	assert.equal(await ouvrir(await jeton({ exp: 999 })), 'jeton expire');
	assert.equal(await ouvrir(await jeton({ exp: undefined })), 'jeton expire');
	assert.equal(await refusDuJeton(avec(await jeton()), { lireLesCles: async () => ({}) }), 'signature invalide');
});

test('les cles de GitHub se lisent sur son JWKS, et un refus le dit', async () => {
	const fetchReel = globalThis.fetch;
	try {
		globalThis.fetch = async (url) => (String(url) === `${EMETTEUR_GITHUB}/.well-known/jwks` ? Response.json(CLES) : new Response('', { status: 500 }));
		assert.deepEqual(await lireLesClesDeGithub(), CLES);
		globalThis.fetch = async () => new Response('', { status: 503 });
		await assert.rejects(lireLesClesDeGithub(), /cles de GitHub : HTTP 503/);
	} finally {
		globalThis.fetch = fetchReel;
	}
});

test('les coupures demandees se lisent, une coupure inconnue ou une demande illisible est refusee', () => {
	assert.deepEqual(lireLesCoupures({ couper: ['depot', 'depot'] }), { coupe: ['depot'] });
	assert.deepEqual(lireLesCoupures(null), { refus: 'couper doit etre une liste' });
	assert.match(lireLesCoupures({ couper: ['tout'] }).refus, /coupure inconnue : tout \(connues : verificateur, depot, journal, tete\)/);
});

test('une coupure n est vue que si la sonde atteint son niveau, dit une raison nouvelle et ne fait rien tomber d autre', () => {
	const corps = (alerte, constats = [], echecs_des_sondes = []) => ({ alerte, constats, echecs_des_sondes });
	const intact = corps('attention', ['vieux constat']);
	assert.deepEqual(jugerLesCoupures(['depot'], intact, corps('attention', ['vieux constat'], ['parcours depot : base coupee'])).depot, { vu: true, niveau: 'attention', raison: 'parcours depot : base coupee' });
	assert.match(jugerLesCoupures(['verificateur'], intact, corps('attention', ['vieux constat'])).verificateur.raison, /reste attention, rouge attendu/);
	assert.match(jugerLesCoupures(['verificateur'], intact, corps('rouge', ['vieux constat'])).verificateur.raison, /aucune raison nouvelle dans constats/);
	const emporte = jugerLesCoupures(['depot'], intact, corps('rouge', ['autre chose'], ['parcours depot : x']));
	assert.deepEqual(emporte.depot, { vu: false, raison: 'la coupure a aussi fait tomber : autre chose' });
	assert.equal(jugerLesCoupures(['journal'], intact, corps('rouge', ['aucun tour publie', 'parcours verificateur casse : aucun tour publie'])).journal.vu, true);
	assert.deepEqual(jugerLesCoupures([], intact, intact), {});
});

const COMMIT = 'c'.repeat(40);

async function prod() {
	const id = '20261029T100000Z';
	const feuilles = [
		{ cle: 'source/a.pdf', sha256: h('a'), jour: '2026-10-29' },
		{ cle: 'source/b.pdf', sha256: h('b'), jour: '2026-10-29' },
		{ cle: 'depots:1', sha256: h('depots'), jour: '2026-10-29' }
	];
	const a = await arbre(await Promise.all(feuilles.map(empreinteDeFeuille)));
	const releve = { id, precedente: RACINE_NULLE, arbre: a, racine: await chainer({ id, precedente: RACINE_NULLE, arbre: a }), feuilles };
	const instant = new Date(Date.now() - 3600_000).toISOString();
	const tours = [{ id, racine: releve.racine, base: null, depots: 1, fichiers: [`${id}.racine.tsr`, `${id}.racine.slh`], instant, ots: 'bitcoin', bloc: 1 }];
	const servis = {
		'/tours.json': JSON.stringify({ tours, copie: { etat: 'active' } }),
		'/version.json': JSON.stringify({ commit: COMMIT, construit: instant }),
		[`/empreintes/${id}.json`]: JSON.stringify(releve),
		...Object.fromEntries(Object.entries(indexDesEmpreintes([releve])).map(([p, v]) => [`/index/${p}.json`, JSON.stringify(v)]))
	};
	const DEPOTS = baseDeTest();
	await DEPOTS.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').bind('2026-10-29', 1, h('doc'), h('recu')).run();
	const env = {
		ASSETS: { fetch: async (url) => (new URL(url).pathname in servis ? new Response(servis[new URL(url).pathname]) : new Response('', { status: 404 })) },
		LIRE_TETE: async () => [{ sha: COMMIT, date: instant }],
		LIRE_CLES: lireLesCles,
		DEPOTS
	};
	return env;
}

const exercer = async (env, corps, j) => {
	const requete = new Request('https://temoinpublic.fr/health/exercice', { method: 'POST', headers: { authorization: `Bearer ${j ?? (await jeton())}`, 'content-type': 'application/json' }, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });
	const r = await exercice({ request: requete, env });
	return { status: r.status, corps: await r.json() };
};

test('l exercice en prod : la sonde intacte est verte, et chaque coupure est vue a son niveau avec sa raison', async () => {
	const env = await prod();
	const temoin = await exercer(env, { couper: [] });
	assert.equal(temoin.status, 200);
	assert.equal(temoin.corps.alerte, 'ok', JSON.stringify(temoin.corps));
	assert.deepEqual(temoin.corps.exercice, { coupe: [], connues: Object.keys(COUPURES), verdicts: {} });
	const attendus = {
		verificateur: ['rouge', /^parcours verificateur casse : le releve du tour ne se lit pas/],
		depot: ['attention', new RegExp(`^parcours depot : base coupee \\${MARQUE.slice(0, -1)}\\)`)],
		journal: ['rouge', /^aucun tour publie$/],
		tete: ['attention', /^tete de main : flux des commits coupe \(exercice\)/]
	};
	for (const [nom, [niveau, raison]] of Object.entries(attendus)) {
		const { corps } = await exercer(env, { couper: [nom] });
		assert.equal(corps.alerte, niveau, nom);
		assert.deepEqual(corps.exercice.coupe, [nom]);
		assert.equal(corps.exercice.verdicts[nom].vu, true, `${nom} : ${corps.exercice.verdicts[nom].raison}`);
		assert.match(corps.exercice.verdicts[nom].raison, raison);
	}
	const apres = await exercer(env, { couper: [] });
	assert.equal(apres.corps.alerte, 'ok', 'rien de la coupure ne reste');
});

test('l exercice refuse sans jeton (401) et sur une demande illisible (400)', async () => {
	const env = await prod();
	const sans = await exercer(env, { couper: [] }, 'x');
	assert.deepEqual([sans.status, sans.corps], [401, { refus: 'jeton absent ou mal forme' }]);
	assert.equal((await exercer(env, 'pas du json')).status, 400);
	assert.equal((await exercer({ ...env, LIRE_CLES: undefined }, { couper: [] }, 'x')).status, 401);
});

test('le verificateur ne se garde pas en exercice, et un releve que la surface ne sert pas le casse', async () => {
	const env = await prod();
	const { tours } = JSON.parse(await (await env.ASSETS.fetch('https://x/tours.json')).text());
	const lire = (chemin) => env.ASSETS.fetch(new URL(chemin, 'https://x'));
	assert.equal((await jouerLeVerificateur({ lire, tours, maintenant: 0 })).ok, true);
	const coupe = async (chemin) => new Response(chemin, { status: 404 });
	assert.equal((await jouerLeVerificateur({ lire: coupe, tours, maintenant: 1 })).ok, true, 'la memoire garde le succes 5 min');
	const r = await jouerLeVerificateur({ lire: coupe, tours, maintenant: 1, garder: false });
	assert.deepEqual([r.ok, r.raison], [false, `le releve du tour ne se lit pas (${tours[0].id}.json : HTTP 404)`]);
});

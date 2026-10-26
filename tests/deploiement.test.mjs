import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLUX_DE_MAIN, RETARD_TOLERE_MIN, commitsDuFlux, juger, lireLaTete, sansTete } from '../src/deploiement.mjs';
import { onRequestGet as sonde } from '../functions/health.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const entree = (sha, date) => `<entry><id>tag:github.com,2008:Grit::Commit/${sha}</id><updated>${date}</updated><title>x</title></entry>`;
const flux = (...e) => `<?xml version="1.0"?><feed><id>tag:github.com,2008:/temoinpublic/empreintes/commits/main</id><updated>x</updated>${e.join('')}</feed>`;
const MAIN = [
	{ sha: C, date: '2026-10-25T23:00:00Z' },
	{ sha: B, date: '2026-10-25T17:00:00Z' },
	{ sha: A, date: '2026-10-25T11:00:00Z' }
];
const a = (iso) => Date.parse(iso);

test('le flux Atom rend ses commits dans son ordre, et refuse ce qu il ne sait pas lire', () => {
	assert.deepEqual(commitsDuFlux(flux(entree(C, '2026-10-25T23:00:00Z'), entree(B, '2026-10-25T17:00:00Z'))), MAIN.slice(0, 2));
	assert.throws(() => commitsDuFlux(flux()), /aucun commit/);
	assert.throws(() => commitsDuFlux('<html>Too many requests</html>'), /aucun commit/);
	assert.throws(() => commitsDuFlux(flux(entree(C, 'hier'))), /illisible/);
	assert.throws(() => commitsDuFlux(flux('<entry><id>autre</id></entry>')), /illisible/);
});

test('la tete servie est a jour, et un sha court la reconnait', () => {
	assert.deepEqual(juger({ servi: C, construit: '2026-10-25T23:02:00Z', commits: MAIN, maintenant: a('2026-10-26T01:00:00Z') }), { retard: { mesure: true, main: C, depuis: null }, niveau: 'ok', constat: null });
	assert.equal(juger({ servi: C.slice(0, 8), commits: MAIN, maintenant: 0 }).niveau, 'ok');
});

test('un commit de main pas servi apres le delai tolere passe attention, avec le retard dit', () => {
	const depuis = a('2026-10-25T23:00:00Z');
	const dans = juger({ servi: B, construit: '2026-10-25T17:03:00Z', commits: MAIN, maintenant: depuis + RETARD_TOLERE_MIN * 60_000 });
	assert.equal(dans.niveau, 'ok', 'le suivi a le temps de tirer et construire');
	assert.equal(dans.retard.depuis, '2026-10-25T23:00:00Z');
	const hors = juger({ servi: B, construit: '2026-10-25T17:03:00Z', commits: MAIN, maintenant: depuis + 61 * 60_000 });
	assert.equal(hors.niveau, 'attention');
	assert.equal(hors.constat, 'sert bbbbbbb, main porte ccccccc depuis 61 min : le suivi de vps5 ne deploie plus');
	assert.equal(juger({ servi: A, commits: MAIN, maintenant: a('2026-10-26T00:00:00Z') }).retard.depuis, '2026-10-25T17:00:00Z', 'le retard court depuis le premier commit non servi');
});

test('un commit servi absent du flux court depuis le premier commit arrive apres sa construction', () => {
	const vieux = juger({ servi: 'd'.repeat(40), construit: '2026-10-25T12:00:00Z', commits: MAIN, maintenant: a('2026-10-26T00:00:00Z') });
	assert.deepEqual([vieux.niveau, vieux.retard.depuis], ['attention', '2026-10-25T17:00:00Z']);
	const sansDate = juger({ servi: 'd'.repeat(40), commits: MAIN, maintenant: a('2026-10-26T00:00:00Z') });
	assert.deepEqual([sansDate.niveau, sansDate.retard.depuis], ['attention', '2026-10-25T11:00:00Z']);
	const neuf = juger({ servi: 'd'.repeat(40), construit: '2026-10-25T23:30:00Z', commits: MAIN, maintenant: a('2026-10-26T00:00:00Z') });
	assert.deepEqual(neuf, { retard: { mesure: true, main: C, depuis: null, tete_attendue: true }, niveau: 'ok', constat: null }, 'une construction plus neuve que la tete attend la suivante');
});

test('un commit servi inconnu ou une tete illisible ne se jugent pas, et le disent', () => {
	assert.equal(juger({ servi: 'inconnu' }).niveau, 'attention');
	assert.equal(juger({}).retard.mesure, false);
	assert.deepEqual(sansTete('HTTP 429'), { retard: { mesure: false, raison: 'tete de main illisible : HTTP 429' }, niveau: 'attention', constat: 'la tete de main est illisible : le retard du deploiement n est pas juge' });
});

test('la tete se lit dans le flux, est relue une fois, et l echec nomme l hote', async () => {
	const appels = [];
	const reponses = [new Response('', { status: 503 }), new Response(flux(entree(C, '2026-10-25T23:00:00Z')))];
	const commits = await lireLaTete(async (url) => {
		appels.push(url);
		return reponses.shift();
	});
	assert.deepEqual(commits, [{ sha: C, date: '2026-10-25T23:00:00Z' }]);
	assert.deepEqual(appels, [FLUX_DE_MAIN, FLUX_DE_MAIN]);
	await assert.rejects(
		lireLaTete(async () => {
			throw new Error('fetch failed');
		}),
		{ message: 'fetch failed apres 2 tentatives : github.com' }
	);
	await assert.rejects(lireLaTete(async () => new Response('', { status: 404 })), { message: 'HTTP 404 apres 2 tentatives : github.com' });
});

const actifs = (version) => ({ fetch: async (url) => (new URL(url).pathname === '/version.json' ? Response.json(version) : new Response('', { status: 404 })) });
const lire = async (env) => (await sonde({ request: new Request('https://temoinpublic.fr/health'), env })).json();

test('la sonde publie le retard, monte au pire niveau et porte la raison d une tete illisible', async () => {
	const enRetard = await lire({ ASSETS: actifs({ commit: A, construit: '2026-10-25T11:02:00Z' }), LIRE_TETE: async () => MAIN });
	assert.equal(enRetard.alerte, 'rouge', 'aucun tour publie reste rouge');
	assert.equal(enRetard.deploye.retard.main, C);
	assert.ok(enRetard.constats.some((c) => c.startsWith('sert aaaaaaa, main porte ccccccc')));
	assert.deepEqual(enRetard.echecs_des_sondes, []);
	const muet = await lire({
		ASSETS: actifs({ commit: A }),
		LIRE_TETE: async () => {
			throw new Error('HTTP 429 apres 2 tentatives : github.com');
		}
	});
	assert.deepEqual(muet.echecs_des_sondes, ['tete de main : HTTP 429 apres 2 tentatives : github.com']);
	assert.equal(muet.deploye.retard.mesure, false);
	const inconnu = await lire({ ASSETS: actifs(null), LIRE_TETE: async () => assert.fail('rien a juger') });
	assert.ok(inconnu.constats.includes('le commit servi est inconnu : la construction ne l a pas ecrit'));
});

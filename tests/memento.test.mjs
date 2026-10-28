// Memento (RFC 7089) sur les sources temoin : les versions tirees des releves, les trois routes, la Function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEMIN, INDEX_MEMENTO, LINK_FORMAT, SOURCES_TEMOIN, adresseDe, cheminMementoRetabli, choisirLaVersion, copieDuTemoin, creerLesVersions, dateHttp, lireLaDemande, reponse, timeMap, trouverLaSource } from '../src/memento.mjs';
import { onRequestGet } from '../functions/memento/[[chemin]].js';
import { onRequest } from '../functions/_middleware.js';

const SITE = 'https://temoinpublic.fr';
const QUALIOPI = 'https://www.monactiviteformation.emploi.gouv.fr/mon-activite-formation/public/listePubliqueOF?format=csv';
const CASPS = 'https://www.esma.europa.eu/sites/default/files/CASPS.csv';
const SOURCES = [
	{ nom: 'qualiopi-organismes-formation', url: QUALIOPI, famille: 'reecrit', theme: 'registres', pourquoi: 'qui perd sa certification et quand' },
	{ nom: 'esma-mica-casps', url: CASPS },
	{ nom: 'sans-adresse' }
];
const [A, B, X, Y] = ['a', 'b', 'c', 'd'].map((c) => c.repeat(64));
const releve = (id, racine, feuilles) => ({ id, racine, feuilles: feuilles.map(([cle, sha256, jour]) => ({ cle, sha256, jour })) });
const RELEVES = [
	releve('20261001T040000Z', 'r1', [['qualiopi-organismes-formation', A, '2026-10-01'], ['esma-mica-casps', X], ['autre', 'e'.repeat(64), '2026-10-01'], ['manifeste:2026-10-01', 'f'.repeat(64), '2026-10-01']]),
	releve('20261002T040000Z', 'r2', [['qualiopi-organismes-formation', A, '2026-10-02'], ['esma-mica-casps', Y, '2026-10-02']]),
	releve('20261003T040000Z', 'r3', [['qualiopi-organismes-formation', B, '2026-10-03'], ['esma-mica-casps', Y, '2026-10-03']]),
	releve('20261004T040000Z', 'r4', [['qualiopi-organismes-formation', A, '2026-10-04']])
];
function indexDeTest(sources = SOURCES) {
	const v = creerLesVersions(sources);
	for (const r of RELEVES) v.ajouter(r);
	return v.index();
}

test('les constantes du contrat avec l entrepot et la construction', () => {
	assert.equal(CHEMIN, '/memento');
	assert.equal(SOURCES_TEMOIN, 'sources-temoin.json');
	assert.equal(INDEX_MEMENTO, 'memento/index.json');
	assert.equal(LINK_FORMAT, 'application/link-format');
});

test('creerLesVersions : une empreinte qui change ouvre une version, la meme la prolonge, une source sans adresse est ignoree', () => {
	const index = indexDeTest();
	assert.deepEqual(Object.keys(index), ['qualiopi-organismes-formation', 'esma-mica-casps']);
	const q = index['qualiopi-organismes-formation'];
	assert.deepEqual([q.url, q.famille, q.theme, q.pourquoi], [QUALIOPI, 'reecrit', 'registres', 'qui perd sa certification et quand']);
	assert.deepEqual(q.versions, [
		{ sha256: A, jour: '2026-10-01', tour: '20261001T040000Z', instant: '2026-10-01T04:00:00Z', racine: 'r1', dernier: '20261002T040000Z' },
		{ sha256: B, jour: '2026-10-03', tour: '20261003T040000Z', instant: '2026-10-03T04:00:00Z', racine: 'r3', dernier: '20261003T040000Z' },
		{ sha256: A, jour: '2026-10-04', tour: '20261004T040000Z', instant: '2026-10-04T04:00:00Z', racine: 'r4', dernier: '20261004T040000Z' }
	]);
	const e = index['esma-mica-casps'];
	assert.deepEqual([e.famille, e.theme, e.pourquoi], [null, null, null]);
	assert.deepEqual(e.versions.map((v) => [v.sha256, v.jour, v.tour, v.dernier]), [[X, null, '20261001T040000Z', '20261001T040000Z'], [Y, '2026-10-02', '20261002T040000Z', '20261003T040000Z']]);
	assert.deepEqual(Object.keys(indexDeTest({ sources: SOURCES })), Object.keys(index));
	assert.deepEqual(indexDeTest([]), {});
	assert.deepEqual(indexDeTest(null), {});
});

test('lireLaDemande : trois formes, la requete gardee, le double trait retabli, le reste refuse', () => {
	assert.deepEqual(lireLaDemande(`${SITE}/memento/timemap/link/${QUALIOPI}`), { genre: 'timemap', uri: QUALIOPI, tour: null });
	assert.deepEqual(lireLaDemande(`${SITE}/memento/timegate/${CASPS}`), { genre: 'timegate', uri: CASPS, tour: null });
	assert.deepEqual(lireLaDemande(`${SITE}/memento/20261003T040000Z/${CASPS}`), { genre: 'memento', uri: CASPS, tour: '20261003T040000Z' });
	assert.equal(lireLaDemande(`${SITE}/memento/timegate/https:/www.esma.europa.eu/sites/default/files/CASPS.csv`).uri, CASPS);
	for (const chemin of ['/memento', '/memento/', '/memento/timegate/ftp://x.y/z', '/memento/truc/https://x.y', '/autre/timegate/https://x.y', '/memento/timegate/']) {
		assert.equal(lireLaDemande(`${SITE}${chemin}`), null, chemin);
	}
	assert.equal(adresseDe('https:/a.b/c'), 'https://a.b/c');
	assert.equal(adresseDe('http://a.b'), 'http://a.b');
	assert.equal(adresseDe('nope'), null);
	assert.equal(adresseDe(null), null);
});

test('trouverLaSource ignore la barre finale ; choisirLaVersion prend la derniere avant l instant, la premiere avant toutes, la derniere sans date', () => {
	const index = indexDeTest();
	assert.equal(trouverLaSource(index, `${CASPS}/`).nom, 'esma-mica-casps');
	assert.equal(trouverLaSource(index, 'https://x.y'), null);
	assert.equal(trouverLaSource(null, CASPS), null);
	const { versions } = index['qualiopi-organismes-formation'];
	assert.equal(choisirLaVersion(versions, null).tour, '20261004T040000Z');
	assert.equal(choisirLaVersion(versions, 'hier').tour, '20261004T040000Z');
	assert.equal(choisirLaVersion(versions, 'Fri, 02 Oct 2026 12:00:00 GMT').tour, '20261001T040000Z');
	assert.equal(choisirLaVersion(versions, 'Sat, 03 Oct 2026 04:00:00 GMT').tour, '20261003T040000Z');
	assert.equal(choisirLaVersion(versions, 'Wed, 01 Jan 2020 00:00:00 GMT').tour, '20261001T040000Z');
	assert.equal(choisirLaVersion([], 'Wed, 01 Jan 2020 00:00:00 GMT'), null);
});

test('dateHttp, copieDuTemoin et la TimeMap au format link', () => {
	assert.equal(dateHttp('2026-10-01T04:00:00Z'), 'Thu, 01 Oct 2026 04:00:00 GMT');
	assert.equal(copieDuTemoin(CASPS, '2026-10-01T04:00:00Z'), `https://web.archive.org/web/20261001040000/${CASPS}`);
	const index = indexDeTest();
	const lignes = timeMap(SITE, index['qualiopi-organismes-formation']).trimEnd().split(',\n');
	assert.equal(lignes[0], `<${QUALIOPI}>; rel="original"`);
	assert.equal(lignes[1], `<${SITE}/memento/timemap/link/${QUALIOPI}>; rel="self"; type="${LINK_FORMAT}"; from="Thu, 01 Oct 2026 04:00:00 GMT"; until="Sun, 04 Oct 2026 04:00:00 GMT"`);
	assert.equal(lignes[2], `<${SITE}/memento/timegate/${QUALIOPI}>; rel="timegate"`);
	assert.equal(lignes[3], `<${SITE}/memento/20261001T040000Z/${QUALIOPI}>; rel="first memento"; datetime="Thu, 01 Oct 2026 04:00:00 GMT"`);
	assert.match(lignes[4], /rel="memento"; datetime="Sat, 03 Oct 2026 04:00:00 GMT"$/);
	assert.match(lignes[5], /20261004T040000Z.*rel="last memento"/);
	assert.equal(lignes.length, 6);
	const une = timeMap(SITE, { url: CASPS, versions: index['esma-mica-casps'].versions.slice(0, 1) }).trimEnd().split(',\n');
	assert.match(une[3], /rel="first last memento"/);
	const aucune = timeMap(SITE, { url: CASPS, versions: [] }).trimEnd().split(',\n');
	assert.equal(aucune.length, 3);
	assert.doesNotMatch(aucune[1], /from=/);
});

test('le middleware recopie les en-tetes de la requete : Accept rend le JSON a travers le chemin //', async () => {
	const index = indexDeTest();
	const env = { ASSETS: { fetch: async (url) => (new URL(url).pathname === `/${INDEX_MEMENTO}` ? Response.json(index) : new Response('', { status: 404 })) } };
	const r = await onRequest({ request: new Request(`${SITE}/memento/20261003T040000Z/${QUALIOPI}`, { headers: { accept: 'application/json' } }), env, next: async () => new Response('tel quel') });
	assert.match(r.headers.get('content-type'), /^application\/json/);
	assert.equal((await r.json()).sha256, B);
});

test('reponse : TimeMap, TimeGate et version, en HTML ou en JSON, et les refus', () => {
	const index = indexDeTest();
	const tm = reponse(index, `${SITE}/memento/timemap/link/${QUALIOPI}`);
	assert.equal(tm.statut, 200);
	assert.match(tm.entetes['content-type'], /^application\/link-format/);
	assert.match(tm.corps, /rel="first memento"/);
	const tg = reponse(index, `${SITE}/memento/timegate/${QUALIOPI}`);
	assert.equal(tg.statut, 302);
	assert.equal(tg.entetes.location, `/memento/20261004T040000Z/${QUALIOPI}`);
	assert.equal(tg.entetes.vary, 'accept-datetime');
	assert.match(tg.entetes.link, /rel="original", <[^>]+timemap\/link[^>]+>; rel="timemap"; type="application\/link-format"$/);
	assert.equal(reponse(index, `${SITE}/memento/timegate/${QUALIOPI}`, { acceptDatetime: 'Fri, 02 Oct 2026 12:00:00 GMT' }).entetes.location, `/memento/20261001T040000Z/${QUALIOPI}`);
	const page = reponse(index, `${SITE}/memento/20261003T040000Z/${QUALIOPI}`);
	assert.equal(page.statut, 200);
	assert.equal(page.entetes['memento-datetime'], 'Sat, 03 Oct 2026 04:00:00 GMT');
	assert.match(page.entetes['content-type'], /^text\/html/);
	assert.match(page.entetes.link, /rel="timegate", <[^>]+20261003T040000Z[^>]+>; rel="memento"; datetime="Sat, 03 Oct 2026 04:00:00 GMT"$/);
	assert.match(page.corps, /<h1>qualiopi-organismes-formation<\/h1>/);
	assert.match(page.corps, /Version 2 sur 3 : 03\/10\/2026 04:00 UTC/);
	assert.match(page.corps, new RegExp(`<code>${B}</code>`));
	assert.match(page.corps, /web\.archive\.org\/web\/20261003040000\//);
	assert.match(page.corps, /<meta name="robots" content="noindex">/);
	assert.deepEqual(page.corps.match(/[^\S ][:;?!»]/g), null, 'aucun deux-points en tete de ligne');
	assert.doesNotMatch(page.corps, /qualifi|certifi/i);
	const json = reponse(index, `${SITE}/memento/20261003T040000Z/${QUALIOPI}`, { accept: 'application/json' });
	assert.match(json.entetes['content-type'], /^application\/json/);
	const corps = JSON.parse(json.corps);
	assert.deepEqual([corps.source, corps.sha256, corps.racine, corps.releve], ['qualiopi-organismes-formation', B, 'r3', `${SITE}/empreintes/20261003T040000Z.json`]);
	assert.equal(corps.temoin, copieDuTemoin(QUALIOPI, '2026-10-03T04:00:00Z'));
	for (const [url, motif] of [
		[`${SITE}/memento/x`, /Adresse Memento inconnue/],
		[`${SITE}/memento/timegate/https://x.y/z`, /n'est pas une source temoin/],
		[`${SITE}/memento/20261009T040000Z/${QUALIOPI}`, /Aucune version de .* au tour 20261009T040000Z/]
	]) {
		const r = reponse(index, url);
		assert.equal(r.statut, 404, url);
		assert.match(r.corps, motif);
		assert.equal(r.entetes['cache-control'], 'no-store');
	}
	const vide = creerLesVersions(SOURCES).index();
	assert.equal(reponse(vide, `${SITE}/memento/timegate/${CASPS}`).statut, 404);
	assert.equal(reponse(vide, `${SITE}/memento/timemap/link/${CASPS}`).statut, 200);
});

test('la Function lit l index construit et repond ; sans index, rien n est une source', async () => {
	const index = indexDeTest();
	const env = { ASSETS: { fetch: async (url) => (new URL(url).pathname === `/${INDEX_MEMENTO}` ? Response.json(index) : new Response('', { status: 404 })) } };
	const tm = await onRequestGet({ request: new Request(`${SITE}/memento/timemap/link/${CASPS}`), env });
	assert.equal(tm.status, 200);
	assert.match(tm.headers.get('content-type'), /^application\/link-format/);
	assert.match(await tm.text(), /rel="last memento"/);
	const tg = await onRequestGet({ request: new Request(`${SITE}/memento/timegate/${CASPS}`, { headers: { 'accept-datetime': 'Thu, 01 Oct 2026 12:00:00 GMT' } }), env });
	assert.equal(tg.status, 302);
	assert.equal(tg.headers.get('location'), `/memento/20261001T040000Z/${CASPS}`);
	assert.equal(await tg.text(), '');
	const sans = await onRequestGet({ request: new Request(`${SITE}/memento/timegate/${CASPS}`), env: { ASSETS: { fetch: async () => new Response('', { status: 404 }) } } });
	assert.equal(sans.status, 404);
});

test('le middleware reduit le // du schema dans une adresse Memento, et laisse tout le reste passer tel quel', async () => {
	assert.equal(cheminMementoRetabli(`${SITE}/memento/timegate/https://a.b/c?d=e`), `${SITE}/memento/timegate/https:/a.b/c?d=e`);
	assert.equal(cheminMementoRetabli(`${SITE}/memento/timemap/link/http://a.b/`), `${SITE}/memento/timemap/link/http:/a.b/`);
	assert.equal(cheminMementoRetabli(`${SITE}/memento/20261003T040000Z/https://a.b/c//d`), `${SITE}/memento/20261003T040000Z/https:/a.b/c//d`);
	for (const u of [`${SITE}/memento/timegate/https:/a.b/c`, `${SITE}/memento/x`, `${SITE}/verifier`, `${SITE}/memento/truc/https://a.b`]) assert.equal(cheminMementoRetabli(u), null, u);
	let suivants = 0;
	const next = async () => (suivants++, new Response('tel quel'));
	const index = indexDeTest();
	const env = { ASSETS: { fetch: async (url) => (new URL(url).pathname === `/${INDEX_MEMENTO}` ? Response.json(index) : new Response('', { status: 404 })) } };
	const reecrit = await onRequest({ request: new Request(`${SITE}/memento/timegate/${CASPS}`, { headers: { 'accept-datetime': 'Fri, 02 Oct 2026 12:00:00 GMT' } }), env, next });
	assert.equal(reecrit.status, 302, 'la Function est jouee par le middleware, sans le routeur');
	assert.equal(reecrit.headers.get('location'), `/memento/20261002T040000Z/${CASPS}`);
	assert.equal(suivants, 0);
	const direct = await onRequest({ request: new Request(`${SITE}/memento/timegate/https:/a.b/c`), env, next });
	assert.equal(await direct.text(), 'tel quel', 'un chemin deja reduit suit le routeur');
	const poste = await onRequest({ request: new Request(`${SITE}/memento/timegate/${CASPS}`, { method: 'POST' }), env, next });
	assert.equal(await poste.text(), 'tel quel', 'un POST ne se joue pas ici');
	const ailleurs = await onRequest({ request: new Request(`${SITE}/verifier`), env, next });
	assert.equal(await ailleurs.text(), 'tel quel');
	assert.equal(suivants, 3);
});

test('les liens Memento restent en https quand le mandataire passe la demande en http, sauf en local', () => {
	const index = indexDeTest();
	const tm = reponse(index, `http://temoinpublic.fr/memento/timemap/link/${QUALIOPI}`);
	assert.doesNotMatch(tm.corps, /<http:\/\/temoinpublic/);
	assert.match(tm.corps, /<https:\/\/temoinpublic\.fr\/memento\/timegate\//);
	assert.match(reponse(index, `http://temoinpublic.fr/memento/timegate/${QUALIOPI}`).entetes.location, /^\/memento\/\d{8}T\d{6}Z\/https:\/\//, 'le TimeGate redirige en relatif');
	assert.match(reponse(index, `http://localhost:8788/memento/timemap/link/${QUALIOPI}`).corps, /<http:\/\/localhost:8788\/memento\/timegate\//);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseDeTest } from './d1.mjs';
import { deposer, fichierDuJour, inserer, resoudreParDoH, temoigner } from '../src/service.mjs';
import { idDuRecu, lireFichierDuJour } from '../src/depot.mjs';
import { onRequestPost, onRequestOptions } from '../functions/api/depots.js';
import { onRequestGet } from '../functions/depots/[fichier].js';

const H = 'a'.repeat(64);
const midi = new Date('2026-10-12T12:00:00Z');
const corpsDe = (r) => JSON.parse(r.corps);
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('un depot declare prend la place suivante du jour, et sa ligne entre dans le fichier public', async () => {
	const db = baseDeTest();
	const a = await deposer({ db, corps: { sha256: H, libelle: 'PV' }, adresse: '203.0.113.1', maintenant: midi });
	const b = await deposer({ db, corps: { sha256: H }, adresse: '203.0.113.2', maintenant: midi });
	assert.equal(a.statut, 201);
	assert.deepEqual([corpsDe(a).place, corpsDe(b).place], [1, 2]);
	assert.equal(corpsDe(a).id, await idDuRecu(corpsDe(a).recu));
	assert.equal(corpsDe(a).recu.libelle, 'PV');
	const f = await fichierDuJour({ db, nom: '2026-10-12.jsonl', maintenant: midi });
	assert.equal(f.statut, 200);
	assert.equal(f.entetes['cache-control'], 'public, max-age=60');
	const lignes = lireFichierDuJour(f.corps, '2026-10-12');
	assert.deepEqual(Object.keys(lignes[0]), ['sha256', 'jour', 'place', 'recu']);
	assert.equal(lignes[0].recu, corpsDe(a).id);
	assert.ok(!f.corps.includes('PV'), 'le libelle ne sort jamais');
	assert.equal(f.corps.split('\n')[0], corpsDe(a).ligne);
});

test('l adresse n est jamais gardee, et les compteurs de la veille partent avec son sel', async () => {
	const db = baseDeTest();
	await deposer({ db, corps: { sha256: H }, adresse: '203.0.113.9', maintenant: new Date('2026-10-11T12:00:00Z') });
	await deposer({ db, corps: { sha256: H }, adresse: '203.0.113.9', maintenant: midi });
	const tout = JSON.stringify([...db.sqlite.prepare('SELECT * FROM compte').all(), ...db.sqlite.prepare('SELECT * FROM sel').all()]);
	assert.ok(!tout.includes('203.0.113.9'));
	assert.deepEqual(db.sqlite.prepare('SELECT jour FROM sel').all().map((r) => r.jour), ['2026-10-12']);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM compte').get().n, 1);
	const veille = await fichierDuJour({ db, nom: '2026-10-11.jsonl', maintenant: midi });
	assert.equal(veille.entetes['cache-control'], 'public, max-age=3600');
	assert.equal(lireFichierDuJour(veille.corps, '2026-10-11').length, 1);
});

test('vingt depots par adresse et par jour, puis 429 jusqu a minuit UTC ; une autre adresse passe', async () => {
	const db = baseDeTest();
	for (let i = 0; i < 20; i++) assert.equal((await deposer({ db, corps: { sha256: H }, adresse: 'x', maintenant: midi })).statut, 201);
	const r = await deposer({ db, corps: { sha256: H }, adresse: 'x', maintenant: midi });
	assert.equal(r.statut, 429);
	assert.equal(r.entetes['retry-after'], String(12 * 3600));
	assert.equal((await deposer({ db, corps: { sha256: H }, adresse: 'y', maintenant: midi })).statut, 201);
	db.sqlite.exec("INSERT INTO depot SELECT '2026-10-12', place + 100, sha256, recu FROM depot");
	db.sqlite.exec("WITH RECURSIVE n(i) AS (SELECT 200 UNION ALL SELECT i + 1 FROM n WHERE i < 2000) INSERT INTO depot SELECT '2026-10-12', i, 'h', 'r' FROM n");
	assert.match(corpsDe(await deposer({ db, corps: { sha256: H }, adresse: 'z', maintenant: midi })).erreur, /plafond du jour/);
});

test('une demande illisible ou une url refusee repond 400 sans rien ecrire', async () => {
	const db = baseDeTest();
	assert.equal((await deposer({ db, corps: { sha256: 'x' }, adresse: 'a', maintenant: midi })).statut, 400);
	const r = await deposer({ db, corps: { url: 'http://169.254.169.254/latest' }, adresse: 'a', maintenant: midi });
	assert.equal(r.statut, 400);
	assert.match(corpsDe(r).details[0], /privee/);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM depot').get().n, 0);
});

test('le temoin depose l empreinte des octets lus, une seule lecture par url et par jour', async () => {
	const db = baseDeTest();
	const lu = { url: 'https://x.fr/a.pdf', taille: 3, type: 'application/pdf', lu: midi.toISOString(), sha256: sha('abc') };
	const temoin = async () => lu;
	const r = await deposer({ db, corps: { url: 'https://x.fr/a.pdf' }, adresse: 'a', maintenant: midi, temoin });
	assert.equal(r.statut, 201);
	assert.equal(corpsDe(r).recu.sha256, sha('abc'));
	assert.equal(corpsDe(r).recu.source, 'temoin');
	assert.deepEqual(corpsDe(r).recu.temoin, { url: lu.url, taille: 3, type: 'application/pdf', lu: lu.lu });
	const encore = await deposer({ db, corps: { url: 'https://x.fr/a.pdf' }, adresse: 'b', maintenant: midi, temoin });
	assert.equal(encore.statut, 409);
	assert.ok(!JSON.stringify(db.sqlite.prepare('SELECT * FROM lecture').all()).includes('x.fr'));
	const echec = await deposer({ db, corps: { url: 'https://y.fr/' }, adresse: 'a', maintenant: midi, temoin: async () => { throw new Error('la source a repondu 404'); } });
	assert.equal(echec.statut, 422);
	assert.match(corpsDe(echec).details[0], /404/);
});

const reponseDe = (statut, corps = '', entetes = {}) => new Response(statut >= 300 && statut < 400 ? null : corps, { status: statut, headers: entetes });

test('le temoin suit les redirections en re-gardant chaque saut, et lit le corps', async () => {
	const appels = [];
	const f = async (url, init) => {
		appels.push([url, init.redirect, init.headers['user-agent']]);
		if (url === 'https://x.fr/a') return reponseDe(302, '', { location: '/b' });
		return reponseDe(200, 'abc', { 'content-type': 'text/plain' });
	};
	const lu = await temoigner({ url: 'https://x.fr/a', hote: 'x.fr' }, { fetch: f, resoudre: async () => ['93.184.216.34'], maintenant: () => midi.getTime() });
	assert.deepEqual(lu, { url: 'https://x.fr/b', taille: 3, type: 'text/plain', lu: midi.toISOString(), sha256: sha('abc') });
	assert.equal(appels[0][1], 'manual');
	assert.match(appels[0][2], /empreintes-temoin/);
	const vide = await temoigner({ url: 'http://93.184.216.34/', hote: '93.184.216.34' }, { fetch: async () => new Response(null, { status: 204 }), resoudre: async () => { throw new Error('jamais'); } });
	assert.equal(vide.taille, 0);
});

test('le temoin refuse un hote resolu en prive, une redirection vers une metadonnee, et un statut d erreur', async () => {
	const publique = async () => ['93.184.216.34'];
	await assert.rejects(temoigner({ url: 'https://x.fr/', hote: 'x.fr' }, { fetch: async () => reponseDe(200), resoudre: async () => ['10.0.0.1'] }), /privee/);
	await assert.rejects(temoigner({ url: 'https://x.fr/', hote: 'x.fr' }, { fetch: async () => reponseDe(301, '', { location: 'http://169.254.169.254/' }), resoudre: publique }), /privee/);
	await assert.rejects(temoigner({ url: 'https://x.fr/', hote: 'x.fr' }, { fetch: async () => reponseDe(301, '', { location: 'https://x.fr/' }), resoudre: publique }), /plus de 5/);
	await assert.rejects(temoigner({ url: 'https://x.fr/', hote: 'x.fr' }, { fetch: async () => reponseDe(404, 'non'), resoudre: publique }), /repondu 404/);
});

test('la resolution DoH lit A puis AAAA, et leve sur un resolveur en erreur', async () => {
	const vus = [];
	const f = async (url, init) => {
		vus.push([url, init.headers.accept]);
		return new Response(JSON.stringify({ Answer: [{ type: url.endsWith('=A') ? 1 : 28, data: url.endsWith('=A') ? '1.2.3.4' : '2606:4700::1' }] }));
	};
	assert.deepEqual(await resoudreParDoH('x.fr', { fetch: f }), ['1.2.3.4', '2606:4700::1']);
	assert.equal(vus[0][1], 'application/dns-json');
	await assert.rejects(resoudreParDoH('x.fr', { fetch: async () => new Response('', { status: 503 }) }), /resolution A : 503/);
});

test('les Functions branchent le service : POST, preflight, fichier du jour, nom inconnu', async () => {
	const env = { DEPOTS: baseDeTest() };
	const post = (corps) => new Request('https://e.fr/api/depots', { method: 'POST', body: corps, headers: { 'cf-connecting-ip': '203.0.113.5' } });
	const r = await onRequestPost({ request: post(JSON.stringify({ sha256: H })), env });
	assert.equal(r.status, 201);
	assert.equal((await onRequestPost({ request: post('pas du json'), env })).status, 400);
	assert.equal(onRequestOptions().status, 204);
	const jour = new Date().toISOString().slice(0, 10);
	const f = await onRequestGet({ params: { fichier: `${jour}.jsonl` }, env });
	assert.equal(f.status, 200);
	assert.equal((await f.text()).split('\n').length, 2);
	for (const nom of ['x.jsonl', '2026-13-45.jsonl', undefined]) assert.equal((await onRequestGet({ params: { fichier: nom }, env })).status, 404, String(nom));
});

test('le bilan garde depots et deposants distincts par jour, en agregat seulement', async () => {
	const db = baseDeTest();
	const veille = new Date('2026-10-11T12:00:00Z');
	for (const adresse of ['a', 'a', 'b']) await deposer({ db, corps: { sha256: H }, adresse, maintenant: veille });
	await deposer({ db, corps: { sha256: H }, adresse: 'c', maintenant: midi });
	const env = { DEPOTS: db };
	const { onRequestGet } = await import('../functions/api/bilan.js');
	const b = await (await onRequestGet({ env })).json();
	assert.deepEqual(b.jours, [
		{ jour: '2026-10-11', depots: 3, deposants: 2 },
		{ jour: '2026-10-12', depots: 1, deposants: 1 }
	]);
	assert.equal(b.deposantsAuMoins, 2);
	assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM compte WHERE jour = '2026-10-11'").get().n, 0);
	const vide = await (await onRequestGet({ env: { DEPOTS: baseDeTest() } })).json();
	assert.deepEqual(vide, { jours: [], deposantsAuMoins: 0 });
});

test("un depot s'ecrit avec ce qui l'accompagne, tout ou rien", async () => {
	const db = baseDeTest();
	const compte = ['INSERT INTO compte (jour, adresse, n) VALUES (?, ?, 1)', '2026-10-12', 'cle'];
	await assert.rejects(inserer(db, { jour: '2026-10-12', empreinte: 'a'.repeat(64), recu: 'r1' }, [compte, ['INSERT INTO absente VALUES (1)']]));
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM depot').get().n, 0, 'pas de ligne publique sans le reste');
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM compte').get().n, 0);
	assert.equal(await inserer(db, { jour: '2026-10-12', empreinte: 'a'.repeat(64), recu: 'r1' }, [compte]), 1);
	assert.equal(db.sqlite.prepare('SELECT n FROM compte').get().n, 1);
});

test('une seule echeance borne la lecture du temoin : resolution, sauts et corps compris', async () => {
	const admise = { url: 'https://x.fr/a', hote: 'x.fr' };
	const publique = async () => ['93.184.216.34'];
	const jamais = () => new Promise(() => {});
	const motif = /lecture au-dela de 0\.05 s$/;
	await assert.rejects(temoigner(admise, { delaiMs: 50, resoudre: jamais, fetch: jamais }), motif, 'resolution sans reponse');
	await assert.rejects(temoigner(admise, { delaiMs: 50, resoudre: publique, fetch: jamais }), motif, 'source sans reponse');
	const muet = async () => new Response(new ReadableStream({ pull: jamais }), { status: 200 });
	await assert.rejects(temoigner(admise, { delaiMs: 50, resoudre: publique, fetch: muet }), motif, 'corps qui ne vient pas');
	let sauts = 0;
	const lent = async (url, { signal }) => {
		sauts += 1;
		await new Promise((ok) => setTimeout(ok, 20));
		signal.throwIfAborted();
		return new Response(null, { status: 302, headers: { location: `${url}x` } });
	};
	await assert.rejects(temoigner(admise, { delaiMs: 50, resoudre: publique, fetch: lent }), motif, 'des redirections qui relancent chacune leur delai');
	assert.ok(sauts <= 4, `${sauts} sauts`);
});

test('la resolution DoH porte le signal de l echeance', async () => {
	const signal = AbortSignal.abort();
	let recu;
	const f = async (_url, options) => {
		recu = options.signal;
		return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
	};
	await resoudreParDoH('x.fr', { fetch: f, signal });
	assert.equal(recu, signal);
});

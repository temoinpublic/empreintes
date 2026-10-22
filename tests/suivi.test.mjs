import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseDeTest } from './d1.mjs';
import { FLUX_MAX, inscrireFlux, registreDeLEditeur, registrePrive, retirerFlux, tourneeDesFlux, idDuFlux } from '../src/suivi.mjs';
import { pageEditeur } from '../src/pages.mjs';
import { onRequestGet as pageDeLEditeur } from '../functions/editeur/[id].js';
import { deposer, fichierDuJour, temoigner } from '../src/service.mjs';
import { lireFichierDuJour } from '../src/depot.mjs';
import { onRequestPost, onRequestOptions } from '../functions/api/flux.js';
import { onRequestDelete, onRequestGet as apiFlux } from '../functions/api/flux/[id].js';
import worker from '../workers/flux.mjs';

const FLUX = 'https://blog.example.fr/rss.xml';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const rss = (items) =>
	`<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>${items.map(([lien, titre]) => `<item><title>${titre}</title><link>${lien}</link></item>`).join('')}</channel></rss>`;

/** Un web fictif : adresse vers texte servi, ou vers un statut d'erreur. */
function web(pages) {
	const lus = [];
	const temoin = async (admise, { garder = false } = {}) => {
		lus.push(admise.url);
		const page = pages[admise.url];
		if (page === undefined) throw new Error('la source a repondu 404');
		if (typeof page === 'number') throw Object.assign(new Error(`la source a repondu ${page}`), { statut: page });
		const octets = new TextEncoder().encode(page);
		const lu = { url: admise.url, taille: octets.byteLength, type: 'text/html', lu: '2026-10-12T12:00:00.000Z', sha256: sha(page) };
		return garder ? { ...lu, octets } : lu;
	};
	return { pages, lus, temoin };
}

const A = 'https://blog.example.fr/a/';
const B = 'https://blog.example.fr/b/';
const jour = (j, h = 12) => new Date(`2026-10-${j}T${String(h).padStart(2, '0')}:00:00Z`);
const corps = (r) => JSON.parse(r.corps);

async function inscrit(w) {
	const db = baseDeTest();
	const r = await inscrireFlux({ db, corps: { url: FLUX }, maintenant: jour(12), temoin: w.temoin });
	assert.equal(r.statut, 201);
	return { db, ...corps(r) };
}

test("l'inscription lit le flux une fois et rend un jeton garde hache ; le reste est refuse", async () => {
	const w = web({ [FLUX]: rss([[A, 'Un'], [B, 'Deux']]), 'https://x.fr/page': '<html></html>' });
	const { db, id, jeton, format, entrees } = await inscrit(w);
	assert.deepEqual([id, format, entrees], [await idDuFlux(FLUX), 'rss', 2]);
	assert.match(jeton, /^[0-9a-f]{64}$/);
	const ligne = db.sqlite.prepare('SELECT url, jeton FROM flux').get();
	assert.equal(ligne.url, FLUX);
	assert.equal(ligne.jeton, sha(jeton));
	const essai = (c) => inscrireFlux({ db, corps: c, maintenant: jour(12), temoin: w.temoin });
	assert.equal((await essai({ url: FLUX })).statut, 409);
	for (const c of [null, {}, { url: FLUX, autre: 1 }, { url: 'ftp://x.fr/' }, { url: 'https://www.quivad.fr/movements.xml' }, { url: 'https://titelia.com/en/feed.xml' }]) assert.equal((await essai(c)).statut, 400, JSON.stringify(c));
	assert.deepEqual(corps(await essai({ url: 'https://x.fr/page' })).erreur, 'flux illisible');
	assert.equal((await essai({ url: 'https://x.fr/absent' })).statut, 422);
	for (let i = 0; i < FLUX_MAX; i++) db.sqlite.prepare("INSERT INTO flux (id, url, jeton, inscrit) VALUES (?, ?, 'j', '2026-01-01')").run(`f${i}`, `https://f${i}.fr/`);
	assert.equal((await essai({ url: 'https://autre.fr/rss.xml' })).statut, 429);
});

test('le retrait demande le jeton, garde les versions, et laisse se reinscrire', async () => {
	const w = web({ [FLUX]: rss([[A, 'Un']]), [A]: 'page a' });
	const { db, id, jeton } = await inscrit(w);
	await tourneeDesFlux({ db, maintenant: jour(12), temoin: w.temoin });
	assert.equal((await retirerFlux({ db, id: 'inconnu', jeton })).statut, 404);
	assert.equal((await retirerFlux({ db, id, jeton: 'faux' })).statut, 403);
	assert.equal((await retirerFlux({ db, id, jeton: '' })).statut, 403);
	assert.equal((await retirerFlux({ db, id, jeton, maintenant: jour(13) })).statut, 200);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM version').get().n, 1);
	assert.deepEqual(await tourneeDesFlux({ db, maintenant: jour(14), temoin: w.temoin }), { flux: 0, lectures: 0 });
	assert.equal((await inscrireFlux({ db, corps: { url: FLUX }, maintenant: jour(14), temoin: w.temoin })).statut, 201);
});

test('la tournee depose une version par article nouveau ; la ligne publique reste a quatre champs, sans adresse ni titre', async () => {
	const w = web({ [FLUX]: rss([[A, 'Titre secret'], [B, 'Deux']]), [A]: 'page a', [B]: 'page b' });
	const { db } = await inscrit(w);
	assert.deepEqual(await tourneeDesFlux({ db, maintenant: jour(12), temoin: w.temoin }), { flux: 1, lectures: 2 });
	const f = await fichierDuJour({ db, nom: '2026-10-12.jsonl', maintenant: jour(12) });
	const lignes = lireFichierDuJour(f.corps, '2026-10-12');
	assert.deepEqual(lignes.map((l) => l.sha256), [sha('page a'), sha('page b')]);
	for (const interdit of ['blog.example.fr', 'Titre secret']) assert.ok(!f.corps.includes(interdit), interdit);
	const v = db.sqlite.prepare('SELECT recu, contenu FROM version').all();
	assert.deepEqual(v.map((x) => JSON.parse(x.contenu).url).sort(), [A, B]);
	assert.ok(!v.some((x) => x.contenu.includes('Titre secret')), 'le recu ne porte pas le titre');
	assert.match(db.sqlite.prepare('SELECT etat FROM flux').get().etat, /2 entrees, 2 versions, 0 echecs/);
	// Une heure plus tard, rien : un essai par article et par jour.
	w.lus.length = 0;
	assert.equal((await tourneeDesFlux({ db, maintenant: jour(12, 13), temoin: w.temoin })).lectures, 0);
	assert.deepEqual(w.lus, [FLUX]);
	// Les versions ne prennent rien au plafond des depots exterieurs : un depot du jour prend la place 3.
	const d = await deposer({ db, corps: { sha256: 'a'.repeat(64) }, adresse: 'x', maintenant: jour(12, 14) });
	assert.equal(corps(d).place, 3);
});

test("un article ne se dit lu qu'avec sa version : une panne a l'ecriture laisse la version a redeposer", async () => {
	const w = web({ [FLUX]: rss([[A, 'Un']]), [A]: 'v1' });
	const { db } = await inscrit(w);
	const batch = db.batch;
	db.batch = async () => {
		throw new Error('D1 indisponible');
	};
	await assert.rejects(tourneeDesFlux({ db, maintenant: jour(12), temoin: w.temoin }), /D1 indisponible/);
	assert.equal(db.sqlite.prepare('SELECT octets FROM article').get().octets, null, 'pas d empreinte sans version');
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM depot').get().n, 0);
	db.batch = batch;
	await tourneeDesFlux({ db, maintenant: jour(13), temoin: w.temoin });
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM version').get().n, 1);
	assert.equal(db.sqlite.prepare('SELECT octets FROM article').get().octets, sha('v1'));
});

test("une entree modifiee se relit le jour meme ; des octets inchanges ne font pas de version ; la relecture hebdomadaire voit une correction silencieuse", async () => {
	const w = web({ [FLUX]: rss([[A, 'Un']]), [A]: 'v1' });
	const { db } = await inscrit(w);
	const versions = () => db.sqlite.prepare('SELECT COUNT(*) AS n FROM version').get().n;
	await tourneeDesFlux({ db, maintenant: jour(12), temoin: w.temoin });
	assert.equal(versions(), 1);
	await tourneeDesFlux({ db, maintenant: jour(13), temoin: w.temoin });
	assert.equal(versions(), 1, 'ni nouvelle, ni modifiee, ni sept jours');
	w.pages[FLUX] = rss([[A, 'Un, corrige']]);
	await tourneeDesFlux({ db, maintenant: jour(14), temoin: w.temoin });
	assert.equal(versions(), 1, 'le flux a change, la page non');
	w.pages[A] = 'v2';
	await tourneeDesFlux({ db, maintenant: jour(15), temoin: w.temoin });
	assert.equal(versions(), 1, 'correction silencieuse : attendre la relecture');
	await tourneeDesFlux({ db, maintenant: jour(21), temoin: w.temoin });
	assert.equal(versions(), 2);
	assert.deepEqual(db.sqlite.prepare('SELECT jour FROM version ORDER BY jour').all().map((r) => r.jour), ['2026-10-12', '2026-10-21']);
});

test('un flux en 403 ou 429 attend le lendemain ; un article illisible se reessaie le lendemain ; le budget se partage', async () => {
	const w = web({ [FLUX]: 429, [A]: 'a' });
	const db = baseDeTest();
	const id = await idDuFlux(FLUX);
	db.sqlite.prepare("INSERT INTO flux (id, url, jeton, inscrit) VALUES (?, ?, 'j', '2026-10-12')").run(id, FLUX);
	await tourneeDesFlux({ db, maintenant: jour(12), temoin: w.temoin });
	assert.deepEqual({ ...db.sqlite.prepare('SELECT reprise, etat FROM flux').get() }, { reprise: '2026-10-13', etat: 'la source a repondu 429' });
	w.pages[FLUX] = rss([[A, 'Un'], [B, 'Deux']]);
	assert.deepEqual(await tourneeDesFlux({ db, maintenant: jour(12, 13), temoin: w.temoin }), { flux: 0, lectures: 0 });
	assert.equal((await tourneeDesFlux({ db, maintenant: jour(13), temoin: w.temoin, budget: 1 })).lectures, 1);
	assert.equal((await tourneeDesFlux({ db, maintenant: jour(13, 13), temoin: w.temoin })).lectures, 1, 'B, illisible');
	assert.match(db.sqlite.prepare('SELECT etat FROM flux').get().etat, /2 entrees, 0 versions, 1 echecs/);
	w.pages[B] = 'b';
	assert.equal((await tourneeDesFlux({ db, maintenant: jour(14), temoin: w.temoin })).lectures, 1);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM version').get().n, 2);
	w.pages[FLUX] = 500;
	await tourneeDesFlux({ db, maintenant: jour(15), temoin: w.temoin });
	assert.equal(db.sqlite.prepare('SELECT reprise FROM flux').get().reprise, null, 'une autre erreur ne met pas en attente');
	w.pages[FLUX] = rss([['http://127.0.0.1/x', 'locale']]);
	await tourneeDesFlux({ db, maintenant: jour(16), temoin: w.temoin });
	assert.match(db.sqlite.prepare('SELECT etat FROM flux').get().etat, /1 echecs/);
});

test('le temoin garde les octets quand on les demande, et nomme le statut de la source', async () => {
	const admise = { url: 'https://x.fr/f', hote: 'x.fr' };
	const servir = (statut, texte) => async () => new Response(texte, { status: statut });
	const lu = await temoigner(admise, { fetch: servir(200, 'abc'), resoudre: async () => ['93.184.216.34'], garder: true });
	assert.equal(new TextDecoder().decode(lu.octets), 'abc');
	assert.equal((await temoigner(admise, { fetch: servir(200, 'abc'), resoudre: async () => ['93.184.216.34'] })).octets, undefined);
	await assert.rejects(temoigner(admise, { fetch: servir(403, ''), resoudre: async () => ['93.184.216.34'] }), (e) => e.statut === 403);
});

test('les Functions et le Worker branchent le suivi', async () => {
	const db = baseDeTest();
	const r = await onRequestPost({ request: new Request('https://e/api/flux', { method: 'POST', body: 'pas du json' }), env: { DEPOTS: db } });
	assert.equal(r.status, 400);
	assert.equal(onRequestOptions().headers.get('access-control-allow-methods'), 'POST, DELETE');
	const d = await onRequestDelete({ request: new Request('https://e/api/flux/x', { method: 'DELETE', headers: { authorization: 'Bearer j' } }), params: { id: 'x' }, env: { DEPOTS: db } });
	assert.equal(d.status, 404);
	const sans = await onRequestDelete({ request: new Request('https://e/api/flux/x', { method: 'DELETE' }), params: { id: 'x' }, env: { DEPOTS: db } });
	assert.equal(sans.status, 404);
	const attendus = [];
	await worker.scheduled({}, { DEPOTS: db }, { waitUntil: (p) => attendus.push(p) });
	await Promise.all(attendus);
	assert.equal(attendus.length, 1);
});

test("le registre public d'un editeur liste ses versions sans adresse ni titre ; le prive, par jeton, donne les adresses et les recus", async () => {
	const w = web({ [FLUX]: rss([[A, 'Titre secret'], [B, 'Deux']]), [A]: 'v1', [B]: 'b' });
	const { db, id, jeton, prive, registre } = await inscrit(w);
	assert.deepEqual([registre, prive], [`/editeur/${id}`, `/editeur/${id}#${jeton}`]);
	await tourneeDesFlux({ db, maintenant: jour(12), temoin: w.temoin });
	w.pages[A] = 'v2';
	await tourneeDesFlux({ db, maintenant: jour(19), temoin: w.temoin });
	const r = await registreDeLEditeur({ db, id });
	assert.equal(r.total, 3);
	assert.deepEqual(r.versions.map((v) => v.jour), ['2026-10-19', '2026-10-12', '2026-10-12']);
	const html = pageEditeur(r);
	assert.match(html, /<h2>3 versions, 2 articles<\/h2>/);
	assert.match(html, /Suivi depuis le 12\/10\/2026/);
	for (const interdit of ['blog.example.fr', 'Titre secret', 'noindex']) assert.ok(!html.includes(interdit), interdit);
	assert.match(html, /<td class="n">2<\/td><td><a href="\/recu\/[0-9a-f]{64}">19\/10\/2026<\/a><\/td>/);
	assert.match(pageEditeur({ ...r, versions: r.versions.slice(0, 1) }), /Les 1 plus récentes sur 3\./);
	assert.equal(await registreDeLEditeur({ db, id: 'inconnu' }), null);
	const page = await pageDeLEditeur({ request: new Request(`https://temoinpublic.fr/editeur/${id}`), params: { id }, env: { DEPOTS: db } });
	assert.equal(page.status, 200);
	assert.match(await page.text(), /<html lang="fr">/);
	const allemande = await pageDeLEditeur({ request: new Request(`https://datumszeuge.de/editeur/${id}`), params: { id }, env: { DEPOTS: db } });
	assert.match(await allemande.text(), /<html lang="de">[\s\S]*Verfolgt seit dem 12\.10\.2026\.<\/p>\n<h2>3 Versionen, 2 Artikel<\/h2>/);
	const absente = await pageDeLEditeur({ request: new Request('https://datumszeuge.de/editeur/x'), params: { id: 'x' }, env: { DEPOTS: db } });
	assert.equal(absente.status, 404);
	assert.match(await absente.text(), /<h1>Seite nicht gefunden<\/h1>/);

	const lire = (j) => apiFlux({ request: new Request(`https://e/api/flux/${id}`, { headers: j ? { authorization: `Bearer ${j}` } : {} }), params: { id }, env: { DEPOTS: db } });
	assert.equal((await lire(null)).status, 403);
	assert.equal((await lire('faux')).status, 403);
	assert.equal((await registrePrive({ db, id: 'x', jeton })).statut, 404);
	const p = await (await lire(jeton)).json();
	assert.equal(p.flux.url, FLUX);
	assert.equal(p.flux.jeton, undefined, 'le hache du jeton ne sort pas');
	assert.deepEqual(p.articles.map((a) => a.lien).sort(), [A, B]);
	assert.equal(p.recus.length, 3);
	assert.ok(p.recus.every((x) => x.recu.url && !JSON.stringify(x).includes('Titre secret')));

	await retirerFlux({ db, id, jeton, maintenant: jour(20) });
	assert.match(pageEditeur(await registreDeLEditeur({ db, id })), /Suivi du 12\/10\/2026 au 20\/10\/2026/);
	assert.match(pageEditeur(await registreDeLEditeur({ db, id }), 'de'), /Verfolgt vom 12\.10\.2026 bis 20\.10\.2026/);
	assert.match(pageEditeur({ ...r, versions: r.versions.slice(0, 1) }, 'de'), /Die 1 neuesten von 3\./);
	assert.match(pageEditeur({ ...r, total: 0, versions: [] }, 'de'), /Keine datierte Version/);
	const vide = pageEditeur({ flux: { id: 'f', inscrit: '2026-10-12T00:00:00Z', retire: null }, total: 0, versions: [] });
	assert.match(vide, /Aucune version datée/);
	assert.match(vide, /noindex/);
});

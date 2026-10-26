import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RACINE_NULLE, arbre, chainer, empreinteDeFeuille } from '../src/chaine.mjs';
import { indexDesEmpreintes } from '../src/journal.mjs';
import { CACHE_MS, depotsCouverts, jouerLeDepot, jouerLeVerificateur, jouerLesParcours } from '../src/parcours.mjs';
import { baseDeTest } from './d1.mjs';
import { onRequestGet as sonde } from '../functions/health.js';

const h = (t) => createHash('sha256').update(String(t)).digest('hex');

async function releveAvec(id, precedente, feuilles) {
	const a = await arbre(await Promise.all(feuilles.map(empreinteDeFeuille)));
	return { id, precedente, arbre: a, racine: await chainer({ id, precedente, arbre: a }), feuilles };
}

const FEUILLES = [
	{ cle: 'manifeste:x', sha256: h('manifeste'), jour: '2026-10-26' },
	{ cle: 'source/a.pdf', sha256: h('a'), jour: '2026-10-26' },
	{ cle: 'source/b.pdf', sha256: h('b'), jour: '2026-10-26' },
	{ cle: 'depots:2', sha256: h('depots'), jour: '2026-10-26' }
];

/** Une surface en memoire : le releve plein, son index, et ce que le test y ajoute. */
async function surface(id, { fichiers = [], index: indexDonne, releve: releveDonne, extra = {} } = {}) {
	const releve = releveDonne ?? (await releveAvec(id, RACINE_NULLE, FEUILLES));
	const tours = [{ id, racine: releve.racine, base: null, depots: 2, fichiers }];
	const parts = indexDonne ?? indexDesEmpreintes([releve]);
	const fichiersServis = { [`/empreintes/${id}.json`]: JSON.stringify(releve), ...Object.fromEntries(Object.entries(parts).map(([p, v]) => [`/index/${p}.json`, JSON.stringify(v)])), ...extra };
	const lus = [];
	const lire = async (chemin) => {
		lus.push(chemin);
		return chemin in fichiersServis ? new Response(fichiersServis[chemin]) : new Response('', { status: 404 });
	};
	return { releve, tours, lire, lus };
}

test('le verificateur retrouve une empreinte du dernier tour dans l index et remonte jusqu a la racine', async () => {
	const s = await surface('20261026T100000Z');
	const r = await jouerLeVerificateur({ lire: s.lire, tours: s.tours, maintenant: 0 });
	assert.deepEqual(r, { ok: true, tour: '20261026T100000Z', empreinte: h('a'), etapes: 2, signature: null });
});

test('le verificateur est rouge sans tour, sur un index qui ne voit pas l empreinte, et sur un chemin qui ne rend pas la racine', async () => {
	assert.deepEqual(await jouerLeVerificateur({ lire: async () => assert.fail('rien a lire'), tours: [], maintenant: 0 }), { ok: false, raison: 'aucun tour publie' });
	const sansIndex = await surface('20261026T110000Z', { index: {} });
	assert.match((await jouerLeVerificateur({ lire: sansIndex.lire, tours: sansIndex.tours, maintenant: 0 })).raison, /l index ne voit pas/);
	const vieux = await surface('20261026T120000Z', { index: { [h('a').slice(0, 2)]: { [h('a')]: [{ cle: 'source/a.pdf', jour: '2026-10-25', premier: 'avant', dernier: 'avant' }] } } });
	assert.match((await jouerLeVerificateur({ lire: vieux.lire, tours: vieux.tours, maintenant: 0 })).raison, /l index ne voit pas .* au tour 20261026T120000Z/);
	const altere = await releveAvec('20261026T130000Z', RACINE_NULLE, FEUILLES);
	altere.racine = h('autre racine');
	const casse = await surface('20261026T130000Z', { releve: altere, index: indexDesEmpreintes([altere]) });
	assert.match((await jouerLeVerificateur({ lire: casse.lire, tours: casse.tours, maintenant: 0 })).raison, /le chemin d audit .* ne rend pas la racine/);
	const sansObjet = await surface('20261026T140000Z', { releve: await releveAvec('20261026T140000Z', RACINE_NULLE, [FEUILLES[0]]) });
	assert.equal((await jouerLeVerificateur({ lire: sansObjet.lire, tours: sansObjet.tours, maintenant: 0 })).raison, 'le dernier releve ne porte aucun objet');
});

test('la signature du journal annoncee par le tour est relue, et une signature absente ou fausse casse le parcours', async () => {
	const nom = '20261026T150000Z.racine.jws';
	const absente = await surface('20261026T150000Z', { fichiers: [nom] });
	assert.equal((await jouerLeVerificateur({ lire: absente.lire, tours: absente.tours, maintenant: 0 })).raison, `la signature ${nom} ne couvre pas la racine`);
	const fausse = await surface('20261026T160000Z', { fichiers: ['20261026T160000Z.racine.jws'], extra: { '/empreintes/20261026T160000Z.racine.jws': 'eyJ.pas.une.signature' } });
	assert.equal((await jouerLeVerificateur({ lire: fausse.lire, tours: fausse.tours, maintenant: 0 })).ok, false);
});

test('un parcours reussi se garde 5 min sur le meme tour, puis se rejoue', async () => {
	const s = await surface('20261026T170000Z');
	assert.equal((await jouerLeVerificateur({ lire: s.lire, tours: s.tours, maintenant: 1000 })).ok, true);
	const lectures = s.lus.length;
	assert.equal((await jouerLeVerificateur({ lire: s.lire, tours: s.tours, maintenant: 1000 + CACHE_MS - 1 })).ok, true);
	assert.equal(s.lus.length, lectures, 'rien relu dans les 5 min');
	assert.equal((await jouerLeVerificateur({ lire: s.lire, tours: s.tours, maintenant: 1000 + CACHE_MS })).ok, true);
	assert.ok(s.lus.length > lectures, 'rejoue apres 5 min');
	const casse = await surface('20261026T180000Z', { index: {} });
	assert.equal((await jouerLeVerificateur({ lire: casse.lire, tours: casse.tours, maintenant: 0 })).ok, false);
	assert.equal((await jouerLeVerificateur({ lire: casse.lire, tours: casse.tours, maintenant: 1 })).ok, false, 'un echec ne se garde pas');
});

const deposerLigne = (db, i) => db.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').bind('2026-10-26', i, h(`doc${i}`), h(`recu${i}`)).run();

test('le depot retrouve le dernier recu par son identifiant et par son empreinte, et compte les lignes couvertes', async () => {
	const db = baseDeTest();
	assert.deepEqual(await jouerLeDepot({ db }), { ok: false, raison: 'aucun depot en base' });
	await deposerLigne(db, 1);
	await deposerLigne(db, 2);
	assert.deepEqual(await jouerLeDepot({ db, couverts: 2 }), { ok: true, recu: h('recu2'), jour: '2026-10-26', depots: 2, couverts: 2 });
	assert.equal((await jouerLeDepot({ db, couverts: 3 })).raison, 'le journal couvre 3 depots, la base en a 2');
});

test('une ligne que la page du recu ou l API ne retrouvent plus casse le depot', async () => {
	const db = baseDeTest();
	await deposerLigne(db, 1);
	const parId = db.prepare('SELECT sha256, jour, place, recu FROM depot WHERE recu = ?');
	const prepare = db.prepare.bind(db);
	db.prepare = (sql) => (sql === 'SELECT sha256, jour, place, recu FROM depot WHERE recu = ?' ? { bind: () => ({ first: async () => null }) } : prepare(sql));
	assert.match((await jouerLeDepot({ db })).raison, /la page du recu .* ne le retrouve pas/);
	db.prepare = (sql) => (sql === 'SELECT sha256, jour, place, recu FROM depot WHERE sha256 = ? ORDER BY jour, place' ? { bind: () => ({ all: async () => ({ results: [] }) }) } : prepare(sql));
	assert.match((await jouerLeDepot({ db })).raison, /l empreinte .* ne rend pas son recu/);
	assert.ok(parId);
});

test('les lignes couvertes se lisent dans le dernier releve plein', () => {
	assert.equal(depotsCouverts([{ id: 'a', base: null, depots: 3 }, { id: 'b', base: 'a', depots: 5 }]), 3);
	assert.equal(depotsCouverts([]), 0);
});

test('les parcours montent au rouge quand l un casse, a attention quand l un ne se joue pas, et le depot est sans objet sans base', async () => {
	const s = await surface('20261026T190000Z');
	const db = baseDeTest();
	await deposerLigne(db, 1);
	await deposerLigne(db, 2);
	const bon = await jouerLesParcours({ lire: s.lire, tours: s.tours, db, maintenant: 0 });
	assert.deepEqual([bon.niveau, bon.constats, bon.echecs, Object.keys(bon.parcours)], ['ok', [], [], ['verificateur', 'depot']]);
	const casse = await jouerLesParcours({ lire: s.lire, tours: s.tours, db: baseDeTest(), maintenant: 0 });
	assert.deepEqual([casse.niveau, casse.constats], ['rouge', ['parcours depot casse : aucun depot en base']]);
	const muet = await jouerLesParcours({
		lire: async () => {
			throw new Error('ASSETS');
		},
		tours: [{ id: '20261026T200000Z', racine: h('r'), base: null, fichiers: [] }],
		maintenant: 0
	});
	assert.deepEqual([muet.niveau, muet.echecs, muet.parcours.verificateur], ['attention', ['parcours verificateur : ASSETS'], { ok: null }]);
	assert.equal('depot' in muet.parcours, false);
});

test('la sonde publie les parcours et son alerte les suit', async () => {
	const s = await surface('20261026T210000Z');
	const commit = 'c'.repeat(40);
	const servis = { '/tours.json': JSON.stringify({ tours: s.tours.map((t) => ({ ...t, instant: '2026-10-26T21:00:00Z', ots: 'calendrier', bloc: null })) }), '/version.json': JSON.stringify({ commit, construit: '2026-10-26T21:01:00Z' }) };
	const env = { ASSETS: { fetch: async (url) => (new URL(url).pathname in servis ? new Response(servis[new URL(url).pathname]) : s.lire(new URL(url).pathname)) }, LIRE_TETE: async () => [{ sha: commit, date: '2026-10-26T21:00:00Z' }], DEPOTS: baseDeTest() };
	const corps = await (await sonde({ request: new Request('https://temoinpublic.fr/health'), env })).json();
	assert.equal(corps.parcours.verificateur.ok, true);
	assert.equal(corps.parcours.depot.ok, false);
	assert.equal(corps.alerte, 'rouge');
	assert.ok(corps.constats.includes('parcours depot casse : aucun depot en base'));
	await deposerLigne(env.DEPOTS, 1);
	await deposerLigne(env.DEPOTS, 2);
	const sain = await (await sonde({ request: new Request('https://temoinpublic.fr/health'), env })).json();
	assert.equal(sain.parcours.depot.ok, true);
	assert.deepEqual(sain.constats.filter((c) => c.startsWith('parcours')), []);
});

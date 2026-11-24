// Le juge des remplacements lit ce qui attend un verdict et pose ses verdicts (D-193).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { JUGEMENTS_MAX, noterJugements, versionsAJuger } from '../src/jugement.mjs';
import { actesDisparus } from '../src/service.mjs';
import { onRequestGet, onRequestPost } from '../functions/api/jugements.js';

const hex = (c) => c.repeat(64);
const recuDe = (lettre) => `f${hex(lettre).slice(1)}`;
const SITE = 'https://www.cravans.fr/docs';

/** Une base ou chaque acte est `[lettre, jour, url]` ; `sha` remplace l'empreinte tiree de la lettre. */
function base(actes) {
	const db = baseDeTest();
	actes.forEach(([lettre, jour, url, sha], place) => {
		db.sqlite.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').run(jour, place, sha ?? hex(lettre), recuDe(lettre));
		db.sqlite.prepare('INSERT INTO acte (recu, collectivite, nature, objet, url) VALUES (?, ?, ?, ?, ?)').run(recuDe(lettre), '17133', 'deliberation', 'Sans objet', url);
	});
	return db;
}

const ACTES = [
	['a', '2026-10-15', `${SITE}/voirie.pdf`],
	['b', '2026-10-22', `${SITE}/voirie.pdf`],
	['c', '2026-10-15', `${SITE}/pv-mai.pdf`],
	['d', '2026-10-23', `${SITE}/pv-mai.pdf`],
	['e', '2026-10-24', `${SITE}/pv-mai.pdf`],
	// Une seule version, une adresse retiree, les memes octets dates deux fois : rien a juger.
	['1', '2026-10-15', `${SITE}/seul.pdf`],
	['2', '2026-10-15', null],
	['3', '2026-10-16', null],
	['4', '2026-10-15', `${SITE}/memes.pdf`, hex('9')],
	['5', '2026-10-16', `${SITE}/memes.pdf`, hex('9')]
];

const lire = async (r) => JSON.parse(r.corps);

test('les versions nouvelles sans verdict attendent, les plus recentes d abord, avec la version d avant', async () => {
	const db = base(ACTES);
	const r = await versionsAJuger({ db });
	assert.equal(r.statut, 200);
	assert.deepEqual(
		(await lire(r)).attente.map((v) => ({ ...v })),
		[
			{ recu: recuDe('e'), apres: hex('e'), avant: hex('d'), jour: '2026-10-24', url: `${SITE}/pv-mai.pdf` },
			{ recu: recuDe('d'), apres: hex('d'), avant: hex('c'), jour: '2026-10-23', url: `${SITE}/pv-mai.pdf` },
			{ recu: recuDe('b'), apres: hex('b'), avant: hex('a'), jour: '2026-10-22', url: `${SITE}/voirie.pdf` }
		]
	);
	for (const max of ['1', 1]) assert.equal((await lire(await versionsAJuger({ db, max }))).attente.length, 1);
	for (const max of ['0', '-3', 'x', null, String(JUGEMENTS_MAX + 5)]) assert.equal((await lire(await versionsAJuger({ db, max }))).attente.length, 3, String(max));
});

test('un verdict pose sort la version de l attente, et seul change la fait paraitre remplacee', async () => {
	const db = base(ACTES);
	const maintenant = new Date('2026-10-25T05:40:00Z');
	const jugements = [
		{ recu: recuDe('b'), verdict: 'change' },
		{ recu: recuDe('d'), verdict: 'reecrit' },
		{ recu: recuDe('e'), verdict: 'indecis' },
		{ recu: hex('0'), verdict: 'change' }
	];
	const r = await noterJugements({ db, corps: { methode: 1, jugements }, maintenant });
	assert.equal(r.statut, 200);
	assert.deepEqual(await lire(r), { jour: '2026-10-25', ecrits: { change: 1, reecrit: 1, indecis: 1 } }, 'un recu qui ne date aucun acte ne s ecrit pas');
	assert.deepEqual((await lire(await versionsAJuger({ db }))).attente, []);
	assert.deepEqual(
		(await actesDisparus({ db })).remplaces.map((v) => v.apres),
		[hex('b')]
	);
	// Une methode plus recente rejuge : le verdict d'avant est remplace.
	await noterJugements({ db, corps: { methode: 2, jugements: [{ recu: recuDe('b'), verdict: 'reecrit' }] }, maintenant: new Date('2026-10-26T05:40:00Z') });
	assert.deepEqual({ ...db.sqlite.prepare('SELECT verdict, methode, jour FROM jugement WHERE recu = ?').get(recuDe('b')) }, { verdict: 'reecrit', methode: 2, jour: '2026-10-26' });
	assert.deepEqual((await actesDisparus({ db })).remplaces, []);
});

test('plus de verdicts qu une instruction n en lie s ecrivent tous', async () => {
	const lettres = Array.from({ length: 200 }, (_, i) => i.toString(16).padStart(64, '0'));
	const db = baseDeTest();
	lettres.forEach((recu, place) => {
		db.sqlite.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').run('2026-10-15', place, recu, recu);
		db.sqlite.prepare('INSERT INTO acte (recu, collectivite, nature, objet, url) VALUES (?, ?, ?, ?, ?)').run(recu, '17133', 'deliberation', 'Sans objet', null);
	});
	const r = await noterJugements({ db, corps: { methode: 1, jugements: lettres.map((recu) => ({ recu, verdict: 'reecrit' })) } });
	assert.equal((await lire(r)).ecrits.reecrit, 200);
});

test('un envoi illisible est refuse, et seule la flotte lit et ecrit', async () => {
	const db = base(ACTES);
	const un = { recu: recuDe('b'), verdict: 'change' };
	const illisibles = [
		null,
		'texte',
		{ methode: 1 },
		{ methode: 0, jugements: [un] },
		{ methode: 1.5, jugements: [un] },
		{ methode: 1, jugements: [null] },
		{ methode: 1, jugements: ['x'] },
		{ methode: 1, jugements: [{ recu: 'abc', verdict: 'change' }] },
		{ methode: 1, jugements: [{ recu: recuDe('b'), verdict: 'remplace' }] },
		{ methode: 1, jugements: [un, un] },
		{ methode: 1, jugements: Array.from({ length: JUGEMENTS_MAX + 1 }, () => un) }
	];
	for (const corps of illisibles) {
		const r = await noterJugements({ db, corps });
		assert.equal(r.statut, 400, JSON.stringify(corps)?.slice(0, 60));
		assert.equal((await lire(r)).erreur, 'jugements illisibles');
	}
	const env = { DEPOTS: db, JETON_FLOTTE: 'secret' };
	const adresse = 'https://temoinpublic.fr/api/jugements';
	const entetes = (jeton) => (jeton ? { authorization: jeton } : {});
	const lireRoute = (jeton, suite = '') => onRequestGet({ env, request: new Request(`${adresse}${suite}`, { headers: entetes(jeton) }) });
	const ecrire = (jeton, corps) => onRequestPost({ env, request: new Request(adresse, { method: 'POST', headers: entetes(jeton), body: corps }) });
	for (const jeton of [null, 'Bearer autre']) {
		assert.equal((await lireRoute(jeton)).status, 401);
		assert.equal((await ecrire(jeton, '{}')).status, 401);
	}
	assert.equal((await (await lireRoute('Bearer secret')).json()).attente.length, 3);
	const borne = await lireRoute('Bearer secret', '?max=2');
	assert.equal(borne.headers.get('cache-control'), 'no-store');
	assert.equal((await borne.json()).attente.length, 2);
	assert.equal((await ecrire('Bearer secret', 'pas du json')).status, 400);
	const ecrit = await ecrire('Bearer secret', JSON.stringify({ methode: 1, jugements: [un] }));
	assert.equal(ecrit.status, 200);
	assert.equal((await ecrit.json()).ecrits.change, 1);
	assert.equal((await (await lireRoute('Bearer secret')).json()).attente.length, 2);
});

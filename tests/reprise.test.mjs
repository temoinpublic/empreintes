// Un verrou passager de la base (Litestream a cote de workerd sur vps5) se rejoue ; le reste remonte tel quel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avecReprise, reprendre } from '../src/reprise.mjs';
import { onRequest } from '../functions/_middleware.js';
import worker from '../workers/flux.mjs';
import { baseDeTest } from './d1.mjs';

const SANS_ATTENTE = [0, 0, 0];
const VERROU = 'D1_ERROR: Failed to parse body as JSON, got: Error: internal error; reference = abc';

/** Une base dont les `n` premiers appels tombent sur un verrou. */
function baseQuiCede(n, base = baseDeTest()) {
	let restants = n;
	const cede = (f) => async (...a) => {
		if (restants-- > 0) throw new Error(VERROU);
		return f(...a);
	};
	return {
		appels: () => n - restants,
		prepare: (sql) => {
			const i = base.prepare(sql);
			const lie = { bind: (...a) => (i.bind(...a), lie), first: cede(i.first), all: cede(i.all), run: cede(i.run), executer: i.executer };
			return lie;
		},
		batch: cede((instructions) => base.batch(instructions)),
		exec: cede(async (sql) => base.sqlite.exec(sql))
	};
}

test('une lecture, une ecriture et un lot tombes sur un verrou se rejouent et rendent leur resultat', async () => {
	const db = avecReprise(baseQuiCede(2), SANS_ATTENTE);
	await db.prepare("INSERT INTO sel (jour, valeur) VALUES ('2026-11-03', 'x')").run();
	assert.equal((await db.prepare('SELECT valeur FROM sel WHERE jour = ?').bind('2026-11-03').first()).valeur, 'x');
	assert.equal((await db.prepare('SELECT * FROM sel').all()).results.length, 1);
	await db.batch([db.prepare("INSERT INTO sel (jour, valeur) VALUES ('2026-11-04', 'y')"), db.prepare("DELETE FROM sel WHERE jour = '2026-11-03'")]);
	await db.exec("DELETE FROM sel WHERE jour = '2026-11-04'");
	assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sel').first()).n, 0);
});

test('au-dela de quatre essais, le verrou remonte ; une autre erreur remonte au premier', async () => {
	const tenace = baseQuiCede(9);
	await assert.rejects(avecReprise(tenace, SANS_ATTENTE).prepare('SELECT 1').first(), /internal error/);
	assert.equal(tenace.appels(), 4);
	let essais = 0;
	const fausse = async () => {
		essais++;
		throw new Error('no such table: rien');
	};
	await assert.rejects(reprendre(fausse, SANS_ATTENTE), /no such table/);
	assert.equal(essais, 1);
	await assert.rejects(reprendre(() => Promise.reject('database is locked'), []), /locked/);
});

test('les attentes par defaut laissent passer un verrou bref', async () => {
	let n = 0;
	assert.equal(await reprendre(async () => (n++ < 1 ? Promise.reject(new Error('SQLITE_BUSY')) : 'ok')), 'ok');
});

test("l'enveloppe se pose une fois, et jamais sur une base absente", () => {
	const db = avecReprise(baseDeTest());
	assert.equal(avecReprise(db), db);
	assert.equal(avecReprise(undefined), undefined);
});

test('le middleware et le Worker des flux passent la base enveloppee', async () => {
	const env = { DEPOTS: baseDeTest(), ASSETS: { fetch: async () => new Response('ok') } };
	await onRequest({ request: new Request('https://temoinpublic.fr/api/bilan'), env, next: async () => new Response('suite') });
	const enveloppee = env.DEPOTS;
	await onRequest({ request: new Request('https://temoinpublic.fr/api/bilan'), env, next: async () => new Response('suite') });
	assert.equal(env.DEPOTS, enveloppee);
	assert.equal(avecReprise(enveloppee), enveloppee);
	await onRequest({ request: new Request('https://temoinpublic.fr/api/bilan'), env: { ASSETS: env.ASSETS }, next: async () => new Response('suite') });
	assert.equal(typeof worker.scheduled, 'function');
});

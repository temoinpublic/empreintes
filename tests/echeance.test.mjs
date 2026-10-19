import test from 'node:test';
import assert from 'node:assert/strict';
import { EcheanceDepassee, sousEcheance, tantQue } from '../src/echeance.mjs';

test('un travail fini avant son echeance rend son resultat et son signal reste leve', async () => {
	let vu;
	const r = await sousEcheance(1000, 'page', async (arret) => {
		vu = arret;
		return 42;
	});
	assert.equal(r, 42);
	assert.equal(vu.aborted, false);
});

test('un travail qui ne finit jamais rejette a son echeance et son signal s abat', async () => {
	let vu;
	const debut = Date.now();
	await assert.rejects(
		sousEcheance(50, 'page https://x.fr/', (arret) => {
			vu = arret;
			return new Promise(() => {});
		}),
		(e) => e instanceof EcheanceDepassee && e.name === 'EcheanceDepassee' && e.message === 'echeance page https://x.fr/ (50 ms)'
	);
	assert.ok(Date.now() - debut < 1000);
	assert.equal(vu.aborted, true);
	assert.ok(vu.reason instanceof EcheanceDepassee);
});

test('le rejet du travail passe tel quel, une exception synchrone aussi', async () => {
	await assert.rejects(sousEcheance(1000, 'x', async () => Promise.reject(new Error('reseau'))), /reseau/);
	await assert.rejects(
		sousEcheance(1000, 'x', () => {
			throw new TypeError('casse');
		}),
		TypeError
	);
});

test('passe l echeance, un effet garde par son arret n agit plus', async () => {
	const faits = [];
	let gardee;
	await assert.rejects(
		sousEcheance(30, 'commune 49007', async (arret) => {
			gardee = tantQue(arret, (x) => faits.push(x));
			gardee('avant');
			await new Promise((r) => setTimeout(r, 80));
			return gardee('apres');
		}),
		EcheanceDepassee
	);
	await new Promise((r) => setTimeout(r, 80));
	assert.deepEqual(faits, ['avant']);
	assert.throws(() => gardee('encore'), EcheanceDepassee);
});

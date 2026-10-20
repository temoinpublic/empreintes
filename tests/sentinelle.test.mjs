import test from 'node:test';
import assert from 'node:assert/strict';
import { Sentinelle, veiller } from '../src/sentinelle.mjs';

const horlogeDe = (etat) => () => etat.t;

test('un ouvrier qui change d etape avant le seuil n est pas immobile', () => {
	const etat = { t: 0 };
	const s = new Sentinelle(horlogeDe(etat));
	s.noter(1, 'lecture', 'https://a.fr/');
	etat.t = 4 * 60000;
	s.noter(1, 'service', '/api/depots https://a.fr/x.pdf');
	etat.t = 8 * 60000;
	assert.deepEqual(s.rapport(5 * 60000), []);
	assert.equal(s.immobiles(0).length, 1);
});

test('les immobiles sont nommes avec leur etape, leur adresse et leur duree, le plus ancien d abord', () => {
	const etat = { t: 0 };
	const s = new Sentinelle(horlogeDe(etat));
	s.noter(2, 'tour', 'mairie.fr');
	etat.t = 60000;
	s.noter(7, 'lecture', 'https://b.fr/actes');
	etat.t = 120000;
	s.noter(3, 'file des documents');
	etat.t = 150 * 60000;
	assert.deepEqual(s.rapport(5 * 60000), [
		'ouvrier 2 immobile depuis 150 min : tour mairie.fr',
		'ouvrier 7 immobile depuis 149 min : lecture https://b.fr/actes',
		'ouvrier 3 immobile depuis 148 min : file des documents'
	]);
});

test('un ouvrier libere disparait du rapport', () => {
	const etat = { t: 0 };
	const s = new Sentinelle(horlogeDe(etat));
	s.noter('r1', 'service', '/api/depots');
	s.liberer('r1');
	etat.t = 3600000;
	assert.deepEqual(s.rapport(1), []);
});

test('l horloge par defaut est celle du systeme', () => {
	const s = new Sentinelle();
	s.noter(1, 'lecture', 'https://c.fr/');
	const [e] = s.immobiles(0);
	assert.ok(e.ms >= 0 && e.ms < 1000);
});

test('la veille dit le rapport a chaque tour tant qu un ouvrier est immobile, se tait sinon, et s arrete', (t) => {
	t.mock.timers.enable({ apis: ['setInterval'] });
	const etat = { t: 0 };
	const s = new Sentinelle(horlogeDe(etat));
	const dits = [];
	const arreter = veiller(s, { toutesLesMs: 1000, seuilMs: 500, dire: (l) => dits.push(l) });
	s.noter(1, 'lecture', 'https://d.fr/');
	t.mock.timers.tick(1000);
	assert.deepEqual(dits, []);
	etat.t = 600;
	t.mock.timers.tick(1000);
	assert.deepEqual(dits, [['ouvrier 1 immobile depuis 0 min : lecture https://d.fr/']]);
	arreter();
	etat.t = 5000;
	t.mock.timers.tick(3000);
	assert.equal(dits.length, 1);
});

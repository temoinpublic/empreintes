import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHIER_PUBLIE, LIMITE_FICHIER_PAGES, PREUVE_PUBLIEE, SEUIL_RELEVE_ATTENTION, SEUIL_RELEVE_ROUGE, constatDeTaille, indexDesEmpreintes, instantDe, resumeDe, verdict } from '../src/journal.mjs';

const r1 = { id: '20261011T041935Z', precedente: '0', arbre: 'a', racine: 'r1', feuilles: [{ cle: 'src/x', sha256: 'aa11', jour: '2026-10-10' }, { cle: 'manifeste:2026-10-11', sha256: 'bb22', jour: '2026-10-11' }] };
const r2 = { id: '20261012T101314Z', precedente: 'r1', arbre: 'b', racine: 'r2', feuilles: [{ cle: 'src/x', sha256: 'aa11', jour: '2026-10-10' }, { cle: 'src/y', sha256: 'aa11', jour: '2026-10-12' }, { cle: 'liste:z', sha256: 'cc33', jour: '2026-10-12' }] };

test("l'instant d'un tour se lit sur son identifiant ; un identifiant illisible leve", () => {
	assert.equal(instantDe('20261012T101314Z'), '2026-10-12T10:13:14Z');
	assert.throws(() => instantDe('hier'), /illisible/);
});

test('seuls les fichiers du journal se publient, jamais le cache ni une sauvegarde', () => {
	for (const f of ['20261012T101314Z.json', '20261012T101314Z.delta.json', '20261012T101314Z.racine', '20261012T101314Z.racine.ots', '20261012T101314Z.racine.tsr', '20261012T101314Z.racine.jws', 'ancrages.json']) assert.ok(FICHIER_PUBLIE.test(f), f);
	assert.ok(PREUVE_PUBLIEE.test(`${'a'.repeat(64)}.json`));
	for (const f of [`${'a'.repeat(64)}.json.tmp`, 'par-url.json', `${'A'.repeat(64)}.json`]) assert.ok(!PREUVE_PUBLIEE.test(f), f);
	for (const f of ['20261012T101314Z.racine.ots.bak', 'cache', '../etat.json', 'x.json']) assert.ok(!FICHIER_PUBLIE.test(f), f);
});

test("l'index garde chaque cle d'une empreinte, son jour, son premier et son dernier tour, sans manifestes ni listes", () => {
	const index = indexDesEmpreintes([r1, r2]);
	assert.deepEqual(Object.keys(index), ['aa']);
	assert.deepEqual(index.aa.aa11, [
		{ cle: 'src/x', jour: '2026-10-10', premier: r1.id, dernier: r2.id },
		{ cle: 'src/y', jour: '2026-10-12', premier: r2.id, dernier: r2.id }
	]);
});

test('le resume compte les objets et nomme les fichiers du tour', () => {
	const t = resumeDe(r2, { ots: 'bitcoin', bloc: 971045, horodatage: { etat: 'fait' } }, ['20261012T101314Z.racine.ots', '20261012T101314Z.json', 'ancrages.json']);
	assert.equal(t.objets, 2);
	assert.equal(t.feuilles, 3);
	assert.equal(t.bloc, 971045);
	assert.equal(t.horodatage, 'fait');
	assert.deepEqual(t.fichiers, ['20261012T101314Z.json', '20261012T101314Z.racine.ots']);
	assert.equal(resumeDe(r1, undefined, []).ots, null);
	assert.equal(resumeDe(r1, undefined, []).octets, null);
	assert.equal(resumeDe(r1, undefined, [], 1905170).octets, 1905170);
	assert.equal(resumeDe(r1, undefined, []).base, null);
	assert.equal(resumeDe(r2, undefined, ['20261012T101314Z.delta.json'], 50000, r1.id).base, r1.id);
});

const tour = (instant, ots = 'bitcoin') => ({ id: instant.replace(/[-:]/g, ''), instant, ots });
const maintenant = new Date('2026-10-12T12:00:00Z');

test('la sonde est ok sur un tour recent ancre', () => {
	assert.deepEqual(verdict([tour('2026-10-12T10:00:00Z')], maintenant), { alerte: 'ok', constats: [] });
});

test('la sonde passe attention au-dela de 12 h sans tour, rouge au-dela de 36 h, rouge sans aucun tour', () => {
	assert.equal(verdict([tour('2026-10-11T22:00:00Z')], maintenant).alerte, 'attention');
	assert.equal(verdict([tour('2026-10-10T20:00:00Z')], maintenant).alerte, 'rouge');
	assert.equal(verdict([], maintenant).alerte, 'rouge');
});

test("une preuve restee aux calendriers plus de 48 h est un constat ; une recente ne l'est pas", () => {
	const v = verdict([tour('2026-10-09T10:00:00Z', 'calendrier'), tour('2026-10-12T10:00:00Z', 'calendrier')], maintenant);
	assert.equal(v.alerte, 'attention');
	assert.equal(v.constats.length, 1);
	assert.equal(verdict([tour('2026-10-09T10:00:00Z', null), tour('2026-10-10T10:00:00Z')], maintenant).alerte, 'rouge');
});

test('une copie suspendue dit attention et la nomme, sans passer rouge sur un journal vieux', () => {
	const copie = { etat: 'suspendue', depuis: '2026-10-12' };
	const v = verdict([tour('2026-10-01T10:00:00Z', 'calendrier')], maintenant, copie);
	assert.equal(v.alerte, 'attention');
	assert.deepEqual(v.constats, ['copie du journal suspendue depuis le 2026-10-12 : dernier tour publie 20261001T100000Z']);
	assert.equal(verdict([], maintenant, copie).alerte, 'rouge');
	assert.equal(verdict([tour('2026-10-12T10:00:00Z')], maintenant, { etat: 'active' }).alerte, 'ok');
});

test("l'horodatage eIDAS du jour manque au-dela de 36 h : attention ; un recent ou aucun ne dit rien", () => {
	const horodate = (instant) => ({ ...tour(instant), fichiers: [`${instant.replace(/[-:]/g, '')}.racine.tsr`] });
	const v = verdict([horodate('2026-10-10T20:00:00Z'), tour('2026-10-12T10:00:00Z')], maintenant);
	assert.deepEqual(v, { alerte: 'attention', constats: ['dernier horodatage qualifie 20261010T200000Z, il y a 40 h'] });
	assert.deepEqual(verdict([horodate('2026-10-11T04:00:00Z'), tour('2026-10-12T10:00:00Z')], maintenant), { alerte: 'ok', constats: [] });
});

test('un releve qui approche la limite d un fichier Pages est un constat : attention a la moitie, rouge aux neuf dixiemes, rien en dessous', () => {
	const recent = { ...tour('2026-10-12T10:00:00Z'), octets: SEUIL_RELEVE_ATTENTION };
	assert.equal(constatDeTaille(recent), null);
	assert.equal(constatDeTaille(tour('2026-10-12T10:00:00Z')), null, 'sans taille connue, rien');
	assert.deepEqual(verdict([recent], maintenant), { alerte: 'ok', constats: [] });
	const gros = { ...recent, octets: SEUIL_RELEVE_ATTENTION + 1 };
	assert.deepEqual(verdict([gros], maintenant), { alerte: 'attention', constats: ['releve 20261012T100000Z : 12,5 Mio, la limite d\'un fichier Pages est 25,0 Mio'] });
	const critique = { ...recent, octets: SEUIL_RELEVE_ROUGE + 1 };
	assert.equal(verdict([critique], maintenant).alerte, 'rouge');
	assert.equal(verdict([critique, recent], maintenant).alerte, 'ok', 'seul le dernier releve compte : les anciens ne grossissent plus');
	const delta = { ...tour('2026-10-12T11:00:00Z'), octets: 50000, base: '20261012T100000Z' };
	assert.equal(verdict([critique, delta], maintenant).alerte, 'rouge', 'un tour en delta est petit par construction : le mur se lit sur le dernier releve plein');
	assert.equal(verdict([recent, delta], maintenant).alerte, 'ok');
	assert.equal(LIMITE_FICHIER_PAGES, 26214400);
});

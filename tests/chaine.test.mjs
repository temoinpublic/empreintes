import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE_NULLE, arbre, cheminDAudit, chainer, empreinteDeFeuille, estUnDelta, lecteurDeReleves, placeDuFichier, racineDepuisChemin, reconstruireReleve, verifierChaine, verifierChaineLegere, verifierLiens, verifierReleve } from '../src/chaine.mjs';

const DONNEES = path.resolve(import.meta.dirname, '..', 'donnees', 'empreintes');
// Chaque tour publie, plein ou en delta : un releve plein suit le dernier delta de la veille, pas le plein d'avant.
const ids = [...new Set(fs.readdirSync(DONNEES).flatMap((f) => /^(\d{8}T\d{6}Z)(?:\.delta)?\.json$/.exec(f)?.[1] ?? []))].sort();
const fichier = (nom) => JSON.parse(fs.readFileSync(path.join(DONNEES, nom), 'utf8'));
const memoire = new Map();
const lirePublie = (id) => {
	if (fs.existsSync(path.join(DONNEES, `${id}.json`))) return fichier(`${id}.json`);
	const delta = fichier(`${id}.delta.json`);
	return reconstruireReleve(lire(delta.base), delta);
};
// Une copie a chaque lecture : des tests modifient le releve qu'on leur rend.
const lire = (id) => {
	if (!memoire.has(id)) memoire.set(id, JSON.stringify(lirePublie(id)));
	return JSON.parse(memoire.get(id));
};

// L'arbre tel que l'entrepot l'ecrit, recopie ici avec node:crypto pour tenir la seconde ecriture.
function arbreDeReference(hexes) {
	if (hexes.length === 0) return RACINE_NULLE;
	let n = hexes.map((h) => Buffer.from(h, 'hex'));
	while (n.length > 1) {
		const s = [];
		for (let i = 0; i < n.length; i += 2) s.push(createHash('sha256').update(n[i]).update(n[i + 1] ?? n[i]).digest());
		n = s;
	}
	return n[0].toString('hex');
}
const h = (i) => createHash('sha256').update(String(i)).digest('hex');

test('le journal publie se verifie de bout en bout, chaque racine egale a son fichier .racine', async () => {
	assert.ok(ids.length >= 2, 'au moins deux tours dans donnees/');
	const v = await verifierChaine(ids, lire);
	assert.deepEqual(v.raisons, []);
	assert.equal(v.tours, ids.length);
	for (const id of ids) assert.equal(fs.readFileSync(path.join(DONNEES, `${id}.racine`), 'utf8').trim(), lire(id).racine);
	assert.equal(v.derniere, lire(ids.at(-1)).racine);
});

test("l'arbre suit celui de l'entrepot, niveaux impairs compris", async () => {
	for (const n of [0, 1, 2, 3, 5, 8, 13]) {
		const hexes = Array.from({ length: n }, (_, i) => h(i));
		assert.equal(await arbre(hexes), arbreDeReference(hexes), `${n} feuilles`);
	}
});

test("chaque chemin d'audit rend l'arbre", async () => {
	const hexes = Array.from({ length: 7 }, (_, i) => h(i));
	const a = await arbre(hexes);
	for (let i = 0; i < hexes.length; i++) assert.equal(await racineDepuisChemin(hexes[i], await cheminDAudit(hexes, i)), a);
	await assert.rejects(cheminDAudit(hexes, 7), /hors de l'arbre/);
});

test("l'empreinte d'une feuille lie cle, contenu et jour, jour absent compris", async () => {
	const f = { cle: 'a/b', sha256: h(1), jour: null };
	assert.equal(await empreinteDeFeuille(f), createHash('sha256').update(`a/b\n${h(1)}\n\n`).digest('hex'));
});

test('un octet change dans un releve casse son arbre ; une precedente changee casse la chaine', async () => {
	const releve = lire(ids[1]);
	const altere = { ...releve, feuilles: releve.feuilles.map((f, i) => (i === 3 ? { ...f, jour: '1999-01-01' } : f)) };
	assert.match((await verifierReleve(altere)).join(), /arbre recalcule/);
	const coupe = await verifierChaine([ids[0], ids[2]], lire);
	assert.equal(coupe.ok, false);
	assert.match(coupe.raisons.join(), /precedente/);
	const renomme = await verifierChaine([ids[0]], () => ({ ...lire(ids[0]), id: 'autre' }));
	assert.match(renomme.raisons.join(), /porte l'identifiant/);
});

test('la racine chainee lie identifiant, precedente et arbre', async () => {
	assert.equal(await chainer({ id: 'x', precedente: RACINE_NULLE, arbre: h(2) }), createHash('sha256').update(`entrepot\nx\n${RACINE_NULLE}\n${h(2)}\n`).digest('hex'));
});

test("un fichier du journal retrouve sa place et son chemin ; un inconnu n'en a pas", async () => {
	const releve = lire(ids.at(-1));
	const feuille = releve.feuilles.find((f) => !f.cle.includes(':'));
	const place = await placeDuFichier(releve, feuille.sha256);
	assert.equal(place.ok, true);
	assert.equal(place.feuille.cle, feuille.cle);
	assert.equal(await placeDuFichier(releve, h('absent')), null);
});

const resume = (id) => {
	const r = lire(id);
	return { id: r.id, precedente: r.precedente, arbre: r.arbre, racine: r.racine };
};

test('la chaine legere tient sur les resumes et recalcule le seul dernier releve', async () => {
	const tours = ids.map(resume);
	const lus = [];
	const v = await verifierChaineLegere(tours, (id) => (lus.push(id), lire(id)));
	assert.deepEqual(v.raisons, []);
	assert.equal(v.ok, true);
	assert.equal(v.tours, ids.length);
	assert.equal(v.derniere, lire(ids.at(-1)).racine);
	assert.deepEqual(lus, [ids.at(-1)]);
	assert.deepEqual(v.recalcule, { id: ids.at(-1), feuilles: lire(ids.at(-1)).feuilles.length });
	assert.deepEqual(await verifierChaineLegere([], lire), { ok: true, tours: 0, derniere: RACINE_NULLE, raisons: [], recalcule: null });
});

test('la chaine legere voit un lien coupe, une racine fausse et un releve qui ne suit pas son resume', async () => {
	const tours = ids.map(resume);
	const coupe = await verifierLiens([tours[0], tours[2]]);
	assert.equal(coupe.ok, false);
	assert.match(coupe.raisons.join(), /precedente/);
	const fausse = await verifierLiens([{ ...tours[0], arbre: h(9) }]);
	assert.match(fausse.raisons.join(), /racine chainee/);
	const dernier = lire(ids.at(-1));
	const autre = await verifierChaineLegere(tours, () => ({ ...dernier, feuilles: dernier.feuilles.slice(1) }));
	assert.equal(autre.ok, false);
	assert.match(autre.raisons.join(), /arbre recalcule/);
	const resumeFaux = await verifierChaineLegere([...tours.slice(0, -1), { ...tours.at(-1), id: 'autre' }], () => dernier);
	assert.match(resumeFaux.raisons.join(), /ne porte pas le id/);
});

// Le delta tel que l'entrepot l'ecrira (D-158) : ce qui sort, ce qui entre avec sa place dans la liste neuve.
function deltaEntre(base, releve) {
	const meme = (a, b) => a && a.sha256 === b.sha256 && (a.jour ?? null) === (b.jour ?? null);
	const avant = new Map(base.feuilles.map((f, i) => [f.cle, { ...f, index: i }]));
	const apres = new Map(releve.feuilles.map((f, i) => [f.cle, { ...f, index: i }]));
	const gardees = [];
	for (const [cle, f] of avant) if (apres.has(cle) && meme(f, apres.get(cle))) gardees.push(cle);
	// Une feuille gardee qui n'a plus le meme rang relatif se reprend : son index est celui de la liste neuve.
	const rangs = gardees.map((cle) => apres.get(cle).index);
	const stables = new Set();
	let dernier = -1;
	for (const [i, cle] of gardees.entries()) {
		if (rangs[i] > dernier) {
			stables.add(cle);
			dernier = rangs[i];
		}
	}
	const { feuilles, ...tour } = releve;
	return {
		...tour,
		base: base.id,
		ajoutees: feuilles.map((f, index) => ({ index, ...f })).filter((f) => !stables.has(f.cle)),
		retirees: [...avant.keys()].filter((cle) => !apres.has(cle))
	};
}

test('un tour en delta se reconstruit depuis sa base, meme arbre et meme racine, sur le journal reel', async () => {
	const [base, suivant] = ids.slice(-2).map(lire);
	const delta = deltaEntre(base, suivant);
	assert.ok(estUnDelta(delta) && !estUnDelta(suivant) && !estUnDelta(null));
	assert.ok(delta.ajoutees.length < suivant.feuilles.length / 2, 'le delta est plus petit que le releve');
	const reconstruit = reconstruireReleve(base, delta);
	assert.deepEqual(reconstruit, suivant);
	assert.deepEqual(await verifierReleve(reconstruit), []);
});

test('le delta porte les ajouts, les changements, les retraits et les deplacements, chacun a sa place', async () => {
	const feuille = (cle, i, jour = '2026-10-20') => ({ cle, sha256: h(i), jour });
	const base = { id: '20261020T040000Z', precedente: RACINE_NULLE, feuilles: [feuille('a', 1), feuille('b', 2), feuille('c', 3), feuille('manifeste:2026-10-20', 4), feuille('depots:10', 5)] };
	const feuillesNeuves = [feuille('a', 1), feuille('b', 22), feuille('bb', 23, null), feuille('d', 6), feuille('manifeste:2026-10-20', 4), feuille('liste:x', 7), feuille('depots:12', 8)];
	const empreintes = await Promise.all(feuillesNeuves.map(empreinteDeFeuille));
	const a = await arbre(empreintes);
	const suivant = { id: '20261020T100000Z', precedente: 'r', arbre: a, racine: await chainer({ id: '20261020T100000Z', precedente: 'r', arbre: a }), feuilles: feuillesNeuves };
	const delta = deltaEntre(base, suivant);
	assert.deepEqual(delta.retirees, ['c', 'depots:10']);
	assert.deepEqual(delta.ajoutees.map((f) => [f.index, f.cle]), [[1, 'b'], [2, 'bb'], [3, 'd'], [5, 'liste:x'], [6, 'depots:12']]);
	assert.equal(delta.ajoutees[1].jour, null);
	const reconstruit = reconstruireReleve(base, delta);
	assert.deepEqual(reconstruit, suivant);
	assert.deepEqual(await verifierReleve(reconstruit), []);
	// Un delta sans ajout ni retrait rend la base telle quelle sous l'identite du tour.
	assert.deepEqual(reconstruireReleve(base, { id: 'x', base: base.id }).feuilles, base.feuilles);
});

test("un delta refuse une base qui n'est pas la sienne, une place hors liste, ou un releve plein", () => {
	const base = { id: '20261020T040000Z', feuilles: [{ cle: 'a', sha256: 'aa' }] };
	assert.throws(() => reconstruireReleve({ id: 'autre', feuilles: [] }, { id: 't', base: base.id, ajoutees: [], retirees: [] }), /n'est pas le releve fourni/);
	assert.throws(() => reconstruireReleve({ id: base.id, base: 'y' }, { id: 't', base: base.id }), /n'est pas le releve fourni/);
	assert.throws(() => reconstruireReleve(base, { id: 't', base: base.id, ajoutees: [{ index: 3, cle: 'z', sha256: 'zz' }] }), /n'a pas de place \(3\)/);
	assert.throws(() => reconstruireReleve(base, { id: 't', base: base.id, ajoutees: [{ cle: 'z', sha256: 'zz' }] }), /n'a pas de place/);
	assert.throws(() => reconstruireReleve(base, base), /pas un tour en delta/);
});

test('le lecteur rend chaque tour plein, lit une base une seule fois, et nomme ce qui manque', async () => {
	const [base, suivant] = ids.slice(-2).map(lire);
	const delta = deltaEntre(base, suivant);
	const publies = { [`${base.id}.json`]: base, [`${suivant.id}.delta.json`]: delta, 'boucle.delta.json': { id: 'boucle', base: 'boucle' }, 'tard.delta.json': { id: 'tard', base: 'zzz' } };
	const lus = [];
	const lireFichier = async (nom) => {
		lus.push(nom);
		return publies[nom] ?? null;
	};
	const sansResume = lecteurDeReleves(lireFichier);
	assert.deepEqual(await sansResume(suivant.id), suivant);
	assert.deepEqual(await sansResume(suivant.id), suivant);
	assert.deepEqual(await sansResume(base.id), base);
	assert.deepEqual(lus, [`${suivant.id}.json`, `${suivant.id}.delta.json`, `${base.id}.json`, `${suivant.id}.json`, `${suivant.id}.delta.json`, `${base.id}.json`]);
	lus.length = 0;
	const avecResume = lecteurDeReleves(lireFichier, [{ id: base.id, base: null }, { id: suivant.id, base: base.id }]);
	assert.deepEqual(await avecResume(suivant.id), suivant);
	assert.deepEqual(lus, [`${suivant.id}.delta.json`, `${base.id}.json`]);
	await assert.rejects(sansResume('absent'), /absent : aucun releve publie/);
	await assert.rejects(sansResume('boucle'), /ne precede pas le tour/);
	await assert.rejects(sansResume('tard'), /ne precede pas le tour/);
	const sansFin = lecteurDeReleves(async (nom) => (nom.endsWith('.delta.json') ? { id: nom.slice(0, -11), base: `${nom.slice(0, -11)}0`.slice(1) } : null));
	await assert.rejects(sansFin('99999999'), /aucun releve publie|ne finit pas|ne precede pas/);
});

test('un lecteur borne a une base ne garde que la plus recente, et relit une base laissee partir', async () => {
	const base = { id: '20261010T000000Z', precedente: '0', arbre: 'a', racine: 'r', feuilles: [{ cle: 'x', sha256: 'aa', jour: '2026-10-10' }] };
	const autre = { ...base, id: '20261011T000000Z' };
	const publies = {
		[`${base.id}.json`]: base,
		[`${autre.id}.json`]: autre,
		'20261010T010000Z.delta.json': { id: '20261010T010000Z', base: base.id },
		'20261011T010000Z.delta.json': { id: '20261011T010000Z', base: autre.id },
		'20261011T020000Z.delta.json': { id: '20261011T020000Z', base: autre.id }
	};
	const lus = [];
	const lire = lecteurDeReleves(
		async (nom) => {
			lus.push(nom);
			return publies[nom] ?? null;
		},
		null,
		{ bases: 1 }
	);
	for (const id of ['20261010T010000Z', '20261011T010000Z', '20261011T020000Z', '20261010T010000Z']) assert.equal((await lire(id)).feuilles.length, 1);
	assert.deepEqual(
		lus.filter((n) => n === `${base.id}.json` || n === `${autre.id}.json`),
		[`${base.id}.json`, `${autre.id}.json`, `${base.id}.json`],
		'la base du 10 est relue une fois partie, celle du 11 lue une seule fois'
	);
});

test("la chaine entiere se verifie quand le dernier tour n'est publie qu'en delta", async () => {
	const [base, suivant] = ids.slice(-2).map(lire);
	const delta = deltaEntre(base, suivant);
	const lireFichier = async (nom) => (nom === `${suivant.id}.delta.json` ? delta : nom === `${suivant.id}.json` ? null : /\.json$/.test(nom) && !nom.includes('.delta.') ? lire(nom.slice(0, -5)) : null);
	const v = await verifierChaine(ids, lecteurDeReleves(lireFichier));
	assert.deepEqual(v.raisons, []);
	assert.equal(v.tours, ids.length);
});

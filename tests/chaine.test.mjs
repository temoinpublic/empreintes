import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE_NULLE, arbre, cheminDAudit, chainer, empreinteDeFeuille, placeDuFichier, racineDepuisChemin, verifierChaine, verifierChaineLegere, verifierLiens, verifierReleve } from '../src/chaine.mjs';

const DONNEES = path.resolve(import.meta.dirname, '..', 'donnees', 'empreintes');
const ids = fs.readdirSync(DONNEES).filter((f) => /^\d{8}T\d{6}Z\.json$/.test(f)).map((f) => f.slice(0, -5)).sort();
const lire = (id) => JSON.parse(fs.readFileSync(path.join(DONNEES, `${id}.json`), 'utf8'));

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

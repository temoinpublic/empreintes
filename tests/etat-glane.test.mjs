import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { ecrireLEtat, lignesDeLEtat, lireLEtat } from '../src/etat-glane.mjs';

const ETAT = {
	robots: { 'mairie-amance.fr': { lu: '2026-11-22T01:52:30.045Z', regles: [{ permis: false, motif: '/api/' }] } },
	pdfs: {
		'https://www.ville-echillais.fr/a.pdf': { jour: '2026-11-20', id: 'r1', code: '17146', nature: 'deliberation', libelle: 'Budget : vote, « primitif »\n2026' },
		'https://www.ville-echillais.fr/b,c}.pdf': { jour: '2026-11-21', statut: 422, essais: 1, erreur: 'lecture impossible' },
		'https://x.fr/vide.pdf': {}
	},
	budgets: {},
	version: 2
};
const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'etat-glane-'));
const lignesDuFichier = (f) => readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });

test('l etat s ecrit une entree par ligne et reste un JSON que lit un JSON.parse du fichier entier', async () => {
	const chemin = path.join(dossier(), 'glane.json');
	ecrireLEtat(fs, chemin, ETAT);
	const texte = fs.readFileSync(chemin, 'utf8');
	assert.deepEqual(JSON.parse(texte), ETAT, 'le lecteur de l entrepot et les mesures lisent toujours le fichier');
	assert.equal(texte.split('\n').length - 1, [...lignesDeLEtat(ETAT)].length);
	assert.ok(texte.split('\n').some((l) => l.startsWith('"https://www.ville-echillais.fr/a.pdf":')), 'un PDF tient sur sa ligne');
	assert.deepEqual(await lireLEtat(lignesDuFichier(chemin)), ETAT);
	assert.equal(fs.readdirSync(path.dirname(chemin)).length, 1, 'aucun voisin laisse');
});

test('aucune ecriture ne porte l etat entier : des lots bornes, jamais une chaine de sa taille', () => {
	const pdfs = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`https://commune-${i}.fr/deliberation-${i}.pdf`, { jour: '2026-11-22', id: `r${i}`, code: '17146', nature: 'deliberation', libelle: `Acte ${i}` }]));
	const etat = { robots: {}, pdfs, budgets: {} };
	const ecrits = [];
	const espion = { ...fs, writeSync: (fd, t) => ecrits.push(t.length) && fs.writeSync(fd, t) };
	const chemin = path.join(dossier(), 'glane.json');
	ecrireLEtat(espion, chemin, etat, { lot: 4096 });
	const total = JSON.stringify(etat).length;
	assert.ok(ecrits.length > 50, `${ecrits.length} ecritures`);
	assert.ok(Math.max(...ecrits) < 4096 + 200, `plus grand lot ${Math.max(...ecrits)} octets sur ${total}`);
	assert.deepEqual(JSON.parse(fs.readFileSync(chemin, 'utf8')), etat);
});

test('une ecriture interrompue laisse l ancien etat entier', () => {
	const chemin = path.join(dossier(), 'glane.json');
	ecrireLEtat(fs, chemin, { pdfs: { a: { id: 1 } } });
	const avant = fs.readFileSync(chemin, 'utf8');
	const coupe = { ...fs, renameSync: () => { throw new Error('interrompu'); } };
	assert.throws(() => ecrireLEtat(coupe, chemin, { pdfs: { a: { id: 1 }, b: { id: 2 } } }), /interrompu/);
	assert.equal(fs.readFileSync(chemin, 'utf8'), avant);
	const casse = { ...fs, writeSync: () => { throw new Error('disque plein'); } };
	assert.throws(() => ecrireLEtat(casse, chemin, { pdfs: { c: {} } }), /disque plein/);
	assert.equal(fs.readFileSync(chemin, 'utf8'), avant);
});

test('un etat ecrit d un bloc par la version d avant se relit tel quel', async () => {
	assert.deepEqual(await lireLEtat([JSON.stringify(ETAT)]), ETAT);
	assert.deepEqual(await lireLEtat([]), {});
	assert.deepEqual(await lireLEtat(['{', '"pdfs":{}', '}']), { pdfs: {} });
	assert.deepEqual(await lireLEtat(['{', '"pdfs":{', '"u":{"id":1}', '},', '', '"n":3', '}']), { pdfs: { u: { id: 1 } }, n: 3 });
});

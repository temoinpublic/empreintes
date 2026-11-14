// Les Functions et le Worker tournent sans `nodejs_compat` : aucun module qu'ils
// chargent, de proche en proche, n'importe un module `node:`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { constants } from 'node:zlib';

const RACINE = path.resolve(import.meta.dirname, '..');
const IMPORT = /^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function entrees(dossier) {
	return fs.readdirSync(path.join(RACINE, dossier), { recursive: true }).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(RACINE, dossier, f));
}

function importsNode(depart) {
	const vus = new Set();
	const fautes = [];
	const pile = [depart];
	while (pile.length) {
		const fichier = pile.pop();
		if (vus.has(fichier)) continue;
		vus.add(fichier);
		for (const m of fs.readFileSync(fichier, 'utf8').matchAll(IMPORT)) {
			const cible = m[1] ?? m[2];
			if (cible.startsWith('node:')) fautes.push(`${path.relative(RACINE, fichier)} ${cible}`);
			else if (cible.startsWith('.')) pile.push(path.resolve(path.dirname(fichier), cible));
		}
	}
	return fautes;
}

test('aucune Function ni le Worker ne charge un module node:', () => {
	const fichiers = [...entrees('functions'), ...entrees('workers')];
	assert.ok(fichiers.length >= 20, 'les entrees sont lues');
	assert.deepEqual(fichiers.flatMap(importsNode), []);
});

test('le detecteur voit un import node: de proche en proche', () => {
	assert.ok(importsNode(path.join(RACINE, 'scripts', 'glaner-actes.mjs')).length > 0);
});

test('la constante de vidage ecrite en clair est celle de zlib', async () => {
	const source = fs.readFileSync(path.join(RACINE, 'src', 'glane.mjs'), 'utf8');
	assert.match(source, new RegExp(`const Z_SYNC_FLUSH = ${constants.Z_SYNC_FLUSH};`));
});

test('toute Function qui repond a GET repond a HEAD par le meme code', async () => {
	const lisibles = entrees('functions').filter((f) => /export async function onRequestGet\b/.test(fs.readFileSync(f, 'utf8')));
	assert.ok(lisibles.length >= 14, 'les Functions de lecture sont lues');
	for (const fichier of lisibles) {
		const module = await import(fichier);
		assert.equal(module.onRequestHead, module.onRequestGet, path.relative(RACINE, fichier));
	}
});

// La surface construite, servie par un serveur local : le script de verification et la sonde la lisent comme en ligne.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { verifierEmpreinte } from '../scripts/verifier.mjs';
import { onRequestGet } from '../functions/health.js';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');

function servir() {
	const serveur = http.createServer((req, res) => {
		const f = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
		if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
		res.writeHead(200).end(fs.readFileSync(f));
	});
	return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

test('la construction a produit la surface', () => {
	for (const f of ['index.html', 'verifier.html', 'deposer.html', 'deposer.js', 'journal.html', 'fichier.js', '404.html', 'depot.mjs', 'documentation.html', 'tours.json', 'version.json', 'chaine.mjs', 'verifier.js', 'textes.js', '_headers', '_routes.json', 'robots.txt', 'llms.txt', 'sitemap.xml']) assert.ok(fs.existsSync(path.join(DIST, f)), f);
	for (const f of ['index.html', 'datieren.html', 'pruefen.html', 'register.html', 'dokumentation.html', 'impressum.html', 'beweiswert.html', '404.html', 'robots.txt', 'llms.txt', 'sitemap.xml']) assert.ok(fs.existsSync(path.join(DIST, 'de', f)), `de/${f}`);
	assert.ok(!fs.existsSync(path.join(DIST, 'de', 'acte.html')), 'pas d acte en allemand');
	assert.match(fs.readFileSync(path.join(DIST, 'de', 'index.html'), 'utf8'), /<html lang="de">/);
	assert.match(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'), /<html lang="fr">/);
	assert.match(fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/temoinpublic.fr\/sitemap.xml/);
	assert.match(fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8'), /^# Témoin public\n/);
});

test('toute page porte les six protections du navigateur', () => {
	const bloc = fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split(/\n(?=\S)/)[0];
	for (const entete of ['Strict-Transport-Security', 'Permissions-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy']) assert.match(bloc, new RegExp(`^  ${entete}: `, 'm'), entete);
	assert.match(bloc, /frame-ancestors 'none'/);
});

test('un fichier du journal se dit servi tel quel ; une empreinte inconnue ne trouve rien', async () => {
	const serveur = await servir();
	const site = `http://127.0.0.1:${serveur.address().port}`;
	try {
		const { tours } = JSON.parse(fs.readFileSync(path.join(DIST, 'tours.json'), 'utf8'));
		const releve = JSON.parse(fs.readFileSync(path.join(DIST, 'empreintes', `${tours[0].id}.json`), 'utf8'));
		const feuille = releve.feuilles.find((f) => !f.cle.includes(':'));
		const constats = await verifierEmpreinte(site, feuille.sha256);
		assert.ok(constats.length >= 1);
		assert.ok(constats.every((c) => c.ok));
		assert.equal(constats.find((c) => c.cle === feuille.cle).premier, tours[0].id);
		assert.deepEqual(await verifierEmpreinte(site, 'f'.repeat(63) + '0'), []);
	} finally {
		serveur.close();
	}
});

test("un document d'un tour signe porte la signature du journal relue ; la chaine compte les signatures", async () => {
	const serveur = await servir();
	const site = `http://127.0.0.1:${serveur.address().port}`;
	try {
		const { tours } = JSON.parse(fs.readFileSync(path.join(DIST, 'tours.json'), 'utf8'));
		const signe = tours.find((t) => t.fichiers.includes(`${t.id}.racine.jws`));
		assert.ok(fs.existsSync(path.join(DIST, 'empreintes', `${signe.id}.racine.jws`)), 'la signature est servie');
		const releve = JSON.parse(fs.readFileSync(path.join(DIST, 'empreintes', `${signe.id}.json`), 'utf8'));
		const vusDe = (sha) => JSON.parse(fs.readFileSync(path.join(DIST, 'index', `${sha.slice(0, 2)}.json`), 'utf8'))[sha];
		const premier = releve.feuilles.find((f) => !f.cle.includes(':') && vusDe(f.sha256).some((v) => v.premier === signe.id));
		const constats = await verifierEmpreinte(site, premier.sha256);
		const c = constats.find((x) => x.premier === signe.id);
		assert.equal(c.signature.ok, true);
		assert.equal(c.ok, true);
	} finally {
		serveur.close();
	}
});

test('la sonde repond 200 en JSON, sans cache, avec le commit servi', async () => {
	const servi = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8')).commit;
	const LIRE_TETE = async () => [{ sha: servi, date: '2026-10-25T00:00:00Z' }];
	const env = { LIRE_TETE, ASSETS: { fetch: async (url) => new Response(fs.readFileSync(path.join(DIST, new URL(url).pathname))) } };
	const r = await onRequestGet({ request: new Request('https://empreintes.florianmousseau.com/health'), env });
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('cache-control'), 'no-store');
	const corps = await r.json();
	assert.ok(['ok', 'attention', 'rouge'].includes(corps.alerte));
	assert.equal(corps.service, 'empreintes');
	assert.ok(corps.deploye.commit);
	assert.deepEqual(corps.deploye.retard, { mesure: true, main: servi, depuis: null });
	const vide = await onRequestGet({ request: new Request('https://x/health'), env: { ASSETS: { fetch: async () => new Response('', { status: 404 }) } } });
	assert.equal((await vide.json()).alerte, 'rouge');
});

test('chaque module importe par un script servi est servi, hors de la Function', () => {
	const routes = JSON.parse(fs.readFileSync(path.join(DIST, '_routes.json'), 'utf8'));
	const scripts = fs.readdirSync(DIST).filter((f) => /\.m?js$/.test(f));
	for (const script of scripts) {
		const source = fs.readFileSync(path.join(DIST, script), 'utf8');
		for (const [, cible] of source.matchAll(/^import [^'"]*['"](\.?\/[^'"]+)['"]/gm)) {
			const nom = cible.replace(/^\.?\//, '');
			assert.ok(fs.existsSync(path.join(DIST, nom)), `${script} importe ${cible}, absent de dist/`);
			assert.ok(routes.exclude.includes(`/${nom}`), `${script} importe ${cible}, que la Function intercepte`);
		}
	}
});

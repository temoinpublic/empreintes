// La description OpenAPI dit toute l'API publique, et `GET /api` la reprend sans s'en ecarter.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { onRequestGet as index } from '../functions/api/index.js';
import { ADRESSES, indexDeLApi } from '../src/documentation.mjs';

const openapi = JSON.parse(readFileSync(new URL('../public/openapi.json', import.meta.url), 'utf8'));
const chemins = Object.keys(openapi.paths);

// Les Functions de `functions/api/` que l'API publique ne decrit pas : un formulaire HTML, une ecriture de la flotte sous jeton, une offre fermee.
const INTERNES = new Set(['attente', 'passages', 'verifications']);

test('chaque Function publique de functions/api/ est decrite, avec un contact et une licence', () => {
	for (const fichier of readdirSync(new URL('../functions/api', import.meta.url))) {
		const nom = fichier.replace(/\.js$/, '');
		if (INTERNES.has(nom) || nom === 'index') continue;
		assert.ok(chemins.some((c) => c === `/api/${nom}` || c.startsWith(`/api/${nom}/`)), `/api/${nom} absent de openapi.json`);
	}
	assert.equal(openapi.info.contact.email, 'contact@temoinpublic.fr');
	assert.match(openapi.info.license.name, /Licence Ouverte/);
	assert.deepEqual(openapi.servers, [{ url: 'https://temoinpublic.fr' }]);
	for (const [, adresse] of [...ADRESSES.dater, ...ADRESSES.agents, ...ADRESSES.lire]) {
		const m = adresse.match(/^(GET|POST|DELETE) (\/(?:api\/[a-z]+|mcp|tours\.json|health))/);
		if (m) assert.ok(chemins.some((c) => c === m[2] || c.startsWith(`${m[2]}/`)), `${adresse} absent de openapi.json`);
	}
	for (const [chemin, methodes] of Object.entries(openapi.paths)) for (const [methode, o] of Object.entries(methodes)) assert.ok(o.operationId && o.summary && o.tags?.length === 1, `${methode} ${chemin}`);
});

test('GET /api rend l index de la description, point par point, avec ou lire la suite', async () => {
	const ASSETS = { fetch: (url) => Promise.resolve(new Response(String(url).endsWith('/openapi.json') ? JSON.stringify(openapi) : null, { status: 200 })) };
	const r = await index({ request: new Request('https://temoinpublic.fr/api'), env: { ASSETS } });
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.equal(r.headers.get('access-control-allow-origin'), '*');
	const corps = await r.json();
	assert.deepEqual(corps, indexDeLApi(openapi, 'https://temoinpublic.fr'));
	assert.equal(corps.service, 'Témoin public');
	assert.equal(corps.documentation, 'https://temoinpublic.fr/documentation');
	assert.equal(corps.openapi, 'https://temoinpublic.fr/openapi.json');
	const attendus = Object.entries(openapi.paths).flatMap(([c, ms]) => Object.keys(ms).map((m) => `${m.toUpperCase()} ${c}`));
	assert.deepEqual(
		corps.points.map((p) => `${p.methode} ${p.chemin}`),
		attendus
	);
	assert.equal(corps.points[0].resume, openapi.paths['/api/depots'].post.summary);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { cheminDeLActe, lireAdresse, resoudre } from '../src/adresse.mjs';
import { reponseAdresse } from '../src/collectivite.mjs';
import { decider } from '../src/hote.mjs';
import { traiterMessage } from '../src/mcp.mjs';
import { pageAdresse, pageAdresses } from '../src/pages.mjs';
import { deposer, ligneEtAdresseDuRecu, versionsDeLaSource } from '../src/service.mjs';
import { onRequestGet as pageDeLAdresse } from '../functions/actes/[[chemin]].js';
import { onRequestGet as apiRecu } from '../functions/api/recus/[id].js';

const CRAVANS = { nom: 'Cravans', insee: '17133', siren: '211701339' };
const commune = async (code) => (['17133', '211701339'].includes(code) ? CRAVANS : null);
const annuaire = async (code) => (['17133', '211701339'].includes(code) ? [['cravans.fr', '']] : null);

const A = `abcdef0123${'4'.repeat(54)}`;
const B = `abcdef01ff${'5'.repeat(54)}`;
const C = `abcdef0123${'6'.repeat(54)}`;

async function dater(db, { n, url, sha256, jour, nature = 'deliberation', libelle = 'Budget primitif', collectivite = '17133' }) {
	const maintenant = new Date(`${jour}T12:00:00Z`);
	const r = await deposer({
		db,
		corps: { type: 'acte', url, collectivite, nature, libelle },
		adresse: `a${n}`,
		maintenant,
		annuaire,
		temoin: async () => ({ url, taille: 1, type: 'application/pdf', lu: maintenant.toISOString(), sha256 })
	});
	assert.equal(r.statut, 201, r.corps);
	return JSON.parse(r.corps).id;
}

async function base() {
	const db = baseDeTest();
	const ids = {
		a: await dater(db, { n: 1, url: 'https://www.cravans.fr/pv-1.pdf', sha256: A, jour: '2026-10-11' }),
		b: await dater(db, { n: 2, url: 'https://www.cravans.fr/pv-2.pdf', sha256: B, jour: '2026-10-11', nature: 'arrete', libelle: 'Voirie' }),
		c: await dater(db, { n: 3, url: 'https://www.cravans.fr/pv-1.pdf', sha256: C, jour: '2026-10-12' })
	};
	return { db, ids };
}

const repondre = (db, chemin) => reponseAdresse({ db, segments: chemin.split('/').slice(2), commune });

test("l'adresse d'un acte se compose et se lit : code en capitales, jour, nature connue, au moins 8 hex", () => {
	assert.equal(cheminDeLActe({ collectivite: '17133', jour: '2026-10-11', nature: 'deliberation', sha256: A }), '/actes/17133/2026-10-11/deliberation-abcdef012344');
	assert.deepEqual(lireAdresse(['2a004', '2026-10-11', 'Deliberation-ABCDEF01']), { code: '2A004', jour: '2026-10-11', prefixe: 'abcdef01' });
	assert.deepEqual(lireAdresse(['211701339', '2026-10-11', 'abcdef01']), { code: '211701339', jour: '2026-10-11', prefixe: 'abcdef01' });
	for (const segments of [
		['17133', '2026-10-11', 'deliberation-abcdef0'],
		['17133', '2026-10-11', 'avis-abcdef01'],
		['17133', '2026-13-45', 'abcdef01'],
		['17133', '11-10-2026', 'abcdef01'],
		['1713', '2026-10-11', 'abcdef01'],
		['211701338', '2026-10-11', 'abcdef01'],
		['17133', '2026-10-11'],
		null
	])
		assert.equal(lireAdresse(segments), null, String(segments));
	assert.deepEqual(resoudre('/x', []), { statut: 404 });
});

test('la forme canonique sert la preuve, la source et les versions vues a la meme source', async () => {
	const { db, ids } = await base();
	const r = await repondre(db, '/actes/17133/2026-10-11/deliberation-abcdef012344');
	assert.equal(r.statut, 200);
	assert.equal(r.entetes['cache-control'], 'public, max-age=300');
	assert.match(r.corps, /<h1>Délibération, Cravans<\/h1>\n<p class="sous-titre">Budget primitif<\/p>/);
	assert.match(r.corps, new RegExp(`<code class="racine">${A}</code>`));
	assert.match(r.corps, new RegExp(`<a href="/recu/${ids.a}">${ids.a.slice(0, 12)}</a>`));
	assert.match(r.corps, /<a href="\/depots\/2026-10-11.jsonl">n° 1 du 11\/10\/2026<\/a>/);
	assert.match(r.corps, /<dt>Source<\/dt><dd><a href="https:\/\/www.cravans.fr\/pv-1.pdf">/);
	assert.match(r.corps, /<a href="\/collectivite\/17133">Cravans<\/a>/);
	assert.match(r.corps, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/actes\/17133\/2026-10-11\/deliberation-abcdef012344">/);
	assert.match(r.corps, /"@type":"Legislation","legislationIdentifier":"https:\/\/temoinpublic.fr\/actes\/17133\/2026-10-11\/deliberation-abcdef012344"/);
	assert.match(r.corps, /<h2>2 versions à cette source<\/h2>/);
	assert.match(r.corps, /<td>Cette page<\/td>/);
	assert.match(r.corps, /<a href="\/actes\/17133\/2026-10-12\/deliberation-abcdef012366">/);
	assert.match(r.corps, /<meta name="robots" content="noindex">/, 'la famille /actes/ nait noindex (D-174)');
	assert.equal(r.entetes['x-robots-tag'], 'noindex');
	const autre = await repondre(db, '/actes/17133/2026-10-11/arrete-abcdef01ff55');
	assert.equal(autre.statut, 200);
	assert.match(autre.corps, /<h2>1 version à cette source<\/h2>/);
	assert.deepEqual(await versionsDeLaSource({ db, collectivite: '17133', url: null }), []);
});

test('un prefixe court ou une ecriture voisine renvoie en 301 a la forme canonique', async () => {
	const { db } = await base();
	for (const chemin of ['/actes/17133/2026-10-11/abcdef0123', '/actes/17133/2026-10-11/arrete-abcdef0123', `/actes/17133/2026-10-11/deliberation-${A}`, '/actes/17133/2026-10-11/DELIBERATION-ABCDEF012344']) {
		const r = await repondre(db, chemin);
		assert.equal(r.statut, 301, chemin);
		assert.equal(r.entetes.location, '/actes/17133/2026-10-11/deliberation-abcdef012344', chemin);
	}
	assert.equal((await repondre(db, '/actes/17133/2026-10-11/abcdef01ff')).entetes.location, '/actes/17133/2026-10-11/arrete-abcdef01ff55');
});

test("un prefixe ambigu rend la liste des adresses, l'inconnu rend 404", async () => {
	const { db } = await base();
	const r = await repondre(db, '/actes/17133/2026-10-11/abcdef01');
	assert.equal(r.statut, 300);
	assert.match(r.corps, /<h1>2 actes à cette adresse<\/h1>/);
	assert.match(r.corps, /<li><a href="\/actes\/17133\/2026-10-11\/deliberation-abcdef012344">/);
	assert.match(r.corps, /<li><a href="\/actes\/17133\/2026-10-11\/arrete-abcdef01ff55">/);
	assert.match(r.corps, /noindex/);
	assert.equal(r.entetes['x-robots-tag'], 'noindex');
	for (const chemin of ['/actes/17133/2026-10-11/abcdef0', '/actes/17133/2026-10-11/deadbeef00', '/actes/17133/2026-10-13/abcdef0123', '/actes/17134/2026-10-11/abcdef0123', '/actes/17133/2026-10-11/avis-abcdef0123', '/actes/17133'])
		assert.equal((await repondre(db, chemin)).statut, 404, chemin);
	assert.match(pageAdresses([]), /<h1>0 actes à cette adresse<\/h1>/);
});

test("la page d'adresse ne montre ni l'objet ni la source qui pourraient nommer une personne", async () => {
	const db = baseDeTest();
	await dater(db, { n: 1, url: 'https://www.cravans.fr/arrete-occupation-domaine-public-SIMON.pdf', sha256: A, jour: '2026-10-11', nature: 'arrete', libelle: 'occupation du domaine public SIMON' });
	const r = await repondre(db, '/actes/17133/2026-10-11/arrete-abcdef012344');
	assert.equal(r.statut, 200);
	assert.doesNotMatch(r.corps, /SIMON/);
	assert.match(r.corps, /<p class="sous-titre">Sans objet<\/p>/);
	assert.doesNotMatch(r.corps, /<dt>Source<\/dt>/);
	const sansNom = pageAdresse({ acte: { collectivite: '17999', jour: '2026-10-11', place: 1, nature: 'decision', sha256: A, recu: 'b'.repeat(64), objet: null, url: null } });
	assert.match(sansNom, /<h1>Décision, Collectivité 17999<\/h1>/);
	assert.doesNotMatch(sansNom, /à cette source/);
});

test("le recu d'un acte porte son adresse dans l'API et le MCP ; un autre depot ne la porte pas", async () => {
	const { db, ids } = await base();
	const env = { DEPOTS: db };
	const lu = await (await apiRecu({ params: { id: ids.a }, env })).json();
	assert.equal(lu.acte, 'https://temoinpublic.fr/actes/17133/2026-10-11/deliberation-abcdef012344');
	assert.equal(lu.sha256, A);
	assert.equal(await ligneEtAdresseDuRecu({ db, id: 'f'.repeat(64) }), null);
	db.sqlite.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').run('2026-10-11', 9, 'c'.repeat(64), 'd'.repeat(64));
	assert.equal((await ligneEtAdresseDuRecu({ db, id: 'd'.repeat(64) })).acte, undefined);
	const service = { ligneDuRecu: (id) => ligneEtAdresseDuRecu({ db, id }) };
	const appel = (id) => traiterMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lire_recu', arguments: { id } } }, service);
	assert.equal((await appel(ids.a)).result.structuredContent.acte, lu.acte);
	assert.equal((await appel('d'.repeat(64))).result.structuredContent.acte, undefined);
});

test("la Function sert l'adresse, et l'edition allemande renvoie au francais", async () => {
	const { db } = await base();
	const env = { DEPOTS: db, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
	const requete = (chemin) => ({ params: { chemin: chemin.split('/').slice(2) }, env, request: new Request(`https://temoinpublic.fr${chemin}`) });
	const page = await pageDeLAdresse(requete('/actes/17133/2026-10-11/deliberation-abcdef012344'));
	assert.equal(page.status, 200);
	assert.match(await page.text(), /<h1>Délibération, Collectivité 17133<\/h1>/);
	const renvoi = await pageDeLAdresse(requete('/actes/17133/2026-10-11/abcdef01ff'));
	assert.equal(renvoi.status, 301);
	assert.equal((await pageDeLAdresse({ params: {}, env, request: new Request('https://temoinpublic.fr/actes') })).status, 404);
	assert.deepEqual(decider('https://datumszeuge.de/actes/17133/2026-10-11/abcdef01'), { action: 'redirection', vers: 'https://temoinpublic.fr/actes/17133/2026-10-11/abcdef01' });
});

import { planDesActes, reponsePlanDesActes } from '../src/collectivite.mjs';
import { noterPassage, passageDeLActe, PASSAGE_MAX } from '../src/service.mjs';
import { onRequestGet as planDesActesGet } from '../functions/sitemap-actes.xml.js';
import { onRequestPost as passagePost } from '../functions/api/passages.js';

test("le plan des actes porte l'adresse de chaque acte date, du plus ancien au plus recent, et aucun nom", async () => {
	const db = baseDeTest();
	await dater(db, { n: 1, url: 'https://www.cravans.fr/arrete-SIMON.pdf', sha256: A, jour: '2026-10-11', nature: 'arrete', libelle: 'occupation du domaine public SIMON' });
	await dater(db, { n: 2, url: 'https://www.cravans.fr/pv-2.pdf', sha256: B, jour: '2026-10-12' });
	const r = await reponsePlanDesActes({ db });
	assert.equal(r.statut, 200);
	assert.equal(r.entetes['content-type'], 'application/xml; charset=utf-8');
	assert.deepEqual([...r.corps.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].map((m) => [m[1], m[2]]), [
		['https://temoinpublic.fr/actes/17133/2026-10-11/arrete-abcdef012344', '2026-10-11'],
		['https://temoinpublic.fr/actes/17133/2026-10-12/deliberation-abcdef01ff55', '2026-10-12']
	]);
	assert.doesNotMatch(r.corps, /SIMON|cravans/);
	assert.match(planDesActes([]), /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">\n\n<\/urlset>/);
	const servi = await planDesActesGet({ env: { DEPOTS: db } });
	assert.equal(servi.status, 200);
	assert.equal(servi.headers.get('cache-control'), 'public, max-age=3600');
});

test('la page porte la date lue, comme lue, et ne la lit pas dans un objet garde', async () => {
	const db = baseDeTest();
	await dater(db, { n: 1, url: 'https://www.cravans.fr/pv.pdf', sha256: A, jour: '2026-10-11', libelle: 'Procès-verbal du 12 février 2026' });
	await dater(db, { n: 2, url: 'https://www.cravans.fr/PV-CM-MARS-2026.pdf', sha256: B, jour: '2026-10-11', libelle: 'Procès-verbal' });
	const jour = await repondre(db, '/actes/17133/2026-10-11/deliberation-abcdef012344');
	assert.match(jour.corps, /<div><dt>Date lue<\/dt><dd><time datetime="2026-02-12">12\/02\/2026<\/time>, dans le libellé<\/dd><\/div>/);
	const mois = await repondre(db, '/actes/17133/2026-10-11/deliberation-abcdef01ff55');
	assert.match(mois.corps, /<dd><time datetime="2026-03">mars 2026<\/time>, dans le nom du fichier<\/dd>/);
	const garde = pageAdresse({ acte: { collectivite: '17133', jour: '2026-10-11', place: 1, nature: 'decision', sha256: A, recu: 'b'.repeat(64), objet: null, url: null } });
	assert.doesNotMatch(garde, /Date lue|À la source/);
});

test("la glane note la source de chaque acte a son passage, et la page le dit ; une version plus recente l'emporte", async () => {
	const { db, ids } = await base();
	const maintenant = new Date('2026-10-14T03:00:00Z');
	const r = await noterPassage({ db, corps: { vus: [ids.c, 'e'.repeat(64)], absents: [ids.b] }, maintenant });
	assert.equal(r.statut, 200);
	assert.deepEqual(JSON.parse(r.corps), { jour: '2026-10-14', vus: 1, absents: 1 });
	assert.deepEqual({ ...(await passageDeLActe({ db, recu: ids.b })) }, { jour: '2026-10-14', etat: 'absente' });
	assert.equal(await passageDeLActe({ db, recu: 'e'.repeat(64) }), null);
	const vue = await repondre(db, '/actes/17133/2026-10-12/deliberation-abcdef012366');
	assert.match(vue.corps, /<div><dt>À la source<\/dt><dd>Lien publié au passage du 14\/10\/2026<\/dd><\/div>/);
	const absente = await repondre(db, '/actes/17133/2026-10-11/arrete-abcdef01ff55');
	assert.match(absente.corps, /<dd>Lien non retrouvé au passage du 14\/10\/2026<\/dd>/);
	await noterPassage({ db, corps: { vus: [ids.a] }, maintenant });
	const ancienne = await repondre(db, '/actes/17133/2026-10-11/deliberation-abcdef012344');
	assert.match(ancienne.corps, /<dd>Nouvelle version datée le <a href="\/actes\/17133\/2026-10-12\/deliberation-abcdef012366">12\/10\/2026<\/a><\/dd>/);
	assert.doesNotMatch(ancienne.corps, /Lien publié/);
	const deux = await noterPassage({ db, corps: { absents: [ids.c] }, maintenant: new Date('2026-10-15T03:00:00Z') });
	assert.deepEqual(JSON.parse(deux.corps), { jour: '2026-10-15', vus: 0, absents: 1 });
	assert.deepEqual({ ...(await passageDeLActe({ db, recu: ids.c })) }, { jour: '2026-10-15', etat: 'absente' });
});

test('un passage illisible est refuse, et seule la flotte en ecrit', async () => {
	const db = baseDeTest();
	const id = 'a'.repeat(64);
	for (const corps of [null, { vus: 'x' }, { vus: ['abc'] }, { vus: [id], absents: [id] }, { vus: Array.from({ length: PASSAGE_MAX + 1 }, () => id) }]) {
		const r = await noterPassage({ db, corps });
		assert.equal(r.statut, 400, JSON.stringify(corps)?.slice(0, 40));
	}
	const ids = Array.from({ length: 200 }, (_, i) => i.toString(16).padStart(64, '0'));
	assert.deepEqual(JSON.parse((await noterPassage({ db, corps: { vus: ids } })).corps).vus, 0);
	const env = { DEPOTS: db, JETON_FLOTTE: 'secret' };
	const appel = (entete, corps) => passagePost({ env, request: new Request('https://temoinpublic.fr/api/passages', { method: 'POST', headers: entete ? { authorization: entete } : {}, body: corps }) });
	assert.equal((await appel(null, '{}')).status, 401);
	assert.equal((await appel('Bearer autre', '{}')).status, 401);
	assert.equal((await appel('Bearer secret', '{"vus":[]}')).status, 200);
	assert.equal((await appel('Bearer secret', 'pas du json')).status, 400);
});

import fs from 'node:fs';
import path from 'node:path';
import { veutDuJson } from '../src/collectivite.mjs';
import * as SCHEMA from '../src/schemaadresse.mjs';
import { pageSchemaAdresse } from '../src/pages.mjs';

/** Le sous-ensemble de JSON Schema que le schema emploie : type, required, pattern, enum, const, items. */
function ecarts(schema, valeur, ou = '') {
	const typeDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
	const types = [schema.type ?? []].flat();
	if (types.length && !types.includes(typeDe(valeur))) return [`${ou} : ${typeDe(valeur)}`];
	const fautes = [];
	if (schema.pattern && typeof valeur === 'string' && !new RegExp(schema.pattern).test(valeur)) fautes.push(`${ou} : motif`);
	if (schema.enum && !schema.enum.includes(valeur)) fautes.push(`${ou} : enum`);
	if ('const' in schema && schema.const !== valeur) fautes.push(`${ou} : const`);
	for (const r of schema.required ?? []) if (!(r in valeur)) fautes.push(`${ou}.${r} : absent`);
	for (const [k, s] of Object.entries(schema.properties ?? {})) if (valeur && k in valeur) fautes.push(...ecarts(s, valeur[k], `${ou}.${k}`));
	if (schema.items && Array.isArray(valeur)) valeur.forEach((v, i) => fautes.push(...ecarts(schema.items, v, `${ou}[${i}]`)));
	return fautes;
}

test("l'adresse sert sa fiche JSON quand on la demande, conforme au schema publie", async () => {
	const { db, ids } = await base();
	await noterPassage({ db, corps: { vus: [ids.c] }, maintenant: new Date('2026-10-14T03:00:00Z') });
	const schema = SCHEMA.schemaDeLAdresse();
	const r = await reponseAdresse({ db, segments: ['17133', '2026-10-12', 'deliberation-abcdef012366'], commune, json: true });
	assert.equal(r.statut, 200);
	assert.equal(r.entetes['content-type'], 'application/json; charset=utf-8');
	assert.equal(r.entetes.vary, 'accept');
	const fiche = JSON.parse(r.corps);
	assert.deepEqual(ecarts(schema, fiche), []);
	assert.equal(fiche.adresse, 'https://temoinpublic.fr/actes/17133/2026-10-12/deliberation-abcdef012366');
	assert.equal(fiche.recu, ids.c);
	assert.equal(fiche.registre, 'https://temoinpublic.fr/depots/2026-10-12.jsonl');
	assert.deepEqual(fiche.passage, { jour: '2026-10-14', etat: 'vue' });
	assert.deepEqual(fiche.versions, ['https://temoinpublic.fr/actes/17133/2026-10-11/deliberation-abcdef012344', fiche.adresse]);
	assert.deepEqual(ecarts(schema, { ...fiche, nature: 'avis', sha256: 'x', passage: 1 }), ['.nature : enum', '.sha256 : motif', '.passage : integer']);
	assert.deepEqual(ecarts(schema, { adresse: 'https://temoinpublic.fr/actes/1713/2026-10-12/deliberation-abcdef012366' }).slice(0, 2), ['.schema : absent', '.collectivite : absent']);
	assert.ok(ecarts(schema, { ...fiche, adresse: 'https://temoinpublic.fr/actes/1713/2026-10-12/deliberation-abcdef012366' }).includes('.adresse : motif'));
	const ambigu = await reponseAdresse({ db, segments: ['17133', '2026-10-11', 'abcdef01'], commune, json: true });
	assert.equal(ambigu.statut, 300);
	assert.equal(JSON.parse(ambigu.corps).adresses.length, 2);
	const inconnu = await reponseAdresse({ db, segments: ['17133', '2026-10-11', 'deadbeef00'], commune, json: true });
	assert.deepEqual([inconnu.statut, JSON.parse(inconnu.corps)], [404, { erreur: 'adresse inconnue' }]);
	assert.equal((await reponseAdresse({ db, segments: ['17133', '2026-10-11', 'abcdef0123'], commune, json: true })).statut, 301);
	assert.equal((await repondre(db, '/actes/17133/2026-10-11/deadbeef00')).entetes.vary, 'accept');
});

test('la fiche ne porte ni objet ni source qui pourraient nommer une personne', async () => {
	const db = baseDeTest();
	await dater(db, { n: 1, url: 'https://www.cravans.fr/arrete-occupation-domaine-public-SIMON.pdf', sha256: A, jour: '2026-10-11', nature: 'arrete', libelle: 'occupation du domaine public SIMON' });
	const r = await reponseAdresse({ db, segments: ['17133', '2026-10-11', 'arrete-abcdef012344'], commune, json: true });
	assert.doesNotMatch(r.corps, /SIMON/);
	assert.equal(JSON.parse(r.corps).objet, null);
});

test('la Function choisit la fiche sur Accept', async () => {
	const { db } = await base();
	const env = { DEPOTS: db, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
	const chemin = '/actes/17133/2026-10-11/deliberation-abcdef012344';
	const r = await pageDeLAdresse({ params: { chemin: chemin.split('/').slice(2) }, env, request: new Request(`https://temoinpublic.fr${chemin}`, { headers: { accept: 'application/json' } }) });
	assert.equal((await r.json()).sha256, A);
	assert.equal(veutDuJson('application/json'), true);
	assert.equal(veutDuJson('application/json;q=0.9, */*'), true);
	assert.equal(veutDuJson('text/html,application/xhtml+xml,application/json'), false);
	assert.equal(veutDuJson('application/json, text/html'), true);
	assert.equal(veutDuJson(null), false);
	assert.equal(veutDuJson('*/*'), false);
});

test('les motifs du schema sont ceux du resolveur', () => {
	const [code, jour, nature, empreinte] = SCHEMA.SEGMENTS.map((s) => new RegExp(s.motif));
	const exemple = new URL(SCHEMA.EXEMPLE).pathname.split('/').slice(2);
	assert.ok(lireAdresse(exemple));
	assert.ok(code.test(exemple[0]) && jour.test(exemple[1]));
	const [n, hex] = exemple[2].split('-');
	assert.ok(nature.test(n) && empreinte.test(hex));
	for (const c of ['17133', '2A004', '211701339', '1713', '20004', '9900A']) assert.equal(code.test(c), Boolean(lireAdresse([c, '2026-10-11', 'abcdef01'])) || c === '211701338', c);
	assert.equal(new RegExp(SCHEMA.schemaDeLAdresse().properties.adresse.pattern).test(SCHEMA.EXEMPLE), true);
	assert.equal(SCHEMA.schemaDeLAdresse().$id, `https://temoinpublic.fr${SCHEMA.CHEMIN_DU_SCHEMA}`);
	assert.deepEqual(SCHEMA.CHAMPS.map(([n]) => n), SCHEMA.schemaDeLAdresse().required);
});

test('la construction publie la page du schema et son fichier versionne, sans nom ni explication', () => {
	const DIST = path.resolve(import.meta.dirname, '..', 'dist');
	const fichier = JSON.parse(fs.readFileSync(path.join(DIST, SCHEMA.CHEMIN_DU_SCHEMA.slice(1)), 'utf8'));
	assert.deepEqual(fichier, SCHEMA.schemaDeLAdresse());
	const page = fs.readFileSync(path.join(DIST, 'adresse-des-actes.html'), 'utf8');
	assert.equal(pageSchemaAdresse(SCHEMA), page);
	assert.match(page, /<h1>Adresse pérenne d’un acte local<\/h1>/);
	assert.match(page, /<a href="\/schema\/adresse-des-actes\/1.json">/);
	assert.equal((page.match(/<table>/g) ?? []).length, 4);
	assert.doesNotMatch(page, / [:;?!]/);
	assert.match(fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/temoinpublic.fr\/adresse-des-actes<\/loc>/);
	assert.match(fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8'), /https:\/\/temoinpublic.fr\/schema\/adresse-des-actes\/1.json/);
	assert.match(fs.readFileSync(path.join(DIST, 'documentation.html'), 'utf8'), /Accept: application\/json/);
	assert.ok(JSON.parse(fs.readFileSync(path.join(DIST, '_routes.json'), 'utf8')).exclude.includes('/schema/*'));
	assert.equal(decider('https://datumszeuge.de/adresse-des-actes').vers, 'https://temoinpublic.fr/adresse-des-actes');
});

test('au-dela de la limite d un fichier, le plan des actes devient un index de pages stables', async () => {
	const { db } = await base();
	const loc = (corps) => [...corps.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	const index = await reponsePlanDesActes({ db, parPage: 2 });
	assert.match(index.corps, /<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
	assert.deepEqual(loc(index.corps), ['https://temoinpublic.fr/sitemap-actes.xml?page=1', 'https://temoinpublic.fr/sitemap-actes.xml?page=2']);
	const [un, deux] = await Promise.all(['1', '2'].map((page) => reponsePlanDesActes({ db, page, parPage: 2 })));
	assert.deepEqual([...loc(un.corps), ...loc(deux.corps)], loc((await reponsePlanDesActes({ db })).corps));
	assert.equal(loc(deux.corps).length, 1);
	for (const page of ['0', '3', 'x', '01', '1e3']) assert.equal((await reponsePlanDesActes({ db, page, parPage: 2 })).statut, 404, page);
	const servi = await planDesActesGet({ env: { DEPOTS: db }, request: new Request('https://temoinpublic.fr/sitemap-actes.xml?page=1') });
	assert.equal(servi.status, 200);
	assert.equal(loc(await servi.text()).length, 3);
	assert.equal((await planDesActesGet({ env: { DEPOTS: db }, request: new Request('https://temoinpublic.fr/sitemap-actes.xml?page=2') })).status, 404);
});

test('la regle de renvoi du schema couvre l empreinte entiere que le resolveur renvoie', async () => {
	const { db } = await base();
	assert.equal((await repondre(db, `/actes/17133/2026-10-11/deliberation-${A}`)).statut, 301);
	assert.match(SCHEMA.RESOLUTION.find((r) => r.statut === 301).cas, /empreinte entière/);
});

test("la page dit la relecture de la source : le meme document, ou l'adresse qui ne le sert plus depuis son premier jour", () => {
	const acte = { collectivite: '17133', jour: '2026-10-11', place: 1, nature: 'deliberation', sha256: A, recu: 'b'.repeat(64), objet: null, url: 'https://www.cravans.fr/pv.pdf' };
	const meme = pageAdresse({ acte, passage: { jour: '2026-10-20', etat: 'vue' }, relecture: { jour: '2026-10-20', depuis: '2026-10-20', statut: 200 } });
	assert.match(meme, /<dd>Lien publié au passage du 20\/10\/2026<\/dd><\/div>\n<div><dt>Relecture<\/dt><dd>Même document relu à la source le 20\/10\/2026<\/dd>/);
	const partie = pageAdresse({ acte, relecture: { jour: '2026-10-30', depuis: '2026-10-23', statut: 404 } });
	assert.match(partie, /<dd>L’adresse ne sert plus le document : réponse 404 depuis le 23\/10\/2026, relue le 30\/10\/2026<\/dd>/);
	assert.doesNotMatch(partie, /À la source/);
	assert.match(pageAdresse({ acte, relecture: { jour: '2026-10-23', depuis: '2026-10-23', statut: 410 } }), /réponse 410 depuis le 23\/10\/2026<\/dd>/);
	const remplacee = pageAdresse({ acte, versions: [{ ...acte }, { ...acte, recu: 'c'.repeat(64), jour: '2026-10-20', sha256: B }], relecture: { jour: '2026-10-30', depuis: '2026-10-23', statut: 404 } });
	assert.doesNotMatch(remplacee, /Relecture/, 'une version plus recente l emporte');
});

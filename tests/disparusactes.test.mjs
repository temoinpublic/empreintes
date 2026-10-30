import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { entreesDesActes } from '../src/disparusactes.mjs';
import { RETENUES } from '../src/retenues.mjs';
import { sha256 } from '../src/chaine.mjs';
import { reponseDisparus, reponseFluxDisparus } from '../src/collectivite.mjs';
import { actesDisparus } from '../src/service.mjs';
import { MARQUE_DES_ACTES, avecLesActes, fluxDisparus, itemsDesActes, pageDisparus, sectionDesActes } from '../src/pages.mjs';
import { onRequestGet } from '../functions/disparus.js';
import { onRequestGet as fluxGet } from '../functions/disparus.xml.js';

const hex = (c) => c.repeat(64);
const SITE = 'https://www.cravans.fr/docs';

/** Une base ou chaque acte est `[lettre, jour, url, objet, relecture, texte]`, `relecture` = [statut, depuis] ou null, `texte` la lettre de son empreinte de texte ou rien. */
function base(actes) {
	const db = baseDeTest();
	actes.forEach(([lettre, jour, url, objet, relecture, texte], place) => {
		const recu = `f${hex(lettre).slice(1)}`;
		db.sqlite.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').run(jour, place, hex(lettre), recu);
		db.sqlite.prepare('INSERT INTO acte (recu, collectivite, nature, objet, url) VALUES (?, ?, ?, ?, ?)').run(recu, '17133', 'deliberation', objet, url);
		if (relecture) db.sqlite.prepare('INSERT INTO relecture (recu, jour, depuis, statut) VALUES (?, ?, ?, ?)').run(recu, '2026-10-23', relecture[1], relecture[0]);
		if (texte) db.sqlite.prepare('INSERT INTO texte (recu, sha256) VALUES (?, ?)').run(recu, hex(texte));
	});
	return db;
}

const ACTES = [
	['a', '2026-10-15', `${SITE}/budget-2026.pdf`, 'Budget primitif 2026', [404, '2026-10-22']],
	['b', '2026-10-15', `${SITE}/voirie.pdf`, 'Travaux de voirie', null, '5'],
	['c', '2026-10-22', `${SITE}/voirie.pdf`, 'Travaux de voirie, version corrigee', null, '6'],
	['d', '2026-10-15', `${SITE}/delegation-signature-maingot.pdf`, 'Delegation', [410, '2026-10-22']],
	['e', '2026-10-15', null, 'Sans objet', [404, '2026-10-22']],
	['1', '2026-10-15', `${SITE}/eclairage.pdf`, 'Occupation du domaine public SIMON', [410, '2026-10-21']],
	['2', '2026-10-15', `${SITE}/cantine.pdf`, 'Tarifs de la cantine', [200, '2026-10-22']],
	// Les memes octets recompresses (le meme texte) : dates, jamais « remplaces ».
	['3', '2026-10-15', `${SITE}/tarifs.pdf`, 'Tarifs 2026', null, '7'],
	['4', '2026-10-22', `${SITE}/tarifs.pdf`, 'Tarifs 2026', null, '7'],
	// Sans empreinte de texte d'un cote ou de l'autre, rien n'est prouve.
	['5', '2026-10-15', `${SITE}/pv-juin.pdf`, 'Proces-verbal de juin', null],
	['6', '2026-10-22', `${SITE}/pv-juin.pdf`, 'Proces-verbal de juin', null, '8'],
	['7', '2026-10-15', `${SITE}/pv-mai.pdf`, 'Proces-verbal de mai', null, '9'],
	['8', '2026-10-22', `${SITE}/pv-mai.pdf`, 'Proces-verbal de mai', null]
];

test('les actes disparus et remplaces : version d avant, preuve, aucune personne', async () => {
	const lu = await actesDisparus({ db: base(ACTES) });
	assert.equal(lu.disparus.length, 3, 'une adresse retiree en base ne se relit pas, un 200 non plus');
	assert.equal(lu.remplaces.length, 1, 'le meme texte recompresse et une version sans empreinte de texte ne sont pas des remplacements');
	assert.equal(lu.remplaces[0].apres, hex('c'));
	const entrees = await entreesDesActes(lu);
	assert.deepEqual(
		entrees.map((e) => [e.classe, e.date, e.http, e.url.slice(SITE.length + 1)]),
		[
			['disparu', '2026-10-22', 404, 'budget-2026.pdf'],
			['remplace', '2026-10-22', null, 'voirie.pdf'],
			['disparu', '2026-10-21', 410, 'eclairage.pdf']
		]
	);
	const [disparu, remplace, eclairage] = entrees;
	assert.deepEqual(disparu.avant, { jour: '2026-10-15', sha256: hex('a') });
	assert.equal(disparu.preuve, `/actes/17133/2026-10-15/deliberation-${'a'.repeat(12)}`);
	assert.equal(remplace.avant.sha256, hex('b'));
	assert.equal(remplace.objet, 'Travaux de voirie, version corrigee');
	assert.equal(eclairage.objet, null, 'un objet qui pourrait nommer ne s affiche pas');
	assert.equal((await entreesDesActes(lu, 1)).length, 1);
	assert.deepEqual(await entreesDesActes({}), []);
});

test('une adresse retenue sur un droit, une ligne mal formee ne paraissent pas', async () => {
	const lu = await actesDisparus({ db: base(ACTES) });
	RETENUES.add(await sha256(`${SITE}/budget-2026.pdf`));
	try {
		assert.equal((await entreesDesActes(lu)).some((e) => e.url.endsWith('budget-2026.pdf')), false);
	} finally {
		RETENUES.clear();
	}
	const ligne = { date: '2026-10-22', http: 404, avant_jour: '2026-10-15', avant: hex('a'), collectivite: '17133', nature: 'arrete', objet: null, url: `${SITE}/x.pdf` };
	for (const mauvaise of [{ url: 'pas une adresse' }, { url: 'ftp://x.fr/a.pdf' }, { avant: 'court' }, { avant_jour: null }, { date: 'hier' }]) assert.deepEqual(await entreesDesActes({ disparus: [{ ...ligne, ...mauvaise }] }), []);
	assert.equal((await entreesDesActes({ disparus: [ligne, null] })).length, 1);
});

test('la section des actes prend la place de sa marque dans /disparus', async () => {
	const page = pageDisparus({ entrees: [], sites: [] });
	assert.ok(page.includes(MARQUE_DES_ACTES));
	assert.equal(sectionDesActes({ entrees: [] }), '');
	assert.ok(!avecLesActes(page, '').includes(MARQUE_DES_ACTES));
	const entrees = await entreesDesActes(await actesDisparus({ db: base(ACTES) }));
	const section = sectionDesActes({ entrees });
	assert.match(section, /<h2>3 actes de communes<\/h2>/);
	assert.match(section, /<a href="\/collectivite\/17133">17133<\/a>/);
	assert.match(section, /Remplacé à la même adresse/);
	assert.match(section, /eclairage\.pdf/);
	assert.doesNotMatch(section, /SIMON|maingot/i);
	assert.match(sectionDesActes({ entrees: entrees.slice(0, 1), nomDe: () => 'Cravans' }), /<h2>1 acte de commune<\/h2>[\s\S]*>Cravans</);
});

test('GET /disparus sert la page publiee avec les actes, et laisse passer une page absente', async () => {
	const db = base(ACTES);
	const page = pageDisparus({ entrees: [], sites: [] });
	const env = (statut) => ({
		DEPOTS: db,
		ASSETS: { fetch: async (u) => (String(u).includes('/annuaire/') ? new Response('{}', { status: 404 }) : new Response(statut === 200 ? page : 'absente', { status: statut, headers: { 'content-type': 'text/html' } })) }
	});
	const r = await onRequestGet({ env: env(200), request: new Request('https://temoinpublic.fr/disparus') });
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
	const html = await r.text();
	assert.match(html, /3 actes de communes/);
	assert.ok(!html.includes(MARQUE_DES_ACTES));
	const absente = await onRequestGet({ env: env(404), request: new Request('https://temoinpublic.fr/disparus') });
	assert.equal(absente.status, 404);
	const commune = async (code) => (code === '17133' ? { nom: 'Cravans' } : null);
	const nommee = await reponseDisparus({ db, publiee: new Response(page), commune });
	assert.match(nommee.corps, />Cravans</);
});

test('GET /disparus.xml sert le flux publie avec un item par acte, aucune personne', async () => {
	const db = base(ACTES);
	const flux = fluxDisparus([]);
	assert.ok(flux.includes(MARQUE_DES_ACTES));
	assert.equal(itemsDesActes({ entrees: [] }), '');
	const env = (statut) => ({
		DEPOTS: db,
		ASSETS: { fetch: async (u) => (String(u).includes('/annuaire/') ? new Response('{}', { status: 404 }) : new Response(statut === 200 ? flux : 'absent', { status: statut })) }
	});
	const r = await fluxGet({ env: env(200), request: new Request('https://temoinpublic.fr/disparus.xml') });
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
	const xml = await r.text();
	assert.ok(!xml.includes(MARQUE_DES_ACTES));
	assert.equal((xml.match(/<item>/g) ?? []).length, 3);
	assert.match(xml, /<title>Remplacé à la même adresse, 17133, Travaux de voirie, version corrigee<\/title>/);
	assert.match(xml, /<link>https:\/\/temoinpublic\.fr\/actes\/17133\/2026-10-15\/deliberation-a{12}<\/link>/);
	assert.match(xml, /<guid isPermaLink="false">acte:disparu:a{64}:/);
	assert.match(xml, /HTTP 404, version du 15\/10\/2026/);
	assert.doesNotMatch(xml, /SIMON|maingot/i);
	assert.equal((await fluxGet({ env: env(404), request: new Request('https://temoinpublic.fr/disparus.xml') })).status, 404);
	const commune = async (code) => (code === '17133' ? { nom: 'Cravans' } : null);
	assert.match((await reponseFluxDisparus({ db, publiee: new Response(flux), commune })).corps, /<title>Disparu, Cravans, /);
});

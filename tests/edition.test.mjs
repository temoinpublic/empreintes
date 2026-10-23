// L'edition allemande : les memes pages en allemand, choisies par l'hote, sans les actes de collectivite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDITIONS, HOTES_ALLEMANDS, cheminsDe, langueDe, planDe } from '../src/edition.mjs';
import { TEXTES, vue } from '../src/textes.mjs';
import { FONCTIONS, decider, horsIndex, pageAllemande } from '../src/hote.mjs';
import { onRequest } from '../functions/_middleware.js';
import { ACTES, donneesStructurees, pageRoles, pageSections, pageAccueil, pageDeposer, pageDocumentation, pageIntrouvable, pageJournal, pageMentions, pagePreuve, pageRecuInconnu, pageVerifier, planDuSite, robots } from '../src/pages.mjs';

const tour = { id: '20261012T101314Z', instant: '2026-10-12T10:13:14Z', objets: 2018, racine: 'f'.repeat(64), ots: 'bitcoin', bloc: 971045, fichiers: ['20261012T101314Z.json', '20261012T101314Z.racine.ots'] };
const de = [pageAccueil([tour], 'de'), pageDeposer('de'), pageVerifier('de'), pageJournal([tour, { ...tour, ots: 'calendrier', bloc: null }], 'de'), pageJournal([], 'de'), pageDocumentation('de'), pageMentions('de'), pageIntrouvable('de'), pageRecuInconnu('de'), pageAccueil([], 'de'), pagePreuve([tour], undefined, 'de'), pagePreuve([{ ...tour, fichiers: ['20261012T101314Z.racine.tsr'] }], undefined, 'de'), pageSections('pratiques', 'de'), pageSections('conditions', 'de'), pageRoles('de'), pageSections('archivage', 'de'), pageSections('conditionsArchivage', 'de')];
const texteDe = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');

test('la table bilingue se lit dans une langue, feuille par feuille, les absents compris', () => {
	assert.deepEqual(vue({ a: { fr: 'x', de: 'y' }, b: { c: { fr: [1], de: [2] }, d: { fr: 'seul', de: undefined } } }, 'de'), { a: 'y', b: { c: [2], d: undefined } });
	assert.equal(vue(TEXTES, 'fr').actes.acte.chemin, '/acte');
	assert.equal(vue(TEXTES, 'de').actes.acte, undefined);
	assert.equal(EDITIONS.fr.marque, 'Témoin public');
});

test("l'hote choisit la langue : datumszeuge.de et sa voie de controle en allemand, tout le reste en francais", () => {
	for (const h of HOTES_ALLEMANDS) assert.equal(langueDe(h), 'de', h);
	assert.equal(langueDe('DATUMSZEUGE.DE'), 'de');
	for (const h of ['temoinpublic.fr', 'www.temoinpublic.fr', 'empreintes.pages.dev', 'main.empreintes.pages.dev', undefined]) assert.equal(langueDe(h), 'fr', String(h));
});

test('chaque page allemande porte la marque, sa langue, son adresse canonique et ses balises de partage', () => {
	for (const html of de) {
		assert.match(html, /^<!doctype html>\n<html lang="de">/);
		assert.match(html, /<title>[^<]+ \| Datumszeuge<\/title>/);
		assert.match(html, /<link rel="canonical" href="https:\/\/datumszeuge.de\//);
		assert.match(html, /<meta property="og:locale" content="de_DE">/);
		assert.match(html, /<nav aria-label="Hauptnavigation"><a href="\/datieren"[^>]*>Datieren<\/a> <a href="\/pruefen"[^>]*>Prüfen<\/a> <a href="\/register"[^>]*>Register<\/a><\/nav>/);
		assert.match(html, /<a href="\/impressum">Impressum<\/a> <a href="https:\/\/github.com\/temoinpublic\/empreintes">Quellcode<\/a>/);
		assert.ok(!html.includes('${'), 'un ${...} est reste dans une chaine simple');
		const corps = html.slice(html.indexOf('<body>'));
		for (const francais of ['Témoin public', 'temoinpublic.fr', 'Mentions', 'lang="fr"']) assert.ok(!corps.includes(francais), francais);
	}
	const structure = JSON.parse(de[0].match(/<script type="application\/ld\+json">(.*)<\/script>/)[1]);
	assert.deepEqual(structure, donneesStructurees('de'));
	assert.equal(structure.inLanguage, 'de');
	assert.equal(structure.name, 'Datumszeuge');
	assert.equal(structure.url, 'https://datumszeuge.de/');
	assert.equal(structure.author, undefined);
});

test("l'edition allemande n'a pas d'acte de collectivite : ni bloc, ni page, ni lien, ni ligne de documentation", () => {
	assert.equal(EDITIONS.de.actes.acte, undefined);
	assert.deepEqual(planDe('de'), ['/', '/datieren', '/pruefen', '/register', '/beweiswert', '/dokumentation', '/praktiken', '/bedingungen', '/rollen', '/archiv', '/archivbedingungen', '/impressum']);
	for (const html of de) {
		for (const interdit of ['id="acte"', 'id="collectivite"', 'href="/acte"', '/collectivite/', 'annuaire', 'INSEE']) assert.ok(!html.includes(interdit), interdit);
	}
	assert.match(de[1], /<label for="url">Der Link zu einem Dokument im Internet<\/label>\n<input[^>]+id="url"[^>]*>\n<details>/);
	assert.match(de[1], /<button type="submit" class="principal large-bouton">Dieses Dokument datieren<\/button>/);
});

test('les dates et les nombres sont allemands, et la typographie francaise ne s y impose pas', () => {
	assert.equal(EDITIONS.de.jour('2026-10-13'), '13.10.2026');
	assert.equal(EDITIONS.de.dateHeure('2026-10-12T10:13:14Z'), '12.10.2026 10:13\u00A0UTC');
	assert.equal(EDITIONS.de.nombre(2018), '2.018');
	assert.match(de[0], /2\.018 Datierungen seit dem 12\.10\.2026\./);
	assert.match(de[3], /Letzte Wurzel, 12\.10\.2026 10:13\u00A0UTC/);
	assert.match(de[3], /Bitcoin, Block 971045/);
	assert.match(de[3], /Eintragung in Bitcoin läuft/);
	assert.match(de[3], /href="\/empreintes\/20261012T101314Z.racine.ots">.ots</);
	assert.match(de[4], /Noch keine Runde veröffentlicht\./);
	assert.match(de[6], /<h2>Datenschutz<\/h2>\n<p>Es wird kein Dokument empfangen oder gespeichert, nur seine Prüfsumme\./, 'un deux-points allemand se colle au mot');
	assert.ok(!texteDe(de[6]).includes('\u00A0:'), 'aucune espace insecable francaise avant un deux-points allemand');
});

test("l'Impressum nomme l'anbieter en lien, l'hebergeur et le code ; aucune autre page ne nomme Florian", () => {
	const impressum = pageMentions('de');
	assert.match(impressum, /<h1>Impressum<\/h1>\n<h2>Anbieter<\/h2>\n<p><a href="https:\/\/florianmousseau.com">Florian Mousseau<\/a>\. Kontakt: <a href="mailto:contact@florianmousseau.com">contact@florianmousseau.com<\/a><\/p>/);
	assert.match(impressum, /<h2>Hosting<\/h2>\n<p>OVH SAS, 2 rue Kellermann, 59100 Roubaix, Frankreich\.<\/p>/);
	assert.doesNotMatch(impressum, /Cloudflare|San Francisco|USA/);
	assert.match(impressum, /Keine Cookies\./);
	assert.match(impressum, /<h2>Quellcode<\/h2>/);
	assert.match(impressum, /<link rel="canonical" href="https:\/\/datumszeuge.de\/impressum">\n<meta/);
	for (const html of de.filter((h) => h !== impressum)) assert.doesNotMatch(html, /Florian Mousseau/);
});

test('les pages equivalentes se lient par hreflang dans les deux sens, x-default sur le francais', () => {
	const paires = { accueil: [pageAccueil([tour]), de[0]], dater: [pageDeposer(), de[1]], verifier: [pageVerifier(), de[2]], journal: [pageJournal([tour]), de[3]], documentation: [pageDocumentation(), de[5]] };
	for (const [acte, [fr, all]] of Object.entries(paires)) {
		const chemins = cheminsDe(acte);
		const liens = `<link rel="alternate" hreflang="fr" href="https://temoinpublic.fr${chemins.fr}">\n<link rel="alternate" hreflang="de" href="https://datumszeuge.de${chemins.de}">\n<link rel="alternate" hreflang="x-default" href="https://temoinpublic.fr${chemins.fr}">`;
		assert.ok(fr.includes(`<link rel="canonical" href="https://temoinpublic.fr${chemins.fr}">\n${liens}\n<meta`), `${acte} fr`);
		assert.ok(all.includes(`<link rel="canonical" href="https://datumszeuge.de${chemins.de}">\n${liens}\n<meta`), `${acte} de`);
	}
	assert.deepEqual(cheminsDe('dater'), { fr: ACTES.dater.chemin, de: '/datieren' });
	for (const html of [pageMentions(), pageMentions('de'), pageIntrouvable(), pageIntrouvable('de'), pageRecuInconnu('de')]) assert.ok(!html.includes('hreflang'), 'une page sans equivalent ne se lie pas');
});

test('le plan du site, les robots et llms.txt de chaque edition parlent de son seul domaine', () => {
	const plan = planDuSite(planDe('de'), 'de');
	assert.equal(plan.match(/<loc>/g).length, 12);
	assert.match(plan, /<loc>https:\/\/datumszeuge.de\/impressum<\/loc>/);
	assert.ok(!plan.includes('temoinpublic'));
	assert.match(robots('de'), /^User-agent: \*\nAllow: \/\nDisallow: \/index\/\n\nSitemap: https:\/\/datumszeuge.de\/sitemap.xml\n$/);
	assert.match(robots(), /Sitemap: https:\/\/temoinpublic.fr\/sitemap.xml/);
	assert.match(EDITIONS.de.llms, /^# Datumszeuge\n/);
	assert.match(EDITIONS.de.llms, /\n## Zitieren\n\nDatierung: Datumszeuge \(datumszeuge.de\), öffentliches Datumsregister, Stand \[Datum der Datierung laut Beleg, UTC\]\.\n$/);
	assert.ok(!EDITIONS.de.llms.includes('temoinpublic.fr') && !EDITIONS.de.llms.includes('/acte'));
	for (const adresse of ['https://datumszeuge.de/datieren', 'https://datumszeuge.de/pruefen', 'https://datumszeuge.de/register', 'https://datumszeuge.de/dokumentation']) assert.ok(EDITIONS.de.llms.includes(adresse), adresse);
	assert.match(EDITIONS.fr.llms, /https:\/\/temoinpublic.fr\/acte/);
	assert.match(EDITIONS.de.llms, /https:\/\/datumszeuge.de\/beweiswert/);
});

test('la valeur de preuve en allemand cite la ZPO et eIDAS, et dit l horodatage qualifie a la date allemande', () => {
	const [sans, avec] = de.slice(-7, -5);
	assert.match(sans, /<h1>Beweiswert<\/h1>\n<h2>Was ein Beleg beweist<\/h2>/);
	assert.match(sans, /Jeden Tag wird das Datum in Bitcoin verankert\.<\/li>/);
	assert.match(avec, /Vertrauensliste \(eIDAS\) mit einem Zeitstempel versehen, seit dem 12\.10\.2026|seit dem 12\.10\.2026 von einem Anbieter/);
	assert.match(sans, /href="https:\/\/www.gesetze-im-internet.de\/zpo\/__286.html">§ 286 ZPO<\/a>/);
	assert.match(sans, /Öffentliches Git-Repository<\/a>/);
	assert.match(sans, /<\/code> und <code>ots verify/);
	assert.match(pageDocumentation('de'), /<h2>Agenten<\/h2>[\s\S]*POST \/mcp/);
	assert.match(pageDocumentation(), /Service-Public.fr<\/a> \(DILA\), <a href="https:\/\/www.etalab.gouv.fr\/licence-ouverte-open-licence\/">Licence Ouverte 2.0<\/a>/);
	for (const html of de) assert.match(html, /<a href="\/beweiswert">Beweiswert<\/a> <a href="\/dokumentation">/);
});

test("la decision par l'hote : le francais suit son cours, l'allemand se lit dans dist/de, le reste renvoie ou manque", () => {
	assert.deepEqual(decider('https://temoinpublic.fr/deposer'), { action: 'suivant' });
	assert.deepEqual(decider('https://temoinpublic.fr/impressum'), { action: 'suivant' });
	assert.deepEqual(decider('https://temoinpublic.fr/de/datieren'), { action: 'introuvable', langue: 'fr' });
	assert.deepEqual(decider('https://datumszeuge.de/de'), { action: 'introuvable', langue: 'de' });
	assert.deepEqual(decider('https://datumszeuge.de/'), { action: 'statique', chemin: '/de/' });
	assert.deepEqual(decider('https://datumszeuge.de/datieren'), { action: 'statique', chemin: '/de/datieren' });
	assert.deepEqual(decider('https://de.empreintes.pages.dev/impressum'), { action: 'statique', chemin: '/de/impressum' });
	for (const f of ['/sitemap.xml', '/robots.txt', '/llms.txt']) assert.deepEqual(decider(`https://datumszeuge.de${f}`), { action: 'statique', chemin: `/de${f}` }, f);
	for (const c of ['/api/depots', '/recu/abc', '/editeur/abc', '/depots/2026-10-12.jsonl', '/health']) assert.deepEqual(decider(`https://datumszeuge.de${c}`), { action: 'suivant' }, c);
	assert.deepEqual(decider('https://datumszeuge.de/healthy'), { action: 'introuvable', langue: 'de' });
	assert.deepEqual(decider('https://datumszeuge.de/acte'), { action: 'redirection', vers: 'https://temoinpublic.fr/acte' });
	assert.deepEqual(decider('https://datumszeuge.de/collectivite/17133?x=1'), { action: 'redirection', vers: 'https://temoinpublic.fr/collectivite/17133?x=1' });
	assert.deepEqual(decider('https://datumszeuge.de/mentions-legales'), { action: 'redirection', vers: 'https://temoinpublic.fr/mentions-legales' });
	assert.deepEqual(decider('https://www.datumszeuge.de/datieren?a=1'), { action: 'redirection', vers: 'https://datumszeuge.de/datieren?a=1' });
	for (const c of ['/deposer', '/verifier', '/journal', '/documentation', '/style.css', '/index.html']) assert.deepEqual(decider(`https://datumszeuge.de${c}`), { action: 'introuvable', langue: 'de' }, c);
	assert.equal(pageAllemande('/pruefen'), '/de/pruefen');
	assert.equal(pageAllemande('/verifier'), null);
	assert.deepEqual(FONCTIONS, ['/api/', '/recu/', '/editeur/', '/depots/', '/health', '/mcp']);
	assert.deepEqual(decider('https://datumszeuge.de/mcp'), { action: 'suivant' });
	assert.ok(horsIndex('https://de.empreintes.pages.dev/') && !horsIndex('https://datumszeuge.de/'));
});

test('la Function intermediaire sert les actifs, les 404 de la bonne langue, les renvois, et ne laisse pas indexer pages.dev', async () => {
	const actifs = { '/de/': 'accueil de', '/de/datieren': 'datieren', '/de/404.html': '404 de', '/404': '404 fr' };
	const env = { ASSETS: { fetch: async (url) => (url.pathname in actifs ? new Response(actifs[url.pathname], { headers: { 'content-type': 'text/html', 'x-test': 'actif' } }) : new Response('', { status: 404 })) } };
	const next = async () => new Response('suite', { status: 200 });
	const servir = (url) => onRequest({ request: new Request(url), env, next });
	let r = await servir('https://datumszeuge.de/');
	assert.equal(r.status, 200);
	assert.equal(await r.text(), 'accueil de');
	assert.equal(r.headers.get('x-test'), 'actif');
	assert.equal(r.headers.get('x-robots-tag'), null);
	r = await servir('https://datumszeuge.de/datieren');
	assert.equal(await r.text(), 'datieren');
	r = await servir('https://datumszeuge.de/nulle-part');
	assert.equal(r.status, 404);
	assert.equal(await r.text(), '404 de', 'le .html en second quand le chemin propre ne repond pas');
	r = await servir('https://temoinpublic.fr/de/datieren');
	assert.equal(r.status, 404);
	assert.equal(await r.text(), '404 fr');
	r = await servir('https://datumszeuge.de/acte');
	assert.equal(r.status, 301);
	assert.equal(r.headers.get('location'), 'https://temoinpublic.fr/acte');
	r = await servir('https://temoinpublic.fr/deposer');
	assert.equal(await r.text(), 'suite');
	assert.equal(r.headers.get('x-robots-tag'), null);
	r = await servir('https://de.empreintes.pages.dev/datieren');
	assert.equal(r.headers.get('x-robots-tag'), 'noindex');
	r = await servir('https://empreintes.pages.dev/deposer');
	assert.equal(await r.text(), 'suite');
	assert.equal(r.headers.get('x-robots-tag'), 'noindex');
	r = await servir('https://www.datumszeuge.de/');
	assert.equal(r.status, 301);
	assert.equal(r.headers.get('x-robots-tag'), null);
	const perdu = await onRequest({ request: new Request('https://datumszeuge.de/pruefen'), env: { ASSETS: { fetch: async () => new Response('', { status: 500 }) } }, next });
	assert.equal(perdu.status, 500, "un actif qui manque ne se maquille pas en page");
});

test('les scripts du navigateur lisent leurs textes dans la langue de la page', () => {
	const textes = readFileSync(new URL('../public/textes.js', import.meta.url), 'utf8');
	assert.match(textes, /export const T = vue\(TEXTES, document\.documentElement\.lang === 'de' \? 'de' : 'fr'\);/);
	for (const script of ['deposer.js', 'verifier.js', 'recu.js', 'editeur.js', 'fichier.js']) {
		const source = readFileSync(new URL(`../public/${script}`, import.meta.url), 'utf8');
		assert.match(source, /import \{ T \} from '\/textes.js';/, script);
		assert.ok(!source.includes('temoinpublic.fr'), `${script} ne fixe pas le domaine`);
	}
	assert.match(textes, /hote: \{ fr: 'temoinpublic.fr', de: 'datumszeuge.de' \}/);
	assert.ok(!textes.includes('\u00A0'), "l'insecable ne s'ecrit jamais en clair");
	const routes = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8'));
	assert.deepEqual(routes.include, ['/*']);
	for (const partage of ['/style.css', '/deposer.js', '/textes.js', '/chaine.mjs', '/empreintes/*', '/index/*', '/annuaire/*', '/tours.json', '/openapi.json']) assert.ok(routes.exclude.includes(partage), partage);
});

test('les textes du registre existent en allemand, a leurs adresses, lies a leur equivalent francais', () => {
	const [pratiques, conditions, roles] = de.slice(-5, -2);
	assert.match(pratiques, /<h1>Praktiken des Registers<\/h1>\n<p class="sous-titre">Version 1, 14\.10\.2026<\/p>/);
	assert.match(pratiques, /hreflang="fr" href="https:\/\/temoinpublic.fr\/pratiques"/);
	assert.match(conditions, /Anbieter ist der im <a href="\/impressum">Impressum<\/a> genannte\./);
	assert.match(roles, /<h2>Keine Schulung eingetragen<\/h2>/);
	for (const c of ['/praktiken', '/bedingungen', '/rollen']) assert.equal(pageAllemande(c), `/de${c}`);
	assert.match(pageDocumentation('de'), /<h2>Texte des Registers<\/h2>\n<ul>\n<li><a href="\/praktiken">Praktiken des Registers<\/a><\/li>/);
});

test('les textes de l archivage existent en allemand, a leurs adresses, lies a leur equivalent francais', () => {
	const [archiv, bedingungen] = de.slice(-2);
	assert.match(archiv, /<h1>Praktiken des Archivs<\/h1>\n<p class="sous-titre">Version 1, 15\.10\.2026<\/p>/);
	assert.match(archiv, /hreflang="fr" href="https:\/\/temoinpublic.fr\/archivage"/);
	assert.match(archiv, /Die Vertrauensrollen sind die des Registers: <a href="\/rollen">Vertrauensrollen<\/a>\./);
	assert.match(bedingungen, /Anbieter ist der im <a href="\/impressum">Impressum<\/a> genannte\./);
	assert.doesNotMatch(archiv + bedingungen, /\u00A0[:;]/, 'pas d insecable francaise dans l edition allemande');
	for (const c of ['/archiv', '/archivbedingungen']) assert.equal(pageAllemande(c), `/de${c}`);
	assert.match(pageDocumentation('de'), /<h2>Texte des Archivs<\/h2>\n<ul>\n<li><a href="\/archiv">Praktiken des Archivs<\/a><\/li>/);
});

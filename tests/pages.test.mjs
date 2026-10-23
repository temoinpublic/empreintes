import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTES, SCEAU, pageAdresse, pageAdresses, TEXTES_DU_REGISTRE, TEXTES_DE_L_ARCHIVAGE, pageRoles, pageSections, DONNEES_STRUCTUREES, PLAN, planDuSite, datesDuPlan, pageMentions, pageActe, pageCollectivite, pageCommunes, pageDepartement, pageEditeur, pageDocumentation, pageIntrouvable, ancrageDe, dateHeure, echapper, pageAccueil, pageDeposer, pageJournal, pageVerifier, pagePreuve, premierHorodatageQualifie, premiereSignaturePostQuantique, COPIES } from '../src/pages.mjs';

const t = { id: '20261012T101314Z', instant: '2026-10-12T10:13:14Z', objets: 2018, racine: 'f'.repeat(64), ots: 'bitcoin', bloc: 971045, fichiers: ['20261012T101314Z.json', '20261012T101314Z.racine.ots'] };
const pages = [pageJournal([t, { ...t, id: '20261012T121314Z', ots: 'calendrier', bloc: null }]), pageVerifier(), pageJournal([]), pageDeposer(), pageAccueil([t]), pageAccueil([]), pageIntrouvable(), pageMentions(), pagePreuve([t]), pageActe(), pageDocumentation(), pageEditeur({ flux: { id: '0123456789abcdef', inscrit: '2026-10-12T00:00:00Z', retire: null }, total: 1, versions: [{ article: 'e'.repeat(64), jour: '2026-10-12', place: 4, sha256: 'c'.repeat(64), recu: 'd'.repeat(64) }] }), pageCollectivite({ code: '17133', commune: { nom: 'Cravans', insee: '17133', siren: '211701339' }, serie: { total: 1, actes: [{ jour: '2026-10-12', place: 3, sha256: 'c'.repeat(64), recu: 'd'.repeat(64), nature: 'deliberation' }] }, departement: '17' }), pageCommunes({ departements: [{ code: '17', nom: 'Charente-Maritime', communes: 1, actes: 2 }] }), pageDepartement({ code: '17', nom: 'Charente-Maritime', communes: [{ insee: '17133', nom: 'Cravans', actes: 2 }] }), pageSections('pratiques'), pageSections('conditions'), pageRoles(), pageSections('archivage'), pageSections('conditionsArchivage'), pageAdresse({ acte: { collectivite: '17133', jour: '2026-10-12', place: 3, nature: 'deliberation', sha256: 'c'.repeat(64), recu: 'd'.repeat(64), objet: 'Budget primitif', url: 'https://www.cravans.fr/pv.pdf' }, commune: { nom: 'Cravans', insee: '17133', siren: null }, versions: [{ collectivite: '17133', jour: '2026-10-12', place: 3, nature: 'deliberation', sha256: 'c'.repeat(64), recu: 'd'.repeat(64) }] }), pageAdresses([{ collectivite: '17133', jour: '2026-10-12', nature: 'arrete', sha256: 'c'.repeat(64) }])];
const texteDe = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');
// « certifie », « certification » se refusent ; « certificat », le mot d'une signature, non.
const CERTIFIE = /certifi(?!cats?\b)/i;

test('aucun signe double ne suit une espace ordinaire dans le texte affiche en francais', () => {
	for (const html of pages) {
		const texte = texteDe(html);
		assert.ok(texte.length > 40, 'le detecteur lit du texte');
		assert.deepEqual(texte.match(/[^\S\u00A0][:;?!»]/g), null);
	}
	assert.match(texteDe('<p>a :</p>'), / :/, 'le detecteur voit une espace ordinaire');
});

test("l'editeur n'est nomme qu'aux mentions legales, et son nom y est un lien", () => {
	for (const html of pages.filter((html) => html !== pageMentions())) assert.doesNotMatch(html, /Florian Mousseau/);
	assert.match(pageMentions(), /<a href="https:\/\/florianmousseau.com">Florian Mousseau<\/a>/);
	assert.equal(DONNEES_STRUCTUREES.author, undefined);
});

test("le journal affiche le dernier tour, son ancrage et ses fichiers", () => {
	assert.match(pages[0], /Bitcoin, bloc 971045/);
	assert.match(pages[0], /en cours d’inscription dans Bitcoin/);
	assert.match(pages[0], /href="\/empreintes\/20261012T101314Z.racine.ots">.ots</);
	assert.match(pages[2], /Aucun tour publié/);
});

test('les dates, les ancrages et les textes se rendent sans surprise', () => {
	assert.equal(dateHeure('2026-10-12T10:13:14Z'), '12/10/2026 10:13\u00A0UTC');
	assert.equal(ancrageDe({ ots: 'erreur' }), 'erreur');
	assert.equal(ancrageDe({ ots: null }), 'aucun');
	assert.equal(echapper('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test("l'accueil dit a quoi sert le service et mene aux deux gestes, sans le vocabulaire du journal", () => {
	const accueil = pages[4];
	assert.match(accueil, /<h1>Prouvez qu’un document existait à une date, sans modification.<\/h1>/);
	assert.match(accueil, /href="\/deposer"( aria-current="page")?>Dater</);
	assert.match(accueil, /id="zone"/, "l'accueil porte la zone de depot");
	assert.match(accueil, /<script type="module" src="\/deposer.js">/);
	assert.match(accueil, /2\u00A0018 dates enregistrées/);
	assert.match(accueil, /Un fichier déposé ne quitte jamais votre appareil/);
	assert.ok(!texteDe(accueil).includes('documents publics'));
	const texte = texteDe(accueil.slice(accueil.indexOf('<main>')));
	for (const mot of ['racine', 'tour', 'ancrage', 'bloc', '.ots', 'miroir', 'SHA']) assert.ok(!texte.includes(mot), mot);
});

test('un acte porte un seul nom sur toutes les pages, et le menu garde trois gestes et les communes', () => {
	for (const html of pages) {
		for (const acte of Object.values(ACTES)) {
			for (const m of html.matchAll(new RegExp(`href="${acte.chemin}"[^>]*>([^<]+)<`, 'g'))) assert.ok([acte.nom, acte.titre].includes(m[1]), m[1]);
		}
		const menu = html.match(/<nav aria-label="Principal">(.*)<\/nav>/)[1];
		assert.deepEqual([...menu.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]), ['Dater', 'Vérifier', 'Communes', 'Registre']);
	}
	assert.match(pages[1], /<a href="\/verifier" aria-current="page">Vérifier<\/a>/);
});

test('la marque porte son sceau, le meme que l icone', () => {
	const icone = readFileSync(new URL('../public/icone.svg', import.meta.url), 'utf8');
	for (const html of pages) assert.ok(html.includes(SCEAU));
	assert.ok(icone.includes(SCEAU.replace(/<svg[^>]*>/, '').replace('</svg>', '')), "l'icone dessine le sceau");
});

test('le choix du document est une zone de depot en francais, le lien a cote, l empreinte repliee', () => {
	for (const html of [pages[1], pages[3], pages[4]]) {
		assert.match(html, /<input type="file" id="fichier" class="masque">\n<label class="zone" for="fichier" id="zone">/);
		assert.match(html, /<span class="zone-titre">Déposez le document( à dater| ou son reçu)<\/span>/);
	}
	assert.match(pages[1], /<details>\n<summary>Pas le fichier sous la main\u00A0\?<\/summary>/);
	assert.match(pages[3], /<details>\n<summary>Une empreinte SHA-256\u00A0\?<\/summary>/);
	assert.ok(!pages[4].includes('id="empreinte"'), "l'accueil ne demande pas d'empreinte");
});

test("le registre s'appelle Registre dans les liens et Registre des dates en titre, et dater dit ce qu'on recoit et ce qui est publie", () => {
	assert.equal(ACTES.journal.nom, 'Registre');
	assert.equal(ACTES.journal.titre, 'Registre des dates');
	for (const html of pages) assert.ok(!html.includes('Journal public'));
	assert.match(pages[0], /<h1>Registre des dates<\/h1>\n<p class="sous-titre">La liste publique des dates, sans les documents.<\/p>/);
	const dater = pages[3];
	assert.ok(dater.indexOf('reçu à imprimer ou à télécharger') > dater.indexOf('Dater ce document</button>'), 'la promesse suit le bouton, au plus pres');
	assert.match(dater, /Un fichier déposé ne quitte jamais votre appareil/);
	assert.ok(!/qualifi/i.test(pages.join('')), 'le mot qualifie n apparait nulle part');
});

test('la documentation nomme chaque adresse servie et chaque formule', () => {
	const doc = pageDocumentation();
	for (const a of ['POST /api/depots', 'POST /api/flux', 'DELETE /api/flux/&lt;id&gt;', 'GET /depots/&lt;jour&gt;.jsonl', 'GET /api/recus/&lt;id&gt;', 'GET /api/depots/&lt;sha256&gt;', 'GET /api/bilan', 'GET /collectivite/&lt;INSEE&gt;', 'GET /health', 'depots:&lt;n&gt;', 'ots verify']) assert.ok(doc.includes(a), a);
	for (const html of pages) assert.match(html, /<a href="\/documentation">Documentation<\/a>/);
});

test('aucun gabarit non interpole ne s affiche', () => {
	for (const html of pages) assert.ok(!html.includes('${'), 'un ${...} est reste dans une chaine simple');
});

test("dater un acte demande l'adresse, la collectivite et la nature, et ne dit que ce que le recu prouve", () => {
	const html = pageActe();
	assert.equal(ACTES.acte.nom, 'Acte de collectivité');
	assert.equal(ACTES.acte.titre, 'Dater la mise en ligne d’un acte');
	assert.match(html, /<h1>Dater la mise en ligne d’un acte<\/h1>/);
	for (const id of ['url', 'collectivite', 'nature', 'objet']) assert.match(html, new RegExp(`id="${id}"`), id);
	assert.match(html, /<option value="deliberation">Délibération<\/option><option value="arrete">Arrêté<\/option><option value="decision">Décision<\/option>/);
	assert.match(html, /ce fichier était en ligne à cette adresse à cet instant/);
	assert.ok(html.indexOf('reçu à imprimer ou à télécharger') > html.indexOf('Dater cet acte</button>'));
	assert.match(html, /Lien du fichier de l’acte \(le PDF\)/);
	for (const dater of [pageDeposer(), pages[4]]) {
		assert.match(dater, /<label for="url">Le lien d’un document en ligne<\/label>/, 'le lien est au premier ecran, pas replie');
		assert.match(dater, /<div id="acte" class="acte" hidden>/, "un lien sur le site d'une commune propose l'acte");
		assert.match(dater, /<select id="nature"><option value="">Non, un autre document<\/option><option value="deliberation">/);
		assert.match(dater, /<input type="hidden" id="collectivite">/);
		assert.match(dater, /<label for="objet">Objet de l’acte<\/label>\n<input type="text" id="objet" maxlength="200" autocomplete="off">/);
	}
	assert.match(html, /<a href="\/deposer" aria-current="page">Dater<\/a>/, 'dater un acte reste sous Dater dans le menu');
	assert.doesNotMatch(texteDe(html) + texteDe(pageDeposer()), /celle du dépôt/, 'un mot lu de travers par une secretaire de mairie');
	assert.ok(!/servi/.test(texteDe(html) + readFileSync(new URL('../public/deposer.js', import.meta.url), 'utf8')), 'un mot de tous les jours');
	assert.ok(!html.includes('id="fichier"'), 'un acte ne se date que par son adresse');
	assert.match(html, /<label for="objet">Objet de l’acte<\/label>\n<input type="text" id="objet" maxlength="200" autocomplete="off" required>/, "un acte se date avec son objet");
	for (const page of pages) assert.doesNotMatch(page, /<a href="\/acte">/, 'un seul chemin vers un acte hors de Dater : le bouton de la commune');
	const tout = [...pages, readFileSync(new URL('../public/deposer.js', import.meta.url), 'utf8')].join('');
	for (const interdit of [/vaut publication/i, CERTIFIE, /qualifi/i]) assert.doesNotMatch(tout, interdit);
});

test('chaque page porte la marque, son adresse canonique et ses balises de partage', () => {
	for (const html of pages) {
		assert.match(html, /<title>[^<]+ \| Témoin public<\/title>/);
		assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\//);
		assert.match(html, /<meta property="og:title" content="[^"]+ \| Témoin public">/);
	}
});

test("seul l'accueil decrit le service en JSON-LD, gratuit et sans balise fermante possible", () => {
	// La page d'un acte a son adresse decrit l'acte (`Legislation`, D-205), jamais le service.
	assert.equal(pages.filter((html) => html.includes('application/ld+json') && !html.includes('"@type":"Legislation"')).length, 2);
	const bloc = pages[4].match(/<script type="application\/ld\+json">(.*)<\/script>/)[1];
	assert.deepEqual(JSON.parse(bloc), DONNEES_STRUCTUREES);
	assert.equal(DONNEES_STRUCTUREES.offers.price, '0');
});

test('le plan du site liste chaque page statique sur le domaine', () => {
	const plan = planDuSite();
	assert.equal(plan.match(/<loc>/g).length, PLAN.length);
	assert.match(plan, /<loc>https:\/\/temoinpublic.fr\/mentions-legales<\/loc>/);
});

test('le plan du site date l accueil et le registre au dernier tour, ce qui a disparu a sa derniere entree, et rien d autre', () => {
	const tours = [{ instant: '2026-10-20T08:00:00Z' }, { instant: '2026-10-21T09:00:00Z' }];
	const entrees = [
		{ date: '2026-10-19', site: 'a.fr' },
		{ date: '2026-10-18', site: 'b.fr' },
		{ date: '2026-10-17', site: 'a.fr' }
	];
	const dates = datesDuPlan(tours, entrees);
	assert.deepEqual(dates, { '/': '2026-10-21T09:00:00Z', [ACTES.journal.chemin]: '2026-10-21T09:00:00Z', '/disparus': '2026-10-19', '/disparus/a-fr': '2026-10-19', '/disparus/b-fr': '2026-10-18' });
	const plan = planDuSite(PLAN, 'fr', dates);
	assert.match(plan, /<loc>https:\/\/temoinpublic.fr\/<\/loc><lastmod>2026-10-21T09:00:00Z<\/lastmod><\/url>/);
	assert.match(plan, /<loc>https:\/\/temoinpublic.fr\/mentions-legales<\/loc><\/url>/);
	assert.equal(plan.match(/<lastmod>/g).length, 2);
	assert.deepEqual(datesDuPlan([], entrees, 'de'), {});
	assert.deepEqual(datesDuPlan(tours, [], 'de'), { '/': '2026-10-21T09:00:00Z', '/register': '2026-10-21T09:00:00Z' });
});

test("les mentions legales nomment l'editeur, l'hebergeur et ce qui est garde", () => {
	const html = pageMentions();
	assert.match(html, /<h2>Hébergeur<\/h2>\n<p>OVH SAS, 2 rue Kellermann, 59100 Roubaix, France\.<\/p>/);
	assert.doesNotMatch(html, /Cloudflare|San Francisco|États-Unis/);
	assert.match(html, /mailto:contact@florianmousseau.com/);
	assert.match(html, /Aucun cookie/);
});

test('la valeur de preuve dit ce qui tient dans trente ans, et la signature post-quantique seulement depuis le premier tour qui en porte (D-201)', () => {
	const slh = { ...t, id: '20261016T161252Z', instant: '2026-10-16T16:12:52Z', fichiers: ['20261016T161252Z.racine.slh'] };
	assert.equal(premiereSignaturePostQuantique([t]), null);
	assert.equal(premiereSignaturePostQuantique([t, slh]), '16/10/2026');
	assert.equal(premiereSignaturePostQuantique([t, slh], 'de'), '16.10.2026');
	const sans = pagePreuve([t]);
	assert.match(sans, /<h2>Dans trente ans<\/h2>/);
	assert.match(sans, /<h2>Dans trente ans<\/h2>\n<ul>\n<li>Le registre est une chaîne d’empreintes SHA-256/, 'une liste sous le titre, aucun paragraphe entre les deux');
	assert.doesNotMatch(sans, /SLH-DSA/);
	const avec = pagePreuve([t, slh]);
	assert.match(avec, /Depuis le 16\/10\/2026, chaque racine est aussi signée en SLH-DSA \(FIPS 205\)/);
	assert.match(avec, /La page <a href="\/verifier">Vérifier<\/a> relit les deux signatures/);
	const de = pagePreuve([t, slh], undefined, 'de');
	assert.match(de, /<h2>In dreißig Jahren<\/h2>/);
	assert.match(de, /mit SLH-DSA \(FIPS 205\) signiert/);
	assert.match(de, /href="\/pruefen"/);
	// La section vient avant « Si ce site disparait », apres les textes.
	assert.ok(avec.indexOf('Dans trente ans') > avec.indexOf('<h2>Textes</h2>'));
	assert.ok(avec.indexOf('Dans trente ans') < avec.indexOf('Si ce site disparaît'));
});

test('la valeur de preuve dit l’horodatage qualifie seulement quand un tour en porte, et nomme chaque copie', () => {
	const tsr = { ...t, id: '20261020T101314Z', instant: '2026-10-20T10:13:14Z', fichiers: ['20261020T101314Z.racine.tsr'] };
	assert.equal(premierHorodatageQualifie([t]), null);
	assert.equal(premierHorodatageQualifie([t, tsr]), '20/10/2026');
	assert.doesNotMatch(pagePreuve([t]), /liste de confiance/);
	assert.match(pagePreuve([t, tsr]), /liste de confiance européenne \(eIDAS\), depuis le 20\/10\/2026/);
	for (const c of COPIES) assert.ok(pagePreuve([]).includes(`href="${c.adresse}"`), c.nom);
	assert.match(pageDocumentation(), /POST \/mcp/);
	assert.ok(PLAN.includes('/preuve'));
});

test("le recu imprime tient sur une page : l'impression rend au corps sa hauteur naturelle", () => {
	const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
	const impression = css.slice(css.indexOf('@media print'));
	assert.match(impression, /html, body \{ min-height: 0; height: auto; \}/);
	assert.match(impression, /body \{ display: block;/);
	assert.match(impression, /@page \{ margin: 12mm; \}/);
});

test('les textes du registre : une page chacun, versionnee, liee depuis la documentation, et vraie aujourd hui', () => {
	const textes = [pageSections('pratiques'), pageSections('conditions'), pageRoles()];
	const doc = pageDocumentation();
	for (const [i, acte] of TEXTES_DU_REGISTRE.entries()) {
		assert.ok(PLAN.includes(ACTES[acte].chemin), acte);
		assert.ok(doc.includes(`<li><a href="${ACTES[acte].chemin}">${ACTES[acte].nom}</a></li>`), acte);
		assert.match(textes[i], new RegExp(`<h1>${ACTES[acte].titre}</h1>\n<p class="sous-titre">Version 1, 14/10/2026</p>`));
	}
	const tout = texteDe(textes.join(''));
	for (const interdit of [/qualifi/i, /cachet/i, CERTIFIE, /palier/i, /cockpit/i, /payant/i, /D-1\d\d/]) assert.doesNotMatch(tout, interdit);
	assert.match(textes[0], /la signature du journal, un JWS compact ES256/);
	assert.match(textes[1], /Gratuit, sans compte\. Le prestataire est l’éditeur nommé aux <a href="\/mentions-legales">Mentions légales<\/a>\./);
	assert.match(textes[2], /<td><strong>Audit interne<\/strong><\/td>/);
	assert.match(textes[2], /Les quatre rôles sont tenus par l’éditeur nommé aux <a href="\/mentions-legales">Mentions légales<\/a>, depuis le 11\/10\/2026\./);
	assert.match(textes[2], /<h2>Aucune formation enregistrée<\/h2>/);
});

test('chaque formulaire de depot montre les conditions avant de rendre un recu', () => {
	const formulaires = [pageAccueil([t]), pageDeposer(), pageActe(), pageDeposer('de'), pageAccueil([t], 'de')];
	for (const html of formulaires) {
		const formulaire = html.slice(html.indexOf('<form id="formulaire"'), html.indexOf('</form>'));
		assert.ok(formulaire.length > 0);
		assert.match(formulaire, /<p class="recoit">(En datant, vous acceptez les <a href="\/conditions">Conditions générales<\/a>|Mit dem Datieren akzeptieren Sie die <a href="\/bedingungen">Nutzungsbedingungen<\/a>)\.<\/p>\n$/);
	}
});

test('les textes de l archivage : une page chacun, versionnee, liee depuis la documentation, et vraie aujourd hui', () => {
	const textes = TEXTES_DE_L_ARCHIVAGE.map((acte) => pageSections(acte));
	const doc = pageDocumentation();
	assert.match(doc, /<h2>Textes de l’archivage<\/h2>\n<ul>\n<li><a href="\/archivage">Pratiques de l’archivage<\/a><\/li>\n<li><a href="\/conditions-archivage">Conditions de l’archivage<\/a><\/li>/);
	for (const [i, acte] of TEXTES_DE_L_ARCHIVAGE.entries()) {
		assert.ok(PLAN.includes(ACTES[acte].chemin), acte);
		assert.match(textes[i], new RegExp(`<h1>${ACTES[acte].titre}</h1>\n<p class="sous-titre">Version 1, 15/10/2026</p>`));
	}
	assert.match(pageSections('pratiques'), /Version 1, 14\/10\/2026/, 'les textes du registre gardent leur version');
	const tout = texteDe(textes.join(''));
	for (const interdit of [/qualifi/i, /cachet/i, /certifi/i, /palier/i, /cockpit/i, /payant/i, /D-1\d\d/, /Hetzner/i, /\/var\//, /Box/]) assert.doesNotMatch(tout, interdit);
	assert.match(textes[0], /Les rôles de confiance sont ceux du registre\u00A0: <a href="\/roles">Rôles de confiance<\/a>\./);
	assert.match(textes[0], /Elle se relit sans le service \(<a href="\/documentation">Documentation<\/a>\)\./);
	assert.match(textes[1], /Le prestataire est l’éditeur nommé aux <a href="\/mentions-legales">Mentions légales<\/a>\./);
	assert.match(textes[1], /ne jamais republier l’archive/);
});

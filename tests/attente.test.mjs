import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { OFFRES, PLAFOND_DU_JOUR, PROFILS_DES_OFFRES, comptesDAttente, inscrire, lireInscription, offreConnue } from '../src/attente.mjs';
import { CHEMIN_OFFRE_DRH, CHEMIN_OFFRE_NOTAIRES, CHEMIN_OFFRE_ASSUREURS, CHEMIN_OFFRE_COMMUNES, CHEMIN_OFFRE_EDITEURS, CHEMIN_OFFRE_MARCHES, CHEMINS_DES_OFFRES, COUVERTURE, COUVERTURE_COMMUNES, COUVERTURE_DU_REGISTRE, ECHANTILLON, EXEMPLE_D_ACTE, EXEMPLE_DE_REGISTRE, OFFRES_DE_L_ACCUEIL, lienDeLAvis } from '../src/offre.mjs';
import { ISSUES_DE_L_ATTENTE, pageAccueil, pageAttente, pageOffreAssureurs, pageOffreNotaires, pageOffreDrh, pageOffreCommunes, pageOffreEditeurs, pageOffreMarches } from '../src/pages.mjs';
import { decider } from '../src/hote.mjs';
import { onRequestPost } from '../functions/api/attente.js';
import { onRequestGet as sonde } from '../functions/health.js';

const texteDe = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');
const envoyer = (env, champs) => onRequestPost({ request: new Request('https://temoinpublic.fr/api/attente', { method: 'POST', body: new URLSearchParams(champs) }), env });
const lignes = (db) => db.sqlite.prepare('SELECT offre, adresse, profil, jour FROM attente ORDER BY adresse').all();

test("une inscription garde l'adresse en minuscules, l'offre et le profil, rien d'autre", () => {
	assert.deepEqual(lireInscription({ offre: 'marches-publics', adresse: '  Achats@Ville-Exemple.FR ', profil: 'acheteur' }), { offre: 'marches-publics', adresse: 'achats@ville-exemple.fr', profil: 'acheteur' });
	assert.equal(lireInscription({ offre: 'marches-publics', adresse: 'a@b.fr', profil: 'inconnu' }).profil, 'autre');
	assert.equal(lireInscription({ offre: 'marches-publics', adresse: 'a@b.fr' }).profil, 'autre');
	assert.deepEqual(Object.keys(PROFILS_DES_OFFRES['marches-publics']), ['entreprise', 'acheteur', 'autre']);
	assert.deepEqual(Object.keys(PROFILS_DES_OFFRES.communes), ['commune', 'prestataire', 'autre']);
	assert.deepEqual(OFFRES, ['marches-publics', 'communes', 'editeurs', 'assureurs', 'notaires', 'drh']);
	assert.deepEqual(Object.keys(CHEMINS_DES_OFFRES), OFFRES);
	// Un profil se juge dans la liste de son offre : celui d'une autre offre devient `autre`.
	assert.equal(lireInscription({ offre: 'communes', adresse: 'mairie@b.fr', profil: 'commune' }).profil, 'commune');
	assert.equal(lireInscription({ offre: 'communes', adresse: 'mairie@b.fr', profil: 'acheteur' }).profil, 'autre');
	assert.equal(offreConnue('communes'), 'communes');
	assert.equal(offreConnue('toString'), null);
	assert.equal(offreConnue(undefined), null);
});

test("une adresse illisible, une offre inconnue ou un champ cache rempli ne s'inscrivent pas", () => {
	for (const adresse of ['', 'sans-arobase.fr', 'a@b', 'a b@c.fr', '<a@b.fr>', `${'a'.repeat(250)}@b.fr`, undefined]) assert.deepEqual(lireInscription({ offre: 'marches-publics', adresse }), { refus: 'adresse' }, String(adresse));
	assert.deepEqual(lireInscription({ offre: 'autre-chose', adresse: 'a@b.fr' }), { refus: 'offre' });
	assert.deepEqual(lireInscription({ offre: 'marches-publics', adresse: 'a@b.fr', site: 'https://spam' }), { robot: true });
});

test('une adresse deja inscrite ne fait pas de seconde ligne, et la reponse est la meme', async () => {
	const db = baseDeTest();
	const ins = { offre: 'marches-publics', adresse: 'a@b.fr', profil: 'entreprise' };
	assert.equal(await inscrire(db, ins, '2026-10-16'), 'inscrit');
	assert.equal(await inscrire(db, { ...ins, profil: 'autre' }, '2026-10-17'), 'inscrit');
	assert.deepEqual(
		lignes(db).map((l) => ({ ...l })),
		[{ offre: 'marches-publics', adresse: 'a@b.fr', profil: 'entreprise', jour: '2026-10-16' }]
	);
	assert.deepEqual(await comptesDAttente(db), { 'marches-publics': 1, communes: 0, editeurs: 0, assureurs: 0, notaires: 0, drh: 0 });
	assert.deepEqual(await comptesDAttente(baseDeTest()), { 'marches-publics': 0, communes: 0, editeurs: 0, assureurs: 0, notaires: 0, drh: 0 });
});

test('au plafond du jour, une offre refuse les inscriptions jusqu’au lendemain', async () => {
	const db = baseDeTest();
	for (let i = 0; i < PLAFOND_DU_JOUR; i++) await inscrire(db, { offre: 'marches-publics', adresse: `a${i}@b.fr`, profil: 'autre' }, '2026-10-16');
	assert.equal(await inscrire(db, { offre: 'marches-publics', adresse: 'z@b.fr', profil: 'autre' }, '2026-10-16'), 'plafond');
	assert.equal(await inscrire(db, { offre: 'marches-publics', adresse: 'z@b.fr', profil: 'autre' }, '2026-10-17'), 'inscrit');
});

test('le formulaire envoye rend une page, sans script, et un robot recoit celle d’une personne', async () => {
	const db = baseDeTest();
	const ok = await envoyer({ DEPOTS: db }, { offre: 'marches-publics', adresse: 'a@b.fr', profil: 'entreprise' });
	assert.equal(ok.status, 200);
	assert.match(ok.headers.get('content-type'), /text\/html/);
	assert.equal(ok.headers.get('cache-control'), 'no-store');
	assert.match(await ok.text(), /<h1>Votre adresse est notée<\/h1>/);
	const mauvaise = await envoyer({ DEPOTS: db }, { offre: 'marches-publics', adresse: 'pas une adresse' });
	assert.equal(mauvaise.status, 400);
	assert.match(await mauvaise.text(), /Cette adresse ne se lit pas/);
	const robot = await envoyer({ DEPOTS: db }, { offre: 'marches-publics', adresse: 'robot@b.fr', site: 'x' });
	assert.equal(robot.status, 200);
	assert.equal(lignes(db).length, 1);
	const json = new Request('https://temoinpublic.fr/api/attente', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
	assert.equal((await onRequestPost({ request: json, env: { DEPOTS: db } })).status, 400);
	for (let i = 1; i < PLAFOND_DU_JOUR; i++) await envoyer({ DEPOTS: db }, { offre: 'marches-publics', adresse: `a${i}@b.fr` });
	assert.equal((await envoyer({ DEPOTS: db }, { offre: 'marches-publics', adresse: 'z@b.fr' })).status, 429);
});

test("chaque page de reponse dit l'issue et ne s'indexe pas", () => {
	for (const [issue, [titre]] of Object.entries(ISSUES_DE_L_ATTENTE)) {
		const html = pageAttente(issue);
		assert.match(html, /<meta name="robots" content="noindex">/);
		assert.ok(html.includes(`<h1>${titre}</h1>`), issue);
		assert.match(html, /href="\/marches-publics"/);
		assert.match(pageAttente(issue, 'communes'), /<a class="bouton" href="\/publicite-des-actes">Revenir à l’offre<\/a>/);
	}
});

test("la liste des communes s'inscrit a part, et sa reponse renvoie a son offre", async () => {
	const db = baseDeTest();
	const ok = await envoyer({ DEPOTS: db }, { offre: 'communes', adresse: 'Mairie@Commune.FR', profil: 'commune' });
	assert.equal(ok.status, 200);
	assert.match(await ok.text(), /href="\/publicite-des-actes">Revenir/);
	await envoyer({ DEPOTS: db }, { offre: 'marches-publics', adresse: 'mairie@commune.fr', profil: 'acheteur' });
	assert.deepEqual(
		lignes(db)
			.map(({ offre, adresse, profil }) => ({ offre, adresse, profil }))
			.sort((a, b) => a.offre.localeCompare(b.offre)),
		[
			{ offre: 'communes', adresse: 'mairie@commune.fr', profil: 'commune' },
			{ offre: 'marches-publics', adresse: 'mairie@commune.fr', profil: 'acheteur' }
		]
	);
	assert.deepEqual(await comptesDAttente(db), { 'marches-publics': 1, communes: 1, editeurs: 0, assureurs: 0, notaires: 0, drh: 0 });
	const mauvaise = await envoyer({ DEPOTS: db }, { offre: 'communes', adresse: 'pas une adresse' });
	assert.equal(mauvaise.status, 400);
	assert.match(await mauvaise.text(), /href="\/publicite-des-actes">Revenir/);
	const inconnue = await envoyer({ DEPOTS: db }, { offre: 'inconnue', adresse: 'a@b.fr' });
	assert.match(await inconnue.text(), /href="\/marches-publics">Revenir/);
});

test("la page de l'offre des communes ne dit aucun prix, porte le formulaire et le geste du jour", () => {
	const html = pageOffreCommunes();
	const texte = texteDe(html);
	for (const interdit of [/€/, /\beuros?\b/i, /tarif/i, /abonnement/i, /gratuit/i, /payant/i, /\bHT\b/, /qualifi/i, /certifi/i, /vaut publication/i]) assert.doesNotMatch(texte, interdit);
	assert.deepEqual(texte.match(/[^\S ][:;?!»%]/g), null, 'deux-points soudes');
	assert.deepEqual(texte.match(/«[^ ]/g), null, 'guillemet ouvrant soude');
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/publicite-des-actes">/);
	assert.match(html, /<input type="hidden" name="offre" value="communes">/);
	assert.match(html, /<input type="radio" name="profil" value="commune" checked> Commune ou intercommunalité/);
	assert.match(html, /<input type="radio" name="profil" value="prestataire"> Éditeur ou prestataire des collectivités/);
	assert.doesNotMatch(html, /value="entreprise"/);
	assert.doesNotMatch(html, /<script/);
	assert.ok(texte.includes(`Au 16/10/2026, 835 communes ont 10 006 actes datés`) || texte.includes('Au 16/10/2026, 835 communes ont 10 006 actes datés'), texte.slice(0, 3000));
	assert.ok(html.includes(`<a href="${EXEMPLE_D_ACTE.adresse}">Délibération, Amboise, en ligne le 15/10/2026</a>`));
	assert.match(EXEMPLE_D_ACTE.adresse, /^\/actes\/\d{5}\/\d{4}-\d{2}-\d{2}\/deliberation-[0-9a-f]{12}$/);
	assert.match(html, /<a class="bouton principal" href="\/acte">/);
	assert.match(html, /<a class="bouton" href="\/collectivite">Voir les communes<\/a>/);
	assert.equal(CHEMIN_OFFRE_COMMUNES, '/publicite-des-actes');
	assert.equal(COUVERTURE_COMMUNES.au, '2026-10-16');
	assert.deepEqual(decider('https://datumszeuge.de/publicite-des-actes'), { action: 'redirection', vers: 'https://temoinpublic.fr/publicite-des-actes' });
});

test("la page de l'offre ne dit aucun prix, montre l'echantillon et porte le formulaire", () => {
	const html = pageOffreMarches();
	const texte = texteDe(html);
	for (const interdit of [/€/, /\beuros?\b/i, /tarif/i, /abonnement/i, /gratuit/i, /payant/i, /\bHT\b/]) assert.doesNotMatch(texte, interdit);
	assert.deepEqual(texte.match(/[^\S ][:;?!»%]/g), null, 'deux-points et pour cent soudes');
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/marches-publics">/);
	assert.match(html, /<form method="post" action="\/api\/attente" class="carte">/);
	assert.match(html, /<input type="hidden" name="offre" value="marches-publics">/);
	assert.match(html, /<div hidden><label for="site">/);
	assert.doesNotMatch(html, /<script/);
	for (const c of ECHANTILLON) {
		assert.ok(html.includes(`<a href="${lienDeLAvis(c.boamp)}">BOAMP ${c.boamp}</a>`), c.boamp);
		assert.match(c.reglement, /^[0-9a-f]{64}$/);
		assert.match(c.criteres, /\.$/, 'une phrase');
	}
	assert.match(texte, /6 consultations prises au vol entre le 13\/10\/2026 et le 15\/10\/2026/);
	assert.ok(texte.includes(`il suit ${COUVERTURE.consultations} consultations`));
	assert.equal(CHEMIN_OFFRE_MARCHES, '/marches-publics');
	assert.equal(lienDeLAvis('26-98309'), 'https://www.boamp.fr/pages/avis/?q=idweb:26-98309');
});

test("l'offre n'existe qu'en francais : l'edition allemande y renvoie", () => {
	assert.deepEqual(decider('https://datumszeuge.de/marches-publics'), { action: 'redirection', vers: 'https://temoinpublic.fr/marches-publics' });
});

test('la sonde compte les adresses en attente, et reste a 200 sans base ou quand elle se tait', async () => {
	const assets = { fetch: async () => new Response('', { status: 404 }) };
	const lire = async (env) => (await sonde({ request: new Request('https://temoinpublic.fr/health'), env })).json();
	assert.equal((await lire({ ASSETS: assets })).attente, null);
	const db = baseDeTest();
	await inscrire(db, { offre: 'marches-publics', adresse: 'a@b.fr', profil: 'autre' }, '2026-10-16');
	assert.deepEqual((await lire({ ASSETS: assets, DEPOTS: db })).attente, { 'marches-publics': 1, communes: 0, editeurs: 0, assureurs: 0, notaires: 0, drh: 0 });
	const lie = {
		bind: () => lie,
		all: async () => {
			throw new Error('D1');
		}
	};
	const muette = await lire({ ASSETS: assets, DEPOTS: { prepare: () => lie } });
	assert.equal(muette.attente, null);
	assert.ok(muette.constats.includes('base des depots illisible'));
	assert.ok(!(await lire({ ASSETS: assets })).constats.includes('base des depots illisible'), 'sans base liee, rien a dire');
});

test("la page de l'offre des editeurs ne dit aucun prix, porte le formulaire et les gestes du jour", async () => {
	const html = pageOffreEditeurs();
	const texte = texteDe(html);
	for (const interdit of [/€/, /\beuros?\b/i, /tarif/i, /abonnement/i, /gratuit/i, /payant/i, /\bHT\b/, /qualifi/i, /certifi/i, /opposable/i]) assert.doesNotMatch(texte, interdit);
	assert.deepEqual(texte.match(/[^\S ][:;?!»%]/g), null, 'deux-points soudes');
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/date-de-publication">/);
	assert.match(html, /<input type="hidden" name="offre" value="editeurs">/);
	assert.match(html, /<input type="radio" name="profil" value="presse" checked> Éditeur de presse ou rédaction/);
	assert.doesNotMatch(html, /value="commune"/);
	assert.doesNotMatch(html, /<script/);
	// Le registre montre ne porte ni adresse ni titre : seulement son identifiant.
	assert.ok(html.includes(`<a href="/editeur/${EXEMPLE_DE_REGISTRE.id}">le registre d’un site suivi depuis le 12/10/2026</a>, 13 articles datés.`));
	assert.match(EXEMPLE_DE_REGISTRE.id, /^[0-9a-f]{16}$/);
	assert.match(html, /<a class="bouton principal" href="\/besoin\/prouver-une-page-web">Dater un article<\/a> <a class="bouton" href="\/documentation">Suivre un flux<\/a>/);
	assert.equal(CHEMIN_OFFRE_EDITEURS, '/date-de-publication');
	assert.equal(CHEMINS_DES_OFFRES.editeurs, CHEMIN_OFFRE_EDITEURS);
	assert.deepEqual(decider('https://datumszeuge.de/date-de-publication'), { action: 'redirection', vers: 'https://temoinpublic.fr/date-de-publication' });
	const db = baseDeTest();
	const ok = await envoyer({ DEPOTS: db }, { offre: 'editeurs', adresse: 'redaction@journal.fr', profil: 'presse' });
	assert.equal(ok.status, 200);
	assert.match(await ok.text(), /<a class="bouton" href="\/date-de-publication">Revenir à l’offre<\/a>/);
	assert.equal(lireInscription({ offre: 'editeurs', adresse: 'a@b.fr', profil: 'commune' }).profil, 'autre');
	assert.deepEqual(await comptesDAttente(db), { 'marches-publics': 0, communes: 0, editeurs: 1, assureurs: 0, notaires: 0, drh: 0 });
});

test("l'accueil francais lie chaque offre, l'accueil allemand aucune", () => {
	const accueil = pageAccueil([]);
	assert.ok(accueil.includes('<p class="suite">Des offres ouvriront bientôt, pour <a href="/marches-publics">les marchés publics</a>, <a href="/publicite-des-actes">les communes</a>, <a href="/date-de-publication">les éditeurs</a>, <a href="/dossier-de-sinistre">les assureurs</a>, <a href="/versions-d-un-acte">les notaires</a> et <a href="/documents-du-personnel">les services du personnel</a>.</p>'));
	assert.deepEqual(
		OFFRES_DE_L_ACCUEIL.map((o) => o.chemin),
		Object.values(CHEMINS_DES_OFFRES)
	);
	for (const { chemin } of OFFRES_DE_L_ACCUEIL) assert.ok(!pageAccueil([], 'de').includes(`href="${chemin}"`), chemin);
});

test("la page de l'offre des assureurs ne dit aucun prix, porte le formulaire et les gestes du jour", async () => {
	const html = pageOffreAssureurs();
	const texte = texteDe(html);
	for (const interdit of [/€/, /\beuros?\b/i, /tarif/i, /abonnement/i, /gratuit/i, /payant/i, /\bHT\b/, /qualifi/i, /certifi/i, /opposable/i, /constat/i]) assert.doesNotMatch(texte, interdit);
	assert.deepEqual(texte.match(/[^\S ][:;?!»%]/g), null, 'deux-points soudes');
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/dossier-de-sinistre">/);
	assert.match(html, /<input type="hidden" name="offre" value="assureurs">/);
	assert.match(html, /<input type="radio" name="profil" value="assureur" checked> Assureur ou mutuelle/);
	assert.doesNotMatch(html, /value="presse"/);
	assert.doesNotMatch(html, /<script/);
	assert.ok(texte.includes('Au 16/10/2026, le registre porte 5 999 dates enregistrées depuis le 11/10/2026.'), texte.slice(0, 3000));
	assert.equal(COUVERTURE_DU_REGISTRE.au, '2026-10-16');
	assert.match(html, /<a class="bouton principal" href="\/deposer">Dater une pièce<\/a> <a class="bouton" href="\/besoin\/prouver-une-page-web">Dater une page web<\/a>/);
	assert.equal(CHEMIN_OFFRE_ASSUREURS, '/dossier-de-sinistre');
	assert.deepEqual(decider('https://datumszeuge.de/dossier-de-sinistre'), { action: 'redirection', vers: 'https://temoinpublic.fr/dossier-de-sinistre' });
	const db = baseDeTest();
	const ok = await envoyer({ DEPOTS: db }, { offre: 'assureurs', adresse: 'sinistres@assureur.fr', profil: 'expert' });
	assert.equal(ok.status, 200);
	assert.match(await ok.text(), /<a class="bouton" href="\/dossier-de-sinistre">Revenir à l’offre<\/a>/);
	assert.deepEqual(lignes(db).map((l) => [l.offre, l.profil]), [['assureurs', 'expert']]);
	assert.deepEqual(await comptesDAttente(db), { 'marches-publics': 0, communes: 0, editeurs: 0, assureurs: 1, notaires: 0, drh: 0 });
});

test("la page de l'offre des notaires ne dit aucun prix, avertit sur la date certaine et porte le formulaire", async () => {
	const html = pageOffreNotaires();
	const texte = texteDe(html);
	for (const interdit of [/€/, /\beuros?\b/i, /tarif/i, /abonnement/i, /gratuit/i, /payant/i, /\bHT\b/, /qualifi/i, /certifi/i, /opposable/i]) assert.doesNotMatch(texte, interdit);
	assert.deepEqual(texte.match(/[^\S ][:;?!»%]/g), null, 'deux-points soudes');
	// « date certaine » ne parait que dans l'avertissement qui dit ce que le recu ne donne pas.
	assert.deepEqual(texte.match(/date certaine/g), ['date certaine']);
	assert.ok(texte.includes('Il ne donne pas date certaine à un acte sous seing privé : l’enregistrement ou l’acte authentique restent nécessaires.'));
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/versions-d-un-acte">/);
	assert.match(html, /<input type="hidden" name="offre" value="notaires">/);
	assert.match(html, /<input type="radio" name="profil" value="notaire" checked> Office notarial/);
	assert.doesNotMatch(html, /<script/);
	assert.match(html, /<a class="bouton principal" href="\/deposer">Dater une version<\/a> <a class="bouton" href="\/verifier">Vérifier une version reçue<\/a>/);
	assert.equal(CHEMIN_OFFRE_NOTAIRES, '/versions-d-un-acte');
	assert.deepEqual(decider('https://datumszeuge.de/versions-d-un-acte'), { action: 'redirection', vers: 'https://temoinpublic.fr/versions-d-un-acte' });
	const db = baseDeTest();
	const ok = await envoyer({ DEPOTS: db }, { offre: 'notaires', adresse: 'office@notaires.fr', profil: 'juriste' });
	assert.equal(ok.status, 200);
	assert.match(await ok.text(), /<a class="bouton" href="\/versions-d-un-acte">Revenir à l’offre<\/a>/);
	assert.deepEqual(lignes(db).map((l) => [l.offre, l.profil]), [['notaires', 'juriste']]);
	assert.equal((await comptesDAttente(db)).notaires, 1);
});

test("la page de l'offre des DRH ne dit aucun prix, avertit sur la remise et porte le formulaire", async () => {
	const html = pageOffreDrh();
	const texte = texteDe(html);
	for (const interdit of [/€/, /\beuros?\b/i, /tarif/i, /abonnement/i, /gratuit/i, /payant/i, /\bHT\b/, /qualifi/i, /certifi/i, /opposable/i]) assert.doesNotMatch(texte, interdit);
	assert.deepEqual(texte.match(/[^\S ][:;?!»%]/g), null, 'deux-points soudes');
	assert.ok(texte.includes('Il ne prouve pas qu’un salarié l’a reçue : la remise se prouve par une décharge signée ou un recommandé.'));
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/documents-du-personnel">/);
	assert.match(html, /<input type="hidden" name="offre" value="drh">/);
	assert.match(html, /<input type="radio" name="profil" value="rh" checked> Service du personnel ou direction/);
	assert.doesNotMatch(html, /<script/);
	assert.match(html, /<a class="bouton principal" href="\/deposer">Dater une version<\/a> <a class="bouton" href="\/verifier">Vérifier une version<\/a>/);
	assert.equal(CHEMIN_OFFRE_DRH, '/documents-du-personnel');
	assert.deepEqual(decider('https://datumszeuge.de/documents-du-personnel'), { action: 'redirection', vers: 'https://temoinpublic.fr/documents-du-personnel' });
	const db = baseDeTest();
	const ok = await envoyer({ DEPOTS: db }, { offre: 'drh', adresse: 'rh@entreprise.fr', profil: 'cabinet' });
	assert.equal(ok.status, 200);
	assert.match(await ok.text(), /<a class="bouton" href="\/documents-du-personnel">Revenir à l’offre<\/a>/);
	assert.deepEqual(lignes(db).map((l) => [l.offre, l.profil]), [['drh', 'cabinet']]);
	assert.equal((await comptesDAttente(db)).drh, 1);
});

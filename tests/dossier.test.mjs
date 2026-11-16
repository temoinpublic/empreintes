// Le dossier de preuve (D-323) : compose depuis la surface construite, puis relu RESEAU COUPE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { FORMAT_DU_DOSSIER, composerDossier, estUnDossier, horodatageQuiCouvre, nomDuDossier, verifierDossier } from '../src/dossier.mjs';
import { dossierDe, principal } from '../scripts/verifier.mjs';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const { tours } = JSON.parse(fs.readFileSync(path.join(DIST, 'tours.json'), 'utf8'));
const vusDe = (sha) => JSON.parse(fs.readFileSync(path.join(DIST, 'index', `${sha.slice(0, 2)}.json`), 'utf8'))[sha];
const copie = (o) => JSON.parse(JSON.stringify(o));

function servir() {
	const serveur = http.createServer((req, res) => {
		const f = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
		if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
		res.writeHead(200).end(fs.readFileSync(f));
	});
	return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

/** Une empreinte entree au tour `tour` (un releve plein), lue dans son releve. */
function empreinteEntreeAu(tour) {
	const releve = JSON.parse(fs.readFileSync(path.join(DIST, 'empreintes', `${tour.id}.json`), 'utf8'));
	return releve.feuilles.find((f) => !f.cle.includes(':') && vusDe(f.sha256)?.some((v) => v.premier === tour.id)).sha256;
}

const plein = (t) => !t.base;
const porte = (t, s) => t.fichiers.includes(`${t.id}.racine.${s}`);
const COMPLET = tours.findLast((t) => plein(t) && porte(t, 'tsr') && porte(t, 'jws') && porte(t, 'slh') && porte(t, 'ots') && t.ots === 'bitcoin');
const ANCIEN = tours[0];

/** Les dossiers du test, composes une fois pendant que le serveur vit ; il est ferme avant toute relecture. */
const dossiers = (async () => {
	const serveur = await servir();
	const site = `http://127.0.0.1:${serveur.address().port}`;
	try {
		const complet = empreinteEntreeAu(COMPLET);
		const ancien = empreinteEntreeAu(ANCIEN);
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-'));
		const fichier = path.join(tmp, nomDuDossier(complet));
		const sortie = await muet(() => principal([complet, '--garder', fichier, '--site', site]));
		return { site, complet: await dossierDe(site, complet), ancien: await dossierDe(site, ancien), inconnu: await dossierDe(site, 'f'.repeat(63) + '0'), fichier, sortie, refus: await muet(() => principal(['f'.repeat(63) + '0', '--garder', fichier + '.rien', '--site', site])) };
	} finally {
		await new Promise((ok) => serveur.close(ok));
	}
})();

/** Joue `f` sans rien ecrire sur la console ; rend son resultat et ce qui a ete dit. */
async function muet(f) {
	const dits = [];
	const [log, error] = [console.log, console.error];
	console.log = console.error = (m) => dits.push(String(m));
	try {
		return { code: await f(), dits };
	} finally {
		[console.log, console.error] = [log, error];
	}
}

/** Joue `f` avec un reseau qui refuse tout : la moindre lecture fait echouer le test. */
async function sansReseau(f) {
	const fetchReel = globalThis.fetch;
	const appels = [];
	globalThis.fetch = (adresse) => {
		appels.push(String(adresse));
		throw new Error(`reseau coupe : ${adresse}`);
	};
	try {
		const rendu = await f();
		assert.deepEqual(appels, [], 'aucune lecture du reseau');
		return rendu;
	} finally {
		globalThis.fetch = fetchReel;
	}
}

test('le dossier se relit reseau coupe : la place, les deux signatures, l horodatage et la preuve Bitcoin', async () => {
	const { complet } = await dossiers;
	assert.equal(complet.format, FORMAT_DU_DOSSIER);
	assert.ok(estUnDossier(complet));
	const v = await sansReseau(() => verifierDossier(complet));
	assert.equal(v.ok, true);
	const c = v.constats.find((x) => x.tour === COMPLET.id);
	assert.deepEqual(c.raisons, []);
	assert.equal(c.inscrit, COMPLET.instant);
	assert.equal(c.signature.ok, true);
	assert.equal(c.postQuantique.ok, true);
	assert.deepEqual({ ok: c.horodatage.ok, tour: c.horodatage.tour, autorite: c.horodatage.autorite }, { ok: true, tour: COMPLET.id, autorite: 'Sectigo Qualified Time Stamping CA R35' });
	assert.match(c.horodatage.instant, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
	assert.deepEqual(c.bitcoin, { ok: true, etat: 'bitcoin', bloc: COMPLET.bloc });
});

test('le script relit le fichier garde et rend 0 sans reseau ; un autre document rend 1', async () => {
	const { fichier, sortie, refus } = await dossiers;
	assert.equal(sortie.code, 0);
	assert.equal(JSON.parse(sortie.dits[0]).dossier, fichier);
	assert.equal(refus.code, 1);
	assert.ok(!fs.existsSync(fichier + '.rien'));
	const lu = await sansReseau(() => muet(() => principal(['--dossier', fichier])));
	assert.equal(lu.code, 0);
	assert.equal(JSON.parse(lu.dits[0]).ok, true);
	const empreinte = JSON.parse(fs.readFileSync(fichier, 'utf8')).empreinte;
	assert.equal((await sansReseau(() => muet(() => principal(['--dossier', fichier, empreinte])))).code, 0);
	const autre = await sansReseau(() => muet(() => principal(['--dossier', fichier, 'a'.repeat(64)])));
	assert.equal(autre.code, 1);
	assert.match(JSON.parse(autre.dits[0]).raisons[0], /autre document/);
	// Le document lui-meme, donne par son chemin : son empreinte n'est pas celle du dossier.
	assert.equal((await sansReseau(() => muet(() => principal(['--dossier', fichier, fichier])))).code, 1);
	const absent = await sansReseau(() => muet(() => principal(['--dossier', fichier + '.absent'])));
	assert.equal(absent.code, 1);
	assert.match(JSON.parse(absent.dits[0]).raisons[0], /pas un dossier/);
	assert.equal((await muet(() => principal([]))).code, 2);
});

test('un tour d avant les signatures tient par la chaine jusqu au premier tour horodate', async () => {
	const { ancien, inconnu } = await dossiers;
	assert.equal(inconnu, null);
	const piece = ancien.constats.find((x) => x.tour.id === ANCIEN.id);
	assert.equal(piece.signature, null);
	assert.equal(piece.signaturePq, null);
	assert.ok(piece.horodatage.liens.length > 0);
	const v = await sansReseau(() => verifierDossier(ancien));
	const c = v.constats.find((x) => x.tour === ANCIEN.id);
	assert.equal(c.ok, true);
	assert.equal(c.signature, null);
	assert.equal(c.horodatage.tour, piece.horodatage.tour);
	// Un lien retire ou altere : l'horodatage ne couvre plus ce tour, et plus rien ne garantit sa racine.
	const coupe = copie(ancien);
	coupe.constats = [copie(piece)];
	coupe.constats[0].horodatage.liens.shift();
	const r = await verifierDossier(coupe);
	assert.equal(r.ok, false);
	assert.deepEqual(r.constats[0].raisons, ['la chaine ne relie pas ce tour au tour horodate', 'aucune signature ni horodatage ne garantit la racine']);
	assert.deepEqual(r.raisons, ['aucun constat du dossier ne tient']);
});

test('chaque piece alteree se dit, et un dossier sans garantie ne prouve rien', async () => {
	const { complet } = await dossiers;
	const base = copie(complet);
	base.constats = [base.constats.find((x) => x.tour.id === COMPLET.id)];
	const raisonsDe = async (alterer) => {
		const d = copie(base);
		alterer(d.constats[0], d);
		const v = await verifierDossier(d);
		assert.equal(v.ok, false);
		return v.constats[0].raisons.join(' | ');
	};
	const inverser = (b64) => (b64[40] === 'A' ? `${b64.slice(0, 40)}B${b64.slice(41)}` : `${b64.slice(0, 40)}A${b64.slice(41)}`);
	assert.match(await raisonsDe((c) => (c.feuille.sha256 = 'b'.repeat(64))), /la feuille ne porte pas l'empreinte du document \| le chemin d'audit ne rend pas l'arbre du tour/);
	assert.match(await raisonsDe((c) => (c.chemin = null)), /le chemin d'audit ne rend pas l'arbre/);
	assert.match(await raisonsDe((c) => (c.tour.racine = 'c'.repeat(64))), /la racine chainee du tour ne correspond pas/);
	assert.match(await raisonsDe((c) => (c.signature = `${c.signature.slice(0, -20)}${c.signature.at(-20) === 'A' ? 'B' : 'A'}${c.signature.slice(-19)}`)), /la signature ne correspond pas/);
	assert.match(await raisonsDe((c) => (c.signaturePq.signature = inverser(c.signaturePq.signature))), /la signature ne correspond pas/);
	assert.match(await raisonsDe((c) => (c.signaturePq.cle = inverser(c.signaturePq.cle))), /la cle n'est pas celle du journal/);
	assert.match(await raisonsDe((c) => (c.signaturePq.cle = '***')), /la cle n'est pas celle du journal/);
	assert.match(await raisonsDe((c) => (c.horodatage.tsr = '***')), /horodatage illisible/);
	assert.match(await raisonsDe((c) => (c.horodatage.tsr = inverser(c.horodatage.tsr))), /horodat|TSTInfo|signa/);
	assert.match(await raisonsDe((c) => (c.horodatage.tour = 'ailleurs')), /la chaine ne relie pas ce tour au tour horodate/);
	assert.match(await raisonsDe((c) => (c.horodatage.liens = null, c.horodatage.tour = 'ailleurs')), /la chaine ne relie pas/);
	assert.match(await raisonsDe((c) => (c.bitcoin.ots = inverser(c.bitcoin.ots))), /la preuve OpenTimestamps ne porte pas sur la racine du tour/);
	assert.match(await raisonsDe((c) => (c.bitcoin.ots = '***')), /OpenTimestamps/);
	// Un tour d'avant la premiere cle post-quantique ne peut pas en porter une.
	assert.match(await raisonsDe((c) => (c.tour.id = '20261011T000000Z')), /aucune cle post-quantique epinglee ne couvre ce tour/);
	// Sans signature ni horodatage, un chemin d'audit juste ne prouve rien : n'importe qui compose un arbre.
	assert.equal(await raisonsDe((c) => Object.assign(c, { signature: null, signaturePq: null, horodatage: null, bitcoin: null })), 'aucune signature ni horodatage ne garantit la racine');
	assert.equal(await raisonsDe((c, d) => (d.constats[0] = null)), 'constat illisible');
	assert.equal(await raisonsDe((c, d) => (d.constats[0] = { tour: null })), 'constat illisible');
	assert.match(await raisonsDe((c) => (c.tour.id = 'pas-un-tour')), /la racine chainee du tour ne correspond pas/);
	// Un constat sans les champs facultatifs se relit quand meme.
	const nu = copie(base);
	Object.assign(nu.constats[0], { cle: undefined, jour: undefined, bitcoin: { ots: nu.constats[0].bitcoin.ots } });
	delete nu.constats[0].tour.instant;
	const v = await verifierDossier(nu);
	assert.equal(v.ok, true);
	assert.deepEqual([v.constats[0].cle, v.constats[0].jour, v.constats[0].inscrit, v.constats[0].bitcoin], [base.constats[0].feuille.cle, base.constats[0].feuille.jour, COMPLET.instant, { ok: true, etat: null, bloc: null }]);
	// Les champs libres du dossier ne se lisent pas : le jour, l'objet et l'instant viennent de la feuille et du tour, que la racine engage.
	const farde = copie(base);
	Object.assign(farde.constats[0], { cle: '<img src=x>', jour: '1999-01-01', bitcoin: { ots: farde.constats[0].bitcoin.ots, etat: '<b>', bloc: '<b>' } });
	farde.constats[0].tour.instant = '1999-01-01T00:00:00Z';
	const lu = (await verifierDossier(farde)).constats[0];
	assert.deepEqual([lu.ok, lu.cle, lu.jour, lu.inscrit, lu.bitcoin], [true, base.constats[0].feuille.cle, base.constats[0].feuille.jour, COMPLET.instant, { ok: true, etat: null, bloc: null }]);
	// Un jour que la feuille n'ecrit pas comme une date ne s'affiche pas.
	assert.match(await raisonsDe((c) => (c.feuille.jour = '<i>')), /le chemin d'audit ne rend pas l'arbre/);
});

test('ce qui n est pas un dossier est refuse ; la composition ecarte une place qui ne se relit pas', async () => {
	for (const faux of [null, {}, { format: FORMAT_DU_DOSSIER }, { format: 'autre', constats: [], empreinte: 'x' }]) {
		assert.equal(estUnDossier(faux), false);
		assert.deepEqual(await verifierDossier(faux), { ok: false, empreinte: null, constats: [], raisons: ["ce fichier n'est pas un dossier de preuve"] });
	}
	assert.equal(nomDuDossier('ab'.repeat(32)), 'preuve-abababababababab.json');
	const lire = () => assert.fail('aucun fichier lu');
	const vide = await composerDossier({ site: 'https://x', empreinte: 'a'.repeat(64), vus: [{ cle: 'k', premier: 'inconnu' }], tours, lireReleve: () => null, lireTexte: lire, lireOctets: lire });
	assert.equal(vide, null);
	// Un tour sans aucun fichier joint : la place seule, ecrite avec ses valeurs par defaut.
	const tour = { id: 'T1', precedente: '0'.repeat(64), arbre: null, racine: null };
	const { chainer, empreinteDeFeuille } = await import('../src/chaine.mjs');
	const feuille = { cle: 'k', sha256: 'a'.repeat(64), jour: '2026-11-15' };
	tour.arbre = await empreinteDeFeuille(feuille);
	tour.racine = await chainer(tour);
	const seul = await composerDossier({ site: 'https://x', empreinte: feuille.sha256, vus: [{ cle: 'k', premier: 'T1' }], tours: [tour], lireReleve: () => ({ ...tour, feuilles: [feuille] }), lireTexte: lire, lireOctets: lire, maintenant: new Date('2026-11-15T03:00:00.000Z') });
	assert.deepEqual(seul.constats[0], { cle: 'k', jour: null, premier: 'T1', dernier: 'T1', tour: { ...tour, instant: null }, feuille, chemin: [], signature: null, signaturePq: null, horodatage: null, bitcoin: null });
	assert.equal(seul.compose, '2026-11-15T03:00:00Z');
});

test('la page propose le dossier et le relit sans le site', () => {
	const source = fs.readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	assert.match(source, /import \{ composerDossier, estUnDossier, horodatageQuiCouvre, nomDuDossier, verifierDossier \} from '\/dossier.mjs';/);
	assert.match(source, /if \(estUnDossier\(r\)\) return verifierLeDossier\(r, sortie\);/);
	// La relecture d'un dossier ne lit rien : aucun fetch entre son entree et sa sortie.
	const relecture = source.slice(source.indexOf('function constatDuDossier'), source.indexOf(" * Seul un 404 dit l'absence"));
	assert.ok(relecture.includes('verifierDossier(dossier)'));
	assert.doesNotMatch(relecture, /fetch\(|lire\(|octets\(/);
	const textes = fs.readFileSync(new URL('../public/textes.js', import.meta.url), 'utf8');
	for (const libelle of ['Inscrit par Témoin public', 'Horodatage eIDAS, au plus tard', 'Ancré dans Bitcoin, au plus tard', 'Garder le dossier de preuve', 'Eingetragen von Datumszeuge', 'eIDAS-Zeitstempel, spätestens', 'In Bitcoin verankert, spätestens']) assert.ok(textes.includes(libelle), libelle);
	assert.ok(fs.existsSync(path.join(DIST, 'dossier.mjs')), 'le module est servi');
	assert.ok(JSON.parse(fs.readFileSync(path.join(DIST, '_routes.json'), 'utf8')).exclude.includes('/dossier.mjs'));
});

test('--garder refuse d ecrire le dossier sur le document lui-meme', async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'garder-'));
	const document = path.join(tmp, 'facture.pdf');
	fs.writeFileSync(document, 'le document');
	const refus = await muet(() => principal([document, '--garder', path.join(tmp, '.', 'facture.pdf')]));
	assert.equal(refus.code, 2);
	assert.equal(fs.readFileSync(document, 'utf8'), 'le document');
});

test('la page lit un dossier de plus d un million d octets comme un dossier', () => {
	const source = fs.readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const borne = Number(/const TAILLE_LUE_COMME_PIECE = ([\d_]+);/.exec(source)[1].replaceAll('_', ''));
	assert.ok(borne >= 50_000_000, `borne ${borne}`);
	assert.match(source, /fichier\.size < TAILLE_LUE_COMME_PIECE \? jsonDans\(octets\)/);
});

test('l horodatage qui couvre un tour en ligne : le premier tour horodate, relie par la chaine, avec son autorite (D-323)', async () => {
	const lireOctets = (nom) => new Uint8Array(fs.readFileSync(path.join(DIST, 'empreintes', nom)));
	const h = await horodatageQuiCouvre(tours, COMPLET.id, COMPLET.racine, lireOctets);
	assert.equal(h.ok, true, h.raisons?.join(', '));
	assert.equal(h.nom, `${COMPLET.id}.racine.tsr`);
	assert.match(h.autorite, /^Sectigo/);
	assert.match(h.instant, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
	const faux = await horodatageQuiCouvre(tours, COMPLET.id, '0'.repeat(64), lireOctets);
	assert.deepEqual([faux.ok, faux.raisons], [false, ['la chaine ne relie pas ce tour au tour horodate']]);
	assert.equal(await horodatageQuiCouvre(tours, 'inconnu', COMPLET.racine, lireOctets), null);
	const sansJeton = tours.findLast((t) => !porte(t, 'tsr'));
	if (sansJeton && tours.at(-1).id === sansJeton.id) assert.equal(await horodatageQuiCouvre(tours, sansJeton.id, sansJeton.racine, lireOctets), null);
});

test('le verdict en ligne et le recu disent les trois dates, chacune avec son garant (D-323)', () => {
	const verifier = fs.readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const constat = verifier.slice(verifier.indexOf('async function constat('), verifier.indexOf('const depot ='));
	assert.match(constat, /<dl class="dates">\n\$\{lignesDesDates\(T\.heure\(vu\.premier\), horodatageEnLigne\(horodatage\), `\$\{ancrage\(tour\)\} \$\{preuves\}`\)\}\n<\/dl>\n<details>/, 'hors du depliant');
	assert.match(verifier, /return \[ligne\(d\.inscrit, inscrit\), ligne\(d\.horodate, horodatage\), ligne\(d\.ancre, bitcoin\)\]/);
	assert.match(verifier, /if \(!h\) return d\.horodateAVenir;/);
	const recu = fs.readFileSync(new URL('../public/recu.js', import.meta.url), 'utf8');
	assert.match(recu, /\[ligne\(d\.inscrit, T\.heure\(p\.tour\)\), ligne\(d\.horodate, horodatage\), ligne\(d\.ancre, bloc\(p\.bloc\)\)\]/);
	assert.match(recu, /horodatageQuiCouvre\(tours, p\.tour, p\.racine,/);
});

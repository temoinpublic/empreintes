import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { DEPOTS_PAR_JOUR, VERSION_DU_RECU_PRODUIT, lireDemande, plafond, recuDe } from '../src/depot.mjs';
import { PRODUITS, RECUS_PAR_PRODUIT_PAR_JOUR, cleDuProduit, lireProduit } from '../src/produit.mjs';
import { bilanPublic, deposer, ligneEtAdresseDuRecu, produitDuRecu, verifierUnRecu } from '../src/service.mjs';
import { onRequestGet as pageDuRecu } from '../functions/recu/[id].js';
import { onRequestGet as apiRecu } from '../functions/api/recus/[id].js';

const midi = new Date('2026-10-20T12:00:00Z');
const lendemain = new Date('2026-10-21T12:00:00Z');
const H = 'a'.repeat(64);
const URL_RECU = `https://auregistre.fr/recu/${'b'.repeat(64)}.json`;
const produit = (autres = {}) => ({ sha256: H, produit: { nom: 'auregistre', url: URL_RECU }, ...autres });
const corpsDe = (r) => JSON.parse(r.corps);
const deposerPourLaFlotte = (db, corps, options = {}) => deposer({ db, corps, adresse: '203.0.113.9', maintenant: midi, flotte: true, ...options });

test('le champ produit nomme un produit de la flotte et l adresse https de son recu, avec un sha256 declare', () => {
	assert.deepEqual(lireDemande(produit()).demande, { sha256: H, produit: { nom: 'auregistre', url: URL_RECU } });
	assert.equal(lireProduit({}, []), null);
	assert.equal(lireProduit({ produit: null }, []), null);
	const defauts = (corps) => lireDemande(corps).erreurs.join('\n');
	assert.match(defauts({ sha256: H, produit: 'auregistre' }), /produit : un objet/);
	assert.match(defauts({ sha256: H, produit: ['auregistre'] }), /produit : un objet/);
	assert.match(defauts(produit({ produit: { nom: 'pappers', url: URL_RECU } })), /produit.nom : "auregistre"/);
	assert.match(defauts(produit({ produit: { nom: 'quivad', url: 'http://quivad.fr/recu/1.json' } })), /produit.url : l adresse https/);
	assert.match(defauts(produit({ produit: { nom: 'quivad', url: 'pas une adresse' } })), /produit.url/);
	assert.match(defauts(produit({ produit: { nom: 'quivad', url: `https://quivad.fr/${'x'.repeat(2048)}` } })), /produit.url/);
	assert.match(defauts(produit({ produit: { nom: 'quivad' } })), /produit.url/);
	assert.match(defauts({ produit: { nom: 'titelia', url: URL_RECU } }), /le sha256 du recu est requis/);
	assert.match(defauts({ url: URL_RECU, produit: { nom: 'titelia', url: URL_RECU } }), /pas d url a lire/);
	assert.deepEqual(PRODUITS, ['auregistre', 'quivad', 'titelia', 'murparmur', 'rendita']);
});

test('un produit a son propre plafond, hors de celui du jour, et son recu est en version 5', () => {
	assert.deepEqual(plafond({ deCetteAdresse: RECUS_PAR_PRODUIT_PAR_JOUR - 1, duJour: DEPOTS_PAR_JOUR, instant: midi.toISOString(), produit: { nom: 'auregistre' } }), { ok: true });
	const r = plafond({ deCetteAdresse: RECUS_PAR_PRODUIT_PAR_JOUR, duJour: 0, instant: midi.toISOString(), flotte: true, produit: { nom: 'auregistre' } });
	assert.equal(r.ok, false);
	assert.match(r.motif, /plafond du produit/);
	assert.equal(r.apres, 12 * 3600);
	const recu = recuDe({ sha256: H, instant: midi.toISOString(), produit: { nom: 'auregistre', url: URL_RECU } });
	assert.equal(recu.version, VERSION_DU_RECU_PRODUIT);
	assert.deepEqual(recu.produit, { nom: 'auregistre', url: URL_RECU });
	assert.equal(recu.source, 'declare');
	assert.throws(() => recuDe({ sha256: H, instant: midi.toISOString(), produit: { nom: 'auregistre', url: URL_RECU }, temoin: { url: URL_RECU, taille: 1, lu: midi.toISOString() } }), /empreinte declaree/);
});

test('le recu d un produit se depose sous le jeton de la flotte, et sous lui seulement', async () => {
	const db = baseDeTest();
	const sansJeton = await deposer({ db, corps: produit(), adresse: '198.51.100.1', maintenant: midi });
	assert.equal(sansJeton.statut, 403);
	assert.match(corpsDe(sansJeton).erreur, /jeton de la flotte requis/);
	const ni = await deposerPourLaFlotte(db, { sha256: H });
	assert.equal(ni.statut, 400);
	assert.match(corpsDe(ni).details.join(), /que des actes ou des recus/);
	const r = await deposerPourLaFlotte(db, produit());
	assert.equal(r.statut, 201);
	const corps = corpsDe(r);
	assert.equal(corps.jour, '2026-10-20');
	assert.equal(corps.place, 1);
	assert.equal(corps.recu.version, VERSION_DU_RECU_PRODUIT);
	assert.deepEqual(corps.recu.produit, { nom: 'auregistre', url: URL_RECU });
	assert.equal(corps.recu.sha256, H);
	assert.equal(db.sqlite.prepare('SELECT n FROM compte WHERE adresse = ?').get(cleDuProduit('auregistre')).n, 1);
});

test('les recus des produits ne prennent ni le plafond du jour ni le bilan public, et s arretent au leur', async () => {
	const db = baseDeTest();
	db.sqlite.prepare('INSERT INTO compte (jour, adresse, n) VALUES (?, ?, ?)').run('2026-10-20', cleDuProduit('auregistre'), RECUS_PAR_PRODUIT_PAR_JOUR - 1);
	for (let n = 0; n < RECUS_PAR_PRODUIT_PAR_JOUR - 1; n++) db.sqlite.prepare('INSERT INTO depot (jour, place, sha256, recu) VALUES (?, ?, ?, ?)').run('2026-10-20', n + 1, 'f'.repeat(64), `${n}`.padStart(64, '0'));
	const dernier = await deposerPourLaFlotte(db, produit());
	assert.equal(dernier.statut, 201, 'le dernier recu du plafond passe');
	const auPlafond = await deposerPourLaFlotte(db, produit({ sha256: 'c'.repeat(64) }));
	assert.equal(auPlafond.statut, 429);
	assert.match(corpsDe(auPlafond).erreur, /plafond du produit/);
	const exterieur = await deposer({ db, corps: { sha256: 'd'.repeat(64) }, adresse: '198.51.100.1', maintenant: midi });
	assert.equal(exterieur.statut, 201, 'les recus des produits ne comptent pas dans les 2 000 du jour');
	assert.deepEqual((await bilanPublic({ db })).jours, [{ jour: '2026-10-20', depots: 1, deposants: 1 }]);
	await deposer({ db, corps: { sha256: 'e'.repeat(64) }, adresse: '198.51.100.2', maintenant: lendemain });
	assert.deepEqual((await bilanPublic({ db })).jours[0], { jour: '2026-10-20', depots: 1, deposants: 1 }, 'le jour clos garde le bilan hors produits');
});

test('la page du recu d un produit nomme le produit et mene au recu qu il sert, en francais et en allemand', async () => {
	const env = { DEPOTS: baseDeTest() };
	const r = corpsDe(await deposerPourLaFlotte(env.DEPOTS, produit()));
	assert.deepEqual({ ...(await produitDuRecu({ db: env.DEPOTS, id: r.id })) }, { nom: 'auregistre', url: URL_RECU });
	assert.equal(await produitDuRecu({ db: env.DEPOTS, id: 'x' }), null);
	const ligne = await ligneEtAdresseDuRecu({ db: env.DEPOTS, id: r.id });
	assert.deepEqual(ligne.produit, { nom: 'auregistre', url: URL_RECU });
	assert.equal(ligne.acte, undefined);
	const page = await (await pageDuRecu({ request: new Request(`https://temoinpublic.fr/recu/${r.id}`), params: { id: r.id }, env })).text();
	assert.match(page, new RegExp(`<div><dt>Produit</dt><dd>auregistre</dd></div>\n<div><dt>Reçu du produit</dt><dd><a href="${URL_RECU}">${URL_RECU}</a></dd></div>\n<div><dt>Empreinte</dt>`));
	const allemande = await (await pageDuRecu({ request: new Request(`https://datumszeuge.de/recu/${r.id}`), params: { id: r.id }, env })).text();
	assert.match(allemande, /<dt>Produkt<\/dt><dd>auregistre<\/dd>[\s\S]*<dt>Beleg des Produkts<\/dt>/);
	assert.deepEqual((await (await apiRecu({ params: { id: r.id }, env })).json()).produit, { nom: 'auregistre', url: URL_RECU });
	const ordinaire = corpsDe(await deposer({ db: env.DEPOTS, corps: { sha256: 'c'.repeat(64) }, adresse: '198.51.100.1', maintenant: midi }));
	const sans = await (await pageDuRecu({ request: new Request(`https://temoinpublic.fr/recu/${ordinaire.id}`), params: { id: ordinaire.id }, env })).text();
	assert.doesNotMatch(sans, /<dt>Produit<\/dt>/);
	assert.equal((await (await apiRecu({ params: { id: ordinaire.id }, env })).json()).produit, undefined);
});

test('la verification d un recu de produit relit les octets a son adresse et compare', async () => {
	const db = baseDeTest();
	const lire = async () => new Response('', { status: 404 });
	const recu = corpsDe(await deposerPourLaFlotte(db, produit())).recu;
	const relu = (sha) => async (admise) => ({ url: admise.url, taille: 10, type: 'application/json', lu: midi.toISOString(), sha256: sha });
	const verdict = async (temoin, corps = recu) => corpsDe(await verifierUnRecu({ db, corps, lire, temoin }));
	const identique = await verdict(relu(H));
	assert.equal(identique.authentique, true);
	assert.deepEqual(identique.produit, { nom: 'auregistre', url: URL_RECU, relecture: { etat: 'identique', sha256: H, lu: midi.toISOString() } });
	assert.equal((await verdict(relu('c'.repeat(64)))).produit.relecture.etat, 'different');
	const muette = await verdict(async () => {
		throw Object.assign(new Error('la source a repondu 404'), { statut: 404 });
	});
	assert.deepEqual(muette.produit.relecture, { etat: 'illisible', raison: 'la source a repondu 404', statut: 404 });
	const coupee = await verdict(async () => {
		throw new Error('hote sans adresse');
	});
	assert.deepEqual(coupee.produit.relecture, { etat: 'illisible', raison: 'hote sans adresse' });
	const privee = await verdict(relu(H), { ...recu, produit: { nom: 'auregistre', url: 'https://localhost/recu/1.json' } });
	assert.equal(privee.authentique, false, 'un recu modifie n est plus celui du registre');
	assert.equal(privee.produit, undefined);
	const ordinaire = corpsDe(await deposer({ db, corps: { sha256: 'd'.repeat(64) }, adresse: '198.51.100.1', maintenant: midi })).recu;
	assert.equal((await verdict(relu(H), ordinaire)).produit, undefined);
});

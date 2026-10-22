// L'API des offres (D-195) : la cle d'un client, son plafond, la verification
// d'un recu, et la porte fermee tant que `OFFRE_API` ne l'ouvre pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { baseDeTest } from './d1.mjs';
import { OFFRE_API_OUVERTE, PLAFOND_CLIENT_MAX, PORTEE_DU_RECU, clientDuJeton, cleDuClient, etatDeLApi, lireRegistre, offreOuverte, verdictDuRecu } from '../src/client.mjs';
import { DEPOTS_PAR_ADRESSE, DEPOTS_PAR_JOUR, plafond } from '../src/depot.mjs';
import { RACINE_NULLE, arbre, chainer, empreinteDeFeuille, hacherLignes } from '../src/chaine.mjs';
import { resumeDe } from '../src/journal.mjs';
import { bilanPublic, deposer, verifierUnRecu } from '../src/service.mjs';
import { onRequestPost as apiDepots, onRequestOptions } from '../functions/api/depots.js';
import { onRequestPost as apiVerifications } from '../functions/api/verifications.js';
import { onRequestGet as sonde } from '../functions/health.js';

const h = (t) => createHash('sha256').update(String(t)).digest('hex');
const midi = new Date('2026-10-15T12:00:00Z');
const lendemain = new Date('2026-10-16T12:00:00Z');
const corpsDe = (r) => JSON.parse(r.corps);
const JETON = 'cle-notaire-essai';
const REGISTRE = JSON.stringify([{ id: 'office-essai', offre: 'notaires', jeton: h(JETON), plafond: 30 }]);
const OUVERTE = { OFFRE_API: OFFRE_API_OUVERTE, CLIENTS_API: REGISTRE };
const sansFichier = async () => new Response('', { status: 404 });
const actifs = (fichiers = {}) => ({ fetch: async (url) => (new URL(url).pathname in fichiers ? new Response(fichiers[new URL(url).pathname]) : new Response('', { status: 404 })) });
const poster = (chemin, corps, entetes = {}) => new Request(`https://temoinpublic.fr${chemin}`, { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });

test('l API des offres est fermee sauf quand OFFRE_API vaut exactement ouverte', () => {
	assert.equal(offreOuverte({}), false);
	assert.equal(offreOuverte(undefined), false);
	assert.equal(offreOuverte({ OFFRE_API: 'oui' }), false);
	assert.equal(offreOuverte({ OFFRE_API: 'ouverte' }), true);
	assert.deepEqual(etatDeLApi({}), { etat: 'fermee' });
	assert.deepEqual(etatDeLApi(OUVERTE), { etat: 'ouverte', clients: 1 });
	assert.deepEqual(etatDeLApi({ OFFRE_API: 'ouverte', CLIENTS_API: '{' }), { etat: 'ouverte', clients: null });
});

test('le registre des clients refuse toute entree hors format plutot que de l ignorer', () => {
	assert.deepEqual(lireRegistre(undefined), []);
	assert.deepEqual(lireRegistre(REGISTRE), [{ id: 'office-essai', offre: 'notaires', jeton: h(JETON), plafond: 30 }]);
	const entree = { id: 'a', offre: 'drh', jeton: h('x'), plafond: 1 };
	assert.throws(() => lireRegistre('{}'), /tableau/);
	for (const autre of [{ id: 'A b' }, { offre: 'banques' }, { jeton: 'x' }, { plafond: 0 }, { plafond: PLAFOND_CLIENT_MAX + 1 }, { plafond: 1.5 }])
		assert.throws(() => lireRegistre(JSON.stringify([{ ...entree, ...autre }])), /entree 1/, JSON.stringify(autre));
	assert.throws(() => lireRegistre(JSON.stringify([entree, entree])), /entree 2/, 'un identifiant en double');
	assert.throws(() => lireRegistre(JSON.stringify([null])), /entree 1/);
});

test('le jeton d un client se reconnait par son empreinte, jamais sans Bearer', async () => {
	const registre = lireRegistre(REGISTRE);
	assert.deepEqual(await clientDuJeton(`Bearer ${JETON}`, registre), { id: 'office-essai', offre: 'notaires', plafond: 30 });
	assert.deepEqual(await clientDuJeton(`Bearer  ${JETON} `, registre), { id: 'office-essai', offre: 'notaires', plafond: 30 });
	assert.equal(await clientDuJeton('Bearer autre', registre), null);
	assert.equal(await clientDuJeton(`Basic ${JETON}`, registre), null);
	assert.equal(await clientDuJeton('Bearer ', registre), null);
	assert.equal(await clientDuJeton(null, registre), null);
	assert.equal(await clientDuJeton(`Bearer ${JETON}`, []), null);
	assert.equal(cleDuClient({ id: 'office-essai' }), 'client:office-essai');
});

test('un client a son plafond a lui, hors du plafond des adresses et du jour', () => {
	const client = { id: 'c', plafond: DEPOTS_PAR_ADRESSE + 5 };
	assert.deepEqual(plafond({ deCetteAdresse: DEPOTS_PAR_ADRESSE + 1, duJour: DEPOTS_PAR_JOUR, instant: midi.toISOString(), client }), { ok: true });
	const r = plafond({ deCetteAdresse: DEPOTS_PAR_ADRESSE + 5, duJour: 0, instant: midi.toISOString(), client });
	assert.equal(r.ok, false);
	assert.equal(r.motif, 'plafond du client atteint');
	assert.equal(r.apres, 12 * 3600);
});

test('un client depose au-dela de vingt, recoit la portee du recu et ne compte ni au plafond du jour ni au bilan', async () => {
	const db = baseDeTest();
	const client = { id: 'office-essai', offre: 'notaires', plafond: DEPOTS_PAR_ADRESSE + 2 };
	for (let n = 1; n <= DEPOTS_PAR_ADRESSE + 2; n++) {
		const r = await deposer({ db, corps: { sha256: h(`v${n}`), libelle: `Version ${n}` }, adresse: '203.0.113.9', maintenant: midi, client });
		assert.equal(r.statut, 201, `version ${n}`);
		const c = corpsDe(r);
		assert.equal(c.client, 'office-essai');
		assert.deepEqual(c.portee, PORTEE_DU_RECU);
	}
	const trop = await deposer({ db, corps: { sha256: h('trop') }, adresse: '203.0.113.9', maintenant: midi, client });
	assert.equal(trop.statut, 429);
	assert.equal(corpsDe(trop).erreur, 'plafond du client atteint');
	const anonyme = await deposer({ db, corps: { sha256: h('anonyme') }, adresse: '203.0.113.9', maintenant: midi });
	assert.equal(anonyme.statut, 201, 'la meme adresse sans jeton garde ses vingt depots');
	assert.equal(corpsDe(anonyme).portee, undefined, 'la reponse du depot gratuit ne change pas');
	assert.deepEqual((await bilanPublic({ db })).jours, [{ jour: '2026-10-15', depots: 1, deposants: 1 }]);
	await deposer({ db, corps: { sha256: h('demain') }, adresse: '198.51.100.2', maintenant: lendemain });
	assert.deepEqual((await bilanPublic({ db })).jours[0], { jour: '2026-10-15', depots: 1, deposants: 1 }, 'le jour clos garde le bilan hors clients');
});

test('fermee, l API refuse la cle d un client comme un jeton inconnu et ne connait pas les verifications', async () => {
	const env = { DEPOTS: baseDeTest(), CLIENTS_API: REGISTRE };
	const r = await apiDepots({ request: poster('/api/depots', { sha256: h('a') }, { authorization: `Bearer ${JETON}` }), env });
	assert.equal(r.status, 401);
	assert.equal((await r.json()).erreur, 'jeton inconnu');
	const v = await apiVerifications({ request: poster('/api/verifications', {}), env });
	assert.equal(v.status, 404);
	assert.deepEqual(await (await sonde({ request: new Request('https://temoinpublic.fr/health'), env: { ASSETS: actifs() } })).json().then((s) => s.apiDesOffres), { etat: 'fermee' });
	assert.match(onRequestOptions().headers.get('access-control-allow-headers'), /authorization/);
});

test('ouverte, la cle d un client depose ; une cle inconnue rend 401', async () => {
	const env = { DEPOTS: baseDeTest(), ...OUVERTE };
	const r = await apiDepots({ request: poster('/api/depots', { sha256: h('a') }, { authorization: `Bearer ${JETON}` }), env });
	assert.equal(r.status, 201);
	assert.equal((await r.json()).client, 'office-essai');
	assert.equal((await apiDepots({ request: poster('/api/depots', { sha256: h('b') }, { authorization: 'Bearer autre' }), env })).status, 401);
	assert.equal(env.DEPOTS.sqlite.prepare('SELECT n FROM compte WHERE adresse = ?').get('client:office-essai').n, 1);
});

/** Un journal publie qui inscrit `lignes` au tour `id` : depots.jsonl, tours.json et le releve. */
async function journalAvec(lignes, { bloc = 971100 } = {}) {
	const texte = lignes.map((l) => `${JSON.stringify({ ...l, lu: '2026-10-15T12:10:00.000Z' })}\n`).join('');
	const feuilles = [{ cle: `depots:${lignes.length}`, sha256: await hacherLignes(texte, lignes.length), jour: '2026-10-15' }];
	const a = await arbre(await Promise.all(feuilles.map(empreinteDeFeuille)));
	const id = '20261015T141000Z';
	const releve = { id, precedente: RACINE_NULLE, arbre: a, racine: await chainer({ id, precedente: RACINE_NULLE, arbre: a }), feuilles };
	return { '/empreintes/depots.jsonl': texte, '/tours.json': JSON.stringify({ tours: [resumeDe(releve, { ots: 'bitcoin', bloc }, [])] }), [`/empreintes/${id}.json`]: JSON.stringify(releve) };
}

test('un recu se verifie : sa ligne, son inscription au journal et la portee ; un recu touche est inconnu', async () => {
	const db = baseDeTest();
	const depot = corpsDe(await deposer({ db, corps: { sha256: h('acte'), libelle: 'Projet v2' }, adresse: 'a', maintenant: midi }));
	const fichiers = await journalAvec([{ sha256: h('acte'), jour: '2026-10-15', place: 1, recu: depot.id }]);
	const lire = async (c) => (c in fichiers ? new Response(fichiers[c]) : new Response('', { status: 404 }));
	const v = corpsDe(await verifierUnRecu({ db, corps: depot.recu, lire }));
	assert.equal(v.authentique, true);
	assert.equal(v.id, depot.id);
	assert.equal(v.empreinte, h('acte'));
	assert.deepEqual([v.jour, v.place, v.source], ['2026-10-15', 1, 'declare']);
	assert.equal(v.inscription.etat, 'inscrit');
	assert.equal(v.inscription.bloc, 971100);
	assert.match(v.inscription.racine, /^[0-9a-f]{64}$/);
	assert.equal(v.page, `https://temoinpublic.fr/recu/${depot.id}`);
	assert.equal(v.portee.date_certaine, false);
	assert.equal(v.portee.qualifie, false);
	assert.equal('signature' in v, false);

	const attente = corpsDe(await verifierUnRecu({ db, corps: depot.recu, lire: sansFichier }));
	assert.deepEqual([attente.authentique, attente.inscription], [true, { etat: 'attente' }], 'pas encore au journal : authentique, en attente');
	const illisible = corpsDe(await verifierUnRecu({ db, corps: depot.recu, lire: async () => new Response('{', { status: 200 }) }));
	assert.deepEqual(illisible.inscription, { etat: 'illisible' });

	const touche = corpsDe(await verifierUnRecu({ db, corps: { ...depot.recu, jour: '2026-10-14' }, lire }));
	assert.deepEqual([touche.authentique, touche.raison], [false, 'recu inconnu du registre']);
	assert.deepEqual(touche.portee, PORTEE_DU_RECU);
	const pasUnRecu = await verifierUnRecu({ db, corps: { sha256: h('acte') }, lire });
	assert.equal(pasUnRecu.statut, 400);
	assert.equal(corpsDe(pasUnRecu).erreur, 'recu illisible');
});

test('un journal non conforme rend le recu non authentique, et une signature refusee aussi', () => {
	const ligne = { sha256: h('x'), jour: '2026-10-15', place: 2, recu: h('r') };
	const recu = { depose: midi.toISOString(), source: 'temoin' };
	assert.equal(verdictDuRecu({ id: h('r'), recu, ligne, inscription: { etat: 'non conforme' }, signature: null }).authentique, false);
	assert.equal(verdictDuRecu({ id: h('r'), recu, ligne, inscription: { etat: 'inscrit' }, signature: { ok: false, raisons: ['x'] } }).authentique, false);
	assert.equal(verdictDuRecu({ id: h('r'), recu, ligne, inscription: { etat: 'attente' }, signature: { ok: true } }).authentique, true);
});

test('la signature d un recu signe se relit a l instant du depot, avec son autorite', async () => {
	const lireFixture = (nom) => fs.readFileSync(new URL(`./fixtures/cades/${nom}`, import.meta.url));
	const doc = createHash('sha256').update(lireFixture('doc.txt')).digest('hex');
	const autorites = async () => ({ autorites: { [createHash('sha256').update(lireFixture('inter.der')).digest('hex')]: { pays: 'DE', nom: 'Intermediaire Essai', usages: [] } } });
	const db = baseDeTest();
	const depot = corpsDe(await deposer({ db, corps: { sha256: doc, signature: lireFixture('doc.p7s').toString('base64') }, adresse: 'a', maintenant: new Date('2026-10-20T12:00:00Z'), autorites }));
	assert.equal(depot.recu.version, 4);
	const v = corpsDe(await verifierUnRecu({ db, corps: depot.recu, lire: sansFichier, autorites }));
	assert.equal(v.authentique, true);
	assert.deepEqual(v.signature, { ok: true, sujet: 'Cachet Essai, Commune d Essai', emetteur: 'Intermediaire Essai, Essai', autorite: { pays: 'DE', nom: 'Intermediaire Essai' } });
	const sansRegistre = corpsDe(await verifierUnRecu({ db, corps: depot.recu, lire: sansFichier }));
	assert.equal(sansRegistre.signature.autorite, null);
});

test('la Function des verifications relit le journal publie par ASSETS', async () => {
	const db = baseDeTest();
	const depot = corpsDe(await deposer({ db, corps: { sha256: h('piece') }, adresse: 'a', maintenant: midi }));
	const env = { DEPOTS: db, ...OUVERTE, ASSETS: actifs(await journalAvec([{ sha256: h('piece'), jour: '2026-10-15', place: 1, recu: depot.id }])) };
	const r = await apiVerifications({ request: poster('/api/verifications', depot.recu), env });
	assert.equal(r.status, 200);
	const v = await r.json();
	assert.deepEqual([v.authentique, v.inscription.etat], [true, 'inscrit']);
	assert.equal((await apiVerifications({ request: poster('/api/verifications', 'pas du json'), env })).status, 400);
	const s = await (await sonde({ request: new Request('https://temoinpublic.fr/health'), env: { ...OUVERTE, ASSETS: actifs() } })).json();
	assert.deepEqual(s.apiDesOffres, { etat: 'ouverte', clients: 1 });
});

test('la portee du recu ne promet ni date certaine ni qualification', () => {
	const texte = JSON.stringify(PORTEE_DU_RECU);
	assert.equal(PORTEE_DU_RECU.date_certaine, false);
	assert.equal(PORTEE_DU_RECU.qualifie, false);
	assert.match(texte, /1377/);
	assert.match(texte, /910\/2014/);
	assert.doesNotMatch(texte.replace(/n’est pas qualifié/, ''), /qualifié/, 'le mot n apparait que nie');
	assert.ok(Object.isFrozen(PORTEE_DU_RECU));
});

test('la verification dit jusqu ou elle est allee : un journal illisible n est pas une inscription relue', () => {
	const ligne = { sha256: 'a'.repeat(64), jour: '2026-10-12', place: 1 };
	const recu = { depose: '2026-10-12T12:00:00.000Z', source: null };
	const v = (inscription, signature = null) => verdictDuRecu({ id: 'r', recu, ligne, inscription, signature }).verification;
	assert.equal(v({ etat: 'inscrit' }), 'complete');
	assert.equal(v({ etat: 'attente' }), 'attente');
	assert.equal(v({ etat: 'illisible' }), 'indeterminee');
	assert.equal(v({ etat: 'non conforme' }), 'refusee');
	assert.equal(v({ etat: 'inscrit' }, { ok: false }), 'refusee');
	assert.equal(verdictDuRecu({ id: 'r', recu, ligne: null }).verification, 'refusee');
});

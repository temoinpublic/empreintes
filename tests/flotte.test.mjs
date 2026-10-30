import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { ACTES_DE_LA_FLOTTE_PAR_JOUR, CLE_DE_LA_FLOTTE, DEPOTS_PAR_ADRESSE, estLaFlotte, plafond } from '../src/depot.mjs';
import { bilanPublic, deposer, serieDeLaCollectivite } from '../src/service.mjs';

const midi = new Date('2026-10-15T12:00:00Z');
const lendemain = new Date('2026-10-16T12:00:00Z');
const corpsDe = (r) => JSON.parse(r.corps);
const annuaire = async (code) => (code === '17133' ? [['cravans.fr', '']] : null);
const pdf = (n) => `https://www.cravans.fr/actes/deliberation-${n}.pdf`;
const acte = (n, autres = {}) => ({ type: 'acte', url: pdf(n), collectivite: '17133', nature: 'deliberation', libelle: `Deliberation ${n}`, ...autres });
const temoinDe = (empreinte) => async (admise) => ({ url: admise.url, taille: 3, type: 'application/pdf', lu: midi.toISOString(), sha256: empreinte(admise.url) });
const parUrl = temoinDe((url) => url.match(/(\d+)\.pdf$/)[1].padStart(64, '0'));
const glaner = (db, corps, options = {}) => deposer({ db, corps, adresse: '203.0.113.9', maintenant: midi, temoin: parUrl, annuaire, flotte: true, ...options });

test('le jeton de la glane se reconnait dans l en-tete, jamais sans jeton configure', async () => {
	assert.equal(await estLaFlotte('Bearer s3cret', 's3cret'), true);
	assert.equal(await estLaFlotte('Bearer  s3cret ', 's3cret'), true);
	assert.equal(await estLaFlotte('Bearer autre', 's3cret'), false);
	assert.equal(await estLaFlotte('Basic s3cret', 's3cret'), false);
	assert.equal(await estLaFlotte(null, 's3cret'), false);
	assert.equal(await estLaFlotte('Bearer ', ''), false);
	assert.equal(await estLaFlotte('Bearer x', undefined), false);
});

test('la glane a son propre plafond, hors de celui des adresses', () => {
	assert.deepEqual(plafond({ deCetteAdresse: DEPOTS_PAR_ADRESSE + 1, duJour: 1e6, instant: midi.toISOString(), flotte: true }), { ok: true });
	const r = plafond({ deCetteAdresse: ACTES_DE_LA_FLOTTE_PAR_JOUR, duJour: 0, instant: midi.toISOString(), flotte: true });
	assert.equal(r.ok, false);
	assert.match(r.motif, /flotte/);
});

test('la glane depose plus de vingt actes dans la journee et ne compte pas parmi les deposants', async () => {
	const db = baseDeTest();
	for (let n = 1; n <= DEPOTS_PAR_ADRESSE + 5; n++) assert.equal((await glaner(db, acte(n))).statut, 201, `acte ${n}`);
	const serie = await serieDeLaCollectivite({ db, codes: ['17133'] });
	assert.equal(serie.total, DEPOTS_PAR_ADRESSE + 5);
	const exterieur = await deposer({ db, corps: { sha256: 'c'.repeat(64) }, adresse: '198.51.100.1', maintenant: midi });
	assert.equal(exterieur.statut, 201, 'les actes de la glane ne prennent pas le plafond du jour des autres');
	assert.deepEqual((await bilanPublic({ db })).jours, [{ jour: '2026-10-15', depots: 1, deposants: 1 }]);
	await deposer({ db, corps: { sha256: 'd'.repeat(64) }, adresse: '198.51.100.2', maintenant: lendemain });
	assert.deepEqual((await bilanPublic({ db })).jours[0], { jour: '2026-10-15', depots: 1, deposants: 1 }, 'le jour clos garde le bilan hors flotte');
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM compte WHERE adresse = ?').get(CLE_DE_LA_FLOTTE).n, 0);
});

test('la glane ne redate pas un acte deja date pour sa commune et rend son recu', async () => {
	const db = baseDeTest();
	const premier = corpsDe(await glaner(db, acte(7)));
	const memeFichier = temoinDe(() => '7'.padStart(64, '0'));
	const r = await glaner(db, acte(8), { temoin: memeFichier });
	assert.equal(r.statut, 200);
	assert.deepEqual(corpsDe(r), { deja: true, jour: '2026-10-15', place: premier.place, id: premier.id });
	assert.equal((await serieDeLaCollectivite({ db, codes: ['17133'] })).total, 1);
});

test('la glane ne depose ni un acte hors du site officiel ni autre chose qu un acte', async () => {
	const db = baseDeTest();
	const hors = await glaner(db, acte(1, { collectivite: '17134' }));
	assert.equal(hors.statut, 422);
	assert.match(corpsDe(hors).erreur, /hors du site officiel/);
	const ordinaire = await glaner(db, { sha256: 'e'.repeat(64) });
	assert.equal(ordinaire.statut, 400);
	assert.match(corpsDe(ordinaire).details.join(), /que des actes/);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM depot').get().n, 0);
});

test('la glane s arrete a son plafond du jour', async () => {
	const db = baseDeTest();
	db.sqlite.prepare('INSERT INTO compte (jour, adresse, n) VALUES (?, ?, ?)').run('2026-10-15', CLE_DE_LA_FLOTTE, ACTES_DE_LA_FLOTTE_PAR_JOUR);
	const r = await glaner(db, acte(1));
	assert.equal(r.statut, 429);
	assert.match(corpsDe(r).erreur, /plafond de la flotte/);
});

import { relectureDeLActe } from '../src/service.mjs';
import { sha256 } from '../src/chaine.mjs';

const jourDe = (j) => new Date(`2026-10-${j}T12:00:00Z`);
const pdfQuiImprime = (texte) => new Uint8Array(Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length 20 >>\nstream\nBT (${texte}) Tj ET\nendstream\nendobj\n`, 'latin1'));
const temoinQuiGarde = (texte) => async (admise) => ({ ...(await parUrl(admise)), octets: pdfQuiImprime(texte) });

test("l'empreinte du texte d'un acte se pose a sa datation, et a la relecture d'un acte date avant elle (D-193)", async () => {
	const db = baseDeTest();
	const texteDe = (recu) => db.sqlite.prepare('SELECT sha256 FROM texte WHERE recu = ?').get(recu)?.sha256 ?? null;
	const r = await glaner(db, acte(7), { temoin: temoinQuiGarde('Budget primitif 2026') });
	assert.equal(r.statut, 201);
	assert.equal('copie' in corpsDe(r), false, 'les octets gardes pour le texte ne sortent pas');
	assert.equal(texteDe(corpsDe(r).id), await sha256('Budget primitif 2026'));
	const { id: ancien } = corpsDe(await glaner(db, acte(8)));
	assert.equal(texteDe(ancien), null, 'date par un temoin sans octets');
	assert.equal((await glaner(db, acte(8), { maintenant: jourDe(20), temoin: temoinQuiGarde('Travaux de voirie') })).statut, 200);
	assert.equal(texteDe(ancien), await sha256('Travaux de voirie'), 'les memes octets relus posent le texte');
	await glaner(db, acte(8), { maintenant: jourDe(21), temoin: temoinQuiGarde('Autre') });
	assert.equal(texteDe(ancien), await sha256('Travaux de voirie'), 'et ne le changent plus');
	assert.equal(texteDe(corpsDe(await glaner(db, acte(9), { temoin: temoinQuiGarde('') })).id), null, 'un PDF sans texte lisible n a pas d empreinte');
});
const disparue = (statut) => async () => {
	throw Object.assign(new Error(`la source a repondu ${statut}`), { statut });
};

test('la glane relit un acte deja date : les memes octets un autre jour, puis une adresse qui ne le sert plus', async () => {
	const db = baseDeTest();
	const { id } = corpsDe(await glaner(db, acte(3)));
	assert.equal(await relectureDeLActe({ db, recu: id }), null, 'le jour du depot, rien a relire');
	const meme = await glaner(db, acte(3), { maintenant: jourDe(20) });
	assert.equal(meme.statut, 200);
	assert.equal(corpsDe(meme).id, id);
	assert.deepEqual({ ...(await relectureDeLActe({ db, recu: id })) }, { jour: '2026-10-20', depuis: '2026-10-20', statut: 200 });
	const partie = await glaner(db, acte(3), { maintenant: jourDe(23), temoin: disparue(404) });
	assert.equal(partie.statut, 422);
	assert.deepEqual({ ...(await relectureDeLActe({ db, recu: id })) }, { jour: '2026-10-23', depuis: '2026-10-23', statut: 404 });
	await glaner(db, acte(3), { maintenant: jourDe(30), temoin: disparue(404) });
	assert.deepEqual({ ...(await relectureDeLActe({ db, recu: id })) }, { jour: '2026-10-30', depuis: '2026-10-23', statut: 404 }, 'depuis ne bouge pas');
	await glaner(db, acte(3), { maintenant: jourDe(31) });
	assert.deepEqual({ ...(await relectureDeLActe({ db, recu: id })) }, { jour: '2026-10-31', depuis: '2026-10-31', statut: 200 }, 'revenue');
});

test("la relecture ne note rien pour une erreur passagere, une autre adresse ou un depot qui n'est pas de la glane", async () => {
	const db = baseDeTest();
	const { id } = corpsDe(await glaner(db, acte(4)));
	assert.equal((await glaner(db, acte(4), { maintenant: jourDe(20), temoin: disparue(500) })).statut, 422);
	assert.equal(await relectureDeLActe({ db, recu: id }), null, 'un 500 ne prouve rien');
	const ailleurs = temoinDe(() => '4'.padStart(64, '0'));
	assert.equal((await glaner(db, acte(9), { maintenant: jourDe(21), temoin: ailleurs })).statut, 200);
	assert.equal(await relectureDeLActe({ db, recu: id }), null, 'les memes octets sous une autre adresse ne relisent pas celle-ci');
	const exterieur = await deposer({ db, corps: acte(4), adresse: '198.51.100.1', maintenant: jourDe(22), temoin: disparue(404), annuaire });
	assert.equal(exterieur.statut, 422);
	assert.equal(await relectureDeLActe({ db, recu: id }), null, 'seule la glane relit');
});

test('au plafond du jour, la glane relit encore ses actes, mais ne date rien de nouveau', async () => {
	const db = baseDeTest();
	const { id } = corpsDe(await glaner(db, acte(5)));
	db.sqlite.prepare('INSERT INTO compte (jour, adresse, n) VALUES (?, ?, ?)').run('2026-10-20', CLE_DE_LA_FLOTTE, ACTES_DE_LA_FLOTTE_PAR_JOUR);
	assert.equal((await glaner(db, acte(5), { maintenant: jourDe(20) })).statut, 200);
	assert.equal((await relectureDeLActe({ db, recu: id })).statut, 200);
	assert.equal((await glaner(db, acte(6), { maintenant: jourDe(20), temoin: disparue(410) })).statut, 422);
	const change = await glaner(db, acte(5), { maintenant: jourDe(20), temoin: temoinDe(() => 'f'.repeat(64)) });
	assert.equal(change.statut, 409, 'une adresse ne se lit qu une fois par jour');
	const neuf = await glaner(db, acte(7), { maintenant: jourDe(20) });
	assert.equal(neuf.statut, 429);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM depot').get().n, 1);
});

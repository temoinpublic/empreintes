import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RACINE_NULLE, arbre, chainer, empreinteDeFeuille, hacherLignes, inscriptionDuRecu, preuveDuDepot } from '../src/chaine.mjs';
import { resumeDe } from '../src/journal.mjs';
import { ligneDe } from '../src/depot.mjs';
import { lecturePublique, ligneDuRecu, lignesDeLEmpreinte, deposer } from '../src/service.mjs';
import { ACTES, pageRecu, pageRecuInconnu } from '../src/pages.mjs';
import { baseDeTest } from './d1.mjs';
import { onRequestGet as pageDuRecu } from '../functions/recu/[id].js';
import { onRequestGet as apiRecu } from '../functions/api/recus/[id].js';
import { onRequestGet as apiDepots } from '../functions/api/depots/[empreinte].js';

const h = (t) => createHash('sha256').update(String(t)).digest('hex');
// Le fichier des depots tel que l'entrepot l'ecrit : la ligne publique plus l'instant de sa lecture.
const ligneEntrepot = (i) => `${JSON.stringify({ sha256: h(`doc${i}`), jour: '2026-10-12', place: i, recu: h(`recu${i}`), lu: '2026-10-12T16:10:00.000Z' })}\n`;
const texteDesDepots = [1, 2, 3].map(ligneEntrepot).join('');

async function releveAvec(id, precedente, feuilles) {
	const a = await arbre(await Promise.all(feuilles.map(empreinteDeFeuille)));
	return { id, precedente, arbre: a, racine: await chainer({ id, precedente, arbre: a }), feuilles };
}
const objet = { cle: 'source/x', sha256: h('x'), jour: '2026-10-12' };

test('les n premieres lignes se hachent comme l entrepot les fige', async () => {
	assert.equal(await hacherLignes(texteDesDepots, 2), h(ligneEntrepot(1) + ligneEntrepot(2)));
	assert.equal(await hacherLignes(texteDesDepots, 4), null);
});

test('un depot est inscrit au premier tour dont la feuille depots:<n> couvre sa ligne', async () => {
	const t1 = await releveAvec('20261012T141000Z', RACINE_NULLE, [objet, { cle: 'depots:1', sha256: await hacherLignes(texteDesDepots, 1), jour: '2026-10-12' }]);
	const t2 = await releveAvec('20261012T161000Z', t1.racine, [objet, { cle: 'depots:3', sha256: await hacherLignes(texteDesDepots, 3), jour: '2026-10-12' }]);
	const p = await preuveDuDepot({ recu: h('recu2'), texteDesDepots, releves: [t1, t2] });
	assert.equal(p.etat, 'inscrit');
	assert.equal(p.tour, t2.id);
	assert.deepEqual([p.rang, p.n], [2, 3]);
	assert.equal(p.racine, t2.racine);
	assert.equal((await preuveDuDepot({ recu: h('recu1'), texteDesDepots, releves: [t1, t2] })).tour, t1.id);
	assert.deepEqual(await preuveDuDepot({ recu: h('recu3'), texteDesDepots, releves: [t1] }), { etat: 'attente', rang: 3 });
	assert.deepEqual(await preuveDuDepot({ recu: h('inconnu'), texteDesDepots, releves: [t2] }), { etat: 'attente' });
	const altere = texteDesDepots.replace('16:10', '16:11');
	assert.equal((await preuveDuDepot({ recu: h('recu2'), texteDesDepots: altere, releves: [t2] })).etat, 'non conforme');
});

test('le resume d un tour porte son compte de depots ; l inscription se lit sur les fichiers publics', async () => {
	const t = await releveAvec('20261012T161000Z', RACINE_NULLE, [objet, { cle: 'depots:3', sha256: await hacherLignes(texteDesDepots, 3), jour: '2026-10-12' }]);
	const resume = resumeDe(t, { ots: 'bitcoin', bloc: 971100 }, []);
	assert.equal(resume.depots, 3);
	assert.equal(resumeDe(await releveAvec('20261012T100000Z', RACINE_NULLE, [objet]), null, []).depots, 0);
	const fichiers = { '/empreintes/depots.jsonl': texteDesDepots, '/tours.json': JSON.stringify({ tours: [{ ...resume, depots: 0, id: 'avant' }, resume] }), [`/empreintes/${t.id}.json`]: JSON.stringify(t) };
	const lire = async (c) => (c in fichiers ? new Response(fichiers[c]) : new Response('', { status: 404 }));
	const p = await inscriptionDuRecu(h('recu3'), lire);
	assert.equal(p.etat, 'inscrit');
	assert.equal(p.bloc, 971100);
	assert.deepEqual(await inscriptionDuRecu(h('rien'), lire), { etat: 'attente' });
	assert.deepEqual(await inscriptionDuRecu(h('recu1'), async () => new Response('', { status: 404 })), { etat: 'attente' });
	await assert.rejects(inscriptionDuRecu(h('recu1'), async () => new Response('', { status: 503 })), /illisible : 503/, 'une panne ne se dit pas en attente');
	fichiers['/tours.json'] = JSON.stringify({ tours: [{ ...resume, depots: 2 }] });
	assert.deepEqual(await inscriptionDuRecu(h('recu3'), lire), { etat: 'attente', rang: 3 });
	fichiers['/tours.json'] = JSON.stringify({ tours: [{ ...resume, ots: 'calendrier' }] });
	assert.equal((await inscriptionDuRecu(h('recu3'), lire)).bloc, null);
});

test('un recu et une empreinte se retrouvent dans la base ; un identifiant illisible ne s y cherche pas', async () => {
	const db = baseDeTest();
	const r = JSON.parse((await deposer({ db, corps: { sha256: h('pv') }, adresse: 'a', maintenant: new Date('2026-10-12T12:00:00Z') })).corps);
	assert.deepEqual({ ...(await ligneDuRecu({ db, id: r.id })) }, { sha256: h('pv'), jour: '2026-10-12', place: 1, recu: r.id });
	assert.equal(await ligneDuRecu({ db, id: h('autre') }), null);
	assert.equal(await ligneDuRecu({ db, id: 'x' }), null);
	assert.equal((await lignesDeLEmpreinte({ db, empreinte: h('pv') })).length, 1);
	assert.deepEqual(await lignesDeLEmpreinte({ db, empreinte: h('rien') }), []);
	assert.equal(await lignesDeLEmpreinte({ db, empreinte: undefined }), null);
	assert.equal(lecturePublique(null).statut, 404);
	assert.equal(lecturePublique([]).entetes['cache-control'], 'public, max-age=60');
});

test('les Functions servent la page du recu, sa ligne et les depots d une empreinte', async () => {
	const env = { DEPOTS: baseDeTest() };
	const r = JSON.parse((await deposer({ db: env.DEPOTS, corps: { sha256: h('pv') }, adresse: 'a' })).corps);
	const page = await pageDuRecu({ request: new Request(`https://temoinpublic.fr/recu/${r.id}`), params: { id: r.id }, env });
	assert.equal(page.status, 200);
	assert.match(await page.text(), new RegExp(`data-recu="${r.id}"`));
	const allemande = await pageDuRecu({ request: new Request(`https://datumszeuge.de/recu/${r.id}`), params: { id: r.id }, env });
	assert.match(await allemande.text(), new RegExp(`<html lang="de">[\\s\\S]*<h1>Datumsbeleg</h1>[\\s\\S]*<p class="imprime">datumszeuge.de/recu/${r.id}</p>`));
	assert.equal((await pageDuRecu({ request: new Request('https://temoinpublic.fr/recu/x'), params: { id: h('rien') }, env })).status, 404);
	const inconnu = await pageDuRecu({ request: new Request('https://de.empreintes.pages.dev/recu/x'), params: { id: h('rien') }, env });
	assert.equal(inconnu.status, 404);
	assert.match(await inconnu.text(), /<h1>Unbekannter Beleg<\/h1>/);
	assert.equal((await (await apiRecu({ params: { id: r.id }, env })).json()).recu, r.id);
	assert.equal((await apiRecu({ params: { id: 'x' }, env })).status, 404);
	assert.equal((await (await apiDepots({ params: { empreinte: h('pv') }, env })).json()).length, 1);
});

test('la page du recu affiche la date, la ligne et mene au verificateur sous son seul nom', () => {
	const ligne = { sha256: h('pv'), jour: '2026-10-12', place: 4, recu: h('r') };
	const html = pageRecu(ligne);
	assert.match(html, /<h1>Reçu de date<\/h1>/);
	assert.match(html, /Document daté du 12\/10\/2026/);
	assert.match(html, new RegExp(`href="${ACTES.verifier.chemin}">${ACTES.verifier.nom}<`));
	assert.ok(ligneDe(ligne));
	assert.match(pageRecuInconnu(), /<h1>Reçu inconnu<\/h1>/);
	const allemand = pageRecu(ligne, null, 'de');
	assert.match(allemand, /<h2>Dokument datiert am 12\.10\.2026<\/h2>/);
	assert.match(html, /<dt>Entrée publique<\/dt><dd><a href="\/depots\/2026-10-12\.jsonl">n°\u00A04 du 12\/10\/2026<\/a><\/dd>/);
	assert.match(allemand, /<dt>Öffentlicher Eintrag<\/dt><dd><a href="\/depots\/2026-10-12\.jsonl">Nr\.\u00A04 vom 12\.10\.2026<\/a><\/dd>/);
	assert.match(allemand, new RegExp(`<link rel="alternate" hreflang="fr" href="https://temoinpublic.fr/recu/${ligne.recu}">\\n<link rel="alternate" hreflang="de" href="https://datumszeuge.de/recu/${ligne.recu}">`));
	assert.match(allemand, /<a class="bouton" href="\/pruefen">Prüfen<\/a>/);
	assert.match(pageRecu(ligne, { collectivite: '17133', nature: 'deliberation', objet: 'Budget', url: null }, 'de'), /<h2>Online am 12\.10\.2026<\/h2>[\s\S]*<dt>Rechtsakt<\/dt><dd>Beschluss, Budget<\/dd>[\s\S]*<a href="https:\/\/temoinpublic.fr\/collectivite\/17133">17133<\/a>/);
});

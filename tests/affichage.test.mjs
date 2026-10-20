import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTest } from './d1.mjs';
import { TYPES_DE_PERMIS, lireAffichage, numeroDePermis } from '../src/affichage.mjs';
import { TYPES, VERSION_DU_RECU_AFFICHAGE, idDuRecu, lireDemande, lireFichierDuJour, recuDe } from '../src/depot.mjs';
import { deposer, fichierDuJour } from '../src/service.mjs';

/*
 * Ce que ces tests defendent : un affichage est une empreinte declaree dont le
 * libelle est un numero de permis lu par sa forme et jamais un nom ; son recu
 * est de version 3 ; sa ligne publique ne change pas ; et le serveur ne borne
 * pas les depots d'un meme numero, qu'un tiers lisant le panneau prendrait.
 */

const midi = new Date('2026-10-14T12:00:00Z');
const H = 'a'.repeat(64);
const corpsDe = (r) => JSON.parse(r.corps);
const affichage = (autres = {}) => ({ type: 'affichage', sha256: H, libelle: 'PC 069 123 24 A0001', ...autres });

test('un numero de permis se lit par sa forme, quels que soient ses separateurs, et se remet en forme', () => {
	for (const saisie of ['PC 069 123 24 A0001', 'pc06912324a0001', 'PC-069-123-24-A0001', 'PC.069.123.24.A0001', ' PC 069 123 24 A0001 ', 'PC/069/123/24/A0001']) {
		assert.equal(numeroDePermis(saisie), 'PC 069 123 24 A0001', saisie);
	}
	assert.equal(numeroDePermis('DP 02A 004 26 00012'), 'DP 02A 004 26 00012');
	assert.equal(numeroDePermis('PA 974 411 25 Z0007'), 'PA 974 411 25 Z0007');
	assert.equal(numeroDePermis('PD 095 500 24 10001'), 'PD 095 500 24 10001');
	assert.deepEqual(TYPES_DE_PERMIS, ['PC', 'PA', 'PD', 'DP']);
});

test('un numero mal forme n est pas devine', () => {
	for (const saisie of ['PC 020 123 24 A0001', 'PC 096 123 24 A0001', 'PC 977 123 24 A0001', 'PC 000 123 24 A0001', 'PX 069 123 24 A0001', 'PC 069 123 24 A001', 'PC 069 123 2024 A0001', '', 'permis de construire', 42, null, undefined]) {
		assert.equal(numeroDePermis(saisie), null, String(saisie));
	}
});

test('la demande d un affichage exige l empreinte declaree de la photo et un numero de permis', () => {
	assert.deepEqual(lireDemande(affichage()).demande, { sha256: H, libelle: 'PC 069 123 24 A0001', affichage: { permis: 'PC 069 123 24 A0001' } });
	assert.deepEqual(lireDemande(affichage({ libelle: 'pc06912324a0001' })).demande.affichage, { permis: 'PC 069 123 24 A0001' });
	assert.deepEqual(TYPES, ['acte', 'affichage']);
	const erreurs = (corps) => lireDemande(corps).erreurs?.join(' | ') ?? '';
	assert.match(erreurs(affichage({ sha256: undefined })), /le sha256 de la photo est requis/);
	assert.doesNotMatch(erreurs(affichage({ sha256: undefined })), /l un des deux/);
	assert.match(erreurs(affichage({ sha256: undefined, url: 'https://x.fr/photo.jpg' })), /pas d url, seulement le sha256/);
	assert.match(erreurs(affichage({ libelle: undefined })), /libelle : le numero du permis/);
	assert.match(erreurs(affichage({ libelle: 'panneau de la maison' })), /libelle : le numero du permis/);
	assert.match(erreurs(affichage({ libelle: 'PC 069 123 24 A0001 de M. Dupont' })), /aucun nom de personne/);
	assert.match(erreurs(affichage({ collectivite: '69123' })), /seulement avec "type": "acte"/);
	assert.match(erreurs(affichage({ type: 'photo' })), /type : "acte", "affichage" ou rien/);
	assert.equal(lireAffichage({ sha256: H, libelle: 'PC 069 123 24 A0001' }, []), null, 'sans type, un depot ordinaire');
});

test('un affichage se depose en empreinte declaree, son recu porte le numero en version 3, sa ligne publique reste a quatre champs', async () => {
	const db = baseDeTest();
	const r = await deposer({ db, corps: affichage(), adresse: 'a', maintenant: midi });
	assert.equal(r.statut, 201);
	const { recu, id } = corpsDe(r);
	assert.equal(recu.version, VERSION_DU_RECU_AFFICHAGE);
	assert.equal(recu.version, 3);
	assert.equal(recu.source, 'declare');
	assert.equal(recu.libelle, 'PC 069 123 24 A0001');
	assert.deepEqual(recu.affichage, { permis: 'PC 069 123 24 A0001' });
	assert.equal(recu.temoin, undefined);
	assert.equal(recu.acte, undefined);
	assert.equal(id, await idDuRecu(recu));
	const f = await fichierDuJour({ db, nom: '2026-10-14.jsonl', maintenant: midi });
	const [ligne] = lireFichierDuJour(f.corps, '2026-10-14');
	assert.deepEqual(Object.keys(ligne), ['sha256', 'jour', 'place', 'recu']);
	// La ligne publique n'est que des hex minuscules : « A0001 » ne peut pas y venir d'un sha256, « 069 » si (run 39351334763).
	assert.ok(!f.corps.includes('A0001'), 'le numero du permis ne se publie pas');
	assert.throws(() => recuDe({ sha256: H, instant: midi.toISOString(), affichage: { permis: 'PC 069 123 24 A0001' }, temoin: { url: 'https://x.fr/p.jpg', taille: 1, lu: midi.toISOString() } }), /empreinte declaree/);
});

test('le serveur ne borne pas les depots d un meme numero : deux appareils, le meme jour, sont tous deux recus', async () => {
	const db = baseDeTest();
	const un = await deposer({ db, corps: affichage(), adresse: 'petitionnaire', maintenant: midi });
	const deux = await deposer({ db, corps: affichage({ sha256: 'b'.repeat(64) }), adresse: 'tiers', maintenant: midi });
	const trois = await deposer({ db, corps: affichage({ sha256: 'c'.repeat(64) }), adresse: 'petitionnaire', maintenant: midi });
	assert.deepEqual([un.statut, deux.statut, trois.statut], [201, 201, 201]);
	assert.deepEqual([corpsDe(un).place, corpsDe(deux).place, corpsDe(trois).place], [1, 2, 3]);
});

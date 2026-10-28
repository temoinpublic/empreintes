import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
	DEPOTS_PAR_ADRESSE,
	DEPOTS_PAR_JOUR,
	canonique,
	estUnRecu,
	cleDAdresse,
	idDuRecu,
	empreinteDeLAdresse,
	jourDe,
	ligneDe,
	ligneDuRecu,
	lireDemande,
	lireFichierDuJour,
	plafond,
	recuDe,
	secondesAvantDemain,
	selAleatoire
} from '../src/depot.mjs';

const H = 'a'.repeat(64);
const B = 'b'.repeat(64);
const sha = (t) => createHash('sha256').update(t).digest('hex');

test('une demande porte une empreinte OU une url, et un libelle facultatif', () => {
	assert.deepEqual(lireDemande({ sha256: ` ${'A'.repeat(64)} `, libelle: '  Deliberation   n 12 ' }), { demande: { sha256: H, libelle: 'Deliberation n 12' } });
	assert.deepEqual(lireDemande({ url: 'https://exemple.fr/a.pdf' }), { demande: { url: 'https://exemple.fr/a.pdf' } });
	assert.deepEqual(lireDemande({ sha256: H, libelle: '   ' }), { demande: { sha256: H } });
	assert.deepEqual(lireDemande({ sha256: H, libelle: null }), { demande: { sha256: H } });
});

test('une demande mal formee dit chacune de ses fautes', () => {
	assert.match(lireDemande(null).erreurs[0], /objet JSON/);
	assert.match(lireDemande([]).erreurs[0], /objet JSON/);
	assert.match(lireDemande({}).erreurs.join(), /l un des deux est requis/);
	assert.match(lireDemande({ sha256: H, url: 'https://x.fr' }).erreurs.join(), /pas les deux/);
	assert.match(lireDemande({ sha256: 'xyz' }).erreurs.join(), /64 caracteres/);
	assert.match(lireDemande({ sha256: 12 }).erreurs.join(), /64 caracteres/);
	assert.match(lireDemande({ url: '' }).erreurs.join(), /url : texte/);
	assert.match(lireDemande({ url: `https://x.fr/${'a'.repeat(2048)}` }).erreurs.join(), /url : texte/);
	assert.match(lireDemande({ sha256: H, libelle: 3 }).erreurs.join(), /libelle : un texte/);
	assert.match(lireDemande({ sha256: H, libelle: 'x'.repeat(201) }).erreurs.join(), /200 caracteres/);
	assert.match(lireDemande({ sha256: H, libelle: 'a\u0000b' }).erreurs.join(), /controle/);
	assert.match(lireDemande({ sha256: H, libelle: 'a b' }).erreurs.join(), /controle/);
	assert.match(lireDemande({ sha256: H, nom: 'Dupont' }).erreurs.join(), /champs inconnus : nom/);
});

test('la forme canonique trie les cles a chaque niveau et omet les absents', () => {
	assert.equal(canonique({ b: 1, a: { d: [2, { y: null, x: 'é' }], c: undefined } }), '{"a":{"d":[2,{"x":"é","y":null}]},"b":1}');
});

test('un recu declare et un recu de temoin, et leur ligne publique', async () => {
	const instant = '2026-10-12T13:45:00.123Z';
	const declare = recuDe({ sha256: H, instant, libelle: 'PV du conseil', sel: '0'.repeat(32) });
	assert.equal(declare.source, 'declare');
	assert.equal(declare.jour, '2026-10-12');
	assert.equal(declare.temoin, undefined);
	const id = await idDuRecu(declare);
	assert.equal(id, sha(canonique(declare)));
	assert.equal(await ligneDuRecu(declare, 3), `{"sha256":"${H}","jour":"2026-10-12","place":3,"recu":"${id}"}\n`);
	assert.ok(!(await ligneDuRecu(declare, 3)).includes('PV du conseil'), 'le libelle ne sort jamais du recu');
	const temoin = recuDe({ sha256: B, instant, url: 'https://x.fr/a', temoin: { url: 'https://x.fr/b', taille: 10, lu: instant } });
	assert.equal(temoin.source, 'temoin');
	assert.deepEqual(temoin.temoin, { url: 'https://x.fr/b', taille: 10, type: null, lu: instant });
	assert.match(temoin.sel, /^[0-9a-f]{32}$/);
	assert.notEqual(selAleatoire(), selAleatoire());
	assert.throws(() => recuDe({ sha256: 'x', instant }), /sha256 illisible/);
	assert.equal(declare.place, undefined);
});

test('une ligne refuse ce qui sortirait du format', () => {
	assert.throws(() => ligneDe({ sha256: H, jour: '2026-10-12', place: 1, recu: 'x' }), /64 hex/);
	assert.throws(() => ligneDe({ sha256: H, jour: '12/10/2026', place: 1, recu: B }), /jour/);
	assert.throws(() => ligneDe({ sha256: H, jour: '2026-10-12', place: 1.5, recu: B }), /place/);
});

test('le fichier du jour se relit ligne a ligne, places suivies depuis 1, ou leve', () => {
	const l1 = ligneDe({ sha256: H, jour: '2026-10-12', place: 1, recu: B });
	const l2 = ligneDe({ sha256: B, jour: '2026-10-12', place: 2, recu: H });
	assert.deepEqual(lireFichierDuJour('', '2026-10-12'), []);
	assert.equal(lireFichierDuJour(l1 + l2, '2026-10-12')[1].place, 2);
	assert.throws(() => lireFichierDuJour(l1.trim(), '2026-10-12'), /saut de ligne/);
	assert.throws(() => lireFichierDuJour(l2, '2026-10-12'), /ligne 1 : hors format/);
	assert.throws(() => lireFichierDuJour(l1, '2026-10-13'), /hors format/);
	assert.throws(() => lireFichierDuJour('{oops\n', '2026-10-12'), /JSON illisible/);
	assert.throws(() => lireFichierDuJour(l1.replace('{"sha256"', '{ "sha256"'), '2026-10-12'), /hors format/);
	assert.throws(() => lireFichierDuJour(`${JSON.stringify({ sha256: 'x', jour: '2026-10-12', place: 1, recu: B })}\n`, '2026-10-12'), /hors format/);
});

test('une adresse est comptee sous un hache sale du jour, jamais en clair', async () => {
	const c = await cleDAdresse('203.0.113.7', 'sel-du-jour');
	assert.equal(c, sha('203.0.113.7\nsel-du-jour'));
	assert.notEqual(c, await cleDAdresse('203.0.113.7', 'sel-du-lendemain'));
});

test('les plafonds : 20 par adresse, 2 000 par jour, retry-after jusqu a minuit UTC', () => {
	const instant = '2026-10-12T23:59:30Z';
	assert.deepEqual(plafond({ deCetteAdresse: DEPOTS_PAR_ADRESSE - 1, duJour: 0, instant }), { ok: true });
	assert.deepEqual(plafond({ deCetteAdresse: DEPOTS_PAR_ADRESSE, duJour: 0, instant }), { ok: false, motif: 'plafond de cette adresse atteint', apres: 30 });
	assert.equal(plafond({ deCetteAdresse: 0, duJour: DEPOTS_PAR_JOUR, instant }).motif, 'plafond du jour atteint');
	assert.equal(secondesAvantDemain('2026-10-12T00:00:00Z'), 86400);
	assert.equal(jourDe('2026-10-12T23:59:59.999Z'), '2026-10-12');
});

/*
 * 2026-10-15, /verifier : un recu d'affichage de permis (version 3) deposait
 * bien, mais la page ne le reconnaissait pas comme un recu et le hachait comme
 * un document quelconque. La forme d'un recu se lit desormais ici, une fois.
 */
test('un recu de chaque version emise se reconnait, et rien d autre', async () => {
	const instant = '2026-10-15T08:00:00.000Z';
	const recus = [
		recuDe({ sha256: 'a'.repeat(64), instant }),
		recuDe({ sha256: 'a'.repeat(64), instant, url: 'https://x.fr/a', temoin: { url: 'https://x.fr/a', taille: 1, lu: instant }, acte: { collectivite: '17133', nature: 'arrete', rattachement: 'declaree' } }),
		recuDe({ sha256: 'a'.repeat(64), instant, affichage: { permis: 'PC 069 123 24 A0001' } })
	];
	assert.deepEqual(recus.map((r) => r.version), [1, 2, 3]);
	for (const r of recus) assert.ok(estUnRecu(JSON.parse(JSON.stringify(r))), `version ${r.version}`);
	assert.ok(!estUnRecu({ ...recus[0], version: 9 }));
	assert.ok(!estUnRecu({ ...recus[0], sel: 'court' }));
	assert.ok(!estUnRecu({ ...recus[0], sha256: undefined }));
	assert.ok(!estUnRecu(null));
	const verifier = fs.readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	assert.match(verifier, /estUnRecu\(r\)/, 'la page de verification lit la forme du recu au meme endroit');
});

test('l adresse de depot ne pre-remplit qu une empreinte SHA-256 bien formee', () => {
	const e = 'ab'.repeat(32);
	assert.equal(empreinteDeLAdresse(`?empreinte=${e}`), e);
	assert.equal(empreinteDeLAdresse(`?empreinte=${e.toUpperCase()}`), e);
	assert.equal(empreinteDeLAdresse(`?x=1&empreinte=${e}`), e);
	assert.equal(empreinteDeLAdresse(''), null);
	assert.equal(empreinteDeLAdresse('?empreinte='), null);
	assert.equal(empreinteDeLAdresse(`?empreinte=${e.slice(1)}`), null);
	assert.equal(empreinteDeLAdresse('?empreinte=<script>'), null);
});

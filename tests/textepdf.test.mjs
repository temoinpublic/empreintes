import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { sha256 } from '../src/chaine.mjs';
import { FLUX_CLAIR_MAX, empreinteDuTexte, gonfler, texteDuPdf, texteImprime } from '../src/textepdf.mjs';

const octets = (s) => new Uint8Array(Buffer.from(s, 'latin1'));
const flate = (clair) => Buffer.from(deflateSync(Buffer.from(clair, 'latin1'))).toString('latin1');
const objet = (n, dictionnaire, contenu) => `${n} 0 obj\n<< ${dictionnaire} /Length ${contenu.length} >>\nstream\n${contenu}\nendstream\nendobj\n`;
const pdf = (...objets) => octets(`%PDF-1.4\n%\xe2\xe3\xcf\xd3\n${objets.join('')}trailer\n<< /Root 1 0 R >>\n%%EOF\n`);
const page = (texte, operateurs = '') => `BT /F1 12 Tf 72 700 Td ${operateurs}(${texte}) Tj ET`;

test('deux encodages du meme document ont la meme empreinte, un texte qui change en change', async () => {
	const clair = pdf(objet(4, '', page('Budget primitif 2026')));
	const comprime = pdf(objet(4, '/Filter /FlateDecode', flate(page('Budget primitif 2026'))));
	const tableau = pdf(objet(9, '/Filter [ /FlateDecode ]', flate(page('Budget primitif 2026'))));
	const deplace = pdf(objet(4, '/Filter /FlateDecode', flate(page('Budget primitif 2026', '1 0 0 1 20 500 Tm T* '))));
	const voulue = await sha256('Budget primitif 2026');
	for (const [nom, o] of Object.entries({ clair, comprime, tableau, deplace })) assert.equal(await empreinteDuTexte(o), voulue, nom);
	assert.notEqual(await empreinteDuTexte(pdf(objet(4, '/Filter /FlateDecode', flate(page('Budget primitif 2027'))))), voulue);
});

test('les chaines hexadecimales, les echappements et les blancs se lisent comme le texte imprime', async () => {
	assert.equal(texteImprime('BT <42 75 64> Tj (get) Tj ET'), 'Budget');
	assert.equal(texteImprime('BT (a\\)b\\101\\n) Tj  (  c ) Tj ET'), 'a)bA c');
	assert.equal(texteImprime("BT [(Bud) -20 (get)] TJ (2026) ' ET"), 'Budget2026');
	assert.equal(texteImprime('q 1 0 0 1 0 0 cm /Im0 Do Q'), '');
	assert.equal(await texteDuPdf(pdf(objet(4, '', page('Un')), objet(5, '/Filter /FlateDecode', flate(page('Deux'))))), 'Un\nDeux');
});

test('rien que des PDF qui impriment : sinon null', async () => {
	assert.equal(await empreinteDuTexte(null), null);
	assert.equal(await empreinteDuTexte(new Uint8Array(0)), null);
	assert.equal(await empreinteDuTexte(octets('<!doctype html><p>(texte)</p>')), null);
	assert.equal(await empreinteDuTexte(pdf(objet(4, '', 'q 1 0 0 1 0 0 cm /Im0 Do Q'))), null, 'sans operateur de texte');
	assert.equal(await empreinteDuTexte(pdf(objet(4, '', 'BT /F1 12 Tf ET'))), null, 'un bloc de texte vide');
	assert.equal(await empreinteDuTexte(pdf('5 0 obj\n<< /Length 9 >>\nstream\nBT (x) Tj ET')), null, 'un flux sans fin est saute');
});

test('les flux sans texte sont sautes : image, police, metadonnees, objets, autre filtre, zlib abime', async () => {
	const texte = objet(4, '/Filter /FlateDecode', flate(page('Texte')));
	const voulue = await sha256('Texte');
	const bruit = 'BT (pas du texte) Tj ET';
	const sautes = {
		image: objet(5, '/Type /XObject /Subtype /Image /Width 2 /Height 2 /Filter /FlateDecode', flate(bruit)),
		police: objet(6, '/Length1 20 /Filter /FlateDecode', flate(bruit)),
		metadonnees: objet(7, '/Type /Metadata /Subtype /XML', bruit),
		objets: objet(8, '/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode', flate(bruit)),
		lzw: objet(9, '/Filter /LZWDecode', bruit),
		deuxFiltres: objet(10, '/Filter [ /ASCII85Decode /FlateDecode ]', bruit),
		abime: objet(11, '/Filter /FlateDecode', 'pas du zlib du tout'),
		fichier: objet(12, '/Type /EmbeddedFile', bruit)
	};
	for (const [nom, o] of Object.entries(sautes)) assert.equal(await empreinteDuTexte(pdf(texte, o)), voulue, nom);
	assert.equal(await empreinteDuTexte(pdf(Object.values(sautes).join(''))), null);
});

test('un flux tronque garde ce qui en sort, un flux trop gros en clair ne compte pas', async () => {
	const lignes = Array.from({ length: 3000 }, (_, i) => `(Ligne ${i} du texte, ${(i * 7919) % 10007}) Tj `);
	const long = flate(`BT ${lignes.join('')}ET`);
	const tronque = long.slice(0, Math.floor(long.length / 2));
	const sorti = await gonfler(octets(tronque));
	assert.ok(sorti && sorti.byteLength > 0 && sorti.byteLength < lignes.join('').length, 'une partie seulement');
	const partiel = texteImprime(Buffer.from(sorti).toString('latin1'));
	assert.ok(partiel.startsWith('Ligne 0 du texte') && !partiel.includes('Ligne 2999'), 'les chaines completes sorties');
	assert.equal(await gonfler(octets(flate('x'.repeat(5000))), 1000), null, 'au-dela de max');
	assert.equal(await gonfler(octets('pas du zlib')), null);
	assert.equal(FLUX_CLAIR_MAX, 16 * 1024 * 1024);
	const voulue = await sha256('Texte');
	assert.equal(await empreinteDuTexte(pdf(objet(4, '', page('Texte')), objet(5, '/Filter /FlateDecode', tronque))), await sha256(`Texte\n${texteImprime(Buffer.from(sorti).toString('latin1'))}`));
	assert.notEqual(await empreinteDuTexte(pdf(objet(4, '', page('Texte')), objet(5, '/Filter /FlateDecode', tronque))), voulue);
});

test('« endstream » suivi d un retour n ouvre pas un flux', async () => {
	const o = pdf(`4 0 obj\n<< /Length 25 >>\nstream\n${page('Un')}\nendstream\nendobj\n5 0 obj\n<< /Length 5 >>\nstream\n(Deux)\nendstream\nendobj\n`);
	assert.equal(await texteDuPdf(o), 'Un');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { sha256 } from '../src/chaine.mjs';
import { ETENDUE, FLUX_CLAIR_MAX, FLUX_PAR_PDF_MAX, METHODE_DU_TEXTE, TEXTE_CLAIR_TOTAL_MAX, degonfler, empreinteDuTexte, gonfler, lecteurDeTexte, lireLeTexte, texteDuPdf, texteImprime } from '../src/textepdf.mjs';

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

test('les flux sans texte sont sautes : image, police, metadonnees, objets, fichier ; un autre filtre ou un zlib abime rendent la lecture partielle', async () => {
	const texte = objet(4, '/Filter /FlateDecode', flate(page('Texte')));
	const voulue = await sha256('Texte');
	const bruit = 'BT (pas du texte) Tj ET';
	const sautes = {
		image: objet(5, '/Type /XObject /Subtype /Image /Width 2 /Height 2 /Filter /FlateDecode', flate(bruit)),
		jpeg: objet(5, '/Width 2 /Height 2 /Filter /DCTDecode', bruit),
		police: objet(6, '/Length1 20 /Filter /FlateDecode', flate(bruit)),
		metadonnees: objet(7, '/Type /Metadata /Subtype /XML', bruit),
		objets: objet(8, '/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode', flate(bruit)),
		fichier: objet(12, '/Type /EmbeddedFile', bruit)
	};
	for (const [nom, o] of Object.entries(sautes)) assert.equal(await empreinteDuTexte(pdf(texte, o)), voulue, nom);
	assert.equal(await empreinteDuTexte(pdf(Object.values(sautes).join(''))), null);
	const partiels = {
		lzw: objet(9, '/Filter /LZWDecode', bruit),
		deuxFiltres: objet(10, '/Filter [ /ASCII85Decode /FlateDecode ]', bruit),
		abime: objet(11, '/Filter /FlateDecode', 'pas du zlib du tout')
	};
	for (const [nom, o] of Object.entries(partiels)) {
		assert.deepEqual(await lireLeTexte(pdf(texte, o)), { texte: 'Texte', etendue: ETENDUE.partielle }, nom);
		assert.equal(await empreinteDuTexte(pdf(texte, o)), null, `${nom} : pas d empreinte sur une lecture partielle`);
	}
	assert.deepEqual(await lireLeTexte(pdf(texte)), { texte: 'Texte', etendue: ETENDUE.complete });
});

test('un flux tronque se lit mais rend la lecture partielle, un flux trop gros en clair ne compte pas', async () => {
	const lignes = Array.from({ length: 3000 }, (_, i) => `(Ligne ${i} du texte, ${(i * 7919) % 10007}) Tj `);
	const long = flate(`BT ${lignes.join('')}ET`);
	const tronque = long.slice(0, Math.floor(long.length / 2));
	const sorti = await gonfler(octets(tronque));
	assert.ok(sorti && sorti.byteLength > 0 && sorti.byteLength < lignes.join('').length, 'une partie seulement');
	assert.equal((await degonfler(octets(tronque))).entier, false);
	assert.equal((await degonfler(octets(flate('BT (x) Tj ET')))).entier, true);
	const partiel = texteImprime(Buffer.from(sorti).toString('latin1'));
	assert.ok(partiel.startsWith('Ligne 0 du texte') && !partiel.includes('Ligne 2999'), 'les chaines completes sorties');
	assert.equal(await gonfler(octets(flate('x'.repeat(5000))), 1000), null, 'au-dela de max');
	assert.equal(await gonfler(octets('pas du zlib')), null);
	assert.equal(FLUX_CLAIR_MAX, 16 * 1024 * 1024);
	const lecture = await lireLeTexte(pdf(objet(4, '', page('Texte')), objet(5, '/Filter /FlateDecode', tronque)));
	assert.equal(lecture.etendue, ETENDUE.partielle);
	assert.equal(lecture.texte, `Texte\n${partiel}`);
	assert.equal(await empreinteDuTexte(pdf(objet(4, '', page('Texte')), objet(5, '/Filter /FlateDecode', tronque))), null);
});

test('le texte invisible ne compte pas : modes de rendu 3 et 7, retablis par Q, la couche OCR d un scan', async () => {
	const voulue = await sha256('Visible');
	assert.equal(texteImprime('BT 3 Tr (cache) Tj 0 Tr (Visible) Tj ET'), 'Visible');
	assert.equal(texteImprime('BT 7 Tr (decoupe) Tj ET'), '');
	assert.equal(texteImprime('q BT 3 Tr (cache) Tj ET Q BT (Visible) Tj ET'), 'Visible');
	assert.equal(texteImprime('BT 3 Tr (cache) Tj ET BT (toujours cache) Tj ET'), '', 'le mode tient d un bloc a l autre');
	assert.equal(texteImprime('Q BT Tr (Visible) Tj ET'), 'Visible', 'un Q sans q et un Tr sans operande ne cassent rien');
	assert.equal(texteImprime('BT 3 Tr [(a) 1 (b)] TJ (c) \' 1 2 (d) " 0 Tr 1 2 (Visible) " ET'), 'Visible');
	assert.equal(await empreinteDuTexte(pdf(objet(4, '', 'BT 3 Tr (couche OCR) Tj ET'))), null, 'un scan avec sa couche OCR n a pas de texte montre');
	assert.equal(await empreinteDuTexte(pdf(objet(4, '', 'BT 3 Tr (couche OCR) Tj 0 Tr (Visible) Tj ET'))), voulue);
	assert.deepEqual(await lireLeTexte(pdf(objet(4, '', 'BT 3 Tr (couche OCR) Tj ET'))), { texte: null, etendue: ETENDUE.complete });
});

test('une chaine hors d un operateur de texte ne compte pas : dictionnaire d un BDC, nom, image en ligne, commentaire, hors BT', async () => {
	assert.equal(texteImprime('/Span << /ActualText (cache) /Lang (fr-FR) >> BDC BT (Visible) Tj ET EMC'), 'Visible');
	assert.equal(texteImprime('BT /Span << /MCID 3 >> BDC (Visible) Tj EMC ET'), 'Visible');
	assert.equal(texteImprime('(hors bloc) Tj BT (Visible) Tj ET'), 'Visible');
	assert.equal(texteImprime('BT % (commentaire) Tj\n(Visible) Tj ET'), 'Visible');
	assert.equal(texteImprime('q BI /W 2 /H 2 /BPC 8 /CS /G ID (x) Tj EI Q BT (Visible) Tj ET'), 'Visible');
	assert.equal(texteImprime('q BI /W 2 /H 2 ID sans fin'), '');
	assert.equal(texteImprime('BT (Visible) Tj ET { } ) <abc'), 'Visible', 'les jetons etrangers et un hexadecimal sans fin');
	assert.equal(texteImprime('BT <41> Tj <4> Tj (a\\\n) Tj (b\\\r\nc) Tj ET'), 'A@abc', 'hexadecimal impair, barre devant une fin de ligne');
	assert.equal(texteImprime('BT [(Visible)] TJ [ ] TJ ET'), 'Visible');
});

test('le dictionnaire du flux est le sien : un flux en clair apres un flux comprime se lit, et sa longueur declaree fait foi', async () => {
	const comprime = objet(4, '/Filter /FlateDecode', flate(page('Un')));
	const clair = objet(5, '', page('Deux'));
	assert.equal(await texteDuPdf(pdf(comprime, clair)), 'Un\nDeux');
	const finEnRetour = flate(page('Trois'));
	const sansLongueur = `6 0 obj\n<< /Filter /FlateDecode /Length 7 0 R >>\nstream\n${finEnRetour}\r\nendstream\nendobj\n7 0 obj\n${finEnRetour.length}\nendobj\n`;
	assert.deepEqual(await lireLeTexte(pdf(sansLongueur)), { texte: 'Trois', etendue: ETENDUE.complete }, 'la fin de ligne devant endstream n est pas du flux');
	const finEnRetourSimple = `6 0 obj\n<< /Filter /FlateDecode >>\nstream\n${finEnRetour}\rendstream\nendobj\n`;
	assert.deepEqual(await lireLeTexte(pdf(finEnRetourSimple)), { texte: 'Trois', etendue: ETENDUE.complete });
	const longueurFausse = `6 0 obj\n<< /Filter /FlateDecode /Length 999999 >>\nstream\n${finEnRetour}\nendstream\nendobj\n`;
	assert.deepEqual(await lireLeTexte(pdf(longueurFausse)), { texte: 'Trois', etendue: ETENDUE.complete }, 'une longueur qui depasse endstream est ignoree');
	const longueurCourte = `6 0 obj\n<< /Filter /FlateDecode /Length 3 >>\nstream\n${finEnRetour}\nendstream\nendobj\n`;
	assert.deepEqual(await lireLeTexte(pdf(longueurCourte)), { texte: 'Trois', etendue: ETENDUE.complete }, 'une longueur que endstream ne suit pas est ignoree');
});

test('un PDF chiffre ou qui n en est pas un a un texte inconnu', async () => {
	assert.deepEqual(await lireLeTexte(octets('<!doctype html>')), { texte: null, etendue: ETENDUE.inconnue });
	assert.deepEqual(await lireLeTexte(null), { texte: null, etendue: ETENDUE.inconnue });
	const chiffre = octets(`%PDF-1.4\n${objet(4, '', page('Texte'))}trailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF\n`);
	assert.deepEqual(await lireLeTexte(chiffre), { texte: null, etendue: ETENDUE.inconnue });
	assert.equal(await empreinteDuTexte(chiffre), null);
});

test('« endstream » suivi d un retour n ouvre pas un flux', async () => {
	const o = pdf(`4 0 obj\n<< /Length 25 >>\nstream\n${page('Un')}\nendstream\nendobj\n5 0 obj\n<< /Length 5 >>\nstream\n(Deux)\nendstream\nendobj\n`);
	assert.equal(await texteDuPdf(o), 'Un');
});

test('un pdf qui depasse le nombre de flux ou le volume decompresse total n a pas de texte connu', async () => {
	const nombreux = Array.from({ length: FLUX_PAR_PDF_MAX + 1 }, (_, i) => objet(i + 4, '', page('x')));
	assert.equal(await texteDuPdf(pdf(...nombreux)), null);
	const ligne = 'BT (a) Tj ET\n';
	const gros = flate(ligne.repeat(Math.floor(FLUX_CLAIR_MAX / ligne.length) - 1));
	const n = Math.ceil(TEXTE_CLAIR_TOTAL_MAX / FLUX_CLAIR_MAX) + 1;
	const lourd = Array.from({ length: n }, (_, i) => objet(i + 4, '/Filter /FlateDecode', gros));
	assert.equal(await texteDuPdf(pdf(...lourd)), null);
});

test('une page coupee en plusieurs flux se lit comme un seul : tableau et objet texte continues, etat a neuf apres un flux ferme', async () => {
	// La coupe tombe entre deux jetons, jamais dans l'un d'eux (PDF 32000-1, 7.8.2).
	const premier = objet(4, '', 'BT /F1 12 Tf [(Bud) -20');
	const second = objet(5, '', '(get)] TJ (2026) Tj ET');
	assert.deepEqual(await lireLeTexte(pdf(premier, second)), { texte: 'Budget2026', etendue: ETENDUE.complete });
	const invisible = objet(4, '', 'BT 3 Tr (couche) Tj');
	const suite = objet(5, '', '(encore) Tj ET');
	assert.equal(await texteDuPdf(pdf(invisible, suite)), null, 'le mode invisible tient sur la suite du flux coupe');
	const fermee = objet(4, '', 'BT 3 Tr (couche) Tj ET');
	const visible = objet(5, '', page('Visible'));
	assert.equal(await texteDuPdf(pdf(fermee, visible)), 'Visible', 'une page fermee ne transmet pas son mode a la suivante');
	assert.equal(await texteDuPdf(pdf(objet(4, '', 'BT 3 Tr (couche) Tj'), objet(5, '', 'ET'), visible)), 'Visible');
	const lecteur = lecteurDeTexte();
	assert.equal(lecteur.lire('BT [(a)'), '');
	assert.equal(lecteur.coupe(), true);
	assert.equal(lecteur.lire('(b)] TJ ET'), 'ab');
	assert.equal(lecteur.coupe(), false);
});

test('un flux vide, un flux suivi de bruit, un flux d indices et un profil ICC ne rendent pas la lecture partielle', async () => {
	const texte = objet(4, '/Filter /FlateDecode', flate(page('Texte')));
	const voulue = await sha256('Texte');
	const vide = objet(5, '/Filter /FlateDecode', flate(''));
	assert.deepEqual(await degonfler(octets(flate(''))), { clair: null, entier: true });
	const bruit = objet(6, '/Filter /FlateDecode', `${flate('BT (Visible) Tj ET')}\0\0\0\0`);
	assert.deepEqual(await degonfler(octets(`${flate('x')}\0\0`)), { clair: new Uint8Array([120]), entier: true });
	assert.deepEqual(await degonfler(octets('pas du zlib')), { clair: null, entier: false });
	const indices = objet(7, '/S 73 /Filter /FlateDecode', 'pas du zlib');
	const icc = objet(8, '/N 3 /Filter /ASCIIHexDecode', '00ff>');
	for (const [nom, o] of Object.entries({ vide, indices, icc })) assert.deepEqual(await lireLeTexte(pdf(texte, o)), { texte: 'Texte', etendue: ETENDUE.complete }, nom);
	assert.deepEqual(await lireLeTexte(pdf(texte, bruit)), { texte: 'Texte\nVisible', etendue: ETENDUE.complete });
	assert.equal(await empreinteDuTexte(pdf(texte, vide, indices, icc)), voulue);
	assert.equal(await empreinteDuTexte(pdf(objet(9, '/N 3 0 R /Filter /LZWDecode', 'x'), texte)), null, 'un /N indirect n est pas un profil');
	assert.equal(METHODE_DU_TEXTE, 3);
});

test('methode 3 : un flux sans fin ou un objet texte ouvert a la fin rendent la lecture partielle', async () => {
	const sansFin = pdf(objet(4, '', page('Un')), '5 0 obj\n<< /Length 9 >>\nstream\nBT (x) Tj ET');
	assert.deepEqual(await lireLeTexte(sansFin), { texte: 'Un', etendue: ETENDUE.partielle });
	const ouvert = pdf(objet(4, '', page('Un')), objet(5, '', 'BT (Deux) Tj'));
	assert.equal((await lireLeTexte(ouvert)).etendue, ETENDUE.partielle);
	assert.equal(await empreinteDuTexte(ouvert), null);
});

test('methode 3 : les memes instructions coupees en deux flux donnent l empreinte d un seul', async () => {
	const unSeul = pdf(objet(4, '', 'BT (Bon) Tj (jour) Tj ET'), objet(6, '', 'BT (a) Tj ET'));
	const coupe = pdf(objet(4, '', 'BT (Bon) Tj'), objet(5, '', '(jour) Tj ET'), objet(6, '', 'BT (a) Tj ET'));
	assert.equal(await texteDuPdf(unSeul), 'Bonjour\na');
	assert.equal(await empreinteDuTexte(coupe), await empreinteDuTexte(unSeul));
	// Deux flux fermes restent separes : « AB » puis « C » n'est pas « A » puis « BC ».
	const ab = pdf(objet(4, '', page('AB')), objet(5, '', page('C')));
	const bc = pdf(objet(4, '', page('A')), objet(5, '', page('BC')));
	assert.notEqual(await empreinteDuTexte(ab), await empreinteDuTexte(bc));
	assert.equal(METHODE_DU_TEXTE, 3);
});

test('une image en ligne dont les pixels ecrivent « EI » se saute jusqu au vrai EI', () => {
	const pixels = ' EI \x01\x02\xff\x80\x00\x90\xfe\x81\x82\x83\x84\x85\x86\x87\x88\x89\x8a\x8b\x8c\x8d\x8e\x8f\x91\x92\x93\x94\x95\x96\x97\x98\x99\x9a';
	assert.equal(texteImprime(`BT (Avant) Tj ET BI /W 4 /H 4 ID ${pixels} EI BT (Apres) Tj ET`), 'AvantApres');
});

test('un flux en clair qui porte « endstream » dans ses octets se lit jusqu a sa longueur declaree', async () => {
	const contenu = 'BT (Un) Tj ET BI /W 1 /H 1 ID x endstream EI BT (Deux) Tj ET';
	assert.deepEqual(await lireLeTexte(pdf(objet(4, '', contenu))), { texte: 'UnDeux', etendue: ETENDUE.complete });
});

test('une image en ligne : sa longueur declaree fait foi, un vrai EI suivi d un texte accentue ferme l image', () => {
	const piege = ' EI BT (Faux) Tj ET                              ';
	assert.equal(texteImprime(`BT (Avant) Tj ET BI /W 1 /H 1 /L ${piege.length} ID ${piege} EI BT (Apres) Tj ET`), 'AvantApres');
	const pixels = '\x01\x02\xff\x80';
	assert.equal(texteImprime(`BI /W 1 /H 1 ID ${pixels} EI BT (\xe9t\xe9) Tj ET`), '\xe9t\xe9');
	assert.equal(texteImprime(`BI /W 1 /H 1 ID ${pixels} EI \x01\x02 BT (Fin) Tj ET`), 'Fin', 'sans EI plausible, le premier');
});

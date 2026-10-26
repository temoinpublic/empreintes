import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { acteDuLien, coucheTexte, documentBudgetaireDe, estUnTelechargement, estUnePageBudget, identiteDuPdf, identiteImprimee, pagesBudget, telechargementsDe } from '../src/glane.mjs';

const ICI = 'https://bourgueil.fr/';
const sites = [['bourgueil.fr', '']];
const lien = (href, texte = '') => ({ href: href.startsWith('http') ? href : `${ICI}${href}`, texte });
const doc = (href, texte) => documentBudgetaireDe(lien(href, texte));

test('une page budget ou finances se reconnait a son libelle ou son chemin, pas un budget participatif', () => {
	assert.equal(estUnePageBudget(lien('ma-mairie/budgets/', 'Budgets')), true);
	assert.equal(estUnePageBudget(lien('mairie/finances-communales/', 'Finances')), true);
	assert.equal(estUnePageBudget(lien('x', 'Les comptes administratifs')), true);
	assert.equal(estUnePageBudget(lien('budget-participatif/', 'Budget participatif')), false);
	assert.equal(estUnePageBudget(lien('feux-dartifices-cofinances-par-la-municipalite/', 'Feux')), false, 'cofinances n est pas finances');
	assert.equal(estUnePageBudget(lien('agenda/', 'Agenda')), false);
	const liens = [lien('ma-mairie/budgets/', 'Budgets'), lien('ma-mairie/budgets/', 'Budgets encore'), lien('bp.pdf', 'Budget primitif'), lien('https://ailleurs.fr/budget/', 'Budget'), lien('', 'Accueil budget'), lien('finances/', 'Finances'), lien('budget-annexe/', 'Budget annexe')];
	assert.deepEqual(
		pagesBudget(liens, { sites, ici: ICI }).map((l) => l.href),
		[`${ICI}ma-mairie/budgets/`, `${ICI}finances/`]
	);
	assert.equal(pagesBudget(liens, { sites, ici: ICI, max: 5 }).length, 3);
});

test('un telechargement est un PDF ou un lien de telechargement, meme sans .pdf', () => {
	assert.equal(estUnTelechargement(`${ICI}a/BP-2026.PDF`), true);
	assert.equal(estUnTelechargement('https://www.nazellesnegron.fr/finances/le-budget?download=193:budget-2025'), true);
	assert.equal(estUnTelechargement(`${ICI}telecharger/12`), true);
	assert.equal(estUnTelechargement(`${ICI}?wpdmdl=88`), true);
	assert.equal(estUnTelechargement(`${ICI}budgets/`), false);
	assert.equal(estUnTelechargement(`${ICI}a.pdf.html`), false);
	const liens = [lien('a.pdf', 'A'), lien('a.pdf', 'A bis'), lien('?download=3', 'B'), lien('https://cdn.fr/c.pdf', 'C'), lien('page/', 'D')];
	assert.deepEqual(
		telechargementsDe(liens, sites).map((l) => l.href),
		[`${ICI}a.pdf`, `${ICI}?download=3`]
	);
});

test('le genre, l exercice et le budget se lisent dans le libelle puis le nom du fichier', () => {
	assert.deepEqual(doc('wp-content/uploads/2026/03/BP-2026-COMMUNE.pdf', 'Consulter le budget 2026 de la commune'), {
		url: `${ICI}wp-content/uploads/2026/03/BP-2026-COMMUNE.pdf`,
		genre: 'BP',
		exercice: '2026',
		budget: 'principal',
		libelle: 'Consulter le budget 2026 de la commune'
	});
	assert.equal(doc('x.pdf', 'Commune – compte financier unique 2025').genre, 'CFU');
	assert.equal(doc('2023_CA_commune.pdf', 'Télécharger').genre, 'CA');
	assert.equal(doc('2023_CA_commune.pdf', 'Télécharger').exercice, '2023');
	assert.equal(doc('x.pdf', 'Compte administratif').exercice, null);
	assert.equal(doc('x.pdf', 'Compte administratif').budget, 'inconnu', 'le budget ne se devine pas');
	assert.equal(doc('x.pdf', 'Rapport d’orientation budgétaire 2026').genre, 'ROB');
	assert.equal(doc('x.pdf', 'DOB 2025').genre, 'ROB');
	assert.equal(doc('D2026_039-PJ-Note-synthetique-BUDGET-PRINCIPAL-COMMUNE-2026-tampon.pdf', 'Consulter la note').genre, 'NOTE', 'une note parle du budget, elle n en est pas la maquette');
	assert.equal(doc('02-note-BP.pdf', '').genre, 'NOTE');
	assert.equal(doc('x.pdf', 'Présentation brève et synthétique').genre, 'NOTE');
	assert.equal(doc('x.pdf', 'Golf – budget primitif 2026').budget, 'annexe');
	assert.equal(doc('BP-2026-LOTISSEMENTS.pdf', 'Consulter le budget 2026 “lotissements”').budget, 'annexe');
	assert.equal(doc('le-budget?download=193:budget-2025-depenses-de-fonctionnement', '').genre, 'BP', 'un telechargement sans .pdf se lit a son adresse');
	assert.equal(doc('x.pdf', 'Note brève – Budget prévisionnel 2024').genre, 'NOTE');
	assert.equal(doc('x.pdf', 'Budget prévisionnel 2024').genre, 'BP');
	assert.equal(doc('wp-content/uploads/2020/09/1-_ST_CLEMENT_2026_20260512163058_BP-scelle.pdf', '').exercice, '2026', 'ni le chemin des envois ni un horodatage ne donnent l exercice');
	assert.equal(doc('wp-content/uploads/2020/09/BP.pdf', 'Budget primitif').exercice, null);
	assert.equal(doc('%E9.pdf', 'Compte administratif 2022').exercice, '2022', 'un nom mal encode se lit tel quel');
});

test('sans genre, un sigle seul ou une deliberation, rien n est releve', () => {
	assert.equal(doc('x.pdf', 'Ça bouge à la plage'), null, '« ça » n est pas un compte administratif');
	assert.equal(doc('ca.pdf', 'Bulletin'), null);
	assert.equal(doc('x.pdf', 'Bulletin municipal 2026'), null);
	assert.equal(doc('budgets/', 'Budget primitif 2026'), null, 'une page n est pas un document');
	assert.equal(doc('CM202605_45-delib-votes-BP-2026.pdf', 'Délibération 20260545 Vote du budget primitif 2026'), null, 'la deliberation est un acte');
	assert.equal(doc('D2026_007-PJ-ROB-2026-tampon.pdf', 'Consulter la délibération 026_007 Finances').genre, 'ROB', 'sa piece jointe est le document');
	assert.equal(doc('x.pdf', 'Annexe – compte administratif 2023 (délibération 12)').genre, 'CA');
});

test('le releve budgetaire ne change rien a ce que la glane depose comme acte', () => {
	assert.equal(acteDuLien(lien('budget.pdf', 'Budget primitif 2026')), null);
	assert.deepEqual(acteDuLien(lien('d.pdf', 'Délibération vote du budget primitif 2026')), { url: `${ICI}d.pdf`, nature: 'deliberation', libelle: 'Délibération vote du budget primitif 2026' });
	assert.equal(acteDuLien(lien('d.pdf', 'Délibération budget, M. DUPONT')), null, 'les controles des personnes tiennent');
});

const pdf = (...objets) => Buffer.from(`%PDF-1.7\n${objets.join('\n')}\n%%EOF`, 'latin1');
const flux = (contenu, filtre = '/Filter /FlateDecode') => {
	const octets = filtre ? deflateSync(Buffer.from(contenu, 'latin1')) : Buffer.from(contenu, 'latin1');
	return `1 0 obj << ${filtre} /Length ${octets.length} >>\nstream\n${octets.toString('latin1')}\nendstream\nendobj`;
};

test('la couche texte se lit dans les octets ou dans un flux decompresse', () => {
	const lire = (octets, options = {}) => coucheTexte(octets, { inflate: inflateSync, ...options });
	assert.deepEqual(lire(pdf('2 0 obj << /Type /Font /Subtype /Type1 >> endobj')), { format: 'pdf', couche: 'oui' });
	assert.deepEqual(lire(pdf(flux('<< /Type /ObjStm >> << /Font << /F1 5 0 R >> >>'))), { format: 'pdf', couche: 'oui' }, 'une police cachee dans un flux d objets');
	assert.deepEqual(lire(pdf(flux('BT /F1 12 Tf (Budget) Tj ET', ''))), { format: 'pdf', couche: 'oui' });
	assert.deepEqual(lire(pdf(flux('q 595 0 0 842 0 0 cm /Im0 Do Q'))), { format: 'pdf', couche: 'non' }, 'une page scannee n est qu une image');
	assert.deepEqual(lire(pdf('1 0 obj << /Filter /FlateDecode >>\nstream\npas du zlib\nendstream')), { format: 'pdf', couche: 'non' }, 'un flux illisible est saute');
	assert.deepEqual(lire(pdf('1 0 obj << /Filter /DCTDecode >>\nstream\nxx\nendstream')), { format: 'pdf', couche: 'non' });
	assert.deepEqual(lire(pdf('1 0 obj << >>\nstream\njamais ferme')), { format: 'pdf', couche: 'non' });
	assert.deepEqual(lire(pdf(flux('q Q')), { tronque: true }), { format: 'pdf', couche: 'inconnue' }, 'un fichier tronque sans texte vu ne se juge pas');
	assert.deepEqual(lire(Buffer.from('\x89PNG\r\n', 'latin1')), { format: 'png', couche: 'non' });
	assert.deepEqual(lire(Buffer.from('\xff\xd8\xff', 'latin1')), { format: 'jpeg', couche: 'non' });
	assert.deepEqual(lire(Buffer.from('<!DOCTYPE html><p>404', 'latin1')), { format: 'html', couche: 'non' });
	assert.deepEqual(lire(Buffer.from('PK\x03\x04', 'latin1')), { format: 'zip', couche: 'non' });
	assert.deepEqual(lire(Buffer.from('bonjour', 'latin1')), { format: 'autre', couche: 'non' });
	assert.deepEqual(coucheTexte(pdf('<< /Font >>')), { format: 'pdf', couche: 'oui' }, 'sans inflate fourni, les octets suffisent quand ils parlent');
});

test('un flux se decompresse borne : une image de page scannee ne remplit pas le tas', () => {
	let plusGrand = 0;
	const inflate = (octets, options) => {
		const clair = inflateSync(octets, options);
		plusGrand = Math.max(plusGrand, clair.length);
		return clair;
	};
	const image = flux('\0'.repeat(60e6));
	assert.deepEqual(coucheTexte(pdf(image, flux('BT /F1 12 Tf (Budget) Tj ET')), { inflate }), { format: 'pdf', couche: 'oui' }, 'le flux suivant se lit encore');
	assert.ok(plusGrand <= 4 * 1024 * 1024, `au plus 4 Mo en clair, lu ${plusGrand}`);
	let graine = 1;
	const bruit = Array.from({ length: 2e6 }, () => String.fromCharCode((graine = (Math.imul(graine, 1103515245) + 12345) >>> 0) >>> 24)).join('');
	assert.ok(deflateSync(Buffer.from(bruit, 'latin1')).length > 256 * 1024, 'le flux de texte depasse le debut lu');
	assert.deepEqual(coucheTexte(pdf(flux(`BT /F1 12 Tf (Budget) Tj ET ${bruit}`)), { inflate }), { format: 'pdf', couche: 'oui' }, 'son debut suffit');
});

test('la page de garde d une maquette se lit dans ses flux : SIRET, libelle du budget, exercice (D-185)', () => {
	const lire = (...objets) => identiteDuPdf(pdf(...objets), { inflate: inflateSync });
	const rien = { siret: null, budgetImprime: null, exerciceImprime: null };
	const garde = flux('BT /F1 12 Tf 1 0 0 1 300 700 Tm (Num\\351ro SIRET : 217 202 647 00012) Tj ET BT 36 650 Td (BUDGET : VILLE DE SABLE SUR SARTHE \\(3\\)) Tj T* [(ANN) -10 (EE) -250 (\\0402024)] TJ ET');
	const annexe = flux('BT (BUDGET ZAC DE GASTINES/ N\\260SIRET : 21720264700202) Tj ET');
	const emprunt = flux('BT (ANNEE 2010) Tj ET');
	const attendu = { siret: '21720264700012', budgetImprime: 'VILLE DE SABLE SUR SARTHE', exerciceImprime: '2024' };
	assert.deepEqual(lire(garde), attendu);
	assert.deepEqual(lire(annexe, emprunt, garde), attendu, 'les pages ne sont pas dans l ordre du fichier : la garde est le flux qui porte SIRET et ANNEE ensemble');
	assert.deepEqual(lire(annexe, emprunt), rien, 'un SIRET d annexe et une annee d emprunt ne se melangent pas');
	assert.deepEqual(lire(flux('BT (Num\\351ro SIRET : 21310403700014) Tj T* (BUDGET PRINCIPAL) Tj T* (ANNEE 2025) Tj ET')), { siret: '21310403700014', budgetImprime: null, exerciceImprime: '2025' }, 'la garde d un CFU n a pas de ligne « BUDGET : »');
	assert.deepEqual(lire(flux('BT <53495245 54203a20 32313331 30343033 37303030 3134> Tj 0 -14 TD (ANNEE 2025) Tj ET')), { siret: '21310403700014', budgetImprime: null, exerciceImprime: '2025' }, 'une chaine hexadecimale se lit octet par octet');
	assert.deepEqual(lire(flux(`BT (SIRET : 21310403700014) ' T* (BUDGET : E\\bAU\\r\\n) Tj (ANNEE\\t2025\\f) " ET`)), { siret: '21310403700014', budgetImprime: 'E\bAU', exerciceImprime: '2025' }, 'les operateurs apostrophe et guillemet montrent leur chaine sur la ligne suivante, les echappements se lisent');
	assert.deepEqual(lire(flux('BT (SIRET : 123) Tj T* (ANNEE 2025) Tj ET')), rien, 'un SIRET qui n a pas 14 chiffres ne vaut rien');
	assert.deepEqual(lire(flux('BT (SIRET : 21310403700014) Tj T* (ANNEE 2025) Tj ET', '')), { siret: '21310403700014', budgetImprime: null, exerciceImprime: '2025' }, 'un flux sans filtre se lit tel quel');
	assert.deepEqual(lire(flux('BT (SIRET : 21310403700014) Tj T* (ANNEE 2025) Tj ET', '/Filter /LZWDecode')), rien, 'un autre filtre est saute');
	assert.deepEqual(lire(flux('q /Im0 Do Q'), '1 0 obj << /Filter /FlateDecode >>\nstream\npas du zlib\nendstream', garde), attendu, 'une image et un flux illisible se sautent');
	assert.deepEqual(lire('1 0 obj << >>\nstream\njamais ferme'), rien);
	assert.deepEqual(identiteDuPdf(pdf(flux('BT (x) Tj ET'), garde), { inflate: inflateSync, texteMax: 4 }), rien, 'la lecture s arrete a la borne d octets en clair');
	assert.deepEqual(identiteImprimee('Numéro SIRET : 21310403700014\nBUDGET : COMMUNE (1)\nANNEE 2024\n'), { siret: '21310403700014', budgetImprime: 'COMMUNE', exerciceImprime: '2024' }, 'le texte d un pdftotext se lit avec les memes lignes');
});

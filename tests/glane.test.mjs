import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SANS_OBJET, acteDuLien, communesDuReleve, ecrireAtomique, liensDe, lotsDuPassage, natureDe, normaliser, objetDe, pagesCandidates, pdfsDe, reglesRobots, robotsPermet, scoreDePage, texteDuHtml } from '../src/glane.mjs';

const ICI = 'https://www.ville-echillais.fr/';
const sites = [['ville-echillais.fr', '']];
const lien = (href, texte = '') => ({ href, texte });

test('les liens d une page sont absolus, sans ancre, avec leur texte ou leur titre', () => {
	const html = `
		<a href="/mairie/conseil-municipal/">Conseil <b>municipal</b></a>
		<a class="x" href='documents/PV%20du%2012-09.pdf' title="PV du 12 septembre"><img src="i.png"></a>
		<a href="#haut">Haut</a><a href="mailto:mairie@x.fr">Ecrire</a><a href="tel:05">Appeler</a>
		<a href="javascript:void(0)">Rien</a><a name="ancre">sans href</a>
		<a href="http://[::1">casse</a><a href="ftp://x.fr/a.pdf">ftp</a>
		<a href="https://autre.fr/page#s">D&eacute;lib&#233;rations &amp; arr&#xEA;t&eacute;s&nbsp;&inconnu;</a>`;
	assert.deepEqual(liensDe(html, `${ICI}mairie/`), [
		lien('https://www.ville-echillais.fr/mairie/conseil-municipal/', 'Conseil municipal'),
		lien('https://www.ville-echillais.fr/mairie/documents/PV%20du%2012-09.pdf', 'PV du 12 septembre'),
		lien('https://autre.fr/page', 'Délibérations & arrêtés &inconnu;')
	]);
	assert.equal(texteDuHtml('<p>Arr&ecirc;t&eacute;\n  du <i>maire</i></p>'), 'Arrêté du maire');
	assert.equal(normaliser('Délibération N’ 12'), "deliberation n' 12");
});

test('une page d actes se reconnait a son libelle ou son chemin, celle qui porte les actes avant celle du conseil', () => {
	assert.equal(scoreDePage(lien(`${ICI}x`, 'Les délibérations')), 3);
	assert.equal(scoreDePage(lien(`${ICI}publication-des-actes/`, 'Publications')), 3);
	assert.equal(scoreDePage(lien(`${ICI}x`, 'Arrêtés municipaux')), 3);
	assert.equal(scoreDePage(lien(`${ICI}x`, 'Comptes rendus')), 2);
	assert.equal(scoreDePage(lien(`${ICI}mairie/conseil-municipal-d-echillais/`, 'Le conseil')), 2);
	assert.equal(scoreDePage(lien(`${ICI}x`, 'Vie municipale')), 1);
	assert.equal(scoreDePage(lien(`${ICI}x`, "Demande d'acte de naissance")), 0);
	assert.equal(scoreDePage(lien(`${ICI}etat-civil/actes`, 'Actes')), 0);
	assert.equal(scoreDePage(lien(`${ICI}x`, 'Agenda')), 0);
	assert.equal(scoreDePage(lien(`${ICI}pages/arretes-de-m-le-prefet-.html`, 'Arrêtés de M. le Préfet')), 0, 'les arretes du prefet ne sont pas ceux de la commune');
	assert.equal(scoreDePage(lien(`${ICI}%E9`, 'Agenda')), 0, 'un chemin mal encode se lit tel quel');
	const liens = [
		lien(`${ICI}vie-municipale/`, 'Vie municipale'),
		lien(`${ICI}conseil/`, 'Le conseil municipal'),
		lien(`${ICI}deliberations/`, 'Délibérations'),
		lien(`${ICI}deliberations/`, 'Délibérations (doublon)'),
		lien(`${ICI}actes.pdf`, 'Délibérations PDF'),
		lien('https://autre.fr/deliberations/', 'Délibérations ailleurs'),
		lien(ICI, 'Accueil des délibérations')
	];
	assert.deepEqual(
		pagesCandidates(liens, { sites, ici: ICI }).map((l) => l.href),
		[`${ICI}deliberations/`, `${ICI}conseil/`]
	);
	assert.equal(pagesCandidates(liens, { sites, ici: ICI, plancher: 1, max: 5 }).length, 3);
	assert.equal(pagesCandidates(liens, { sites, ici: ICI, max: 1 }).length, 1);
});

test('les PDF retenus sont ceux du site officiel, une fois chacun', () => {
	const liens = [lien(`${ICI}a.pdf`, 'A'), lien(`${ICI}a.pdf`, 'A encore'), lien(`${ICI}B.PDF?v=2`, 'B'), lien('https://cdn.ailleurs.fr/c.pdf', 'C'), lien(`${ICI}page`, 'D')];
	assert.deepEqual(
		pdfsDe(liens, sites).map((l) => l.href),
		[`${ICI}a.pdf`, `${ICI}B.PDF?v=2`]
	);
});

test('la nature se lit dans le libelle, puis dans le nom du fichier, et ne se devine jamais', () => {
	assert.equal(natureDe(lien(`${ICI}1.pdf`, 'Arrêté n° 2026-12 portant circulation')), 'arrete');
	assert.equal(natureDe(lien(`${ICI}1.pdf`, 'Délibération portant arrêté du budget')), 'deliberation', 'le premier indice l emporte');
	assert.equal(natureDe(lien(`${ICI}1.pdf`, 'Procès-verbal de la séance du 12/09/2026')), 'deliberation');
	assert.equal(natureDe(lien(`${ICI}1.pdf`, 'Compte rendu du conseil')), 'deliberation');
	assert.equal(natureDe(lien(`${ICI}1.pdf`, 'Décision du maire 2026-3')), 'decision');
	assert.equal(natureDe(lien(`${ICI}PV_CM_2026-09-12.pdf`, 'Télécharger')), 'deliberation');
	assert.equal(natureDe(lien(`${ICI}arrete-voirie-12.pdf`, 'Voirie')), 'arrete');
	assert.equal(natureDe(lien(`${ICI}budget.pdf`, 'Budget 2026')), null);
	assert.equal(natureDe(lien(`${ICI}convocation-conseil.pdf`, 'Conseil municipal du 3 octobre')), null);
	assert.equal(natureDe(lien(`${ICI}cr.pdf`, 'Ordre du jour du conseil municipal')), null);
	assert.equal(natureDe(lien(`${ICI}bulletin.pdf`, 'Bulletin municipal')), null);
	assert.equal(natureDe(lien(`${ICI}ap.pdf`, 'Arrêté préfectoral sécheresse')), null, 'un arrete du prefet n est pas un acte de la commune');
	assert.equal(natureDe(lien(`${ICI}ap.pdf`, 'Arrêté préfectoral sécheresse')), null);
});

test('l objet est le libelle nettoye, sinon le nom du fichier, et ne nomme personne', () => {
	assert.equal(objetDe(lien(`${ICI}1.pdf`, 'Procès-verbal du 12/09/2026 (PDF, 245 Ko)')), 'Procès-verbal du 12/09/2026');
	assert.equal(objetDe(lien(`${ICI}1.pdf`, 'Télécharger le compte rendu - 1,2 Mo')), 'Compte rendu');
	assert.equal(objetDe(lien(`${ICI}docs/PV_conseil-municipal_12-09-2026.pdf`, 'Télécharger')), 'PV conseil municipal 12 09 2026');
	assert.equal(objetDe(lien(`${ICI}docs/deliberation-0a1b2c3d4e5f6a7b.pdf`, 'ici')), 'Deliberation');
	assert.equal(objetDe(lien(`${ICI}docs/arrete%20voirie.pdf`, 'pdf')), 'Arrete voirie');
	assert.equal(objetDe(lien(`${ICI}docs/arrete-stationnement.pdf`, 'Document à télécharger')), 'Arrete stationnement');
	assert.equal(objetDe(lien(`${ICI}docs/annexe-deliberation-12.pdf`, 'Annexe')), 'Annexe deliberation 12');
	assert.equal(objetDe(lien(`${ICI}IMG/pdf/pv_cm_13122025.pdf`, 'PDF - 2.3 Mio')), 'Pv cm 13122025');
	assert.equal(objetDe(lien(`${ICI}CR-CM-08-12-2025.pdf`, 'Cliquez')), 'CR CM 08 12 2025');
	assert.equal(objetDe(lien(`${ICI}PV-12-03-2026.pdf`, 'Consulter le')), 'PV 12 03 2026');
	assert.equal(objetDe(lien(`${ICI}1.pdf`, 'Conseil Municipal du 22 mars 2026 V2. (464.09 k')), 'Conseil Municipal du 22 mars 2026 V2.');
	assert.equal(objetDe(lien(`${ICI}1.pdf`, 'Arrêté 15 mars 2026')), 'Arrêté 15 mars 2026');
	assert.equal(objetDe(lien(`${ICI}1.pdf`, 'Arrêté de M. Dupont, maire')), SANS_OBJET);
	assert.equal(objetDe(lien(`${ICI}0a1b2c3d4e5f6a7b8c9d.pdf`, '')), SANS_OBJET);
	assert.equal(objetDe(lien(`${ICI}1.pdf`, `Délibération ${'x'.repeat(300)}`)).length, 200);
	assert.deepEqual(acteDuLien(lien(`${ICI}pv.pdf`, 'PV du conseil')), { url: `${ICI}pv.pdf`, nature: 'deliberation', libelle: 'PV du conseil' });
	assert.equal(acteDuLien(lien(`${ICI}budget.pdf`, 'Budget')), null);
});

test('robots.txt : le groupe qui nomme la glane, sinon *, la regle la plus longue', () => {
	const texte = `# commentaire
User-agent: *
Disallow: /prive/
Crawl-delay: 10

User-agent: autrebot
User-agent: TemoinPublic/1.0
Disallow: /documents/*.pdf$
Allow: /documents/actes/
sans deux-points
`;
	const nous = reglesRobots(texte);
	assert.deepEqual(nous, [
		{ permis: false, motif: '/documents/*.pdf$' },
		{ permis: true, motif: '/documents/actes/' }
	]);
	assert.equal(robotsPermet(nous, `${ICI}documents/a.pdf`), false);
	assert.equal(robotsPermet(nous, `${ICI}documents/actes/a.pdf`), true, 'la plus longue l emporte');
	assert.equal(robotsPermet(nous, `${ICI}documents/a.pdf?x=1`), true, 'le $ ancre la fin');
	assert.equal(robotsPermet(nous, `${ICI}robots.txt`), true);
	const autres = reglesRobots(texte, 'inconnu');
	assert.equal(robotsPermet(autres, `${ICI}prive/a`), false);
	assert.equal(robotsPermet(autres, `${ICI}public/a`), true);
	assert.deepEqual(reglesRobots('User-agent: x\nDisallow: /'), []);
	const egalite = [
		{ permis: false, motif: '/a' },
		{ permis: true, motif: '/a' }
	];
	assert.equal(robotsPermet(egalite, `${ICI}a`), true);
	assert.equal(robotsPermet([{ permis: false, motif: '/a' }, { permis: true, motif: '/' }], `${ICI}a`), false);
});

test('un acte qui pourrait nommer une personne n est pas depose, son adresse serait montree', () => {
	const pas = (href, texte) => assert.equal(acteDuLien(lien(`${ICI}${href}`, texte)), null, texte);
	pas('a1.pdf', 'Arrete portant nomination MOINARD');
	pas('a2.pdf', '3 2026 037 Arrete portant occupation du domaine public SIMON');
	pas('a3.pdf', 'ARRETE 07-2026 TRAVAUX STE GATTEAU p. PETIT Catherine 44 Grande rue');
	pas('ARRETE-13-2026-DELEGATION-SIGNATURE-MAINGOT.pdf', 'Télécharger');
	pas('a4.pdf', 'ARRETE 03-2026 TRAVAUX RUE DES LOGES PACORY');
	pas('a5.pdf', 'Arrêté voirie BUFFARD route de l’Orgère');
	pas('a6.pdf', 'Délibération garantie emprunt SEMIS');
	pas('a7.pdf', 'Arrêté de M. Dupont, maire');
	pas('Arrete-Jean-Martin.pdf', 'Arrêté de voirie');
	const garde = (href, texte, nature) => assert.equal(acteDuLien(lien(`${ICI}${href}`, texte))?.nature, nature, texte);
	garde('PV_CM_26.01.2026.pdf', 'Séance du 26 janvier 2026', 'deliberation');
	garde('pv.pdf', 'PROCES VERBAL CONSEIL MUNICIPAL DU 20 NOVEMBRE 2025', 'deliberation');
	garde('ccas.pdf', 'Procès-verbal du Conseil d’administration du CCAS du 05-09-2023', 'deliberation');
	garde('Arrete-prescrivant-lentretien-des-trottoirs.pdf', 'Arrêté prescrivant l’entretien des trottoirs', 'arrete');
	garde('arrete.pdf', 'ARRETE TEMPORAIRE DE CIRCULATION', 'arrete');
	pas('a8.pdf', 'ARRETE TEMPORAIRE DE CIRCULATION RUE DES ACACIAS');
	garde('CR-CM-16-02-2026.pdf', 'Cliquez', 'deliberation');
});

import { aRelire, issueDeRelecture } from '../src/glane.mjs';

test('la glane relit ses actes les plus anciennement lus, apres leur delai, quand elle sait les redemander', () => {
	const pdfs = {
		a: { jour: '2026-10-16', id: 'r1', code: '17133', nature: 'deliberation', libelle: 'PV' },
		b: { jour: '2026-10-08', id: 'r2', code: '17133', nature: 'arrete', libelle: 'Arrete', relu: '2026-10-09' },
		c: { jour: '2026-10-02', id: 'r3', code: '17133', nature: 'deliberation', libelle: 'PV' },
		d: { jour: '2026-10-01', id: 'r4', code: '17133' },
		h: { jour: '2026-10-01', id: 'r8', code: '17133', nature: 'deliberation' },
		e: { jour: '2026-10-01', statut: 422, essais: 1 },
		f: { jour: '2026-10-01', id: 'r6', nature: 'deliberation' },
		g: { jour: '2026-10-09', id: 'r7', code: '17133', nature: 'decision', libelle: 'Decision', relu: '2026-10-16' }
	};
	assert.deepEqual(aRelire(pdfs, { jour: '2026-10-16', jours: 7, max: 10 }).map(([u]) => u), ['c', 'b']);
	assert.deepEqual(aRelire(pdfs, { jour: '2026-10-16', jours: 7, max: 1 }).map(([u]) => u), ['c']);
	assert.deepEqual(aRelire(pdfs, { jour: '2026-10-16', jours: 0, max: 10 }).map(([u]) => u), ['c', 'b', 'a', 'g']);
});

test('la reponse du service a une relecture dit le meme document, une version nouvelle, une disparition, ou de reessayer', () => {
	assert.equal(issueDeRelecture(200, { deja: true }), 'inchange');
	assert.equal(issueDeRelecture(201), 'remplace');
	assert.equal(issueDeRelecture(422, { erreur: 'lecture impossible', details: ['la source a repondu 404'] }), 'disparu-404');
	assert.equal(issueDeRelecture(422, { details: ['la source a repondu 410'] }), 'disparu-410');
	assert.equal(issueDeRelecture(422, { details: ['la source a repondu 4040'] }), 'illisible');
	assert.equal(issueDeRelecture(422, { details: ['la source a repondu 500'] }), 'illisible');
	assert.equal(issueDeRelecture(422), 'illisible');
	assert.equal(issueDeRelecture(400, { erreur: 'demande illisible' }), 'illisible', 'une demande refusee ne garde pas la tete de la file');
	for (const s of [409, 429, 500, 503]) assert.equal(issueDeRelecture(s), null);
});

import { refusDeDepot } from '../src/glane.mjs';

test('un refus de lecture se classe sur son motif, et seul un refus transitoire se redemande a un autre passage', () => {
	const lecture = (motif) => refusDeDepot(422, { erreur: 'lecture impossible', details: motif === undefined ? [] : [motif] });
	assert.deepEqual(lecture('la source a repondu 404'), { classe: 'disparu', definitif: true });
	assert.deepEqual(lecture('la source a repondu 410'), { classe: 'disparu', definitif: true });
	assert.deepEqual(lecture('la source a repondu 403'), { classe: 'source-4xx', definitif: true });
	assert.deepEqual(lecture('page web servie a la place du fichier annonce'), { classe: 'contenu', definitif: true });
	assert.deepEqual(lecture('fichier annonce en pdf, octets d un autre format'), { classe: 'contenu', definitif: true });
	assert.deepEqual(lecture('document de moins de 512 octets'), { classe: 'contenu', definitif: true });
	assert.deepEqual(lecture('verification anti-robot servie a la place du document'), { classe: 'contenu', definitif: true });
	assert.deepEqual(lecture('document au-dela de 20971520 octets'), { classe: 'trop-gros', definitif: true });
	assert.deepEqual(lecture('hote resolu en adresse privee, locale ou reservee (fe80::1)'), { classe: 'adresse', definitif: true });
	assert.deepEqual(lecture('plus de 5 redirections'), { classe: 'adresse', definitif: true });
	assert.deepEqual(lecture('la source a repondu 503'), { classe: 'source-5xx', definitif: false });
	assert.deepEqual(lecture('la source a repondu 429'), { classe: 'source-5xx', definitif: false });
	assert.deepEqual(lecture('lecture au-dela de 30 s'), { classe: 'delai', definitif: false });
	assert.deepEqual(lecture('The operation was aborted due to timeout'), { classe: 'delai', definitif: false });
	assert.deepEqual(lecture('TypeError: fetch failed'), { classe: 'transitoire', definitif: false });
	assert.deepEqual(lecture(undefined), { classe: 'transitoire', definitif: false }, 'un etat ancien sans motif se redemande pour l apprendre');
	assert.deepEqual(refusDeDepot(422, { erreur: 'hors du site officiel', details: ['17146'] }), { classe: 'hors-site', definitif: true });
	assert.deepEqual(refusDeDepot(400, { erreur: 'demande illisible' }), { classe: 'refus', definitif: true });
	assert.deepEqual(refusDeDepot(422), { classe: 'refus', definitif: true });
});

test('le releve du jour dit les communes deja lues, sans son en-tete ni ligne vide', () => {
	const tsv = 'code\tsite\taccueil\n44150\tsaint-aignan-grandlieu.fr\t200\n2A004\tajaccio.fr\trobots\n\n';
	assert.deepEqual([...communesDuReleve(tsv)], ['44150', '2A004']);
	assert.equal(communesDuReleve('code\tsite\n').size, 0);
});

test('un passage part en entier, en lots bornes', () => {
	const ids = (n, c) => Array.from({ length: n }, (_, i) => c.repeat(60) + String(i).padStart(4, '0'));
	const vus = ids(950, 'a');
	const absents = ids(120, 'b');
	const lots = lotsDuPassage(vus, absents);
	assert.equal(lots.length, 3);
	assert.ok(lots.every((l) => l.vus.length <= 400 && l.absents.length <= 100 && l.vus.length + l.absents.length <= 500));
	assert.deepEqual(lots.flatMap((l) => l.vus), vus, 'aucun vu laisse au-dela de 400');
	assert.deepEqual(lots.flatMap((l) => l.absents), absents, 'aucun absent laisse au-dela de 100');
	assert.deepEqual(lotsDuPassage([], []), []);
	assert.deepEqual(lotsDuPassage(['x'], []), [{ vus: ['x'], absents: [] }]);
});

test('l etat de la glane s ecrit d un bloc : une ecriture interrompue laisse l ancien entier', () => {
	const chemin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'glane-')), 'glane.json');
	ecrireAtomique(fs, chemin, '{"pdfs":{"a":1}}\n');
	assert.equal(fs.readFileSync(chemin, 'utf8'), '{"pdfs":{"a":1}}\n');
	const coupe = { ...fs, writeFileSync: (f, t) => fs.writeFileSync(f, t.slice(0, 5)), renameSync: () => { throw new Error('interrompu'); } };
	assert.throws(() => ecrireAtomique(coupe, chemin, '{"pdfs":{"a":1,"b":2}}\n'), /interrompu/);
	assert.equal(fs.readFileSync(chemin, 'utf8'), '{"pdfs":{"a":1}}\n');
});

import { statutLu } from '../src/glane.mjs';

test('une page coupee a la borne d octets ne compte pas comme lue en entier', () => {
	assert.equal(statutLu({ statut: 200, tronque: false }), 200);
	assert.equal(statutLu({ statut: 200, tronque: true }), 'tronque');
	assert.equal(statutLu({ statut: 404 }), 404);
});

import { Disjoncteur, estUnePasserelle } from '../src/glane.mjs';

test('une reponse de la passerelle ne met pas l acte en cause, un 500 si', () => {
	for (const s of [502, 503, 504]) assert.equal(estUnePasserelle(s), true);
	for (const s of [500, 501, 422, 200, 'reseau']) assert.equal(estUnePasserelle(s), false);
});

test('le disjoncteur s ouvre apres N echecs de suite, laisse un essai par pause et se referme sur une reponse', () => {
	let t = 0;
	const dits = [];
	const d = new Disjoncteur({ seuil: 3, pauseMs: 1000, maintenant: () => t, dire: (l) => dits.push(l) });
	d.noter(502);
	d.noter('reseau');
	d.noter(404);
	assert.equal(d.echecs, 0, 'une reponse sous 500 remet le compte a zero');
	d.noter(500);
	d.noter(503);
	assert.equal(d.permet(), true);
	d.noter('echeance');
	assert.equal(d.ouvert, true);
	assert.deepEqual(dits, [{ disjoncteur: 'ouvert', echecs: 3, statut: 'echeance', pauseMs: 1000 }]);
	assert.equal(d.permet(), false, 'aucun appel pendant la pause');
	d.noter(502);
	assert.equal(dits.length, 1, 'un echec en vol ne redit pas l ouverture');
	t = 1000;
	assert.equal(d.permet(), true, 'un essai a la fin de la pause');
	assert.equal(d.permet(), false, 'un seul');
	d.noter(504);
	t = 1999;
	assert.equal(d.permet(), false, 'l essai rate, nouvelle pause');
	t = 2000;
	assert.equal(d.permet(), true);
	d.noter(422);
	assert.equal(d.ouvert, false);
	assert.deepEqual(dits.at(-1), { disjoncteur: 'ferme', statut: 422 });
	assert.equal(d.permet(), true);
});

test('le disjoncteur se demande sans consommer l essai : pourrait avant les attentes, permet a l envoi', () => {
	let t = 0;
	const d = new Disjoncteur({ seuil: 1, pauseMs: 1000, maintenant: () => t });
	assert.equal(d.pourrait(), true, 'ferme, tout peut partir');
	d.noter(502);
	assert.equal(d.pourrait(), false, 'ouvert, rien pendant la pause');
	t = 1000;
	assert.equal(d.pourrait(), true, 'la pause finie, un essai pourrait partir');
	assert.equal(d.pourrait(), true, 'le demander ne le consomme pas : une URL interdite ne gaspille rien');
	assert.equal(d.permet(), true, 'l essai se prend a l envoi');
	assert.equal(d.pourrait(), false, 'un appel engage pendant la pause est retenu a l envoi');
	assert.equal(d.permet(), false, 'une seule sonde par pause, meme en parallele');
});

test('le disjoncteur par defaut : 20 echecs, 5 min, l horloge du systeme', () => {
	const d = new Disjoncteur();
	for (let i = 0; i < 19; i++) d.noter(502);
	assert.equal(d.ouvert, false);
	d.noter(502);
	assert.equal(d.ouvert, true);
	assert.ok(d.reprise - Date.now() > 4 * 60000);
	assert.equal(d.permet(), false);
});

// Les sources nommees (D-314) : la preuve d'un document dit lequel, de qui, et ou il se lit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FICHIER_PUBLIE } from '../src/journal.mjs';
import { SOURCES_NOMMEES, nommer } from '../src/sources.mjs';

const TABLE = [
	{ nom: 'programme-x', url: 'https://www.candidat.example/programme', libelle: ' Le programme ', editeur: 'Candidat X (Parti Y)' },
	{ nom: 'liste', url: 'https://registre.example/liste.csv' },
	{ nom: 'piege', url: 'javascript:alert(1)', libelle: 'Piege' },
	{ nom: 'sans-adresse', libelle: 'Rien' },
	null
];

test('une cle nommee rend le document, son editeur, son adresse et son hote', () => {
	assert.deepEqual(nommer(TABLE, 'programme-x'), { libelle: 'Le programme', editeur: 'Candidat X (Parti Y)', url: 'https://www.candidat.example/programme', hote: 'candidat.example' });
});

test('une source sans libelle garde son adresse ; le document d une liste se lit sous sa source', () => {
	assert.deepEqual(nommer(TABLE, 'liste'), { libelle: null, editeur: null, url: 'https://registre.example/liste.csv', hote: 'registre.example' });
	assert.equal(nommer(TABLE, 'liste/0017bf3e5246').url, 'https://registre.example/liste.csv');
});

test('une cle inconnue, une adresse qui n est pas du web ou une table absente ne nomment rien', () => {
	assert.equal(nommer(TABLE, 'inconnue'), null);
	assert.equal(nommer(TABLE, 'piege'), null);
	assert.equal(nommer(TABLE, 'sans-adresse'), null);
	assert.equal(nommer(null, 'programme-x'), null);
	assert.equal(nommer(TABLE, undefined), null);
});

test('la table se publie avec le journal et son lecteur est servi au navigateur', () => {
	assert.ok(FICHIER_PUBLIE.test(SOURCES_NOMMEES));
	assert.match(fs.readFileSync(new URL('../scripts/construire.mjs', import.meta.url), 'utf8'), /'sources\.mjs', /);
	assert.ok(JSON.parse(fs.readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8')).exclude.includes('/sources.mjs'));
});

/*
 * 2026-11-13, D-314 : arrive par « preuve du 05/11 » d'un changement de programme, le lecteur
 * lisait « Identique au document daté du 05/11/2026 » sans savoir quel document, ni de qui.
 */
test('la preuve nomme le document sans clic, et une table en panne ne bloque pas le verdict', () => {
	const source = fs.readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const constat = source.slice(source.indexOf('async function constat('), source.indexOf('const depot = '));
	assert.ok(constat.indexOf('${documentNomme(') > 0 && constat.indexOf('${documentNomme(') < constat.indexOf('<details>'), 'le document est dit avant le repli des details');
	const nomme = source.slice(source.indexOf('function documentNomme('), source.indexOf('async function constat('));
	for (const champ of ['d.libelle', 'd.editeur ?? d.hote', 'd.url']) assert.ok(nomme.includes(`echapper(${champ})`), `${champ} passe par l echappement`);
	const lecture = source.slice(source.indexOf('async function sourcesNommees('), source.indexOf('function documentNomme('));
	assert.match(lecture, /catch \{\s*return null;/, 'une panne de la table rend null');
	const textes = fs.readFileSync(new URL('../public/textes.js', import.meta.url), 'utf8');
	for (const cle of ['document', 'editeur', 'source']) assert.match(textes, new RegExp(`\\t\\t${cle}: \\{ fr: '[^']+', de: '[^']+' \\}`), cle);
});

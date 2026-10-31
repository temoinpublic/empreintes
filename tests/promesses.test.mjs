import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHEMIN_PROMESSES, PHRASES_MIN, cheminDeLaCommune, datesDesPromesses, fichePubliable, fichesDeLaMesure, fichesPubliables, listePubliable, nombreDePhrases, phrasePubliable, sitePubliable } from '../src/promesses.mjs';
import { ecrirePromesses } from '../scripts/promesses.mjs';
import { pagePromesses, pagePromessesDeLaCommune } from '../src/pages.mjs';
import { decider } from '../src/hote.mjs';

const SOURCE = 'https://angers-ensemble-2026.fr/programme';
const phrase = (champs = {}) => ({ texte: 'Nous créerons une maison de santé dans chaque quartier avant la fin du mandat.', source: SOURCE, lue_le: '2026-10-31T19:00:00.000Z', ...champs });
const phrases = (n) => Array.from({ length: n }, (_, i) => phrase({ texte: `Nous ouvrirons la piscine municipale numéro ${i + 1} le dimanche matin toute l’année.` }));
const fiche = (champs = {}) => ({ insee: '49007', commune: 'Angers', lue_le: '2026-10-31', relue_le: '2026-10-31', listes: [{ site: 'angers-ensemble-2026.fr', phrases: phrases(PHRASES_MIN) }], ...champs });
const texteDe = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');

test('une phrase parait entiere, datee, sourcee, sans personne nommee', () => {
	assert.equal(phrasePubliable(phrase()), true);
	for (const p of [phrase({ texte: 'Trop court.' }), phrase({ texte: 'x'.repeat(321) }), phrase({ source: 'ftp://a.fr/p' }), phrase({ source: 'pas une adresse' }), phrase({ lue_le: 'hier' }), phrase({ texte: 'Nous soutiendrons Monsieur Jean Dupont dans toutes ses démarches auprès de la préfecture.' }), null]) assert.equal(phrasePubliable(p), false);
});

test('un site est un hote qui ne nomme personne', () => {
	assert.equal(sitePubliable('Angers-Ensemble-2026.fr'), true);
	for (const s of ['jean-dupont-2026.fr', 'pas un hote', '-a.fr', '', null]) assert.equal(sitePubliable(s), false);
});

test('une liste se reduit a ses phrases publiables, sans doublon', () => {
	const l = listePubliable({ site: 'Angers-Ensemble-2026.fr', phrases: [phrase(), phrase({ texte: ` ${phrase().texte} ` }), phrase({ texte: 'court' })] });
	assert.deepEqual(l, { site: 'angers-ensemble-2026.fr', phrases: [{ texte: phrase().texte, source: SOURCE, lue_le: '2026-10-31' }] });
	assert.equal(listePubliable({ site: 'angers-ensemble-2026.fr', phrases: [phrase({ texte: 'court' })] }), null);
	assert.equal(listePubliable({ site: 'jean-dupont-2026.fr', phrases: [phrase()] }), null);
	assert.equal(listePubliable(null), null);
});

test('une commune ne parait que relue, a son code, avec assez de phrases', () => {
	const f = fichePubliable(fiche());
	assert.equal(nombreDePhrases(f), PHRASES_MIN);
	assert.deepEqual(Object.keys(f), ['insee', 'commune', 'relue_le', 'listes']);
	for (const b of [fiche({ relue_le: null }), fiche({ relue_le: '31/10/2026' }), fiche({ insee: '4900' }), fiche({ commune: ' ' }), fiche({ listes: [{ site: 'angers-ensemble-2026.fr', phrases: phrases(PHRASES_MIN - 1) }] }), fiche({ listes: 'x' }), null]) assert.equal(fichePubliable(b), null);
	assert.equal(fichePubliable(fiche({ insee: '2A004', commune: 'Ajaccio' })).insee, '2A004');
});

test('les fiches se trient par nom, et datent le plan', () => {
	const fiches = fichesPubliables([fiche({ insee: '75056', commune: 'Paris', relue_le: '2026-11-02' }), fiche(), fiche({ relue_le: null, insee: '69123' })]);
	assert.deepEqual(
		fiches.map((f) => f.commune),
		['Angers', 'Paris']
	);
	assert.deepEqual(datesDesPromesses(fiches), { '/promesses/49007': '2026-10-31', '/promesses/75056': '2026-11-02', [CHEMIN_PROMESSES]: '2026-11-02' });
	assert.deepEqual(datesDesPromesses([]), {});
	assert.deepEqual(fichesPubliables(null), []);
});

test("la mesure de l'entrepot devient des fiches a relire, une par commune, sans population", () => {
	const mesure = {
		lu_le: '2026-10-31T19:00:00.000Z',
		sites: [
			{ domaine: 'angers-ensemble-2026.fr', commune: { code: '49007', nom: 'Angers', population: 155000 }, phrases: phrases(3) },
			{ domaine: 'angers-demain.fr', commune: { code: '49007', nom: 'Angers', population: 155000 }, phrases: [phrase(), phrase({ texte: 'Nous planterons dix mille arbres sur les boulevards de la ville avant 2032.' })] },
			{ domaine: 'jean-dupont-2026.fr', commune: { code: '49007', nom: 'Angers' }, phrases: phrases(9) },
			{ domaine: 'petite-commune.fr', commune: { code: '49001', nom: 'Allonnes' }, phrases: phrases(2) },
			{ domaine: 'sans-commune.fr', commune: null, phrases: phrases(9) }
		]
	};
	const [f] = fichesDeLaMesure(mesure);
	assert.deepEqual(fichesDeLaMesure(mesure).length, 1);
	assert.deepEqual({ ...f, listes: f.listes.map((l) => l.site) }, { insee: '49007', commune: 'Angers', lue_le: '2026-10-31', relue_le: null, listes: ['angers-ensemble-2026.fr', 'angers-demain.fr'] });
	assert.equal(fichePubliable(f), null, 'une fiche non relue ne se sert pas');
	assert.equal(fichesDeLaMesure(mesure, 2).length, 2);
	assert.deepEqual(fichesDeLaMesure(null), []);
});

test('le script ecrit les fiches a relire et ne recouvre jamais une fiche relue', () => {
	const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'promesses-'));
	const mesure = path.join(dossier, 'promesses.json');
	fs.writeFileSync(mesure, JSON.stringify({ lu_le: '2026-10-31T19:00:00.000Z', sites: [{ domaine: 'angers-ensemble-2026.fr', commune: { code: '49007', nom: 'Angers' }, phrases: phrases(6) }] }));
	const sortie = path.join(dossier, 'donnees');
	assert.deepEqual(ecrirePromesses(mesure, sortie), { ecrites: ['49007'], relues: [] });
	const ecrite = JSON.parse(fs.readFileSync(path.join(sortie, '49007.json'), 'utf8'));
	assert.equal(ecrite.relue_le, null);
	fs.writeFileSync(path.join(sortie, '49007.json'), JSON.stringify({ ...ecrite, relue_le: '2026-10-31', listes: [] }));
	assert.deepEqual(ecrirePromesses(mesure, sortie), { ecrites: [], relues: ['49007'] });
	assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sortie, '49007.json'), 'utf8')).listes, []);
	assert.deepEqual(ecrirePromesses(path.join(dossier, 'absent.json'), sortie), { ecrites: [], relues: [] });
});

test('la page de la commune porte chaque phrase, sa source et sa date, et les signes doubles soudes', () => {
	const f = fichePubliable(fiche({ listes: [{ site: 'angers-ensemble-2026.fr', phrases: [...phrases(PHRASES_MIN), phrase({ texte: 'Nous le ferons : une crèche par quartier, ouverte le samedi !' })] }] }));
	const html = pagePromessesDeLaCommune(f);
	assert.match(html, /<title>Angers, promesses municipales 2026 \| /);
	assert.match(html, /<link rel="canonical" href="https:\/\/temoinpublic.fr\/promesses\/49007">/);
	assert.match(html, /<h2>angers-ensemble-2026.fr<\/h2>/);
	assert.match(html, /<li>« Nous le ferons : une crèche par quartier, ouverte le samedi ! » <a href="https:\/\/angers-ensemble-2026.fr\/programme">Source<\/a>, lu le 31\/10\/2026<\/li>/);
	assert.match(html, /6 phrases de promesse, 1 liste, relues le 31\/10\/2026/);
	assert.doesNotMatch(html, /noindex/);
	assert.deepEqual(texteDe(html).match(/[^\S ][:;?!»]/g), null);
});

test("l'index liste les communes relues, et reste hors index sans aucune", () => {
	const html = pagePromesses(fichesPubliables([fiche(), fiche({ insee: '75056', commune: 'Paris' })]));
	assert.match(html, /<h2>2 communes, 10 phrases de promesse<\/h2>/);
	assert.match(html, /<a href="\/promesses\/49007">Angers<\/a><\/td><td class="n">1<\/td><td class="n">5<\/td>/);
	assert.doesNotMatch(html, /noindex/);
	assert.deepEqual(texteDe(html).match(/[^\S ][:;?!»]/g), null);
	const vide = pagePromesses([]);
	assert.match(vide, /noindex/);
	assert.match(vide, /Aucune commune relue/);
	assert.equal(cheminDeLaCommune('49007'), '/promesses/49007');
});

test("l'edition allemande renvoie les promesses au francais", () => {
	assert.deepEqual(decider('https://datumszeuge.de/promesses/49007'), { action: 'redirection', vers: 'https://temoinpublic.fr/promesses/49007' });
	assert.deepEqual(decider('https://temoinpublic.fr/promesses'), { action: 'suivant' });
});

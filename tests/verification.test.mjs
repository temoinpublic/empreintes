// Ce que la page de verification montre : un resultat par document date, jamais deux.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * 2026-10-14, /verifier : choisir le fichier lance la verification, et un clic
 * sur « Vérifier » pendant qu'elle tourne en lancait une seconde ; les deux
 * ajoutaient leurs lignes au meme resultat, affiche en double.
 */
test('la verification ecrit son resultat d un seul tenant', () => {
	const source = readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	assert.ok(!/innerHTML \+=/.test(source), 'aucun ajout au resultat en cours de route');
});

/*
 * 2026-11-02, /journal : « Vérifier la chaîne » relit 107 tours en 78 s, et
 * pendant tout ce temps la zone de resultat restait vide et le bouton
 * cliquable. Le lecteur ne voyait rien venir et relancait la verification.
 */
test('la verification de la chaine dit qu elle tourne et ne se relance pas', () => {
	const source = readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const gestion = source.slice(source.indexOf("$('chaine')?.addEventListener"));
	assert.match(gestion, /\.disabled = true/, 'le bouton se desactive au clic');
	assert.match(gestion, /finally \{[^}]*\.disabled = false/, 'et se rend a la fin, meme en erreur');
	assert.match(gestion, /t\.chaineEnCours\(/, 'la zone de resultat dit que la verification tourne');
	const textes = readFileSync(new URL('../public/textes.js', import.meta.url), 'utf8');
	assert.match(textes, /chaineEnCours: \{ fr: \(n\) => `Vérification des \$\{n\} tours en cours`, de: /);
});

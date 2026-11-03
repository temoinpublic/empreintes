// Le formulaire de depot : un seul document par depot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/deposer.js', import.meta.url), 'utf8');
const ecouteur = (id) => {
	const debut = source.indexOf(`${id}?.addEventListener(`);
	assert.ok(debut >= 0, id);
	return source.slice(debut, source.indexOf('\n});', debut));
};

/*
 * 2026-11-03, audit Codex : `/deposer?empreinte=A` preremplit l'empreinte ; un
 * lien B colle ensuite etait ignore, `demande()` donnant la priorite a la
 * saisie, et le service datait A sans lire B.
 */
test('un lien colle efface l empreinte saisie ou annoncee', () => {
	assert.match(ecouteur("$('url')"), /viderLEmpreinte\(\)/);
});

test('un fichier choisi efface l empreinte saisie', () => {
	assert.match(ecouteur('$fichier()'), /viderLEmpreinte\(\)/);
});

test('une empreinte saisie efface le lien et le fichier', () => {
	const e = ecouteur("$('empreinte')");
	assert.match(e, /\$\('url'\)\.value = ''/);
	assert.match(e, /\$fichier\(\)\.value = ''/);
});

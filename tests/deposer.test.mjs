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

/*
 * 2026-11-12, audit Codex : pendant les 350 ms de temporisation ou la lecture
 * de l'annuaire, un acte partait avec la collectivite du lien d'avant.
 */
test('un lien change efface la commune reconnue et le depot attend la nouvelle lecture', () => {
	const e = ecouteur("$('url')");
	assert.match(e, /lecture\+\+;\n\tif \(\$\('acte'\)\) \$\('collectivite'\)\.value = '';/);
	const envoi = source.slice(source.indexOf("$('formulaire').addEventListener('submit'"));
	assert.ok(envoi.indexOf('await communeAJour();') >= 0);
	assert.ok(envoi.indexOf('await communeAJour();') < envoi.indexOf('await demande()'));
	assert.match(source, /async function communeAJour\(\) \{\n\tif \(attente !== null\) \{\n\t\tclearTimeout\(attente\);\n\t\tlancerLaLecture\(\);\n\t\}\n\tawait enVol;/);
});

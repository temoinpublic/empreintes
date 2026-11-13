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

/*
 * 2026-11-02, audit Codex : un 503 de l'index ou du registre se lisait « jamais
 * date ici » ou « recu inconnu ». Une panne niait au visiteur une preuve qui
 * existe ; seul un 404 dit l'absence.
 */
test('une panne de lecture ne se lit pas comme une absence', () => {
	const source = readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const verifier = source.slice(source.indexOf('async function verifier('), source.indexOf('/** Le fichier lu comme'));
	assert.doesNotMatch(verifier, /\.ok \? /, 'aucune reponse en echec lue comme vide');
	assert.match(verifier, /absentSur404\(r, /);
	assert.match(verifier, /absentSur404\(d, /);
	const recu = source.slice(source.indexOf('async function verifierLeRecu('), source.indexOf('/** La ligne publique'));
	assert.match(recu, /await ligneDuRecu\(id\)/, 'le recu passe par la lecture qui distingue 404 et panne');
	assert.match(source, /if \(reponse\.status === 404\) return absent;\n\tif \(!reponse\.ok\) throw/);
});

/*
 * 2026-11-03, audit Codex : deux fichiers choisis coup sur coup lancent deux
 * verifications ; la premiere, plus lente, finissait apres la seconde et son
 * verdict restait affiche sous le nom du second document.
 */
test('seule la derniere verification demandee ecrit son verdict', () => {
	const source = readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const lancer = source.slice(source.indexOf('const lancer = async'), source.indexOf('// `/verifier?empreinte='));
	const garde = lancer.indexOf('if (numero !== derniere) return;');
	assert.ok(garde > 0, 'lancer garde le numero de sa demande');
	const ecritures = [...source.matchAll(/\$\('resultat'\)\.innerHTML = (?!'')/g)].map((m) => m.index);
	const debut = source.indexOf('const lancer = async');
	assert.ok(ecritures.length > 0);
	for (const i of ecritures) assert.ok(i > debut + garde, 'aucun verdict n est ecrit avant la garde');
});

/*
 * 2026-11-12, audit Codex : un recu precede d'un blanc se lisait comme un
 * document ordinaire (« jamais date »), et une panne RESEAU de la liste des
 * autorites bloquait la verification qu'un 503 laissait passer.
 */
test('un recu precede d un blanc reste un recu, et la liste des autorites est facultative', async () => {
	const source = readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const corps = (nom) => {
		const debut = source.indexOf(`function ${nom}(`);
		return source.slice(source.lastIndexOf('\n', debut) + 1, source.indexOf('\n}\n', debut) + 2);
	};
	const jsonDans = new Function(`${corps('jsonDans')}; return jsonDans;`)();
	const octets = (texte) => new TextEncoder().encode(texte);
	assert.deepEqual(jsonDans(octets('\n  {"sha256":"ab"}')), { sha256: 'ab' });
	assert.equal(jsonDans(octets('x{"sha256":"ab"}')), null);
	const enPanne = new Function('fetch', `${corps('autoritesConnues')}; return autoritesConnues;`);
	assert.equal(await enPanne(async () => { throw new TypeError('Failed to fetch'); })(), null);
	assert.equal(await enPanne(async () => ({ ok: false }))(), null);
	assert.deepEqual(await enPanne(async () => ({ ok: true, json: async () => ({ autorites: [1] }) }))(), [1]);
});

/*
 * 2026-11-13, sur la lecture de Florian : un lien de preuve (avantapres2027,
 * auregistre) ouvrait le formulaire de depot, puis une ligne sans le document
 * ni ses dates. Arrive par un lien, le verdict passe seul en tete.
 */
test('arrive par un lien, le verdict passe avant le formulaire, replie', async () => {
	const source = readFileSync(new URL('../public/verifier.js', import.meta.url), 'utf8');
	const arrivee = source.slice(source.indexOf('// `/verifier?empreinte='));
	assert.match(arrivee, /replierLeFormulaire\(\);\n\tlancer\(\)/);
	assert.match(arrivee, /formulaire\.hidden = true/);
	assert.match(arrivee, /document\.title = /);
	const constat = source.slice(source.indexOf('async function constat('), source.indexOf('const depot ='));
	assert.ok(constat.indexOf('t.vuEnLigne(') < constat.indexOf('<details>'), 'les dates se lisent sans deplier');
	assert.ok(constat.indexOf('t.objet') < constat.indexOf('<details>'), 'l objet se lit sans deplier');
	const { pageVerifier } = await import('../src/pages.mjs');
	const page = pageVerifier();
	assert.ok(page.indexOf('id="resultat"') < page.indexOf('id="formulaire"'), 'le verdict au-dessus du formulaire');
});

/* 2026-11-13, vu en prod : `form { display: grid }` l'emportait sur `hidden`, le formulaire replie restait affiche. */
test('un formulaire replie ne s affiche pas', () => {
	const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
	assert.match(css, /form\[hidden\] \{ display: none; \}/);
});

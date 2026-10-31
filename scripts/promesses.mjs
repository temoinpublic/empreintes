#!/usr/bin/env node
// Les fiches a relire des promesses municipales (D-202), tirees d'une mesure de
// l'entrepot (`promesses.json`, prive : il porte les noms des tetes de liste).
// Ecrit dans `donnees/promesses/` une fiche par commune, sans relecture ; une
// fiche deja relue (`relue_le`) n'est jamais recouverte, la relecture prime sur
// la mesure. Rien d'autre ne franchit la porte : ce que `src/promesses.mjs`
// refuse n'entre jamais dans l'historique de ce depot public.
//
//   node scripts/promesses.mjs <promesses.json> <donnees/promesses> [--min 5]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHRASES_MIN, fichesDeLaMesure } from '../src/promesses.mjs';

const lireJson = (f) => {
	try {
		return JSON.parse(fs.readFileSync(f, 'utf8'));
	} catch {
		return null;
	}
};

/** Ecrit les fiches a relire qui n'existent pas encore relues ; rend les codes ecrits et ceux gardes tels quels. */
export function ecrirePromesses(mesure, sortie, { min = PHRASES_MIN } = {}) {
	const ecrites = [];
	const relues = [];
	for (const fiche of fichesDeLaMesure(lireJson(mesure), min)) {
		const cible = path.join(sortie, `${fiche.insee}.json`);
		if (lireJson(cible)?.relue_le) {
			relues.push(fiche.insee);
			continue;
		}
		fs.mkdirSync(sortie, { recursive: true });
		fs.writeFileSync(cible, `${JSON.stringify(fiche, null, 1)}\n`);
		ecrites.push(fiche.insee);
	}
	return { ecrites, relues };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const [mesure, sortie, ...reste] = process.argv.slice(2);
	if (!mesure || !sortie) {
		console.error('usage : node scripts/promesses.mjs <promesses.json> <donnees/promesses> [--min 5]');
		process.exit(2);
	}
	const min = reste.includes('--min') ? Number(reste[reste.indexOf('--min') + 1]) : PHRASES_MIN;
	console.log(JSON.stringify(ecrirePromesses(mesure, sortie, { min })));
}

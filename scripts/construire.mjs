#!/usr/bin/env node
// Construit `dist/` depuis `donnees/empreintes/` : les fichiers du journal tels
// quels, la liste des tours, l'index des empreintes, les pages francaises a la
// racine et les pages allemandes sous `de/`.
//
//   node scripts/construire.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FICHIER_PUBLIE, ID_DE_TOUR, PREUVE_PUBLIEE, creerLIndex, resumeDe } from '../src/journal.mjs';
import { lecteurDeReleves } from '../src/chaine.mjs';
import { INDEX_MEMENTO, SOURCES_TEMOIN, creerLesVersions } from '../src/memento.mjs';
import { BESOINS } from '../src/besoins.mjs';
import { entreesDe, sitesDe } from '../src/disparus.mjs';
import { CHEMIN_DISPARUS, cheminDuSite, fluxDisparus, pageDisparus, pageDisparusDuSite, pageAccueil, pageActe, pageBesoin, pageDeposer, pageDocumentation, pageIntrouvable, pageJournal, pageMentions, pageOffreAssureurs, pageOffreCommunes, pageOffreConformite, pageOffreDrh, pageOffreEditeurs, pageOffreMarches, pageOffreNotaires, pagePreuve, pageRoles, pageSections, pageSchemaAdresse, pageVerifier, TEXTES_DE_L_ARCHIVAGE, planDuSite, datesDuPlan, robots } from '../src/pages.mjs';
import { EDITIONS, dossierDe, planDe } from '../src/edition.mjs';
import { CHEMIN_OFFRE_ASSUREURS, CHEMIN_OFFRE_COMMUNES, CHEMIN_OFFRE_CONFORMITE, CHEMIN_OFFRE_DRH, CHEMIN_OFFRE_EDITEURS, CHEMIN_OFFRE_MARCHES, CHEMIN_OFFRE_NOTAIRES } from '../src/offre.mjs';
import * as SCHEMA from '../src/schemaadresse.mjs';

const RACINE = path.resolve(import.meta.dirname, '..');
const DONNEES = path.join(RACINE, 'donnees', 'empreintes');
const DIST = path.join(RACINE, 'dist');

const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function commitServi() {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return process.env.GITHUB_SHA ?? 'inconnu';
	}
}

const ecrire = (relatif, contenu) => {
	const f = path.join(DIST, relatif);
	fs.mkdirSync(path.dirname(f), { recursive: true });
	fs.writeFileSync(f, contenu);
};

const fichiers = fs.readdirSync(DONNEES).filter((f) => FICHIER_PUBLIE.test(f));
// Un tour est publie plein (`<id>.json`) ou en delta (`<id>.delta.json`, D-158) ; la surface le sert tel quel et le lit plein.
const fichierDuTour = (f) => /^\d{8}T\d{6}Z(\.delta)?\.json$/.exec(f)?.[0];
const ids = [...new Set(fichiers.filter(fichierDuTour).map((f) => f.slice(0, 16)).filter((id) => ID_DE_TOUR.test(id)))].sort();
const ancrages = fs.existsSync(path.join(DONNEES, 'ancrages.json')) ? lireJson(path.join(DONNEES, 'ancrages.json')) : { tours: {} };
const fichierPublie = (id) => (fichiers.includes(`${id}.json`) ? `${id}.json` : `${id}.delta.json`);
// Un tour a la fois, et seule la derniere base gardee : tenir tous les releves pleins ensemble faisait croitre la memoire avec le journal.
const lireReleve = lecteurDeReleves((nom) => (fichiers.includes(nom) ? lireJson(path.join(DONNEES, nom)) : null), null, { bases: 1 });
const tours = [];
const indexEnCours = creerLIndex();
// Les versions des sources temoin (Memento, D-205), depuis la liste que l'entrepot publie avec le journal.
const versionsTemoin = creerLesVersions(fs.existsSync(path.join(DONNEES, SOURCES_TEMOIN)) ? lireJson(path.join(DONNEES, SOURCES_TEMOIN)) : []);
for (const id of ids) {
	const r = await lireReleve(id);
	tours.push(resumeDe(r, ancrages.tours?.[id], fichiers, fs.statSync(path.join(DONNEES, fichierPublie(id))).size, fichiers.includes(`${id}.json`) ? null : lireJson(path.join(DONNEES, `${id}.delta.json`)).base));
	indexEnCours.ajouter(r);
	versionsTemoin.ajouter(r);
}

fs.rmSync(DIST, { recursive: true, force: true });
for (const f of fichiers) ecrire(path.join('empreintes', f), fs.readFileSync(path.join(DONNEES, f)));
const index = indexEnCours.parts();
for (const [prefixe, part] of Object.entries(index)) ecrire(`index/${prefixe}.json`, JSON.stringify(part));
ecrire(INDEX_MEMENTO, `${JSON.stringify(versionsTemoin.index())}\n`);
// Ce qui a disparu (D-193), pousse filtre par l'entrepot et refiltre ici ; une entree sans preuve servie ne parait pas.
const DISPARUS = path.join(RACINE, 'donnees', 'disparus');
const jours = fs.existsSync(DISPARUS) ? fs.readdirSync(DISPARUS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => lireJson(path.join(DISPARUS, f))) : [];
const entrees = entreesDe(jours, (sha) => Boolean(index[sha.slice(0, 2)]?.[sha]));
const sites = sitesDe(entrees);
// Les attestations des listes publiques et les preuves de leurs objets (D-162), poussees par l'entrepot.
const PAR_URL = path.join(RACINE, 'donnees', 'attestations', 'par-url.json');
if (fs.existsSync(PAR_URL)) ecrire('attestations/par-url.json', fs.readFileSync(PAR_URL));
const PREUVES = path.join(RACINE, 'donnees', 'preuves');
const preuves = fs.existsSync(PREUVES) ? fs.readdirSync(PREUVES).filter((f) => PREUVE_PUBLIEE.test(f)) : [];
for (const f of preuves) ecrire(`preuves/${f}`, fs.readFileSync(path.join(PREUVES, f)));
const copie = fs.existsSync(path.join(RACINE, 'donnees', 'copie.json')) ? lireJson(path.join(RACINE, 'donnees', 'copie.json')) : null;
ecrire('tours.json', `${JSON.stringify({ copie, tours }, null, 1)}\n`);
ecrire('version.json', `${JSON.stringify({ commit: commitServi(), construit: new Date().toISOString() })}\n`);
for (const [langue, e] of Object.entries(EDITIONS)) {
	const dans = (f, contenu) => ecrire(`${dossierDe(langue)}${f}`, contenu);
	dans('index.html', pageAccueil(tours, langue));
	dans(`${e.actes.verifier.chemin.slice(1)}.html`, pageVerifier(langue));
	dans(`${e.actes.journal.chemin.slice(1)}.html`, pageJournal(tours, langue));
	dans('404.html', pageIntrouvable(langue));
	dans(`${e.actes.documentation.chemin.slice(1)}.html`, pageDocumentation(langue));
	dans(`${e.actes.dater.chemin.slice(1)}.html`, pageDeposer(langue));
	dans(`${e.actes.mentions.chemin.slice(1)}.html`, pageMentions(langue));
	dans(`${e.actes.preuve.chemin.slice(1)}.html`, pagePreuve(tours, undefined, langue));
	dans(`${e.actes.pratiques.chemin.slice(1)}.html`, pageSections('pratiques', langue));
	dans(`${e.actes.conditions.chemin.slice(1)}.html`, pageSections('conditions', langue));
	dans(`${e.actes.roles.chemin.slice(1)}.html`, pageRoles(langue));
	for (const acte of TEXTES_DE_L_ARCHIVAGE) dans(`${e.actes[acte].chemin.slice(1)}.html`, pageSections(acte, langue));
	dans('sitemap.xml', planDuSite(langue === 'fr' ? [...planDe(langue), SCHEMA.CHEMIN_DE_LA_PAGE, CHEMIN_OFFRE_MARCHES, CHEMIN_OFFRE_COMMUNES, CHEMIN_OFFRE_EDITEURS, CHEMIN_OFFRE_ASSUREURS, CHEMIN_OFFRE_NOTAIRES, CHEMIN_OFFRE_DRH, CHEMIN_OFFRE_CONFORMITE, ...(entrees.length ? [CHEMIN_DISPARUS] : []), ...sites.map((x) => cheminDuSite(x.site))] : planDe(langue), langue, datesDuPlan(tours, entrees, langue)));
	dans('robots.txt', robots(langue));
	dans('llms.txt', e.llms);
}
ecrire('acte.html', pageActe());
// Le schema ouvert des adresses d'actes (D-205) : sa page, et le fichier versionne qui ne change jamais en place.
ecrire(`${SCHEMA.CHEMIN_DE_LA_PAGE.slice(1)}.html`, pageSchemaAdresse(SCHEMA));
ecrire(SCHEMA.CHEMIN_DU_SCHEMA.slice(1), `${JSON.stringify(SCHEMA.schemaDeLAdresse(), null, 1)}\n`);
ecrire('disparus.html', pageDisparus({ entrees, sites }));
ecrire('disparus.xml', fluxDisparus(entrees));
for (const { site } of sites) ecrire(`${cheminDuSite(site).slice(1)}.html`, pageDisparusDuSite({ site, entrees: entrees.filter((d) => d.site === site) }));
// L'offre des marches publics (D-200), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_MARCHES.slice(1)}.html`, pageOffreMarches());
// L'offre des communes (D-195), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_COMMUNES.slice(1)}.html`, pageOffreCommunes());
// L'offre des editeurs (D-195), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_EDITEURS.slice(1)}.html`, pageOffreEditeurs());
// L'offre des assureurs (D-195), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_ASSUREURS.slice(1)}.html`, pageOffreAssureurs());
// L'offre des notaires (D-195), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_NOTAIRES.slice(1)}.html`, pageOffreNotaires());
// L'offre des DRH (D-195), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_DRH.slice(1)}.html`, pageOffreDrh());
// L'offre de la conformite (D-195, D-237), en francais seulement, sans prix.
ecrire(`${CHEMIN_OFFRE_CONFORMITE.slice(1)}.html`, pageOffreConformite());
for (const b of BESOINS) ecrire(`${b.chemin.slice(1)}.html`, pageBesoin(b));
for (const m of ['chaine.mjs', 'horodatage.mjs', 'slh.mjs', 'depot.mjs', 'acte.mjs', 'personne.mjs', 'annuaire.mjs', 'affichage.mjs', 'origine.mjs', 'produit.mjs', 'serie.mjs']) ecrire(m, fs.readFileSync(path.join(RACINE, 'src', m)));
for (const f of fs.readdirSync(path.join(RACINE, 'public'))) ecrire(f, fs.readFileSync(path.join(RACINE, 'public', f)));
console.log(`${tours.length} tours, ${fichiers.length} fichiers du journal, ${preuves.length} preuves, ${entrees.length} disparus, dist/ ecrit`);

import { inscriptionDuRecu, sha256 } from '/chaine.mjs';
import { relireLeRecuDuProduit } from '/produit.mjs';
import { horodatageQuiCouvre } from '/dossier.mjs';
import { T } from '/textes.js';

document.getElementById('imprimer')?.addEventListener('click', () => window.print());
const cible = document.getElementById('inscription');
const recu = document.getElementById('recu').dataset.recu;

const d = T.verifier.dossier;
const bloc = (b) => (b ? `<a href="https://mempool.space/block/${b}">${T.bloc(b)}</a>` : T.calendrier);
const ligne = (terme, valeur) => `<div><dt>${terme}</dt><dd>${valeur}</dd></div>`;

/** L'horodatage eIDAS qui couvre le tour du recu, relu ici contre sa racine. */
async function horodatageDuRecu(p) {
	const { tours } = await (await fetch('/tours.json')).json();
	const h = await horodatageQuiCouvre(tours, p.tour, p.racine, async (nom) => new Uint8Array(await (await fetch(`/empreintes/${nom}`)).arrayBuffer()));
	if (!h) return d.horodateAVenir;
	return `<a href="/empreintes/${h.nom}">${h.ok ? `${T.instant(h.instant)}, ${h.autorite}` : T.recu.nonConforme}</a>`;
}

/** Le recu inscrit : trois dates, chacune avec celui qui la garantit (D-323). */
async function afficherLesDates(p) {
	const horodatage = await horodatageDuRecu(p).catch(() => T.recu.illisible);
	cible.parentElement.outerHTML = [ligne(d.inscrit, T.heure(p.tour)), ligne(d.horodate, horodatage), ligne(d.ancre, bloc(p.bloc))].join('\n');
}

inscriptionDuRecu(recu, (c) => fetch(c))
	.then((p) => {
		if (p.etat === 'inscrit') return afficherLesDates(p);
		cible.textContent = p.etat === 'attente' ? T.recu.attente : T.recu.nonConforme;
	})
	.catch(() => {
		cible.textContent = T.recu.illisible;
	});

// Le recu d'un produit de la flotte se relit a son adresse, dans le navigateur du lecteur (D-167).
const relecture = document.getElementById('relecture-produit');
if (relecture) {
	const { url, sha256: attendu } = relecture.dataset;
	relireLeRecuDuProduit(url, attendu, (u) => fetch(u, { cache: 'no-store' }), sha256).then((r) => {
		if (r.etat === 'identique') relecture.textContent = T.recu.produitIdentique;
		else if (r.etat === 'different') relecture.textContent = T.recu.produitDifferent;
		else relecture.textContent = T.recu.produitIllisible(r.statut);
	}).catch(() => {
		relecture.textContent = T.recu.produitIllisible(null);
	});
}

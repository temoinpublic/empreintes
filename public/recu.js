import { inscriptionDuRecu, sha256 } from '/chaine.mjs';
import { relireLeRecuDuProduit } from '/produit.mjs';
import { T } from '/textes.js';

document.getElementById('imprimer')?.addEventListener('click', () => window.print());
const cible = document.getElementById('inscription');
const recu = document.getElementById('recu').dataset.recu;

const bloc = (b) => (b ? `, <a href="https://mempool.space/block/${b}">${T.bloc(b)}</a>` : `, ${T.calendrier}`);

inscriptionDuRecu(recu, (c) => fetch(c))
	.then((p) => {
		if (p.etat === 'inscrit') cible.innerHTML = `${T.recu.inscrit(T.heure(p.tour))}${bloc(p.bloc)}`;
		else if (p.etat === 'attente') cible.textContent = T.recu.attente;
		else cible.textContent = T.recu.nonConforme;
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

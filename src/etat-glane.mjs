// L'etat de la glane (`glane.json`) s'ecrit et se lit une entree par ligne.
//
// En un seul `JSON.stringify`, l'etat de 69 Mo (2026-11-22 : 250 000 PDF, les
// budgets, les robots) devenait a chaque sauvegarde une chaine de sa taille en
// plus des objets deja en memoire, et le noyau tuait la glane a 510 Mo sur 512.
// Le fichier reste un JSON valide (un retour a la ligne est un blanc) : tout
// lecteur qui fait `JSON.parse` du fichier entier le lit comme avant.

const LOT_OCTETS = 1 << 20;

/** Les lignes de l'etat : chaque objet de premier niveau s'ouvre sur sa ligne, puis une ligne par entree. */
export function* lignesDeLEtat(etat) {
	yield '{';
	const cles = Object.keys(etat);
	for (const [i, cle] of cles.entries()) {
		const fin = i < cles.length - 1 ? ',' : '';
		const valeur = etat[cle];
		const entrees = estUnObjet(valeur) ? Object.keys(valeur) : null;
		if (!entrees?.length) {
			yield `${JSON.stringify(cle)}:${JSON.stringify(valeur)}${fin}`;
			continue;
		}
		yield `${JSON.stringify(cle)}:{`;
		for (const [j, sous] of entrees.entries()) yield `${JSON.stringify(sous)}:${JSON.stringify(valeur[sous])}${j < entrees.length - 1 ? ',' : ''}`;
		yield `}${fin}`;
	}
	yield '}';
}

const estUnObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Ecrit tous les octets : `writeSync` peut en ecrire moins sans lever. */
function ecrireTout(fs, fd, octets) {
	for (let fait = 0; fait < octets.length; ) fait += fs.writeSync(fd, octets, fait, octets.length - fait);
}

/**
 * Ecrit l'etat par lots d'au plus `lot` octets UTF-8 (plus une ligne), dans un
 * fichier voisin puis un renommage : une interruption laisse l'ancien etat
 * entier, et le voisin s'efface. `fs` est passe pour que ce module reste sans
 * acces disque.
 */
export function ecrireLEtat(fs, chemin, etat, { lot = LOT_OCTETS } = {}) {
	const voisin = `${chemin}.${process.pid}.tmp`;
	const fd = fs.openSync(voisin, 'w');
	try {
		try {
			let tampon = [];
			let octets = 0;
			for (const ligne of lignesDeLEtat(etat)) {
				tampon.push(ligne, '\n');
				octets += Buffer.byteLength(ligne) + 1;
				if (octets >= lot) {
					ecrireTout(fs, fd, Buffer.from(tampon.join('')));
					tampon = [];
					octets = 0;
				}
			}
			if (octets) ecrireTout(fs, fd, Buffer.from(tampon.join('')));
		} finally {
			fs.closeSync(fd);
		}
		fs.renameSync(voisin, chemin);
	} catch (e) {
		fs.rmSync(voisin, { force: true });
		throw e;
	}
}

class EtatIncomplet extends Error {}

/** Pose `valeur` comme propriete propre, meme pour une cle `__proto__`. */
function poser(cible, ligne) {
	const entree = JSON.parse(`{${ligne.endsWith(',') ? ligne.slice(0, -1) : ligne}}`);
	for (const cle of Object.keys(entree)) Object.defineProperty(cible, cle, { value: entree[cle], writable: true, enumerable: true, configurable: true });
}

/**
 * Relit l'etat ligne par ligne (`lignes` : un iterable, asynchrone ou non, des
 * lignes du fichier). Un etat ecrit d'un bloc par une version d'avant tient sur
 * une ligne et se lit d'un `JSON.parse`, une seule fois. Comme `JSON.parse`, un
 * fichier vide, coupe ou suivi d'autre chose est refuse : sauve ensuite, il
 * effacerait l'historique.
 */
export async function lireLEtat(lignes) {
	let etat = {};
	let section = null;
	let debut = null;
	let ferme = false;
	for await (const brute of lignes) {
		const ligne = brute.trimEnd();
		if (!ligne) continue;
		if (ferme) throw new EtatIncomplet('etat de la glane : du texte apres la fin');
		if (debut === null) {
			debut = ligne;
			if (ligne === '{') continue;
			etat = JSON.parse(ligne);
			ferme = true;
			continue;
		}
		if (ligne === '}' && section === null) ferme = true;
		else if (section !== null && (ligne === '}' || ligne === '},')) section = null;
		else if (section === null && ligne.endsWith(':{')) {
			section = JSON.parse(ligne.slice(0, -2));
			poser(etat, `${JSON.stringify(section)}:{}`);
		} else poser(section === null ? etat : etat[section], ligne);
	}
	if (!ferme) throw new EtatIncomplet('etat de la glane coupe ou vide');
	return etat;
}

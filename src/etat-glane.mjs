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

/**
 * Ecrit l'etat par lots d'au plus `lot` octets (plus une ligne), dans un fichier
 * voisin puis un renommage : une interruption laisse l'ancien etat entier.
 * `fs` est passe pour que ce module reste sans acces disque.
 */
export function ecrireLEtat(fs, chemin, etat, { lot = LOT_OCTETS } = {}) {
	const voisin = `${chemin}.${process.pid}.tmp`;
	const fd = fs.openSync(voisin, 'w');
	try {
		let tampon = '';
		for (const ligne of lignesDeLEtat(etat)) {
			tampon += `${ligne}\n`;
			if (tampon.length >= lot) {
				fs.writeSync(fd, tampon);
				tampon = '';
			}
		}
		if (tampon) fs.writeSync(fd, tampon);
	} finally {
		fs.closeSync(fd);
	}
	fs.renameSync(voisin, chemin);
}

/**
 * Relit l'etat ligne par ligne (`lignes` : un iterable, asynchrone ou non, des
 * lignes du fichier). Un etat ecrit d'un bloc par une version d'avant tient sur
 * une ligne et se lit d'un `JSON.parse`, une seule fois.
 */
export async function lireLEtat(lignes) {
	const etat = {};
	let section = null;
	let premiere = true;
	for await (const brute of lignes) {
		const ligne = brute.trimEnd();
		if (premiere) {
			premiere = false;
			if (ligne !== '{') return JSON.parse(ligne);
			continue;
		}
		if (ligne === '}' || ligne === '},') {
			section = null;
			continue;
		}
		if (!ligne) continue;
		if (section === null && ligne.endsWith(':{')) {
			section = JSON.parse(ligne.slice(0, -2));
			etat[section] = {};
			continue;
		}
		Object.assign(section === null ? etat : etat[section], JSON.parse(`{${ligne.endsWith(',') ? ligne.slice(0, -1) : ligne}}`));
	}
	return etat;
}

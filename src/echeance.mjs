// Une echeance tenue par sa propre horloge (D-178). Le delai d'un `fetch` ne
// suffit pas : sur le VPS, dans la nuit du 2026-10-17, 29 des 30 ouvriers de la
// glane sont restes plus de deux heures sur la lecture d'une seule page, sans
// connexion ouverte, malgre leur `AbortSignal.timeout(20000)`.

/** Le rejet d'un travail qui n'a pas fini a son echeance. */
export class EcheanceDepassee extends Error {
	constructor(quoi, ms) {
		super(`echeance ${quoi} (${ms} ms)`);
		this.name = 'EcheanceDepassee';
	}
}

/**
 * Rend le resultat de `travail(arret)`, ou rejette avec `EcheanceDepassee` au
 * bout de `ms` meme si le travail ne se termine jamais ; `arret` s'abat a
 * l'echeance pour que le travail libere ce qu'il tient (une connexion).
 */
export function sousEcheance(ms, quoi, travail) {
	const controleur = new AbortController();
	let minuterie;
	const echeance = new Promise((_, rejeter) => {
		minuterie = setTimeout(() => {
			const erreur = new EcheanceDepassee(quoi, ms);
			controleur.abort(erreur);
			rejeter(erreur);
		}, ms);
	});
	const fait = Promise.resolve().then(() => travail(controleur.signal));
	return Promise.race([fait, echeance]).finally(() => clearTimeout(minuterie));
}

/**
 * Rend `effet` garde par `arret` : passe l'echeance, il rejette avec la raison de
 * l'arret au lieu d'agir. Un travail abandonne a son echeance ne lit et ne
 * depose plus rien pendant que l'ouvrier est deja sur le suivant.
 */
export function tantQue(arret, effet) {
	return (...args) => {
		arret.throwIfAborted();
		return effet(...args);
	};
}

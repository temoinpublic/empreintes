// La sentinelle de la glane (D-178). Dans la nuit du 2026-10-17, 29 ouvriers sur
// 30 sont restes deux heures et demie sans avancer, et personne n'a su sur quoi :
// l'inspecteur ne donnait que l'heure de leur derniere requete. Chaque ouvrier
// dit donc l'etape qu'il attend (une lecture, un tour de politesse, un appel au
// service, la file des documents) ; un ouvrier immobile au-dela du seuil est
// nomme au journal avec son etape, son adresse et sa duree.

/** Les etapes en cours, une par ouvrier, datees par l'horloge donnee. */
export class Sentinelle {
	#etapes = new Map();
	#horloge;

	constructor(horloge = Date.now) {
		this.#horloge = horloge;
	}

	/** L'ouvrier `qui` entre dans l'etape `quoi`, sur `ou`. */
	noter(qui, quoi, ou = '') {
		this.#etapes.set(qui, { quoi, ou, depuis: this.#horloge() });
	}

	/** L'ouvrier `qui` n'attend plus rien. */
	liberer(qui) {
		this.#etapes.delete(qui);
	}

	/** Les ouvriers immobiles depuis `seuilMs` au moins, le plus ancien d'abord. */
	immobiles(seuilMs) {
		const maintenant = this.#horloge();
		return [...this.#etapes]
			.map(([qui, e]) => ({ qui, ...e, ms: maintenant - e.depuis }))
			.filter((e) => e.ms >= seuilMs)
			.sort((a, b) => b.ms - a.ms);
	}

	/** Une ligne par ouvrier immobile ; aucune quand tous avancent. */
	rapport(seuilMs) {
		return this.immobiles(seuilMs).map((e) => `ouvrier ${e.qui} immobile depuis ${Math.round(e.ms / 60000)} min : ${e.quoi} ${e.ou}`.trimEnd());
	}
}

/**
 * Dit le rapport toutes les `toutesLesMs` tant qu'un ouvrier est immobile depuis
 * `seuilMs` ; rend la fonction qui arrete la veille. Ne retient pas le processus.
 */
export function veiller(sentinelle, { toutesLesMs, seuilMs, dire }) {
	const minuterie = setInterval(() => {
		const lignes = sentinelle.rapport(seuilMs);
		if (lignes.length) dire(lignes);
	}, toutesLesMs);
	minuterie.unref();
	return () => clearInterval(minuterie);
}

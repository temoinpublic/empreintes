// Sur vps5, la base D1 est un SQLite que Litestream lit et checkpointe a cote de workerd, qui
// n'attend jamais un verrou : une requete sur quarante mille tombait en SQLITE_BUSY (~40 par jour,
// des depots de la glane en 500). Une requete refusee pour verrou n'a rien ecrit : elle se rejoue.

/** Les erreurs d'un verrou pris ailleurs ; miniflare rend un SQLITE_BUSY en « internal error ». */
const PASSAGERE = /SQLITE_BUSY|database is locked|internal error/i;

/** Les attentes entre deux essais, en millisecondes : au plus quatre essais. */
export const ATTENTES = [20, 80, 250];

const MARQUE = Symbol('reprise');

const attendre = (ms) => new Promise((fin) => setTimeout(fin, ms));

/** Joue `essai`, et le rejoue apres chaque erreur passagere tant qu'il reste une attente. */
export async function reprendre(essai, attentes = ATTENTES) {
	for (let i = 0; ; i++) {
		try {
			return await essai();
		} catch (erreur) {
			if (i >= attentes.length || !PASSAGERE.test(String(erreur?.message ?? erreur))) throw erreur;
			await attendre(attentes[i]);
		}
	}
}

function instruction(brute, attentes) {
	return {
		brute,
		bind: (...args) => instruction(brute.bind(...args), attentes),
		first: (...a) => reprendre(() => brute.first(...a), attentes),
		all: () => reprendre(() => brute.all(), attentes),
		run: () => reprendre(() => brute.run(), attentes)
	};
}

/**
 * La base D1 dont chaque lecture, ecriture et lot se rejoue sur un verrou passager.
 * Idempotent : une base deja enveloppee est rendue telle quelle.
 */
export function avecReprise(db, attentes = ATTENTES) {
	if (!db || db[MARQUE]) return db;
	return {
		[MARQUE]: true,
		prepare: (sql) => instruction(db.prepare(sql), attentes),
		batch: (instructions) => reprendre(() => db.batch(instructions.map((i) => i.brute ?? i)), attentes),
		exec: (sql) => reprendre(() => db.exec(sql), attentes)
	};
}

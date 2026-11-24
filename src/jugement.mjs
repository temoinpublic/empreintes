// Le juge des remplacements (D-193) : les versions nouvelles qui attendent un verdict, et l'ecriture de ce verdict.
// Le juge tourne hors du service (il compare l'image des pages des deux fichiers gardes) ; ici, rien que la base.

const HEX64 = /^[0-9a-f]{64}$/;
const JSON_UTF8 = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
// D1 lie au plus 100 parametres par instruction.
const PAR_INSTRUCTION = 90;

/** Les verdicts admis : seul `change` laisse paraitre un remplacement ; `indecis` evite de rejuger chaque nuit. */
export const VERDICTS = ['change', 'reecrit', 'indecis'];

/** Au plus autant de verdicts par appel, et de versions rendues en attente. */
export const JUGEMENTS_MAX = 2000;

const reponse = (statut, corps) => ({ statut, corps: `${JSON.stringify(corps, null, 1)}\n`, entetes: JSON_UTF8 });
const refus = (statut, erreur, details) => reponse(statut, { erreur, details });

/** Le jour UTC d'un instant, `AAAA-MM-JJ`. */
const jourDe = (instant) => instant.toISOString().slice(0, 10);

/** La borne demandee, entre 1 et `JUGEMENTS_MAX`. */
function borne(max) {
	const n = Number.parseInt(max ?? '', 10);
	return Number.isInteger(n) && n > 0 ? Math.min(n, JUGEMENTS_MAX) : JUGEMENTS_MAX;
}

/**
 * Les versions nouvelles d'un acte, datees a la meme adresse qu'une version
 * d'avant aux octets differents, que le juge n'a pas encore jugees : les plus
 * recentes d'abord, `{ recu, apres, avant, jour, url }`.
 */
export async function versionsAJuger({ db, max }) {
	const lu = await db
		.prepare(
			`SELECT recu, apres, avant, jour, url FROM (SELECT a.recu AS recu, d.sha256 AS apres, LAG(d.sha256) OVER suite AS avant, d.jour AS jour, a.url AS url FROM acte a JOIN depot d ON d.recu = a.recu WHERE a.url IS NOT NULL WINDOW suite AS (PARTITION BY a.collectivite, a.url ORDER BY d.jour, d.place)) WHERE avant IS NOT NULL AND avant <> apres AND recu NOT IN (SELECT recu FROM jugement) ORDER BY jour DESC, url LIMIT ?`
		)
		.bind(borne(max))
		.all();
	return reponse(200, { attente: lu.results });
}

/** Les erreurs d'un envoi `{ methode, jugements: [{ recu, verdict }] }`. */
function erreursDeLEnvoi(corps) {
	if (corps === null || typeof corps !== 'object' || !Array.isArray(corps.jugements)) return ['un objet { methode, jugements } attendu'];
	if (!Number.isInteger(corps.methode) || corps.methode < 1) return ['methode : un entier positif, celui de la regle du juge'];
	if (corps.jugements.length > JUGEMENTS_MAX) return [`au plus ${JUGEMENTS_MAX} jugements par envoi`];
	if (!corps.jugements.every((j) => j !== null && typeof j === 'object' && HEX64.test(j.recu) && VERDICTS.includes(j.verdict))) return [`jugements : des { recu (64 hex), verdict (${VERDICTS.join(', ')}) }`];
	if (new Set(corps.jugements.map((j) => j.recu)).size !== corps.jugements.length) return ['un recu juge deux fois'];
	return [];
}

/**
 * Pose les verdicts du juge au jour du serveur. Seuls les recus d'actes
 * s'ecrivent ; un verdict deja pose est remplace (une methode plus recente
 * rejuge). Rend le nombre de lignes ecrites par verdict.
 */
export async function noterJugements({ db, corps, maintenant = new Date() }) {
	const erreurs = erreursDeLEnvoi(corps);
	if (erreurs.length) return refus(400, 'jugements illisibles', erreurs);
	const jour = jourDe(maintenant);
	const ecrits = {};
	for (const verdict of VERDICTS) {
		const ids = corps.jugements.filter((j) => j.verdict === verdict).map((j) => j.recu);
		ecrits[verdict] = 0;
		for (let i = 0; i < ids.length; i += PAR_INSTRUCTION) {
			const lot = ids.slice(i, i + PAR_INSTRUCTION);
			const r = await db
				.prepare(`INSERT INTO jugement (recu, verdict, methode, jour) SELECT recu, ?, ?, ? FROM acte WHERE recu IN (${lot.map(() => '?').join(', ')}) ON CONFLICT (recu) DO UPDATE SET verdict = excluded.verdict, methode = excluded.methode, jour = excluded.jour`)
				.bind(verdict, corps.methode, jour, ...lot)
				.run();
			ecrits[verdict] += r.meta.changes;
		}
	}
	return reponse(200, { jour, ecrits });
}

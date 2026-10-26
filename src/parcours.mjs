// Les parcours de la sonde (D-128, P1) : ce qu'un visiteur fait, joue par
// `/health` et juge sur son RESULTAT. Le verificateur : une empreinte du
// dernier tour cherchee dans l'index, sa place relue jusqu'a la racine, la
// signature du journal. Le depot : le dernier recu rendu, retrouve par son
// identifiant et par son empreinte comme la page du recu et l'API le font,
// et le journal ne couvre pas plus de lignes que la base n'en a.
import { certificatDuTour, lecteurDeReleves, placeDuFichier, verifierSignatureDuJournal } from './chaine.mjs';
import { estUnObjet } from './journal.mjs';
import { ligneDuRecu, lignesDeLEmpreinte } from './service.mjs';

/** Un parcours se rejoue au plus toutes les 5 min sur le meme tour (P2). */
export const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

const lignesDeLaFeuille = (cle) => Number(/^depots:(\d+)$/.exec(cle)?.[1] ?? 0);

async function verificateur(lire, tours) {
	const tour = tours.at(-1);
	if (!tour) return { ok: false, raison: 'aucun tour publie' };
	const releve = await lecteurDeReleves(async (nom) => {
		const r = await lire(`/empreintes/${nom}`);
		return r.ok ? r.json() : null;
	}, tours)(tour.id);
	const feuille = releve.feuilles.find(estUnObjet);
	if (!feuille) return { ok: false, tour: tour.id, raison: 'le dernier releve ne porte aucun objet' };
	const index = await lire(`/index/${feuille.sha256.slice(0, 2)}.json`);
	const vus = index.ok ? ((await index.json())[feuille.sha256] ?? []) : [];
	if (!vus.some((v) => v.dernier === tour.id)) return { ok: false, tour: tour.id, empreinte: feuille.sha256, raison: `l index ne voit pas ${feuille.sha256.slice(0, 8)} au tour ${tour.id}` };
	const place = await placeDuFichier(releve, feuille.sha256);
	if (!place?.ok) return { ok: false, tour: tour.id, empreinte: feuille.sha256, raison: `le chemin d audit de ${feuille.sha256.slice(0, 8)} ne rend pas la racine ${releve.racine.slice(0, 8)}` };
	const nom = `${tour.id}.racine.jws`;
	let signature = null;
	if (tour.fichiers?.includes(nom)) {
		const r = await lire(`/empreintes/${nom}`);
		signature = r.ok ? (await verifierSignatureDuJournal(await r.text(), releve.racine, certificatDuTour(tour.id))).ok : false;
		if (!signature) return { ok: false, tour: tour.id, empreinte: feuille.sha256, raison: `la signature ${nom} ne couvre pas la racine` };
	}
	return { ok: true, tour: tour.id, empreinte: feuille.sha256, etapes: place.chemin.length, signature };
}

/** Le verificateur, joue sur le dernier tour ; `lire(chemin)` rend une reponse fetch de la surface. */
export async function jouerLeVerificateur({ lire, tours, maintenant = Date.now() }) {
	const cle = tours.at(-1) ? `${tours.at(-1).id}:${tours.at(-1).racine}` : null;
	const garde = cle && cache.get(cle);
	if (garde && maintenant - garde.a < CACHE_MS) return garde.resultat;
	const resultat = await verificateur(lire, tours);
	if (cle && resultat.ok) cache.set(cle, { a: maintenant, resultat });
	return resultat;
}

/** Le depot, joue sur le dernier recu de la base ; `couverts` est le nombre de lignes de depots que le dernier releve plein couvre. */
export async function jouerLeDepot({ db, couverts = 0 }) {
	const dernier = await db.prepare('SELECT sha256, jour, place, recu FROM depot ORDER BY jour DESC, place DESC LIMIT 1').bind().first();
	if (!dernier) return { ok: false, raison: 'aucun depot en base' };
	const parId = await ligneDuRecu({ db, id: dernier.recu });
	if (parId?.sha256 !== dernier.sha256) return { ok: false, recu: dernier.recu, raison: `la page du recu ${dernier.recu.slice(0, 8)} ne le retrouve pas` };
	const parEmpreinte = await lignesDeLEmpreinte({ db, empreinte: dernier.sha256 });
	if (!parEmpreinte?.some((l) => l.recu === dernier.recu)) return { ok: false, recu: dernier.recu, raison: `l empreinte ${dernier.sha256.slice(0, 8)} ne rend pas son recu` };
	const { n } = await db.prepare('SELECT COUNT(*) AS n FROM depot').bind().first();
	if (couverts > n) return { ok: false, recu: dernier.recu, raison: `le journal couvre ${couverts} depots, la base en a ${n}` };
	return { ok: true, recu: dernier.recu, jour: dernier.jour, depots: n, couverts };
}

/** Les lignes de depots couvertes par le dernier releve plein, lues dans son resume. */
export const depotsCouverts = (tours) => tours.findLast((t) => !t.base)?.depots ?? 0;

/**
 * Les deux parcours, chacun seul : un parcours casse est `rouge` et dit
 * pourquoi ; une erreur en chemin passe `attention` et sa raison voyage.
 * `db` absente : le depot est sans objet.
 */
export async function jouerLesParcours({ lire, tours, db, maintenant }) {
	const jouer = async (nom, f) => {
		try {
			return { nom, ...(await f()) };
		} catch (e) {
			return { nom, ok: null, echec: `parcours ${nom} : ${e.message}` };
		}
	};
	const joues = await Promise.all([jouer('verificateur', () => jouerLeVerificateur({ lire, tours, maintenant })), db ? jouer('depot', () => jouerLeDepot({ db, couverts: depotsCouverts(tours) })) : null]);
	const resultats = joues.filter(Boolean);
	const casses = resultats.filter((r) => r.ok === false);
	const echecs = resultats.filter((r) => r.echec).map((r) => r.echec);
	return {
		niveau: casses.length ? 'rouge' : echecs.length ? 'attention' : 'ok',
		constats: casses.map((r) => `parcours ${r.nom} casse : ${r.raison}`),
		echecs,
		parcours: Object.fromEntries(resultats.map(({ nom, echec, ...r }) => [nom, r]))
	};
}

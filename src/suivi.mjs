// Le suivi des flux (D-170) : l'inscription et le retrait d'un flux, et la
// tournee horaire du Worker `empreintes-flux`. La base est celle des depots ;
// le reseau passe par le temoin, qu'on injecte. Les decisions vivent dans
// `src/flux.mjs`, pur.
//
// Une version d'article est un depot ordinaire : sa ligne publique reste a
// quatre champs. Le lien flux, article, version vit dans `flux`, `article` et
// `version` ; l'adresse de l'article et son recu ne sortent que par le jeton
// de l'editeur (morceau 3), jamais un titre.

import { sha256 } from './chaine.mjs';
import { apresLeCurseur, avantLeCurseur, pageDe } from './curseur.mjs';
import { idDuRecu, jourDe, recuDe, selAleatoire } from './depot.mjs';
import { LECTURES_PAR_JOUR, empreinteDEntree, idDArticle, lireFlux, planDuJour, repriseApres } from './flux.mjs';
import { inserer, temoigner } from './service.mjs';
import { urlAdmise } from './temoin.mjs';

/** Au plus tant de flux suivis, et tant d'inscriptions par jour. */
export const FLUX_MAX = 200;
export const INSCRIPTIONS_PAR_JOUR = 20;
/** Au plus tant de lectures d'articles par tournee horaire, tous flux confondus. */
export const LECTURES_PAR_TOURNEE = 10;
/** Les flux de DONNEES de la flotte : ils changent chaque heure et ne sont pas des publications. */
export const HOTES_DE_DONNEES = ['quivad.fr', 'quivad.com', 'quivad.eu', 'quivad.de', 'quivad.it', 'quivad.be', 'titelia.com', 'titelia.fr', 'titelia.eu'];

const JSON_UTF8 = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const reponse = (statut, corps) => ({ statut, corps: `${JSON.stringify(corps, null, 1)}\n`, entetes: JSON_UTF8 });
const refus = (statut, erreur, details = []) => reponse(statut, { erreur, details });

const un = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const tous = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const faire = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

/** Applique `fn` a chaque element, l'un apres l'autre : un site lu poliment, une base ecrite dans l'ordre. */
const enSerie = (elements, fn) => elements.reduce(async (avant, x) => [...(await avant), await fn(x)], Promise.resolve([]));

const estDeDonnees = (hote) => HOTES_DE_DONNEES.some((h) => hote === h || hote.endsWith(`.${h}`));
const lireTexte = (lu) => new TextDecoder('utf-8').decode(lu.octets);

/** L'identifiant public d'un flux : 16 caracteres de l'empreinte de son adresse. */
export const idDuFlux = async (url) => (await sha256(`flux\n${url}\n`)).slice(0, 16);

/**
 * Inscrit un flux : `{ url }`. Le flux est lu une fois et doit etre un RSS 2.0
 * ou un Atom 1.0 ; rend `{ id, jeton }`, le jeton n'etant garde que hache.
 */
export async function inscrireFlux({ db, corps, maintenant = new Date(), temoin = temoigner }) {
	const url = typeof corps?.url === 'string' ? corps.url.trim() : null;
	if (!url || Object.keys(corps).some((k) => k !== 'url')) return refus(400, 'demande illisible', ['url : l adresse du flux, seule']);
	const admise = urlAdmise(url);
	if (admise.refus) return refus(400, 'url refusee', [admise.refus]);
	if (estDeDonnees(new URL(admise.url).hostname.replace(/^www\./, ''))) return refus(400, 'url refusee', ['un flux de donnees, pas de publications']);
	const jour = jourDe(maintenant.toISOString());
	const id = await idDuFlux(admise.url);
	if (await un(db, 'SELECT id FROM flux WHERE id = ? AND retire IS NULL', id)) return refus(409, 'flux deja suivi');
	const actifs = (await un(db, 'SELECT COUNT(*) AS n FROM flux WHERE retire IS NULL')).n;
	const duJour = (await un(db, 'SELECT COUNT(*) AS n FROM flux WHERE inscrit >= ?', jour)).n;
	if (actifs >= FLUX_MAX || duJour >= INSCRIPTIONS_PAR_JOUR) return refus(429, 'plafond des flux atteint');
	let lu;
	let flux;
	try {
		lu = await temoin(admise, { garder: true });
		flux = lireFlux(lireTexte(lu), lu.url);
	} catch (error_) {
		return refus(422, 'flux illisible', [String(error_?.message ?? error_)]);
	}
	const jeton = selAleatoire() + selAleatoire();
	await faire(db, 'DELETE FROM flux WHERE id = ?', id);
	// Une reinscription est une generation neuve : ses articles se relisent comme
	// jamais lus, sinon des octets inchanges ne lui donnaient aucun recu (audit Codex
	// du 2026-11-11). Les versions d'avant restent dans l'arbre.
	await faire(db, 'UPDATE article SET empreinte = NULL, octets = NULL, essaye = NULL, lu = NULL WHERE flux = ?', id);
	await faire(db, 'INSERT INTO flux (id, url, jeton, inscrit) VALUES (?, ?, ?, ?)', id, admise.url, await sha256(jeton), maintenant.toISOString());
	return reponse(201, { id, jeton, format: flux.format, entrees: flux.entrees.length, registre: `/editeur/${id}`, prive: `/editeur/${id}#${jeton}` });
}

/** Retire un flux sur presentation de son jeton ; les versions deja deposees restent dans l'arbre. */
export async function retirerFlux({ db, id, jeton, maintenant = new Date() }) {
	const flux = await un(db, 'SELECT jeton FROM flux WHERE id = ? AND retire IS NULL', String(id ?? ''));
	if (!flux) return refus(404, 'flux inconnu');
	if (!jeton || (await sha256(jeton)) !== flux.jeton) return refus(403, 'jeton refuse');
	await faire(db, 'UPDATE flux SET retire = ? WHERE id = ?', maintenant.toISOString(), id);
	return reponse(200, { id, retire: maintenant.toISOString() });
}

/** Les entrees du flux, identifiees par article : `{ id, lien, empreinte }`. */
async function entreesDuFlux(flux) {
	return Promise.all(flux.entrees.map(async (e) => ({ id: await idDArticle(e), lien: e.lien, empreinte: await empreinteDEntree(e) })));
}

async function connusDe(db, flux) {
	const lignes = await tous(db, 'SELECT id, empreinte, octets, essaye, lu FROM article WHERE flux = ?', flux);
	return Object.fromEntries(lignes.map((l) => [l.id, l]));
}

/** Lit un article et depose une version quand ses octets ont change. Rend `version`, `inchangee` ou `echec`. */
async function lireArticle({ db, flux, entree, connu, instant, jour, temoin }) {
	await faire(
		db,
		'INSERT INTO article (flux, id, lien, essaye) VALUES (?, ?, ?, ?) ON CONFLICT (flux, id) DO UPDATE SET lien = excluded.lien, essaye = excluded.essaye',
		flux,
		entree.id,
		entree.lien,
		jour
	);
	const admise = urlAdmise(entree.lien);
	let lu;
	try {
		if (admise.refus) throw new Error(admise.refus);
		lu = await temoin(admise);
	} catch {
		return 'echec';
	}
	const etat = ['UPDATE article SET empreinte = ?, octets = ?, lu = ? WHERE flux = ? AND id = ?', entree.empreinte, lu.sha256, jour, flux, entree.id];
	try {
		return await ecrireLaLecture({ db, flux, entree, connu, instant, jour, lu, etat });
	} catch {
		// L'essai du jour est rendu : sans cela, une ecriture en panne laissait l'article
		// ignore jusqu'au lendemain, et un contenu retire entre-temps etait perdu. Si la base
		// refuse encore, la tournee suivante n'y peut rien de plus : l'echec reste compte.
		await faire(db, 'UPDATE article SET essaye = ? WHERE flux = ? AND id = ?', connu?.essaye ?? null, flux, entree.id).catch(() => null);
		return 'echec';
	}
}

async function ecrireLaLecture({ db, flux, entree, connu, instant, jour, lu, etat }) {
	if (connu?.octets === lu.sha256) {
		await faire(db, ...etat);
		return 'inchangee';
	}
	// L'article ne se dit lu qu'avec sa version : ecrit avant elle, une panne la perdait pour de bon.
	const recu = recuDe({ sha256: lu.sha256, instant, url: entree.lien, temoin: lu });
	const id = await idDuRecu(recu);
	await inserer(db, { jour, empreinte: lu.sha256, recu: id }, [['INSERT INTO version (recu, flux, article, jour, contenu) VALUES (?, ?, ?, ?, ?)', id, flux, entree.id, jour, JSON.stringify(recu)], etat]);
	return 'version';
}

/** Une tournee sur un flux : lit le flux, puis les articles du plan, `budget` au plus. Rend le nombre de lectures faites. */
async function tourneeDuFlux({ db, flux, instant, jour, temoin, budget }) {
	let lu;
	let entrees;
	try {
		lu = await temoin(urlAdmise(flux.url), { garder: true });
		entrees = await entreesDuFlux(lireFlux(lireTexte(lu), lu.url));
	} catch (error_) {
		await faire(db, 'UPDATE flux SET lu = ?, etat = ?, reprise = ? WHERE id = ?', instant, String(error_?.message ?? error_).slice(0, 200), repriseApres(error_?.statut, jour), flux.id);
		return 0;
	}
	const connus = await connusDe(db, flux.id);
	const faits = Object.values(connus).filter((c) => c.essaye === jour).length;
	const plan = planDuJour({ entrees, connus, jour, plafond: Math.min(budget, LECTURES_PAR_JOUR - faits) });
	const parId = new Map(entrees.map((e) => [e.id, e]));
	const issues = await enSerie(plan, (p) => lireArticle({ db, flux: flux.id, entree: parId.get(p.id), connu: connus[p.id], instant, jour, temoin }));
	const compte = (motif) => issues.filter((i) => i === motif).length;
	await faire(db, 'UPDATE flux SET lu = ?, etat = ?, reprise = NULL WHERE id = ?', instant, `${entrees.length} entrees, ${compte('version')} versions, ${compte('echec')} echecs`, flux.id);
	return plan.length;
}

/**
 * La tournee horaire : chaque flux suivi, le moins recemment lu d'abord, sauf
 * ceux qui attendent leur reprise ; `LECTURES_PAR_TOURNEE` lectures d'articles
 * au plus, pour rester dans les bornes d'une invocation.
 */
export async function tourneeDesFlux({ db, maintenant = new Date(), temoin = temoigner, budget = LECTURES_PAR_TOURNEE }) {
	const instant = maintenant.toISOString();
	const jour = jourDe(instant);
	const suivis = await tous(db, "SELECT id, url FROM flux WHERE retire IS NULL AND (reprise IS NULL OR reprise <= ?) ORDER BY COALESCE(lu, '') LIMIT 20", jour);
	let reste = budget;
	await enSerie(suivis, async (flux) => {
		if (reste > 0) reste -= await tourneeDuFlux({ db, flux, instant, jour, temoin, budget: reste });
	});
	return { flux: suivis.length, lectures: budget - reste };
}

/** Au plus tant de versions sur le registre public d'un editeur ; le compte dit les autres. */
export const REGISTRE_MAX = 2000;

/**
 * Le registre public d'un flux : ses versions (article, jour, place,
 * empreinte, recu), sans adresse ni titre ; null pour un flux inconnu.
 */
export async function registreDeLEditeur({ db, id, limite = REGISTRE_MAX, avant = null }) {
	const flux = await un(db, 'SELECT id, inscrit, retire FROM flux WHERE id = ?', String(id ?? ''));
	if (!flux) return null;
	const total = (await un(db, 'SELECT COUNT(*) AS n FROM version WHERE flux = ?', flux.id)).n;
	const borne = avantLeCurseur(avant);
	const lues = await tous(
		db,
		`SELECT v.article, d.jour, d.place, d.sha256, d.recu FROM version v JOIN depot d ON d.recu = v.recu WHERE v.flux = ?${borne.sql} ORDER BY d.jour DESC, d.place DESC LIMIT ?`,
		flux.id,
		...borne.args,
		limite + 1
	);
	const { lignes, suivant } = pageDe(lues, limite);
	return { flux, total, versions: lignes, suivant, suite: Boolean(avant) };
}

/** Le registre prive d'un flux, sur presentation de son jeton : l'adresse du flux et de chaque article, et chaque recu. */
/** Au plus tant de recus par lot de l'export prive ; `suivant` donne le lot d'apres. */
export const EXPORT_MAX = 2000;

export async function registrePrive({ db, id, jeton, apres = null, limite = EXPORT_MAX }) {
	const flux = await un(db, 'SELECT id, url, jeton, inscrit, retire, lu, etat FROM flux WHERE id = ?', String(id ?? ''));
	if (!flux) return refus(404, 'flux inconnu');
	if (!jeton || (await sha256(jeton)) !== flux.jeton) return refus(403, 'jeton refuse');
	// Une reinscription apres un retrait ouvre un registre neuf : son jeton ne lit
	// que ce qui a ete depose depuis, jamais les recus de l'inscription d'avant. A
	// l'INSTANT pres et non au jour : retiree et reprise le meme jour, l'inscription
	// neuve lisait les recus de la precedente (audit Codex du 2026-11-11).
	const depuis = jourDe(flux.inscrit);
	const DEPUIS_L_INSCRIPTION = "v.flux = ? AND v.jour >= ? AND json_extract(v.contenu, '$.depose') >= ?";
	// La liste des articles vient avec le PREMIER lot seulement : chaque lot la
	// rechargeait en entier (relecture Codex de la PR 154, 2026-11-12).
	const articles = apres
		? []
		: await tous(
				db,
				`SELECT a.id, a.lien, a.lu FROM article a WHERE a.flux = ? AND EXISTS (SELECT 1 FROM version v WHERE ${DEPUIS_L_INSCRIPTION} AND v.article = a.id) ORDER BY a.id`,
				flux.id,
				flux.id,
				depuis,
				flux.inscrit
			);
	// Par lots bornes, comme les pages publiques : charge d'un coup, l'export d'un flux
	// ancien finissait par ne plus tenir dans une invocation (audit Codex du 2026-11-11).
	const borne = apresLeCurseur(apres);
	const lus = await tous(
		db,
		`SELECT v.recu, v.article, v.contenu, d.jour, d.place FROM version v JOIN depot d ON d.recu = v.recu WHERE ${DEPUIS_L_INSCRIPTION}${borne.sql} ORDER BY d.jour, d.place LIMIT ?`,
		flux.id,
		depuis,
		flux.inscrit,
		...borne.args,
		limite + 1
	);
	const { lignes, suivant } = pageDe(lus, limite);
	const public_ = { id: flux.id, url: flux.url, inscrit: flux.inscrit, retire: flux.retire, lu: flux.lu, etat: flux.etat };
	return reponse(200, { flux: public_, articles, recus: lignes.map((r) => ({ id: r.recu, article: r.article, recu: JSON.parse(r.contenu) })), suivant });
}

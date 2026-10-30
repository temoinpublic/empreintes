// Le service de depot : la base (D1, ou toute base qui en a la forme), les
// plafonds, le temoin et la reponse. Les Functions ne font que le brancher.

import { surSiteOfficiel } from './acte.mjs';
import { cheminDeLActe } from './adresse.mjs';
import { nommeUnePersonne } from './personne.mjs';
import { inscriptionDuRecu, sha256 } from './chaine.mjs';
import { CLE_DE_LA_FLOTTE, cleDAdresse, estUnRecu, idDuRecu, jourDe, ligneDe, lireDemande, plafond, recuDe, secondesAvantDemain, selAleatoire } from './depot.mjs';
import { PORTEE_DU_RECU, PREFIXE_CLIENT, cleDuClient, verdictDuRecu } from './client.mjs';
import { PREFIXE_PRODUIT, cleDuProduit } from './produit.mjs';
import { verifierSignatureDuDeposant } from './origine.mjs';
import { EcheanceDepassee, sousEcheance } from './echeance.mjs';
import { AGENT, DELAI_MS, cleDeLecture, contenuAdmis, estUneIp, ipsDoH, lireBorne, resolutionAdmise, sautSuivant, urlAdmise } from './temoin.mjs';
import { empreinteDuTexte } from './textepdf.mjs';

/** Le schema de la base `empreintes-depots` ; rejouable. */
export const SCHEMA = [
	'CREATE TABLE IF NOT EXISTS depot (jour TEXT NOT NULL, place INTEGER NOT NULL, sha256 TEXT NOT NULL, recu TEXT NOT NULL, PRIMARY KEY (jour, place)) WITHOUT ROWID',
	'CREATE TABLE IF NOT EXISTS compte (jour TEXT NOT NULL, adresse TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (jour, adresse)) WITHOUT ROWID',
	'CREATE TABLE IF NOT EXISTS lecture (cle TEXT PRIMARY KEY, jour TEXT NOT NULL) WITHOUT ROWID',
	'CREATE TABLE IF NOT EXISTS sel (jour TEXT PRIMARY KEY, valeur TEXT NOT NULL) WITHOUT ROWID',
	'CREATE TABLE IF NOT EXISTS bilan (jour TEXT PRIMARY KEY, depots INTEGER NOT NULL, deposants INTEGER NOT NULL) WITHOUT ROWID',
	// `objet` et `url` ajoutes le 2026-10-12 par ALTER TABLE sur la base en service ; null pour les actes d'avant.
	'CREATE TABLE IF NOT EXISTS acte (recu TEXT PRIMARY KEY, collectivite TEXT NOT NULL, nature TEXT NOT NULL, objet TEXT, url TEXT) WITHOUT ROWID',
	'CREATE INDEX IF NOT EXISTS acte_collectivite ON acte (collectivite)',
	// D-170 : les flux suivis, leurs articles et les versions deposees. `jeton` est le sha256 du jeton rendu a l'inscription.
	'CREATE TABLE IF NOT EXISTS flux (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, jeton TEXT NOT NULL, inscrit TEXT NOT NULL, retire TEXT, reprise TEXT, lu TEXT, etat TEXT) WITHOUT ROWID',
	'CREATE TABLE IF NOT EXISTS article (flux TEXT NOT NULL, id TEXT NOT NULL, lien TEXT NOT NULL, empreinte TEXT, octets TEXT, essaye TEXT, lu TEXT, PRIMARY KEY (flux, id)) WITHOUT ROWID',
	'CREATE TABLE IF NOT EXISTS version (recu TEXT PRIMARY KEY, flux TEXT NOT NULL, article TEXT NOT NULL, jour TEXT NOT NULL, contenu TEXT NOT NULL) WITHOUT ROWID',
	'CREATE INDEX IF NOT EXISTS version_jour ON version (jour)',
	'CREATE INDEX IF NOT EXISTS version_article ON version (flux, article)',
	'CREATE INDEX IF NOT EXISTS depot_recu ON depot (recu)',
	'CREATE INDEX IF NOT EXISTS depot_sha256 ON depot (sha256)',
	// D-205 : la source d'un acte au dernier passage de la glane, `vue` (le lien y est encore publie) ou `absente`.
	'CREATE TABLE IF NOT EXISTS passage (recu TEXT PRIMARY KEY, jour TEXT NOT NULL, etat TEXT NOT NULL) WITHOUT ROWID',
	// D-193 : la derniere relecture de la source d'un acte par le temoin, quand la glane la redemande : `statut` 200
	// (les memes octets), 404 ou 410 ; `depuis`, le premier jour de ce statut.
	'CREATE TABLE IF NOT EXISTS relecture (recu TEXT PRIMARY KEY, jour TEXT NOT NULL, depuis TEXT NOT NULL, statut INTEGER NOT NULL) WITHOUT ROWID',
	// D-193 : l'empreinte du TEXTE d'un acte (`src/textepdf.mjs`), posee a sa datation ou a une relecture des memes octets ;
	// une version nouvelle a la meme adresse n'est « remplacee » que si elle change. Table creee le 2026-10-30 sur la base en service.
	'CREATE TABLE IF NOT EXISTS texte (recu TEXT PRIMARY KEY, sha256 TEXT NOT NULL) WITHOUT ROWID',
	// D-200 : la liste d'attente d'une offre pas encore ouverte (`src/attente.mjs`) ; l'adresse electronique et le profil, rien d'autre.
	'CREATE TABLE IF NOT EXISTS attente (offre TEXT NOT NULL, adresse TEXT NOT NULL, profil TEXT NOT NULL, jour TEXT NOT NULL, PRIMARY KEY (offre, adresse)) WITHOUT ROWID',
	// D-167 : le produit de la flotte qui a depose un recu de consultation, et l'adresse publique de ce recu (table ajoutee le 2026-10-20).
	'CREATE TABLE IF NOT EXISTS produit (recu TEXT PRIMARY KEY, nom TEXT NOT NULL, url TEXT NOT NULL) WITHOUT ROWID'
];

const JSON_UTF8 = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const reponse = (statut, corps, entetes = {}) => ({ statut, corps: `${JSON.stringify(corps, null, 1)}\n`, entetes: { ...JSON_UTF8, ...entetes } });
const refus = (statut, erreur, details = [], entetes = {}) => reponse(statut, { erreur, details }, entetes);

const un = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const faire = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

/** Le sel du jour : tire une fois, jete le lendemain avec les compteurs et les lectures. */
async function selDuJour(db, jour) {
	await faire(db, 'DELETE FROM sel WHERE jour < ?', jour);
	// Le compte des jours passes ne survit qu'en agregat : combien de depots, combien d'adresses distinctes ce jour-la.
	await faire(db, 'INSERT INTO bilan (jour, depots, deposants) SELECT jour, SUM(n), COUNT(*) FROM compte WHERE jour < ? AND adresse <> ? AND adresse NOT LIKE ? AND adresse NOT LIKE ? GROUP BY jour ON CONFLICT (jour) DO NOTHING', jour, CLE_DE_LA_FLOTTE, `${PREFIXE_CLIENT}%`, `${PREFIXE_PRODUIT}%`);
	await faire(db, 'DELETE FROM compte WHERE jour < ?', jour);
	await faire(db, 'DELETE FROM lecture WHERE jour < ?', jour);
	await faire(db, 'INSERT INTO sel (jour, valeur) VALUES (?, ?) ON CONFLICT (jour) DO NOTHING', jour, selAleatoire());
	return (await un(db, 'SELECT valeur FROM sel WHERE jour = ?', jour)).valeur;
}

/** Les adresses IP d'un hote, en A et AAAA, par un resolveur DoH au format JSON. */
export async function resoudreParDoH(hote, { fetch: f = fetch, resolveur = 'https://cloudflare-dns.com/dns-query', signal } = {}) {
	const lire = async (type) => {
		const r = await f(`${resolveur}?name=${encodeURIComponent(hote)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal });
		if (!r.ok) throw new Error(`resolution ${type} : ${r.status}`);
		return ipsDoH(await r.json());
	};
	return [...(await lire('A')), ...(await lire('AAAA'))];
}

/**
 * Ce que le temoin a lu d'une reponse finale ; leve avec `statut` si elle n'est
 * pas un succes, et avec `contenu` quand `juger` refuse ce qui a ete servi.
 */
async function lireReponse(r, { url, demandee, debut, maintenant, garder, juger }) {
	if (!r.ok) {
		await r.body?.cancel();
		throw Object.assign(new Error(`la source a repondu ${r.status}`), { statut: r.status });
	}
	const octets = r.body ? await lireBorne(r.body.getReader(), { debut, maintenant }) : new Uint8Array(0);
	const verdict = juger ? contenuAdmis({ annoncees: [demandee, url], type: r.headers.get('content-type'), octets }) : { ok: true };
	if (verdict.refus) throw Object.assign(new Error(verdict.refus), { contenu: true });
	const lu = { url, taille: octets.byteLength, type: r.headers.get('content-type'), lu: new Date(maintenant()).toISOString(), sha256: await sha256(octets) };
	return garder ? { ...lu, octets } : lu;
}

/**
 * Le temoin : lit l'URL lui-meme, chaque saut regarde (protocole, port, hote,
 * resolution), dans ses bornes, et rend ce qu'il a lu (les octets aussi avec
 * `garder`). Leve avec le motif, et `statut` quand la source a repondu.
 * `juger` refuse aussi ce qui n'est pas le document (`contenuAdmis`) : pour un
 * depot, pas pour un flux suivi, dont les pages portent souvent une connexion.
 */
export async function temoigner(admise, { delaiMs = DELAI_MS, ...options } = {}) {
	try {
		return await sousEcheance(delaiMs, 'du temoin', (arret) => lireSous(admise, arret, options));
	} catch (erreur) {
		// Le meme motif que la borne de lecture : la glane le classe en `422-delai`, a redemander.
		if (erreur instanceof EcheanceDepassee) throw new Error(`lecture au-dela de ${delaiMs / 1000} s`);
		throw erreur;
	}
}

/**
 * UNE echeance pour toute la lecture, resolutions, sauts et corps compris : un
 * delai par `fetch` repartait a chaque redirection, la resolution DoH n'en avait
 * aucun, et un `read()` bloque n'etait juge qu'une fois revenu.
 */
async function lireSous(admise, arret, { fetch: f = fetch, resoudre = (h, signal) => resoudreParDoH(h, { signal }), maintenant = () => Date.now(), garder = false, juger = false }) {
	const debut = maintenant();
	let courante = admise;
	for (let sauts = 0; ; sauts++) {
		if (!estUneIp(courante.hote)) {
			const verdict = resolutionAdmise(await resoudre(courante.hote, arret));
			if (verdict.refus) throw new Error(verdict.refus);
		}
		const r = await f(courante.url, { redirect: 'manual', headers: { 'user-agent': AGENT, accept: '*/*' }, signal: arret });
		if (r.status >= 300 && r.status < 400) {
			await r.body?.cancel();
			const suite = sautSuivant({ courante: courante.url, statut: r.status, location: r.headers.get('location'), sauts });
			if (suite.refus) throw new Error(suite.refus);
			courante = suite;
			continue;
		}
		return lireReponse(r, { url: courante.url, demandee: admise.url, debut, maintenant, garder, juger });
	}
}

const SQL_DU_DEPOT = 'INSERT INTO depot (jour, place, sha256, recu) SELECT ?, COALESCE(MAX(place), 0) + 1, ?, ? FROM depot WHERE jour = ? RETURNING place';

/**
 * Prend la place suivante du jour, dans la meme instruction que l'insertion, et
 * ecrit `suites` (`[sql, ...args]`) dans la MEME transaction (`batch` de D1) :
 * une panne entre deux ecritures laissait une ligne publique sans son acte,
 * son produit, sa version ou son compte. Tout ou rien ; une collision de place
 * avec un depot simultane rejoue le tout une fois.
 */
export async function inserer(db, { jour, empreinte, recu }, suites = []) {
	const ecrire = async () => {
		const [depot] = await db.batch([db.prepare(SQL_DU_DEPOT).bind(jour, empreinte, recu, jour), ...suites.map(([sql, ...args]) => db.prepare(sql).bind(...args))]);
		return depot.results[0].place;
	};
	try {
		return await ecrire();
	} catch {
		return await ecrire();
	}
}

/**
 * Le rattachement d'un acte : `site-officiel` quand l'adresse demandee ET
 * l'adresse lue sont sur un site que l'annuaire donne a la collectivite,
 * `declaree` sinon, et aussi quand l'annuaire ne repond pas.
 */
async function rattachement({ acte, demandee, lue, annuaire }) {
	let sites = null;
	try {
		sites = await annuaire(acte.collectivite);
	} catch {
		sites = null;
	}
	return surSiteOfficiel(demandee, sites) && surSiteOfficiel(lue, sites) ? 'site-officiel' : 'declaree';
}

/** L'adresse lue d'un acte, montree sur la page de sa collectivite ; null quand son chemin nomme une personne. */
export function adressePublique(url) {
	let chemin;
	try {
		chemin = decodeURIComponent(new URL(url).pathname);
	} catch {
		return null;
	}
	return nommeUnePersonne(chemin.replace(/[/_.-]+/g, ' ')) ? null : url;
}

/** Le registre des autorites, ou null quand il manque : la signature se verifie alors sans juger l'emetteur. */
async function lireAutorites(autorites) {
	try {
		return (await autorites())?.autorites ?? null;
	} catch {
		return null;
	}
}

/**
 * Un depot, de la demande a la reponse : `{ statut, corps, entetes }`.
 * `adresse` n'est jamais gardee : seul son hache sale du jour compte.
 * `annuaire(code)` rend les sites officiels d'une collectivite, `[hote, prefixe]` ;
 * `autorites()` le registre des autorites des listes de confiance, ou null.
 * `flotte` : la glane des actes des communes (D-178), qui ne depose que des
 * actes lus sur le site officiel, sous son propre plafond, hors du bilan des
 * deposants, et ne redate pas un acte deja date pour sa collectivite ; ou un
 * produit de la flotte (D-167, `produit` dans la demande), qui depose
 * l'empreinte declaree d'un recu qu'il sert, sous le plafond de ce produit.
 * `client` : un client des offres (D-195, `src/client.mjs`), sous son propre
 * plafond, hors du plafond public et du bilan ; sa reponse porte `portee`.
 */
export async function deposer({ db, corps, adresse, maintenant = new Date(), temoin = temoigner, annuaire = async () => null, autorites = async () => null, flotte = false, client = null, copie = false }) {
	const { demande, erreurs } = lireDemande(corps);
	if (erreurs) return refus(400, 'demande illisible', erreurs);
	if (demande.produit && !flotte) return refus(403, 'jeton de la flotte requis', ['un recu de produit se depose sous le jeton de la flotte']);
	if (flotte && !demande.acte && !demande.produit) return refus(400, 'demande illisible', ['la flotte ne depose que des actes ou des recus de ses produits']);
	const glane = flotte && Boolean(demande.acte);
	const instant = maintenant.toISOString();
	const jour = jourDe(instant);
	const sel = await selDuJour(db, jour);
	const cle = cleDeCompte({ flotte, client, produit: demande.produit }) ?? (await cleDAdresse(adresse ?? 'inconnue', sel));
	// Les versions des flux suivis (D-170) ont leurs propres plafonds, hors de celui des depots exterieurs.
	// Les actes de la glane (D-178) et les recus des produits (D-167) aussi.
	const duJour =
		(await un(db, 'SELECT COALESCE(MAX(place), 0) AS n FROM depot WHERE jour = ?', jour)).n -
		(await un(db, 'SELECT COUNT(*) AS n FROM version WHERE jour = ?', jour)).n -
		(await un(db, 'SELECT COALESCE(SUM(n), 0) AS n FROM compte WHERE jour = ? AND (adresse = ? OR adresse LIKE ? OR adresse LIKE ?)', jour, CLE_DE_LA_FLOTTE, `${PREFIXE_CLIENT}%`, `${PREFIXE_PRODUIT}%`)).n;
	const deCetteAdresse = (await un(db, 'SELECT n FROM compte WHERE jour = ? AND adresse = ?', jour, cle))?.n ?? 0;
	const limite = plafond({ deCetteAdresse, duJour, instant, flotte: glane, client, produit: demande.produit ?? null });
	const auPlafond = () => refus(429, limite.motif, [], { 'retry-after': String(limite.apres) });
	// La glane relit aussi ses actes deja dates (D-193) : son plafond ne compte que les actes nouveaux, il se juge apres la lecture.
	if (!limite.ok && !glane) return auPlafond();

	let empreinte = demande.sha256;
	let lu = null;
	let cleLue = null;
	let texte = null;
	const copieVoulue = copie && !flotte;
	if (demande.url) {
		const admise = urlAdmise(demande.url);
		if (admise.refus) return refus(400, 'url refusee', [admise.refus]);
		cleLue = await cleDeLecture(admise.url, jour);
		const nouvelle = await faire(db, 'INSERT INTO lecture (cle, jour) VALUES (?, ?) ON CONFLICT (cle) DO NOTHING', cleLue, jour);
		if (nouvelle.meta.changes === 0) return refus(409, 'url deja lue aujourd hui', [], { 'retry-after': String(secondesAvantDemain(instant)) });
		try {
			// Les octets d'un acte servent a son empreinte de texte (D-193), jamais rendus sans `copie`.
			lu = await temoin(admise, { juger: true, garder: copieVoulue || Boolean(demande.acte) });
		} catch (erreur) {
			// Une source qui ne sert plus un acte deja date pour sa commune : la relecture le note, la reponse reste un refus.
			if (glane && SOURCE_DISPARUE.includes(erreur?.statut))
				await noterRelecture(db, { jour, statut: erreur.statut, ou: 'collectivite = ? AND url = ?', args: [demande.acte.collectivite, adressePublique(admise.url)] });
			return refus(422, 'lecture impossible', [String(erreur?.message ?? erreur)]);
		}
		empreinte = lu.sha256;
		if (demande.acte) texte = await empreinteDuTexte(lu.octets);
	}

	const signature = demande.signature ? await verifierSignatureDuDeposant(demande.signature, empreinte, instant, await lireAutorites(autorites)) : null;
	if (signature && !signature.ok) {
		// Une signature refusee ne consomme pas la lecture du jour : le deposant peut revenir avec la bonne.
		if (cleLue) await faire(db, 'DELETE FROM lecture WHERE cle = ?', cleLue);
		return refus(400, 'signature refusee', signature.raisons);
	}

	const acte = demande.acte ? { ...demande.acte, rattachement: await rattachement({ acte: demande.acte, demandee: demande.url, lue: lu.url, annuaire }) } : null;
	if (glane) {
		const refusDeLaGlane = await jugerLaGlane(db, { acte, empreinte, lue: adressePublique(lu.url), jour, texte });
		if (refusDeLaGlane) return refusDeLaGlane;
		if (!limite.ok) return auPlafond();
	}
	const recu = recuDe({ sha256: empreinte, instant, libelle: demande.libelle, url: demande.url, temoin: lu, acte, affichage: demande.affichage ?? null, produit: demande.produit ?? null, signature: signature && { valeur: demande.signature, certificat: signature.certificat.empreinte, sujet: signature.certificat.sujet, emetteur: signature.certificat.emetteur, autorite: signature.certificat.autorite } });
	const id = await idDuRecu(recu);
	const suites = [['INSERT INTO compte (jour, adresse, n) VALUES (?, ?, 1) ON CONFLICT (jour, adresse) DO UPDATE SET n = n + 1', jour, cle]];
	// La serie d'une collectivite ne tient que les actes lus sur son site officiel ; un acte declare reste dans son recu.
	if (acte?.rattachement === 'site-officiel') {
		suites.push(['INSERT INTO acte (recu, collectivite, nature, objet, url) VALUES (?, ?, ?, ?, ?)', id, acte.collectivite, acte.nature, demande.libelle ?? null, adressePublique(lu.url)]);
		if (texte) suites.push([SQL_DU_TEXTE, id, texte]);
	}
	// Le recu d'un produit (D-167) : sa page nomme le produit et mene au recu que celui-ci sert.
	if (demande.produit) suites.push(['INSERT INTO produit (recu, nom, url) VALUES (?, ?, ?)', id, demande.produit.nom, demande.produit.url]);
	const place = await inserer(db, { jour, empreinte, recu: id }, suites);
	return reponse(201, { jour, place, ligne: ligneDe({ sha256: empreinte, jour, place, recu: id }).trim(), id, recu, ...(copieVoulue ? copieDe(lu) : {}), ...(client ? { client: client.id, portee: PORTEE_DU_RECU } : {}) });
}

const SQL_DU_TEXTE = 'INSERT INTO texte (recu, sha256) VALUES (?, ?) ON CONFLICT (recu) DO NOTHING';

/** Au-dela, la reponse ne porte pas la copie : le deposant lit le fichier a sa source. */
export const COPIE_MAX = 8 * 1024 * 1024;

/**
 * La copie des octets que le temoin a lus, rendue au deposant et jamais gardee :
 * sans elle, une page qui change ou disparait ne se rapproche plus de son empreinte.
 */
function copieDe(lu) {
	if (!lu?.octets || lu.octets.byteLength > COPIE_MAX) return {};
	return { copie: { type: lu.type ?? null, base64: enBase64(lu.octets) } };
}

function enBase64(octets) {
	let binaire = '';
	for (let i = 0; i < octets.byteLength; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
	return btoa(binaire);
}

/** La cle de compte d'un produit, de la glane ou d'un client ; null pour un deposant sans jeton, compte par son adresse. */
function cleDeCompte({ flotte, client, produit }) {
	if (produit) return cleDuProduit(produit.nom);
	if (flotte) return CLE_DE_LA_FLOTTE;
	return client ? cleDuClient(client) : null;
}

const FICHIER = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * Ce que la glane ne depose pas : un acte lu hors du site officiel de la
 * commune (il n'irait sur aucune page), ou deja date pour elle (meme empreinte) ;
 * alors son recu existant. Null quand l'acte est a deposer.
 */
async function jugerLaGlane(db, { acte, empreinte, lue, jour, texte = null }) {
	if (acte.rattachement !== 'site-officiel') return refus(422, 'hors du site officiel', [acte.collectivite]);
	const deja = await un(db, 'SELECT d.jour, d.place, d.recu, a.url FROM acte a JOIN depot d ON d.recu = a.recu WHERE d.sha256 = ? AND a.collectivite = ? ORDER BY d.jour LIMIT 1', empreinte, acte.collectivite);
	if (!deja) return null;
	// Les memes octets : la meme empreinte de texte, posee sur l'acte date avant qu'elle existe (D-193).
	if (texte) await faire(db, SQL_DU_TEXTE, deja.recu, texte);
	// Les memes octets relus a l'adresse de l'acte, un autre jour : sa source le sert toujours.
	if (lue && deja.url === lue && deja.jour < jour) await noterRelecture(db, { jour, statut: 200, ou: 'recu = ?', args: [deja.recu] });
	return reponse(200, { deja: true, jour: deja.jour, place: Number(deja.place), id: deja.recu });
}

/** Les reponses d'une source qui ne sert plus le document (D-193). */
export const SOURCE_DISPARUE = [404, 410];

/** Note la relecture du jour pour les actes que `ou` designe ; `depuis` ne bouge que quand le statut change. */
async function noterRelecture(db, { jour, statut, ou, args }) {
	if (args.includes(null)) return;
	await faire(
		db,
		`INSERT INTO relecture (recu, jour, depuis, statut) SELECT recu, ?, ?, ? FROM acte WHERE ${ou} ON CONFLICT (recu) DO UPDATE SET depuis = CASE WHEN relecture.statut = excluded.statut THEN relecture.depuis ELSE excluded.jour END, jour = excluded.jour, statut = excluded.statut`,
		jour,
		jour,
		statut,
		...args
	);
}

/** La derniere relecture de la source d'un acte, `{ jour, depuis, statut }`, ou null. */
export const relectureDeLActe = ({ db, recu }) => un(db, 'SELECT jour, depuis, statut FROM relecture WHERE recu = ?', recu);

/** Le fichier public d'un jour : ses lignes dans l'ordre des places, rien d'autre. */
export async function fichierDuJour({ db, nom, maintenant = new Date() }) {
	const m = FICHIER.exec(nom ?? '');
	if (!m || Number.isNaN(Date.parse(m[1]))) return { statut: 404, corps: 'fichier inconnu\n', entetes: { 'content-type': 'text/plain; charset=utf-8' } };
	const { results } = await db.prepare('SELECT sha256, jour, place, recu FROM depot WHERE jour = ? ORDER BY place').bind(m[1]).all();
	const clos = m[1] < jourDe(maintenant.toISOString());
	return {
		statut: 200,
		corps: results.map(ligneDe).join(''),
		entetes: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': `public, max-age=${clos ? 3600 : 60}`, 'access-control-allow-origin': '*' }
	};
}

const HEX64 = /^[0-9a-f]{64}$/;
const COLONNES = 'SELECT sha256, jour, place, recu FROM depot';

/** La ligne publique d'un recu, par son identifiant ; null s'il est inconnu. */
export async function ligneDuRecu({ db, id }) {
	if (!HEX64.test(id ?? '')) return null;
	return un(db, `${COLONNES} WHERE recu = ?`, id);
}

/** Les lignes publiques qui portent une empreinte, dans l'ordre des jours et des places. */
export async function lignesDeLEmpreinte({ db, empreinte }) {
	if (!HEX64.test(empreinte ?? '')) return null;
	return (await db.prepare(`${COLONNES} WHERE sha256 = ? ORDER BY jour, place`).bind(empreinte).all()).results;
}

/** La reponse JSON d'une lecture publique : 404 sur l'inconnu, cache court sinon. */
export function lecturePublique(valeur) {
	if (valeur === null) return refus(404, 'inconnu');
	return reponse(200, valeur, { 'cache-control': 'public, max-age=60' });
}

/**
 * Le bilan public, jour par jour : depots et deposants distincts (adresses
 * distinctes ce jour-la, jamais suivies d'un jour a l'autre). Les jours clos
 * viennent de `bilan`, le jour en cours et les jours pas encore purges du
 * compteur vivant.
 */
export async function bilanPublic({ db }) {
	const { results } = await db
		.prepare('SELECT jour, depots, deposants FROM bilan UNION ALL SELECT jour, SUM(n) AS depots, COUNT(*) AS deposants FROM compte WHERE adresse <> ? AND adresse NOT LIKE ? AND adresse NOT LIKE ? GROUP BY jour ORDER BY jour')
		.bind(CLE_DE_LA_FLOTTE, `${PREFIXE_CLIENT}%`, `${PREFIXE_PRODUIT}%`)
		.all();
	const jours = results.map((r) => ({ jour: r.jour, depots: Number(r.depots), deposants: Number(r.deposants) }));
	return { jours, deposantsAuMoins: Math.max(0, ...jours.map((j) => j.deposants)), recusDesProduits: await recusDesProduits({ db }) };
}

/** Les recus des produits de la flotte (D-167), jour par jour et par produit : le nom en clair, jamais une adresse. */
async function recusDesProduits({ db }) {
	const { results } = await db.prepare('SELECT d.jour, p.nom, COUNT(*) AS recus FROM produit p JOIN depot d ON d.recu = p.recu GROUP BY d.jour, p.nom ORDER BY d.jour, p.nom').all();
	return results.map((r) => ({ jour: r.jour, nom: r.nom, recus: Number(r.recus) }));
}

/** Au plus tant d'actes sur la page d'une collectivite ; le compte dit les autres. */
export const SERIE_MAX = 500;

/**
 * La serie publique d'une collectivite : ses actes rattaches, du plus recent au
 * plus ancien, sous chacun de ses codes (INSEE et SIREN) : la ligne publique,
 * la nature, l'objet donne au depot et l'adresse lue sur le site officiel ;
 * `depuis`, le jour du premier acte date.
 */
export async function serieDeLaCollectivite({ db, codes, limite = SERIE_MAX }) {
	const marques = codes.map(() => '?').join(', ');
	const compte = await un(db, `SELECT COUNT(*) AS n, MIN(d.jour) AS depuis FROM acte a JOIN depot d ON d.recu = a.recu WHERE a.collectivite IN (${marques})`, ...codes);
	const { results } = await db
		.prepare(`SELECT d.jour, d.place, d.sha256, d.recu, a.collectivite, a.nature, a.objet, a.url FROM acte a JOIN depot d ON d.recu = a.recu WHERE a.collectivite IN (${marques}) ORDER BY d.jour DESC, d.place DESC LIMIT ?`)
		.bind(...codes, limite)
		.all();
	return { total: Number(compte.n), depuis: compte.depuis ?? null, actes: results };
}

/** Le compte d'actes rattaches de chaque code de collectivite (INSEE ou SIREN), `[{ code, actes }]`. */
export async function actesParCollectivite({ db }) {
	const { results } = await db.prepare('SELECT collectivite AS code, COUNT(*) AS actes, MAX((SELECT MAX(d.jour) FROM depot d WHERE d.recu = a.recu)) AS jour FROM acte a GROUP BY collectivite').all();
	return results.map((r) => ({ code: r.code, actes: Number(r.actes), jour: r.jour ?? null }));
}

/** L'acte rattache que porte un recu, `{ collectivite, nature, objet, url }` ; null pour tout autre depot. */
export async function acteDuRecu({ db, id }) {
	if (!HEX64.test(id ?? '')) return null;
	return un(db, 'SELECT collectivite, nature, objet, url FROM acte WHERE recu = ?', id);
}

/** Le produit de la flotte qui a depose un recu, `{ nom, url }` ; null pour tout autre depot. */
export async function produitDuRecu({ db, id }) {
	if (!HEX64.test(id ?? '')) return null;
	return un(db, 'SELECT nom, url FROM produit WHERE recu = ?', id);
}

const COLONNES_D_ACTE = 'SELECT d.jour, d.place, d.sha256, d.recu, a.collectivite, a.nature, a.objet, a.url FROM acte a JOIN depot d ON d.recu = a.recu';

/** Au plus tant d'actes rendus pour un prefixe ambigu. */
export const AMBIGUS_MAX = 20;

/** Les actes rattaches d'une collectivite, dates tel jour, dont l'empreinte commence par `prefixe`. */
export async function actesAuPrefixe({ db, code, jour, prefixe }) {
	const { results } = await db
		.prepare(`${COLONNES_D_ACTE} WHERE d.jour = ? AND a.collectivite = ? AND substr(d.sha256, 1, ?) = ? ORDER BY d.place LIMIT ?`)
		.bind(jour, code, prefixe.length, prefixe, AMBIGUS_MAX)
		.all();
	return results;
}

/** Au plus autant d'adresses dans le plan des actes : la limite d'un fichier sitemaps.org. */
export const PLAN_DES_ACTES_MAX = 50000;

/** Ce qui compose l'adresse de chaque acte rattache, du plus ancien au plus recent. */
export async function adressesDesActes({ db, limite = PLAN_DES_ACTES_MAX, decalage = 0 }) {
	const { results } = await db.prepare('SELECT d.jour, d.sha256, a.collectivite, a.nature FROM acte a JOIN depot d ON d.recu = a.recu ORDER BY d.jour, d.place LIMIT ? OFFSET ?').bind(limite, decalage).all();
	return results;
}

/** Le nombre d'actes rattaches, qui ont chacun une adresse. */
export const nombreDActes = async ({ db }) => (await un(db, 'SELECT COUNT(*) AS n FROM acte')).n;

/** Les versions datees d'une meme source dans une collectivite, de la plus ancienne a la plus recente. */
export async function versionsDeLaSource({ db, collectivite, url }) {
	if (!url) return [];
	const { results } = await db.prepare(`${COLONNES_D_ACTE} WHERE a.collectivite = ? AND a.url = ? ORDER BY d.jour, d.place`).bind(collectivite, url).all();
	return results;
}

/**
 * La ligne publique d'un recu, plus `acte`, l'adresse perenne de l'acte qu'il
 * date (D-205), quand c'en est un, et `produit`, le produit de la flotte et
 * l'adresse du recu qu'il sert (D-167) ; null s'il est inconnu.
 */
export async function ligneEtAdresseDuRecu({ db, id }) {
	const ligne = await ligneDuRecu({ db, id });
	if (!ligne) return null;
	const [acte, produit] = await Promise.all([acteDuRecu({ db, id }), produitDuRecu({ db, id })]);
	return {
		...ligne,
		...(acte ? { acte: `https://temoinpublic.fr${cheminDeLActe({ ...acte, jour: ligne.jour, sha256: ligne.sha256 })}` } : {}),
		...(produit ? { produit: { nom: produit.nom, url: produit.url } } : {})
	};
}

/** Au plus autant de recus dans un passage de la glane, vus et absents ensemble. */
export const PASSAGE_MAX = 500;
// D1 lie au plus 100 parametres par instruction.
const PAR_INSTRUCTION = 90;

/** Les erreurs d'un passage `{ vus, absents }` : deux listes de recus (64 hex), disjointes, bornees. */
function erreursDuPassage(corps) {
	if (corps === null || typeof corps !== 'object') return ['un objet { vus, absents } attendu'];
	const listes = [corps.vus ?? [], corps.absents ?? []];
	if (!listes.every((l) => Array.isArray(l) && l.every((id) => HEX64.test(id)))) return ['vus, absents : des listes de recus (64 hex)'];
	const [vus, absents] = listes;
	if (vus.length + absents.length > PASSAGE_MAX) return [`au plus ${PASSAGE_MAX} recus par passage`];
	if (vus.some((id) => absents.includes(id))) return ['un recu a la fois vu et absent'];
	return [];
}

/** Note `etat` au jour pour chaque recu de `ids` qui date un acte ; rend le nombre de lignes ecrites. */
async function noterEtat(db, ids, jour, etat) {
	let n = 0;
	for (let i = 0; i < ids.length; i += PAR_INSTRUCTION) {
		const lot = ids.slice(i, i + PAR_INSTRUCTION);
		const r = await faire(
			db,
			`INSERT INTO passage (recu, jour, etat) SELECT recu, ?, ? FROM acte WHERE recu IN (${lot.map(() => '?').join(', ')}) ON CONFLICT (recu) DO UPDATE SET jour = excluded.jour, etat = excluded.etat`,
			jour,
			etat,
			...lot
		);
		n += r.meta.changes;
	}
	return n;
}

/**
 * Le passage de la glane sur la page des actes d'une commune (D-205) : les
 * recus dont le lien y est encore publie (`vus`) et ceux dont il a disparu
 * (`absents`). Seuls les recus d'actes s'ecrivent ; le jour est celui du serveur.
 */
export async function noterPassage({ db, corps, maintenant = new Date() }) {
	const erreurs = erreursDuPassage(corps);
	if (erreurs.length) return refus(400, 'passage illisible', erreurs);
	const jour = jourDe(maintenant);
	return reponse(200, { jour, vus: await noterEtat(db, corps.vus ?? [], jour, 'vue'), absents: await noterEtat(db, corps.absents ?? [], jour, 'absente') });
}

/** L'etat de la source d'un acte au dernier passage de la glane, `{ jour, etat }`, ou null. */
export const passageDeLActe = ({ db, recu }) => un(db, 'SELECT jour, etat FROM passage WHERE recu = ?', recu);

/** Au plus autant d'evenements d'actes par classe sur `/disparus` (D-193). */
export const DISPARUS_DES_ACTES_MAX = 100;

/**
 * Les actes des communes dont la source a change (D-193), les plus recents
 * d'abord, `{ disparus, remplaces }` : `disparus`, ceux que leur
 * adresse ne sert plus (relecture 404 ou 410, `date` le premier jour de ce
 * statut) ; `remplaces`, chaque version nouvelle datee a la meme adresse dont
 * le TEXTE change, avec la version qui la precede (`avant_*`). Une version
 * dont seuls les octets changent (recompression, autre `Producer`) reste
 * datee mais n'est pas un remplacement ; sans empreinte de texte des deux
 * cotes, rien n'est prouve, rien ne parait (les 857 recompressions de
 * l'Aveyron d'octobre 2026). Bruts : le filtre de ce qui se publie est
 * `entreesDesActes`.
 */
export async function actesDisparus({ db, max = DISPARUS_DES_ACTES_MAX }) {
	const disparus = await db
		.prepare(
			`SELECT r.depuis AS date, r.statut AS http, d.jour AS avant_jour, d.sha256 AS avant, a.collectivite, a.nature, a.objet, a.url FROM relecture r JOIN acte a ON a.recu = r.recu JOIN depot d ON d.recu = r.recu WHERE r.statut IN (${SOURCE_DISPARUE.join(', ')}) AND a.url IS NOT NULL ORDER BY r.depuis DESC, a.url LIMIT ?`
		)
		.bind(max)
		.all();
	const remplaces = await db
		.prepare(
			`SELECT * FROM (SELECT d.jour AS date, d.sha256 AS apres, t.sha256 AS texte, LAG(d.jour) OVER suite AS avant_jour, LAG(d.sha256) OVER suite AS avant, LAG(t.sha256) OVER suite AS avant_texte, LAG(a.nature) OVER suite AS nature, a.collectivite, a.objet, a.url FROM acte a JOIN depot d ON d.recu = a.recu LEFT JOIN texte t ON t.recu = a.recu WHERE a.url IS NOT NULL WINDOW suite AS (PARTITION BY a.collectivite, a.url ORDER BY d.jour, d.place)) WHERE avant IS NOT NULL AND texte IS NOT NULL AND avant_texte IS NOT NULL AND texte <> avant_texte ORDER BY date DESC, url LIMIT ?`
		)
		.bind(max)
		.all();
	return { disparus: disparus.results, remplaces: remplaces.results };
}

/**
 * La verification d'un recu par l'API des offres (D-195) : `corps` est le recu
 * rendu au depot, tel quel. Son identifiant se recalcule, sa ligne publique se
 * relit en base, son inscription dans le journal publie se lit par `lire`
 * (chemin vers une reponse), la signature du deposant se verifie a l'instant du
 * depot. Toujours 200 sur un recu lisible : `authentique` dit le verdict.
 */
export async function verifierUnRecu({ db, corps, lire, autorites = async () => null, temoin = temoigner }) {
	if (!estUnRecu(corps)) return refus(400, 'recu illisible', ['un recu rendu par POST /api/depots est attendu, tel quel']);
	const id = await idDuRecu(corps);
	const ligne = await ligneDuRecu({ db, id });
	if (!ligne) return reponse(200, verdictDuRecu({ id, recu: corps, ligne: null }));
	const [inscription, signature, produit] = await Promise.all([inscriptionLue(id, lire), signatureRelue(corps, autorites), produitRelu(corps, temoin)]);
	return reponse(200, verdictDuRecu({ id, recu: corps, ligne, inscription, signature, produit }));
}

/**
 * Le recu d'un produit de la flotte (D-167), relu a son adresse par le temoin :
 * `identique` quand les octets servis aujourd'hui ont l'empreinte deposee,
 * `different` sinon, `illisible` quand l'adresse ne repond pas (`statut` de la
 * source quand elle a repondu). Null pour un recu sans produit.
 */
async function produitRelu(recu, temoin) {
	if (!recu.produit) return null;
	const { nom, url } = recu.produit;
	const admise = urlAdmise(url);
	if (admise.refus) return { nom, url, relecture: { etat: 'illisible', raison: admise.refus } };
	try {
		const lu = await temoin(admise);
		return { nom, url, relecture: { etat: lu.sha256 === recu.sha256 ? 'identique' : 'different', sha256: lu.sha256, lu: lu.lu } };
	} catch (erreur) {
		return { nom, url, relecture: { etat: 'illisible', raison: String(erreur?.message ?? erreur), ...(erreur?.statut ? { statut: erreur.statut } : {}) } };
	}
}

async function inscriptionLue(id, lire) {
	try {
		const p = await inscriptionDuRecu(id, lire);
		return p.etat === 'inscrit' ? { etat: p.etat, tour: p.tour, racine: p.racine ?? null, bloc: p.bloc ?? null } : { etat: p.etat };
	} catch {
		return { etat: 'illisible' };
	}
}

async function signatureRelue(recu, autorites) {
	if (!recu.signature) return null;
	const v = await verifierSignatureDuDeposant(recu.signature.jws ?? recu.signature.cades, recu.sha256, recu.depose, await lireAutorites(autorites));
	return v.ok ? { ok: true, sujet: v.certificat.sujet, emetteur: v.certificat.emetteur, autorite: v.certificat.autorite ?? null } : { ok: false, raisons: v.raisons };
}

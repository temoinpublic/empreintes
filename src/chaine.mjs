// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Florian Mousseau. Ce fichier seul est sous licence MIT
// (LICENSES/MIT.txt) pour que tout logiciel, ouvert ou ferme, puisse verifier.
// La verification du journal des empreintes, ecrite une seconde fois et a part
// de l'entrepot qui le produit : un verificateur qui reprendrait le code du
// producteur ne prouverait rien. Memes formules, memes octets, aucune
// dependance ; le meme fichier tourne dans le navigateur et sous Node.

/** La racine « precedente » du tout premier tour. */
export const RACINE_NULLE = '0'.repeat(64);

const encodeur = new TextEncoder();

/** Le sha256 hexadecimal d'octets ou d'un texte. */
export async function sha256(donnees) {
	const octets = typeof donnees === 'string' ? encodeur.encode(donnees) : donnees;
	const empreinte = await globalThis.crypto.subtle.digest('SHA-256', octets);
	return hex(new Uint8Array(empreinte));
}

const hex = (octets) => Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');

function octetsDe(h) {
	const octets = new Uint8Array(h.length / 2);
	for (let i = 0; i < octets.length; i++) octets[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
	return octets;
}

/**
 * Un tour publie EN DELTA (D-158) : `<id>.delta.json` au lieu de `<id>.json`,
 * les memes champs sans `feuilles`, plus `base` (l'identifiant du releve plein
 * dont il part), `ajoutees` (chaque feuille ajoutee, changee ou deplacee, avec
 * `index`, sa place dans la liste reconstruite) et `retirees` (les cles qui
 * sortent). L'arbre, la racine et la chaine ne changent pas : la racine ne
 * depend que des feuilles, et `verifierReleve` juge la reconstruction.
 */
export const estUnDelta = (releve) => typeof releve?.base === 'string' && !Array.isArray(releve?.feuilles);

/** Le releve plein d'un tour en delta, reconstruit depuis sa base : les cles retirees et reprises sortent, chaque ajoutee reprend sa place. */
export function reconstruireReleve(base, delta) {
	if (!estUnDelta(delta)) throw new Error(`${delta?.id} : pas un tour en delta`);
	if (base?.id !== delta.base || !Array.isArray(base.feuilles)) throw new Error(`${delta.id} : la base ${delta.base} n'est pas le releve fourni`);
	const sortantes = new Set([...(delta.retirees ?? []), ...(delta.ajoutees ?? []).map((f) => f.cle)]);
	const feuilles = base.feuilles.filter((f) => !sortantes.has(f.cle));
	for (const { index, ...feuille } of [...(delta.ajoutees ?? [])].sort((a, b) => a.index - b.index)) {
		if (!Number.isInteger(index) || index < 0 || index > feuilles.length) throw new Error(`${delta.id} : la feuille ${feuille.cle} n'a pas de place (${index})`);
		feuilles.splice(index, 0, feuille);
	}
	const { base: _, ajoutees: _a, retirees: _r, ...tour } = delta;
	return { ...tour, feuilles };
}

/**
 * Un lecteur de releves qui rend chaque tour PLEIN, publie tel quel ou en
 * delta : `lireFichier(nom)` rend le JSON d'un fichier du journal, ou null
 * quand il n'est pas publie. `tours` (les resumes de `/tours.json`) epargne
 * l'essai du fichier plein a un tour dont le resume dit la base. Une base est
 * lue une fois par lecteur ; `bases` borne celles qu'il garde, les plus
 * recentes : une lecture de tous les tours dans l'ordre n'a besoin que de la
 * derniere, et les garder toutes faisait grossir la construction avec le journal.
 */
export function lecteurDeReleves(lireFichier, tours = null, { bases: garder = Infinity } = {}) {
	const bases = new Map();
	const nomDe = (id) => (tours?.find((t) => t.id === id)?.base ? `${id}.delta.json` : `${id}.json`);
	async function lire(id, profondeur = 0) {
		if (profondeur > 8) throw new Error(`${id} : la chaine des bases ne finit pas`);
		const nom = nomDe(id);
		const releve = (await lireFichier(nom)) ?? (nom.endsWith('.delta.json') ? null : await lireFichier(`${id}.delta.json`));
		if (!releve) throw new Error(`${id} : aucun releve publie`);
		if (!estUnDelta(releve)) return releve;
		if (!(releve.base < id)) throw new Error(`${id} : la base ${releve.base} ne precede pas le tour`);
		if (!bases.has(releve.base)) {
			bases.set(releve.base, lire(releve.base, profondeur + 1));
			for (const vieille of [...bases.keys()].slice(0, Math.max(0, bases.size - garder))) bases.delete(vieille);
		}
		return reconstruireReleve(await bases.get(releve.base), releve);
	}
	return (id) => lire(id);
}

/** Le hache de deux noeuds de l'arbre, gauche puis droite, en octets. */
export async function paire(gauche, droite) {
	const a = octetsDe(gauche);
	const b = octetsDe(droite);
	const lies = new Uint8Array(a.length + b.length);
	lies.set(a);
	lies.set(b, a.length);
	return sha256(lies);
}

/** L'empreinte d'une feuille : la cle liee a son contenu et a son jour. */
export const empreinteDeFeuille = (f) => sha256(`${f.cle}\n${f.sha256}\n${f.jour ?? ''}\n`);

/** La racine de Merkle d'une liste d'empreintes ; un niveau impair duplique sa derniere. */
export async function arbre(empreintes) {
	if (empreintes.length === 0) return RACINE_NULLE;
	let niveau = empreintes;
	while (niveau.length > 1) {
		const suivant = [];
		for (let i = 0; i < niveau.length; i += 2) suivant.push(paire(niveau[i], niveau[i + 1] ?? niveau[i]));
		niveau = await Promise.all(suivant);
	}
	return niveau[0];
}

/** Les freres a hacher d'une feuille jusqu'a l'arbre, du bas vers le haut, avec leur cote. */
export async function cheminDAudit(empreintes, index) {
	if (index < 0 || index >= empreintes.length) throw new Error(`feuille ${index} hors de l'arbre`);
	const chemin = [];
	let niveau = empreintes;
	let i = index;
	while (niveau.length > 1) {
		chemin.push(i % 2 === 0 ? { cote: 'droite', empreinte: niveau[i + 1] ?? niveau[i] } : { cote: 'gauche', empreinte: niveau[i - 1] });
		const suivant = [];
		for (let k = 0; k < niveau.length; k += 2) suivant.push(paire(niveau[k], niveau[k + 1] ?? niveau[k]));
		niveau = await Promise.all(suivant);
		i = Math.floor(i / 2);
	}
	return chemin;
}

/** L'arbre que rendent une feuille et son chemin d'audit. */
export async function racineDepuisChemin(empreinte, chemin) {
	let h = empreinte;
	for (const pas of chemin) h = pas.cote === 'droite' ? await paire(h, pas.empreinte) : await paire(pas.empreinte, h);
	return h;
}

/** La racine chainee d'un tour : son arbre lie a son identifiant et a la racine precedente. */
export const chainer = ({ id, precedente, arbre: a }) => sha256(`entrepot\n${id}\n${precedente}\n${a}\n`);

/** Recalcule un releve depuis ses feuilles ; rend les raisons d'un ecart, vide s'il tient. */
export async function verifierReleve(releve) {
	const raisons = [];
	const empreintes = await Promise.all(releve.feuilles.map(empreinteDeFeuille));
	const a = await arbre(empreintes);
	if (a !== releve.arbre) raisons.push(`${releve.id} : l'arbre recalcule ne correspond pas`);
	const r = await chainer({ id: releve.id, precedente: releve.precedente, arbre: releve.arbre });
	if (r !== releve.racine) raisons.push(`${releve.id} : la racine chainee ne correspond pas`);
	return raisons;
}

/**
 * Verifie la chaine de bout en bout : chaque releve recalcule, chaque
 * `precedente` egale a la racine du tour d'avant, le premier sur la racine
 * nulle. `lire(id)` rend un releve PLEIN (`lecteurDeReleves` pour un journal qui
 * publie des tours en delta) ; `ids` est la liste ordonnee des tours.
 */
export async function verifierChaine(ids, lire, { surTour } = {}) {
	const raisons = [];
	let precedente = RACINE_NULLE;
	for (const id of ids) {
		const releve = await lire(id);
		if (releve.id !== id) raisons.push(`${id} : le releve porte l'identifiant ${releve.id}`);
		if (releve.precedente !== precedente) raisons.push(`${id} : la racine precedente n'est pas celle du tour d'avant`);
		raisons.push(...(await verifierReleve(releve)));
		precedente = releve.racine;
		surTour?.(id);
	}
	return { ok: raisons.length === 0, tours: ids.length, derniere: precedente, raisons };
}

/**
 * Verifie la chaine sur les seuls resumes des tours de `/tours.json` (`id`,
 * `precedente`, `arbre`, `racine`) : chaque racine recalculee, chaque
 * `precedente` egale a la racine d'avant, le premier sur la racine nulle. Ne
 * relit aucune feuille, donc son cout ne croit qu'avec le nombre de tours.
 */
export async function verifierLiens(tours) {
	const raisons = [];
	let precedente = RACINE_NULLE;
	for (const tour of tours) {
		if (tour.precedente !== precedente) raisons.push(`${tour.id} : la racine precedente n'est pas celle du tour d'avant`);
		if ((await chainer(tour)) !== tour.racine) raisons.push(`${tour.id} : la racine chainee ne correspond pas`);
		precedente = tour.racine;
	}
	return { ok: raisons.length === 0, tours: tours.length, derniere: precedente, raisons };
}

/**
 * La verification du navigateur : la chaine sur les resumes, puis le releve du
 * dernier tour recalcule depuis ses feuilles et compare a son resume. Chaque
 * releve porte l'etat entier de l'entrepot : les relire tous ferait
 * telecharger au visiteur la somme de l'historique, qui croit au carre. Le
 * script `verifier.mjs --chaine` recalcule, lui, chaque releve.
 */
export async function verifierChaineLegere(tours, lire) {
	const v = await verifierLiens(tours);
	const dernier = tours.at(-1);
	if (!dernier) return { ...v, recalcule: null };
	const releve = await lire(dernier.id);
	const raisons = [...v.raisons, ...(await verifierReleve(releve))];
	for (const champ of ['id', 'precedente', 'arbre', 'racine']) {
		if (releve[champ] !== dernier[champ]) raisons.push(`${dernier.id} : le releve ne porte pas le ${champ} de la liste des tours`);
	}
	return { ok: raisons.length === 0, tours: v.tours, derniere: v.derniere, raisons, recalcule: { id: dernier.id, feuilles: releve.feuilles.length } };
}

/** La place d'un fichier dans un releve : sa feuille, son chemin d'audit, et ce que le chemin rend. */
export async function placeDuFichier(releve, empreinteDuFichier) {
	const index = releve.feuilles.findIndex((f) => f.sha256 === empreinteDuFichier);
	if (index < 0) return null;
	const empreintes = await Promise.all(releve.feuilles.map(empreinteDeFeuille));
	const chemin = await cheminDAudit(empreintes, index);
	const arbreRendu = await racineDepuisChemin(empreintes[index], chemin);
	const racine = await chainer({ id: releve.id, precedente: releve.precedente, arbre: arbreRendu });
	return { feuille: releve.feuilles[index], index, chemin, ok: arbreRendu === releve.arbre && racine === releve.racine };
}

/** L'empreinte des `n` premieres lignes non vides d'un texte, chacune suivie de son saut de ligne ; null s'il en a moins. */
export async function hacherLignes(texte, n) {
	const lignes = texte.split('\n').filter(Boolean);
	if (lignes.length < n) return null;
	return sha256(lignes.slice(0, n).map((l) => `${l}\n`).join(''));
}

/** Le nombre de lignes d'une feuille `<prefixe>:<n>`, ou null. */
const lignesDeLaFeuille = (cle, prefixe) => {
	const m = new RegExp(`^${prefixe}:(\\d+)$`).exec(cle);
	return m ? Number(m[1]) : null;
};

/**
 * La preuve d'un depot exterieur : sa ligne dans le fichier des depots de
 * l'entrepot, le premier tour dont la feuille `depots:<n>` la couvre, le hache
 * des n premieres lignes egal a la feuille, et le chemin d'audit jusqu'a la
 * racine chainee. `releves` dans l'ordre des tours ; rend `{ etat: 'attente' }`
 * tant qu'aucun tour ne couvre la ligne.
 */
export async function preuveDuDepot({ recu, texteDesDepots, releves }) {
	const lignes = texteDesDepots.split('\n').filter(Boolean);
	const rang = lignes.findIndex((l) => JSON.parse(l).recu === recu) + 1;
	if (rang === 0) return { etat: 'attente' };
	for (const releve of releves) {
		const index = releve.feuilles.findIndex((f) => (lignesDeLaFeuille(f.cle, 'depots') ?? 0) >= rang);
		if (index < 0) continue;
		const feuille = releve.feuilles[index];
		const n = lignesDeLaFeuille(feuille.cle, 'depots');
		const empreintes = await Promise.all(releve.feuilles.map(empreinteDeFeuille));
		const chemin = await cheminDAudit(empreintes, index);
		const arbreRendu = await racineDepuisChemin(empreintes[index], chemin);
		const racine = await chainer({ id: releve.id, precedente: releve.precedente, arbre: arbreRendu });
		const ok = (await hacherLignes(texteDesDepots, n)) === feuille.sha256 && arbreRendu === releve.arbre && racine === releve.racine;
		return { etat: ok ? 'inscrit' : 'non conforme', tour: releve.id, rang, n, feuille, chemin, racine: releve.racine };
	}
	return { etat: 'attente', rang };
}

/**
 * L'inscription d'un recu au registre, lue sur les fichiers publics de la
 * surface (`lire(chemin)` rend une reponse fetch) : le fichier des depots, la
 * liste des tours, puis le seul releve du premier tour qui couvre la ligne.
 */
export async function inscriptionDuRecu(id, lire) {
	const r = await lire('/empreintes/depots.jsonl');
	if (!r.ok) return { etat: 'attente' };
	const texteDesDepots = await r.text();
	const rang = texteDesDepots.split('\n').filter(Boolean).findIndex((l) => JSON.parse(l).recu === id) + 1;
	if (!rang) return { etat: 'attente' };
	const { tours } = await (await lire('/tours.json')).json();
	const tour = tours.find((t) => t.depots >= rang);
	if (!tour) return { etat: 'attente', rang };
	const releve = await lecteurDeReleves(async (nom) => {
		const f = await lire(`/empreintes/${nom}`);
		return f.ok ? f.json() : null;
	}, tours)(tour.id);
	return { ...(await preuveDuDepot({ recu: id, texteDesDepots, releves: [releve] })), bloc: tour.ots === 'bitcoin' ? tour.bloc : null };
}

/**
 * L'empreinte (sha256 du DER) du certificat de la signature du journal,
 * epinglee ici : un certificat auto-signe ne prouve l'origine que compare a
 * l'empreinte publiee hors du fichier signe.
 */
export const CERTIFICAT_DU_JOURNAL = '5263feba5fc71c4725c93328c0c75a94fc4e1b632bb9ff01574239551ab34b80';

/**
 * L'historique des certificats du journal, du plus ancien au plus recent : un
 * certificat signe les tours a partir de `depuis` jusqu'au `depuis` du suivant.
 * Un nouveau certificat s'ajoute ici sans retirer l'ancien, et les signatures
 * deja publiees restent verifiables. `retire` (un identifiant de tour) refuse
 * les signatures de ce certificat a partir de ce tour : une cle compromise.
 */
export const CERTIFICATS_DU_JOURNAL = [{ empreinte: CERTIFICAT_DU_JOURNAL, depuis: '20261012T000000Z', retire: null }];

/** L'empreinte du certificat qui signe le tour `id`, ou null si aucun ne le couvre. */
export function certificatDuTour(id, certificats = CERTIFICATS_DU_JOURNAL) {
	const c = certificats.findLast((x) => x.depuis <= id);
	return c && !(c.retire && c.retire <= id) ? c.empreinte : null;
}

const depuisBase64 = (texte) => {
	const b64 = texte.replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const versBase64Url = (octets) => btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Un element DER a `pos` : ou commence son contenu, ou il finit. */
function elementDer(octets, pos) {
	let longueur = octets[pos + 1];
	let debut = pos + 2;
	if (longueur > 0x7f) {
		const n = longueur & 0x7f;
		longueur = 0;
		for (let i = 0; i < n; i++) longueur = longueur * 256 + octets[debut + i];
		debut += n;
	}
	if (Number.isNaN(longueur) || debut + longueur > octets.length) throw new Error('DER tronque');
	return { debut, fin: debut + longueur };
}

/** La cle publique (SubjectPublicKeyInfo) d'un certificat X.509 en DER. */
export function clePubliqueDuCertificat(der) {
	const tbs = elementDer(der, elementDer(der, 0).debut);
	let pos = tbs.debut;
	if (der[pos] === 0xa0) pos = elementDer(der, pos).fin;
	// numero de serie, algorithme, emetteur, validite, sujet
	for (let i = 0; i < 5; i++) pos = elementDer(der, pos).fin;
	return der.slice(pos, elementDer(der, pos).fin);
}

/**
 * Relit la signature du journal d'un tour (JWS compact, JAdES B-B, ES256) :
 * le certificat de `x5c` est celui qu'on epingle et `x5t#S256` le designe,
 * `sigT` est declare dans `crit`, la charge utile est la racine du tour, et la
 * signature tient sous la cle du certificat. Rend `{ ok, raisons, sigT }`.
 */
export async function verifierSignatureDuJournal(jws, racine, empreinteCertificat = CERTIFICAT_DU_JOURNAL) {
	const morceaux = String(jws).trim().split('.');
	if (morceaux.length !== 3) return { ok: false, raisons: ['pas un JWS compact'], sigT: null };
	let entete;
	let der;
	try {
		entete = JSON.parse(new TextDecoder().decode(depuisBase64(morceaux[0])));
		der = depuisBase64(entete.x5c[0]);
	} catch {
		return { ok: false, raisons: ['en-tete illisible'], sigT: null };
	}
	const raisons = [];
	if (entete.alg !== 'ES256') raisons.push(`algorithme ${entete.alg}`);
	if (!entete.crit?.includes('sigT') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(entete.sigT ?? '')) raisons.push('sigT absent ou mal declare');
	if ((await sha256(der)) !== empreinteCertificat) raisons.push("le certificat n'est pas celui du journal");
	if (entete['x5t#S256'] !== versBase64Url(octetsDe(await sha256(der)))) raisons.push('x5t#S256 ne designe pas le certificat');
	if (new TextDecoder().decode(depuisBase64(morceaux[1])) !== racine) raisons.push("la charge utile n'est pas la racine du tour");
	let juste = false;
	try {
		const cle = await globalThis.crypto.subtle.importKey('spki', clePubliqueDuCertificat(der), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
		juste = await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cle, depuisBase64(morceaux[2]), encodeur.encode(`${morceaux[0]}.${morceaux[1]}`));
	} catch {
		juste = false;
	}
	if (!juste) raisons.push('la signature ne correspond pas');
	return { ok: raisons.length === 0, raisons, sigT: entete.sigT ?? null };
}

/**
 * Les signatures du journal de toute la liste des tours (`tours.json`) : chaque
 * tour qui en porte une la voit relue contre sa racine. `lireTexte(chemin)`
 * rend le texte d'un fichier publie. Rend le compte et les raisons d'un ecart.
 */
export async function verifierSignatures(tours, lireTexte) {
	const raisons = [];
	let signees = 0;
	for (const t of tours.filter((t) => t.fichiers?.includes(`${t.id}.racine.jws`))) {
		const v = await verifierSignatureDuJournal(await lireTexte(`/empreintes/${t.id}.racine.jws`), t.racine, certificatDuTour(t.id));
		signees += 1;
		raisons.push(...v.raisons.map((r) => `${t.id} : ${r}`));
	}
	return { ok: raisons.length === 0, signees, raisons };
}

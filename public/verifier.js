import { sha256, lecteurDeReleves, lieJusquA, placeDuFichier, verifierChaineLegere, verifierSignatureDuJournal, verifierSignatures, certificatDuTour } from '/chaine.mjs';
import { cleSlhDuTour, verifierSignatureSlhDuJournal, verifierSignaturesSlh } from '/slh.mjs';
import { tourHorodate, verifierHorodatage, verifierHorodatages } from '/horodatage.mjs';
import { montrer, suivreLeChoix } from '/fichier.js';
import { estUnRecu, idDuRecu } from '/depot.mjs';
import { estUnCertificat, lireCertificat, verifierLeCertificat } from '/serie.mjs';
import { verifierSignatureDuDeposant } from '/origine.mjs';
import { T } from '/textes.js';

suivreLeChoix(document);

const $ = (id) => document.getElementById(id);
const NBSP = '\u00A0';
const t = T.verifier;
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const lire = async (chemin) => {
	const r = await fetch(chemin);
	if (!r.ok) throw new Error(`${chemin}${NBSP}: ${r.status}`);
	return r.json();
};
let tours = null;
const lesTours = async () => (tours ??= (await lire('/tours.json')).tours);
/** Un releve plein, publie tel quel ou reconstruit depuis sa base quand le tour est en delta. */
const lireReleve = async (id) =>
	lecteurDeReleves(async (nom) => {
		const r = await fetch(`/empreintes/${nom}`);
		return r.ok ? r.json() : null;
	}, await lesTours())(id);

function ancrage(tour) {
	if (tour?.ots === 'bitcoin' && tour.bloc) return `<a href="https://mempool.space/block/${tour.bloc}">${T.bloc(tour.bloc)}</a>`;
	return tour?.ots === 'calendrier' ? T.calendrier : T.aucun;
}

/** La signature du journal d'un tour, relue contre sa racine ; null quand le tour n'en porte pas. */
async function signatureDe(tour, racine) {
	const nom = `${tour.id}.racine.jws`;
	if (!tour.fichiers?.includes(nom)) return null;
	const r = await fetch(`/empreintes/${nom}`);
	const v = r.ok ? await verifierSignatureDuJournal(await r.text(), racine, certificatDuTour(tour.id)) : { ok: false };
	return { ...v, nom };
}

const octets = async (chemin) => {
	const r = await fetch(chemin);
	if (!r.ok) throw new Error(`${chemin}${NBSP}: ${r.status}`);
	return new Uint8Array(await r.arrayBuffer());
};

/** La signature post-quantique d'un tour, relue contre sa racine et la cle epinglee ; null quand le tour n'en porte pas. */
async function signatureSlhDe(tour, racine) {
	const nom = `${tour.id}.racine.slh`;
	if (!tour.fichiers?.includes(nom)) return null;
	const cle = cleSlhDuTour(tour.id);
	const v = cle ? verifierSignatureSlhDuJournal(await octets(`/empreintes/${nom}`), racine, await octets(`/empreintes/${cle.fichier}`), cle.empreinte) : { ok: false };
	return { ...v, nom };
}

/** L'horodatage qualifie qui couvre le tour : le premier a partir de lui, relu contre sa racine ; null sans. */
async function horodatageDu(id, racine) {
	const tours = await lesTours();
	const tour = tourHorodate(tours, id);
	if (!tour) return null;
	const nom = `${tour.id}.racine.tsr`;
	// Un tour horodate plus tard ne couvre ce tour-ci que par des liens intacts.
	if (!(await lieJusquA(tours, id, tour.id, racine))) return { ok: false, raisons: ['la chaine ne relie pas ce tour au tour horodate'], instant: null, nom };
	return { ...(await verifierHorodatage(await octets(`/empreintes/${nom}`), tour.racine)), nom };
}

async function constat(empreinte, vu) {
	const releve = await lireReleve(vu.premier);
	const place = await placeDuFichier(releve, empreinte);
	const tour = (await lesTours()).find((t) => t.id === vu.premier);
	const signature = tour ? await signatureDe(tour, releve.racine) : null;
	const signatureSlh = tour ? await signatureSlhDe(tour, releve.racine) : null;
	const horodatage = await horodatageDu(vu.premier, releve.racine);
	const ok = place?.ok && signature?.ok !== false && signatureSlh?.ok !== false && horodatage?.ok !== false;
	const preuves = (tour?.fichiers ?? [])
		.filter((f) => f.endsWith('.ots') || f.endsWith('.tsr'))
		.map((f) => `<a href="/empreintes/${f}">${f.endsWith('.ots') ? t.preuveOts : t.horodatageTsr}</a>`)
		.join(' ');
	return `<article class="${ok ? 'ok' : 'ko'}">
<h2>${ok ? t.identique(T.jour(vu.jour)) : t.nonConforme}</h2>
<p class="faits">${t.vuEnLigne(T.heure(vu.premier), T.heure(vu.dernier))}</p>
<details>
<summary>${t.details}</summary>
<dl>
<div><dt>${t.objet}</dt><dd><code>${echapper(vu.cle)}</code></dd></div>
<div><dt>${t.chemin}</dt><dd>${place ? t.etapes(place.chemin.length) : t.absent}</dd></div>
<div><dt>${t.racine}</dt><dd><code class="racine">${releve.racine}</code></dd></div>
<div><dt>Bitcoin</dt><dd>${ancrage(tour)} ${preuves}</dd></div>
${horodatage ? `<div><dt>${t.horodatage}</dt><dd><a href="/empreintes/${horodatage.nom}">${horodatage.ok ? t.horodatageValide(T.instant(horodatage.instant)) : t.signatureNonConforme}</a></dd></div>` : ''}
${signature ? `<div><dt>${t.signature}</dt><dd><a href="/empreintes/${signature.nom}">${signature.ok ? t.signatureValide : t.signatureNonConforme}</a></dd></div>` : ''}
${signatureSlh ? `<div><dt>${t.signaturePq}</dt><dd><a href="/empreintes/${signatureSlh.nom}">${signatureSlh.ok ? t.signatureValide : t.signatureNonConforme}</a></dd></div>` : ''}
</dl>
</details>
</article>`;
}

const depot = (l) => `<article class="ok">
<h2>${t.identique(T.jour(l.jour))}</h2>
<p><a href="/recu/${l.recu}">${T.voirLeRecu}</a></p>
</article>`;

/*
 * Seul un 404 dit l'absence. Un 503 est une lecture impossible : la lire comme
 * une absence ferait nier au visiteur une preuve qui existe.
 */
async function absentSur404(reponse, absent, chemin) {
	if (reponse.status === 404) return absent;
	if (!reponse.ok) throw new Error(`${chemin}${NBSP}: ${reponse.status}`);
	return reponse.json();
}

async function verifier(empreinte, sortie) {
	const [r, d] = await Promise.all([fetch(`/index/${empreinte.slice(0, 2)}.json`), fetch(`/api/depots/${empreinte}`)]);
	const vus = (await absentSur404(r, {}, '/index'))[empreinte] ?? [];
	const deposes = await absentSur404(d, [], '/api/depots');
	if (vus.length === 0 && deposes.length === 0) {
		sortie.innerHTML = `<article class="ko"><h2>${t.jamais}</h2></article>`;
		return;
	}
	const constats = await Promise.all(vus.map((vu) => constat(empreinte, vu)));
	sortie.innerHTML = [...deposes.map(depot), ...constats].join('');
}

/** Le fichier lu comme un objet JSON, s'il en est un ; null pour tout autre document. */
function jsonDans(octets) {
	// Un recu passe entre deux logiciels peut gagner un blanc en tete : il reste un recu.
	let debut = 0;
	while ([0x20, 0x09, 0x0a, 0x0d].includes(octets[debut])) debut++;
	if (octets[debut] !== 0x7b) return null;
	try {
		return JSON.parse(new TextDecoder().decode(octets.subarray(debut)));
	} catch {
		return null;
	}
}

/** La liste des autorites, ou null : facultative, sa panne (reseau comme HTTP) ne bloque pas la verification. */
async function autoritesConnues() {
	try {
		const r = await fetch('/confiance/autorites.json');
		return r.ok ? (await r.json()).autorites : null;
	} catch {
		return null;
	}
}

/** La signature du deposant d'un recu version 4, relue ici contre l'empreinte et l'instant du depot ; vide sans signature. */
async function signatureDuRecu(recu) {
	if (!recu.signature) return '';
	const v = await verifierSignatureDuDeposant(recu.signature.jws ?? recu.signature.cades, recu.sha256, recu.depose, await autoritesConnues());
	const nom = (n) => echapper(n ?? t.sansNom);
	const autorite = v.certificat?.autorite;
	const texte = v.ok ? t.signeeValide(nom(v.certificat.sujet), nom(v.certificat.emetteur)) : t.signeeNonConforme;
	const liste = v.ok && autorite ? `<div><dt>${t.autorite}</dt><dd>${t.inscrite(echapper(autorite.nom), autorite.pays)}</dd></div>` : '';
	return `<dl><div><dt>${t.signeePar}</dt><dd>${texte}</dd></div>${liste}</dl>`;
}

async function verifierLeRecu(recu, sortie) {
	const id = await idDuRecu(recu);
	const ligne = await ligneDuRecu(id);
	sortie.innerHTML = ligne
		? `<article class="ok"><h2>${t.authentique(T.jour(recu.jour))}</h2>${await signatureDuRecu(recu)}<p><a href="/recu/${id}">${T.voirLeRecu}</a></p></article>`
		: `<article class="ko"><h2>${t.inconnu}</h2></article>`;
}

/** La ligne publique d'un recu, ou null quand le registre ne le connait pas. */
async function ligneDuRecu(id) {
	const r = await fetch(`/api/recus/${id}`);
	if (r.status === 404) return null;
	if (!r.ok) throw new Error(`/api/recus${NBSP}: ${r.status}`);
	return r.json();
}

/** Au plus `n` lectures en vol : un certificat de deux mois porte une soixantaine de recus. */
function enFile(lecture, n = 6) {
	let enVol = 0;
	const attente = [];
	const suivant = () => {
		if (enVol >= n || attente.length === 0) return;
		enVol++;
		const { id, resoudre, rejeter } = attente.shift();
		lecture(id)
			.then(resoudre, rejeter)
			.finally(() => {
				enVol--;
				suivant();
			});
	};
	return (id) =>
		new Promise((resoudre, rejeter) => {
			attente.push({ id, resoudre, rejeter });
			suivant();
		});
}

const s = t.serie;
const CLASSES = { 'au-registre': 'ok', inconnu: 'ko', different: 'ko', 'autre-permis': 'ko', 'sans-photo': 'ko', 'a-venir': '' };

function ligneDuJour(j) {
	const recu = j.place ? `<a href="/recu/${j.recu}">${s.place(j.place)}</a>` : '';
	const empreinte = j.sha256 ? `<code>${j.sha256.slice(0, 12)}…</code>` : '';
	return `<tr class="${CLASSES[j.verdict]}"><td>${T.jour(j.jour)}</td><td>${s.verdicts[j.verdict]}</td><td>${empreinte}</td><td>${recu}</td></tr>`;
}

function titreDeLaSerie(b) {
	if (!b.conforme) return s.nonConforme(b.refuses);
	if (b.sansPhoto > 0) return s.interrompue(b.sansPhoto, T.jour(b.premierManque));
	return b.aVenir > 0 ? s.enCours(b.auRegistre, b.total) : s.complete(b.total);
}

/** Le certificat d'une serie d'affichage : chaque recu relu contre sa ligne publique, chaque jour de la periode compte. */
async function verifierLaSerie(brut, sortie) {
	const lu = lireCertificat(brut);
	if (lu.erreur) {
		sortie.innerHTML = `<article class="ko"><h2>${s.illisible}</h2><p>${s.erreurs[lu.erreur]}</p></article>`;
		return;
	}
	const b = await verifierLeCertificat(lu.certificat, enFile(ligneDuRecu), new Date().toISOString().slice(0, 10));
	const permis = b.auRegistre > 0 && b.permisRelus === b.auRegistre ? s.permisRelu : s.permisNonRelu(b.permisRelus, b.auRegistre);
	sortie.innerHTML = `<article class="${b.continue ? 'ok' : 'ko'}">
<h2>${titreDeLaSerie(b)}</h2>
<dl>
<div><dt>${s.permis}</dt><dd>${echapper(b.permis)}, ${permis}</dd></div>
<div><dt>${s.periode}</dt><dd>${s.duAu(T.jour(b.pose), T.jour(b.fin))}</dd></div>
<div><dt>${s.auRegistre}</dt><dd>${s.compte(b.auRegistre, b.total)}</dd></div>
</dl>
<p>${s.photos}</p>
<details>
<summary>${s.details}</summary>
<div class="defile"><table class="serie"><thead><tr><th>${s.jour}</th><th>${s.registre}</th><th>${s.empreinte}</th><th>${s.recu}</th></tr></thead>
<tbody>${b.jours.map(ligneDuJour).join('')}</tbody></table></div>
</details>
</article>`;
}

async function verifierLeFichier(fichier, sortie) {
	const octets = new Uint8Array(await fichier.arrayBuffer());
	// Un recu signe porte le JWS de son deposant, 32 768 caracteres au plus ; un certificat de serie, deux mois de recus.
	const r = fichier.size < 1_000_000 ? jsonDans(octets) : null;
	if (estUnCertificat(r)) return verifierLaSerie(r, sortie);
	return estUnRecu(r) ? verifierLeRecu(r, sortie) : verifier(await sha256(octets), sortie);
}

// Chaque verification ecrit dans sa propre zone ; seule la DERNIERE demandee s'affiche.
// Deux fichiers choisis coup sur coup finissaient dans le desordre, et le verdict du
// premier restait sous le nom du second (audit Codex du 2026-11-03).
let derniere = 0;
const lancer = async () => {
	const numero = ++derniere;
	const fichier = $('fichier').files[0];
	const saisie = $('empreinte').value.trim().toLowerCase();
	const sortie = document.createElement('div');
	$('resultat').innerHTML = '';
	try {
		if (fichier) await verifierLeFichier(fichier, sortie);
		else if (/^[0-9a-f]{64}$/.test(saisie)) await verifier(saisie, sortie);
		else sortie.innerHTML = `<p>${T.choisir}</p>`;
	} catch (erreur) {
		sortie.innerHTML = `<article class="ko"><h2>${T.erreur}</h2><p>${echapper(erreur.message)}</p></article>`;
	}
	if (numero !== derniere) return;
	$('resultat').innerHTML = sortie.innerHTML;
	if ($('resultat').innerHTML) montrer($('resultat'));
};

// `/verifier?empreinte=<sha256>` : le lien qu'une autre page donne vers la preuve d'un document.
const demandee = new URLSearchParams(location.search).get('empreinte')?.toLowerCase();
// Arrive par un lien, le visiteur n'a rien a deposer : le verdict seul (le formulaire est cache des le
// premier rendu par arrivee.js), puis un lien discret vers la page vide pour un autre document.
if (demandee && /^[0-9a-f]{64}$/.test(demandee) && $('empreinte')) {
	$('empreinte').value = demandee;
	// Le lien vers un autre document est la des maintenant, sous le resultat : une requete
	// qui pend ne laisse pas le visiteur devant une page sans formulaire ni issue.
	$('resultat').insertAdjacentHTML('afterend', `<p class="autre"><a href="${location.pathname}">${t.autre}</a></p>`);
	lancer().then(() => {
		const verdict = $('resultat').querySelector('h2')?.textContent;
		if (verdict) document.title = `${verdict} | ${document.title.split(' | ').at(-1)}`;
	});
} else {
	// Un lien que verifier.js ne lance pas ne doit pas laisser le formulaire cache.
	document.documentElement.classList.remove('par-lien');
}

$('formulaire')?.addEventListener('submit', (e) => {
	e.preventDefault();
	lancer();
});
// Le document depose se verifie aussitot : le bouton ne sert qu'a l'empreinte saisie.
$('fichier')?.addEventListener('change', () => $('fichier').files[0] && lancer());

$('chaine')?.addEventListener('click', async () => {
	const sortie = $('resultat-chaine');
	// La relecture prend plus d'une minute : sans signe, le lecteur la relancait.
	const bouton = $('chaine');
	bouton.disabled = true;
	try {
		sortie.innerHTML = `<p>${t.chaineEnCours((await lesTours()).length)}</p>`;
		// La chaine se lit sur `/tours.json` ; seul le dernier releve se recalcule ici, le script les recalcule tous.
		const v = await verifierChaineLegere(await lesTours(), lireReleve);
		const s = await verifierSignatures(await lesTours(), async (chemin) => (await fetch(chemin)).text());
		const pq = await verifierSignaturesSlh(await lesTours(), octets);
		const h = await verifierHorodatages(await lesTours(), octets);
		const raisons = [...v.raisons, ...s.raisons, ...pq.raisons, ...h.raisons];
		sortie.innerHTML = raisons.length === 0
			? `<article class="ok"><h2>${t.intacte(v.tours)}</h2>${v.recalcule ? `<p>${t.recalcule(v.recalcule.feuilles, T.heure(v.recalcule.id))}</p>` : ''}<p>${t.signatures(s.signees)}</p>${pq.signees ? `<p>${t.signaturesPq(pq.signees)}</p>` : ''}<p>${t.horodatages(h.horodates)}</p><p>${t.derniere} <code class="racine">${v.derniere}</code></p></article>`
			: `<article class="ko"><h2>${t.rompue}</h2><ul>${raisons.map((r) => `<li>${echapper(r)}</li>`).join('')}</ul></article>`;
	} catch (erreur) {
		sortie.innerHTML = `<article class="ko"><h2>${T.erreur}</h2><p>${echapper(erreur.message)}</p></article>`;
	} finally {
		bouton.disabled = false;
	}
});

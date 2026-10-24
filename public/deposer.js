import { sha256 } from '/chaine.mjs';
import { montrer, suivreLeChoix } from '/fichier.js';
import { communeDe, communeDeLAdresse } from '/annuaire.mjs';
import { T } from '/textes.js';

const $ = (id) => document.getElementById(id);
const $fichier = () => $('fichier');
const t = T.deposer;

if ($fichier()) suivreLeChoix(document);

// L'empreinte du document choisi, calculee une fois : elle sert a dire s'il est deja date, puis au depot.
let choisi = null;
const empreinteDe = async (fichier) => {
	if (choisi?.fichier !== fichier) choisi = { fichier, sha256: sha256(new Uint8Array(await fichier.arrayBuffer())) };
	return choisi.sha256;
};

async function dejaDate() {
	const deja = $('deja');
	const fichier = $fichier()?.files[0];
	deja.hidden = true;
	if (!fichier) return;
	try {
		const r = await fetch(`/api/depots/${await empreinteDe(fichier)}`);
		const lignes = r.ok ? await r.json() : [];
		if (!lignes.length || $fichier().files[0] !== fichier) return;
		const premier = lignes[0];
		deja.innerHTML = `${t.deja(T.jour(premier.jour))} <a href="/recu/${premier.recu}">${T.voirLeRecu}</a>`;
		deja.hidden = false;
	} catch {
		// Une lecture manquee ne bloque pas le depot.
	}
}

const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
if ($('deja')) $fichier().addEventListener('change', dejaDate);

// Un lien sur le site officiel d'une commune : on propose d'en faire un acte, la commune deja reconnue.
// L'edition allemande n'a ni le bloc ni le champ : le lien y reste un document.
let lecture = 0;
async function reconnaitreLaCommune() {
	const url = $('url').value.trim();
	const numero = ++lecture;
	let insee = null;
	let commune = null;
	if (/^https?:\/\/[^/]+\.[^/]+/i.test(url)) {
		try {
			insee = await communeDeLAdresse(url, (c) => fetch(c));
			commune = insee ? await communeDe(insee, (c) => fetch(c)) : null;
		} catch {
			insee = null;
		}
	}
	if (numero !== lecture) return;
	const bloc = $('acte');
	if (bloc) {
		bloc.hidden = !insee;
		$('collectivite').value = insee ?? '';
		$('acte-commune').textContent = commune?.nom ?? t.commune(insee);
		if (!insee && $('nature').value) {
			$('nature').value = '';
			$('nature').dispatchEvent(new Event('change'));
		}
	} else if (insee && $('collectivite') && !$('collectivite').value) $('collectivite').value = insee;
}

// Le bouton dit ce qui sera date.
// Un acte se date avec son objet.
// Au chargement aussi : un retour arriere rend au menu la nature choisie sans
// declencher `change` (mesure le 2026-10-13 : « Délibération » restituee, bouton
// « Dater ce document », objet facultatif, et le refus ne venait que du serveur).
const accorderALaNature = () => {
	const acte = Boolean($('nature').value);
	$('formulaire').querySelector('button[type=submit]').textContent = acte ? t.daterActe : t.daterDocument;
	$('objet').required = acte;
};
if ($('acte')) {
	$('nature').addEventListener('change', accorderALaNature);
	accorderALaNature();
	window.addEventListener('pageshow', accorderALaNature);
}

let attente;
$('url')?.addEventListener('input', () => {
	if ($fichier()?.files.length && $('url').value.trim()) {
		$fichier().value = '';
		$fichier().dispatchEvent(new Event('change'));
	}
	clearTimeout(attente);
	attente = setTimeout(reconnaitreLaCommune, 350);
});
// Un fichier choisi remplace le lien : un seul document par depot.
$fichier()?.addEventListener('change', () => {
	if (!$fichier().files.length || !$('url').value) return;
	$('url').value = '';
	reconnaitreLaCommune();
});

// Seul un acte lu sur le site officiel entre dans la serie publique de sa collectivite.
const collectivite = (acte) =>
	acte.rattachement === 'site-officiel' ? `<a href="/collectivite/${encodeURIComponent(acte.collectivite)}">${echapper(acte.collectivite)}</a>` : echapper(acte.collectivite);

function telecharger(recu, id) {
	const lien = document.createElement('a');
	lien.href = URL.createObjectURL(new Blob([`${JSON.stringify(recu, null, 1)}\n`], { type: 'application/json' }));
	lien.download = `${t.fichier}-${id.slice(0, 16)}.json`;
	lien.click();
	URL.revokeObjectURL(lien.href);
}

// La copie des octets lus par le temoin : rendue une fois, jamais gardee en base.
const EXTENSIONS = { 'text/html': 'html', 'application/pdf': 'pdf', 'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml', 'text/plain': 'txt', 'image/jpeg': 'jpg', 'image/png': 'png' };
function telechargerLaCopie(copie, sha) {
	const type = String(copie.type ?? '').split(';')[0].trim().toLowerCase();
	const octets = Uint8Array.from(atob(copie.base64), (c) => c.charCodeAt(0));
	const lien = document.createElement('a');
	lien.href = URL.createObjectURL(new Blob([octets], { type: type || 'application/octet-stream' }));
	lien.download = `${t.copieFichier}-${sha.slice(0, 16)}.${EXTENSIONS[type] ?? 'bin'}`;
	lien.click();
	URL.revokeObjectURL(lien.href);
}

const ligneDuRecu = (titre, valeur) => `<div><dt>${titre}</dt><dd>${valeur}</dd></div>`;

// Un acte reste en ligne a sa source ; un lien lu se garde avec sa copie ; un fichier, avec lui-meme.
const garde = (r) => {
	if (r.recu.acte) return t.enLigne;
	return r.copie ? t.gardezLaCopie : t.gardez;
};

// Le meme recu que sa page `/recu/<id>` : tout est visible, l'adresse entiere, rien sous un depliant.
function afficher(r) {
	const acte = r.recu.acte;
	const lu = r.recu.temoin?.lu;
	const titre = acte ? t.recuActe(t.natures[acte.nature], T.jour(lu.slice(0, 10)), lu.slice(11, 16)) : t.recuDocument(T.jour(r.jour));
	const source = r.recu.temoin ? `${t.luA} <a href="${echapper(r.recu.temoin.url)}">${echapper(r.recu.temoin.url)}</a>` : t.calculee;
	const lignes = [
		r.recu.libelle ? ligneDuRecu(t.nom, `<strong>${echapper(r.recu.libelle)}</strong>`) : '',
		acte ? ligneDuRecu(t.collectivite, `${collectivite(acte)}, ${t.rattachement[acte.rattachement]}`) : '',
		ligneDuRecu(t.empreinte, `<code class="racine">${r.recu.sha256}</code><br><span class="source">${source}</span>`),
		ligneDuRecu(t.ligne, `<a href="/depots/${r.jour}.jsonl">${t.place(r.place, T.jour(r.jour))}</a>`),
		ligneDuRecu(t.emis, t.instant(T.jour(r.recu.depose.slice(0, 10)), r.recu.depose.slice(11, 16))),
		ligneDuRecu(t.adresse, `<a class="racine" href="/recu/${r.id}">${T.hote}/recu/${r.id}</a>`)
	];
	$('resultat').innerHTML = `<article class="ok recu" tabindex="-1">
<h2>${titre}</h2>
<dl>
${lignes.join('')}
</dl>
<p class="garde">${garde(r)}</p>
<p class="gestes"><button type="button" id="imprimer" class="principal">${t.imprimer}</button> <button type="button" id="recu">${t.telecharger}</button>${r.copie ? ` <button type="button" id="copie">${t.telechargerLaCopie}</button>` : ''}</p>
</article>`;
	$('recu').addEventListener('click', () => telecharger(r.recu, r.id));
	if (r.copie) $('copie').addEventListener('click', () => telechargerLaCopie(r.copie, r.recu.sha256));
	$('imprimer').addEventListener('click', () => window.print());
	$('formulaire').reset();
	$fichier()?.dispatchEvent(new Event('change'));
	$('url')?.dispatchEvent(new Event('input'));
}

const valeur = (id) => $(id)?.value.trim() ?? '';

async function demande() {
	if ($('nature')?.value && $('collectivite').value) return { type: 'acte', url: valeur('url'), collectivite: valeur('collectivite'), nature: $('nature').value, libelle: valeur('objet') };
	const libelle = valeur('libelle');
	const fichier = $fichier()?.files[0];
	const saisie = $('empreinte')?.value.trim();
	const url = $('url')?.value.trim();
	const corps = libelle ? { libelle } : {};
	if (fichier) return { ...corps, sha256: await empreinteDe(fichier) };
	if (saisie) return { ...corps, sha256: saisie };
	if (url) return { ...corps, url };
	return null;
}

async function envoyer(corps) {
	const r = await fetch('/api/depots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
	const reponse = await r.json();
	if (r.status === 201) afficher(reponse);
	else $('resultat').innerHTML = `<article class="ko"><h2>${t.refus[r.status] ?? echapper(reponse.erreur)}</h2>${(reponse.details ?? []).map((d) => `<p>${echapper(t.motifs[d] ?? d)}</p>`).join('')}</article>`;
}

$('formulaire').addEventListener('submit', async (e) => {
	e.preventDefault();
	const bouton = e.submitter ?? $('formulaire').querySelector('button');
	bouton.disabled = true;
	try {
		const corps = await demande();
		if (corps) await envoyer(corps);
		else $('resultat').innerHTML = `<p>${T.choisir}</p>`;
	} catch (erreur) {
		$('resultat').innerHTML = `<article class="ko"><h2>${T.erreurAvec(echapper(erreur.message))}</h2></article>`;
	} finally {
		bouton.disabled = false;
	}
	montrer($('resultat'));
	$('resultat').querySelector('article')?.focus({ preventScroll: true });
});

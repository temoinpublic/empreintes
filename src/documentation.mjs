// Ce que la documentation montre dans toute langue : les adresses de l'API et les
// formules. Chaque edition n'en donne que l'explication, sous la meme cle ; une
// adresse qu'une edition ne nomme pas (les actes, en allemand) ne s'y affiche pas.

export const ADRESSES = {
	dater: [
		['empreinte', 'POST /api/depots {"sha256": "&lt;64 hex&gt;", "libelle": "&lt;texte&gt;"}'],
		['url', 'POST /api/depots {"url": "https://&lt;adresse&gt;"}'],
		['acte', 'POST /api/depots {"type": "acte", "url": "https://&lt;adresse&gt;", "collectivite": "&lt;INSEE | SIREN&gt;", "nature": "deliberation | arrete | decision", "libelle": "&lt;objet&gt;"}'],
		['affichage', 'POST /api/depots {"type": "affichage", "sha256": "&lt;64 hex&gt;", "libelle": "&lt;numéro du permis&gt;"}'],
		['signe', 'POST /api/depots {"sha256": "&lt;64 hex&gt;", "signature": "&lt;JWS JAdES | CAdES détachée en base64&gt;"}'],
		['cree', '201'],
		['flux', 'POST /api/flux {"url": "https://&lt;flux RSS ou Atom&gt;"}'],
		['editeur', 'GET /editeur/&lt;id&gt;'],
		['fluxPrive', 'GET /api/flux/&lt;id&gt;'],
		['fluxRetire', 'DELETE /api/flux/&lt;id&gt;'],
		['plafond', '429'],
		['unJour', '409'],
		['illisible', '422']
	],
	agents: [
		['mcp', 'POST /mcp'],
		['openapi', 'GET /openapi.json'],
		['index', 'GET /api']
	],
	lire: [
		['jour', 'GET /depots/&lt;jour&gt;.jsonl'],
		['recu', 'GET /recu/&lt;id&gt;'],
		['ligneDuRecu', 'GET /api/recus/&lt;id&gt;'],
		['depotsDeLEmpreinte', 'GET /api/depots/&lt;sha256&gt;'],
		['indexCommunes', 'GET /collectivite'],
		['departement', 'GET /collectivite/departement/&lt;département&gt;'],
		['collectivite', 'GET /collectivite/&lt;INSEE&gt;'],
		['adresseActe', 'GET /actes/&lt;code&gt;/&lt;jour&gt;/&lt;nature&gt;-&lt;12 hex&gt;'],
		['communes', 'GET /annuaire/communes/insee-&lt;département&gt;.json'],
		['sites', 'GET /annuaire/insee-&lt;département&gt;.json'],
		['bilan', 'GET /api/bilan'],
		['bilanCommunes', 'GET /api/communes'],
		['tours', 'GET /tours.json'],
		['releve', 'GET /empreintes/&lt;tour&gt;.json'],
		['delta', 'GET /empreintes/&lt;tour&gt;.delta.json'],
		['signature', 'GET /empreintes/&lt;tour&gt;.racine.jws'],
		['signaturePostQuantique', 'GET /empreintes/&lt;tour&gt;.racine.slh'],
		['clePostQuantique', 'GET /empreintes/cle-slh-dsa.pub'],
		['depots', 'GET /empreintes/depots.jsonl'],
		['attestations', 'GET /attestations/par-url.json'],
		['autorites', 'GET /confiance/autorites.json'],
		['preuveDUnObjet', 'GET /preuves/&lt;sha256&gt;.json'],
		['sante', 'GET /health']
	]
};

/** Les formules, dans l'ordre de la table ; vide quand la ligne n'est qu'une explication. */
export const FORMULES = {
	feuille: '<code>sha256(cle + "\\n" + sha256 + "\\n" + jour + "\\n")</code>',
	arbre: '',
	racine: '<code>sha256("entrepot\\n" + tour + "\\n" + précédente + "\\n" + arbre + "\\n")</code>',
	depots: '',
	recu: '',
	bitcoin: '<code>ots verify &lt;tour&gt;.racine.ots</code>',
	signature: '<code>sha256(x5c[0]) = 5263feba5fc71c4725c93328c0c75a94fc4e1b632bb9ff01574239551ab34b80</code>',
	signaturePostQuantique: '<code>sha256(cle-slh-dsa.pub) = c1eccce60b9e07019b60e86f8c65836332a302f5140e09df54e7c762bc989f9c</code>',
	signatureDuDeposant: '<code>JAdES, charge utile = empreinte en 64 hex</code>, <code>CAdES, messageDigest = sha256 du document</code>',
	horodatage: '<code>openssl ts -verify -data &lt;tour&gt;.racine -in &lt;tour&gt;.racine.tsr</code>',
	script: '<a href="https://github.com/temoinpublic/empreintes/blob/main/scripts/verifier.mjs">node scripts/verifier.mjs &lt;document | --chaine&gt;</a>'
};

/**
 * L'index que `GET /api` rend : chaque point d'entree de la description OpenAPI, dans son ordre,
 * et les adresses ou lire la suite. Construit depuis `openapi.json` pour ne jamais s'en ecarter.
 */
export function indexDeLApi(openapi, origine) {
	const points = Object.entries(openapi.paths).flatMap(([chemin, methodes]) =>
		Object.entries(methodes).map(([methode, operation]) => ({ methode: methode.toUpperCase(), chemin, resume: operation.summary }))
	);
	return { service: openapi.info.title, documentation: `${origine}/documentation`, openapi: `${origine}/openapi.json`, mcp: `${origine}/mcp`, points };
}

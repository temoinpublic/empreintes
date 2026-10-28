// La liste d'attente d'une offre pas encore ouverte (D-200) : une adresse
// electronique, le profil de qui attend, le jour. Rien d'autre n'est garde :
// ni adresse IP, ni cookie. La reponse est la meme pour une adresse nouvelle et
// pour une adresse deja inscrite, pour ne rien dire de qui attend deja.

/**
 * Les offres qui tiennent une liste d'attente, par leur nom dans la table, et
 * qui attend : la valeur du formulaire et son libelle. Le premier profil est
 * coche par defaut ; `autre` ferme chaque liste (D-200, D-195).
 */
export const PROFILS_DES_OFFRES = {
	'marches-publics': { entreprise: 'Entreprise qui répond aux marchés', acheteur: 'Collectivité ou acheteur public', autre: 'Autre' },
	communes: { commune: 'Commune ou intercommunalité', prestataire: 'Éditeur ou prestataire des collectivités', autre: 'Autre' },
	editeurs: { presse: 'Éditeur de presse ou rédaction', site: 'Site, blog ou administration qui publie', autre: 'Autre' },
	assureurs: { assureur: 'Assureur ou mutuelle', expert: 'Expert, courtier ou gestionnaire de sinistres', autre: 'Autre' },
	notaires: { notaire: 'Office notarial', juriste: 'Avocat ou juriste', autre: 'Autre' },
	drh: { rh: 'Service du personnel ou direction', cabinet: 'Cabinet de paie, d’avocats ou d’expertise comptable', autre: 'Autre' },
	conformite: { conformite: 'Équipe conformité ou LCB-FT', conseil: 'Avocat, auditeur ou mandataire judiciaire', autre: 'Autre' }
};

export const OFFRES = Object.keys(PROFILS_DES_OFFRES);

/** L'offre nommee par le formulaire, si elle tient une liste ; sinon rien. */
export const offreConnue = (offre) => (Object.hasOwn(PROFILS_DES_OFFRES, offre) ? offre : null);

/** Au-dela, une offre refuse les inscriptions du jour : un robot ne remplit pas la table. */
export const PLAFOND_DU_JOUR = 200;

const ADRESSE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/** L'inscription lue dans le formulaire, ou la raison de son refus. */
export function lireInscription(champs) {
	const adresse = String(champs.adresse ?? '')
		.trim()
		.toLowerCase();
	// Le champ `site` est cache aux personnes : rempli, c'est un robot, qui recoit la meme reponse qu'une inscription.
	if (champs.site) return { robot: true };
	const offre = offreConnue(champs.offre);
	if (!offre) return { refus: 'offre' };
	if (adresse.length > 254 || !ADRESSE.test(adresse)) return { refus: 'adresse' };
	return { offre, adresse, profil: Object.hasOwn(PROFILS_DES_OFFRES[offre], champs.profil) ? champs.profil : 'autre' };
}

/** Inscrit une adresse sur la liste d'une offre : `inscrit`, ou `plafond` quand le jour est plein. */
export async function inscrire(db, { offre, adresse, profil }, jour) {
	const { n } = await db.prepare('SELECT COUNT(*) AS n FROM attente WHERE offre = ? AND jour = ?').bind(offre, jour).first();
	if (n >= PLAFOND_DU_JOUR) return 'plafond';
	await db.prepare('INSERT INTO attente (offre, adresse, profil, jour) VALUES (?, ?, ?, ?) ON CONFLICT (offre, adresse) DO NOTHING').bind(offre, adresse, profil, jour).run();
	return 'inscrit';
}

/** Le nombre d'adresses qui attendent, par offre, pour la sonde. */
export async function comptesDAttente(db) {
	const { results } = await db.prepare('SELECT offre, COUNT(*) AS n FROM attente GROUP BY offre').all();
	return Object.fromEntries(OFFRES.map((o) => [o, Number(results.find((r) => r.offre === o)?.n ?? 0)]));
}

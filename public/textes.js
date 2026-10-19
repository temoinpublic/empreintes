// Les textes des scripts du navigateur, les deux langues cote a cote ; `T` les lit dans la langue de la page (`<html lang>`).
const NBSP = '\u00A0';

const bilingue = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'fr' in v && 'de' in v;
const vue = (noeud, langue) => (bilingue(noeud) ? noeud[langue] : Object.fromEntries(Object.entries(noeud).map(([k, v]) => [k, vue(v, langue)])));

const TEXTES = {
	hote: { fr: 'temoinpublic.fr', de: 'datumszeuge.de' },
	jour: { fr: (j) => (j ? j.split('-').reverse().join('/') : 'jour inconnu'), de: (j) => (j ? j.split('-').reverse().join('.') : 'Tag unbekannt') },
	heure: {
		fr: (id) => `${id.slice(6, 8)}/${id.slice(4, 6)}/${id.slice(0, 4)} ${id.slice(9, 11)}:${id.slice(11, 13)}${NBSP}UTC`,
		de: (id) => `${id.slice(6, 8)}.${id.slice(4, 6)}.${id.slice(0, 4)} ${id.slice(9, 11)}:${id.slice(11, 13)}${NBSP}UTC`
	},
	instant: {
		fr: (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}${NBSP}UTC`,
		de: (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}${NBSP}UTC`
	},
	aucunDocument: { fr: 'Aucun document choisi', de: 'Kein Dokument ausgewählt' },
	choisir: { fr: 'Choisir le document.', de: 'Bitte ein Dokument auswählen.' },
	erreur: { fr: 'Erreur', de: 'Fehler' },
	erreurAvec: { fr: (m) => `Erreur${NBSP}: ${m}`, de: (m) => `Fehler: ${m}` },
	voirLeRecu: { fr: 'Voir le reçu', de: 'Beleg ansehen' },
	bloc: { fr: (b) => `Bitcoin, bloc ${b}`, de: (b) => `Bitcoin, Block ${b}` },
	calendrier: { fr: 'en cours d’inscription dans Bitcoin', de: 'Eintragung in Bitcoin läuft' },
	aucun: { fr: 'aucun', de: 'keine' },
	deposer: {
		deja: { fr: (j) => `Déjà daté le ${j}.`, de: (j) => `Bereits datiert am ${j}.` },
		refus: {
			400: { fr: 'Dépôt refusé', de: 'Hinterlegung abgelehnt' },
			409: { fr: 'Ce document en ligne a déjà été lu aujourd’hui', de: 'Dieses Dokument wurde heute schon gelesen' },
			422: { fr: 'Le document en ligne n’a pas pu être lu', de: 'Das Dokument konnte nicht gelesen werden' },
			429: { fr: 'Limite du jour atteinte, à demain', de: 'Tageslimit erreicht, bis morgen' }
		},
		motifs: {
			'url illisible': { fr: 'Ce lien n’est pas une adresse web.', de: 'Dieser Link ist keine Webadresse.' },
			'http ou https seulement': { fr: 'Le lien doit commencer par https:// ou http://.', de: 'Der Link muss mit https:// oder http:// beginnen.' },
			'adresse privee, locale ou reservee': { fr: 'Seules les adresses publiques sont acceptées.', de: 'Nur öffentliche Adressen sind zulässig.' },
			'nom d hote non public': { fr: 'Seules les adresses publiques sont acceptées.', de: 'Nur öffentliche Adressen sind zulässig.' },
			'hote sans adresse': { fr: 'Ce site n’existe pas.', de: 'Diese Website existiert nicht.' },
			'sha256 : 64 caracteres hexadecimaux': { fr: 'Une empreinte SHA-256 compte 64 caractères, chiffres et lettres de a à f.', de: 'Eine SHA-256-Prüfsumme hat 64 Zeichen, Ziffern und Buchstaben von a bis f.' },
			'document de moins de 512 octets': { fr: 'Le fichier reçu est presque vide, moins de 512 octets.', de: 'Die empfangene Datei ist fast leer, weniger als 512 Byte.' },
			'page web servie a la place du fichier annonce': { fr: 'Le lien annonce un fichier, mais le site a renvoyé une page web.', de: 'Der Link kündigt eine Datei an, die Website hat aber eine Webseite geliefert.' },
			'fichier annonce en pdf, octets d un autre format': { fr: 'Le lien annonce un PDF, mais le fichier reçu n’en est pas un.', de: 'Der Link kündigt ein PDF an, die empfangene Datei ist aber keines.' },
			'verification anti-robot servie a la place du document': { fr: 'Le site a renvoyé une vérification anti-robot à la place du document.', de: 'Die Website hat statt des Dokuments eine Roboterprüfung geliefert.' },
			'captcha servi a la place du document': { fr: 'Le site a renvoyé un captcha à la place du document.', de: 'Die Website hat statt des Dokuments ein Captcha geliefert.' },
			'page de connexion servie a la place du document': { fr: 'Le site a renvoyé une page de connexion à la place du document.', de: 'Die Website hat statt des Dokuments eine Anmeldeseite geliefert.' },
			'collectivite : code commune INSEE (5 caracteres) ou SIREN (9 chiffres)': { fr: 'Le code INSEE de la commune a 5 caractères, le SIREN de la collectivité 9 chiffres.', de: 'Der INSEE-Code der Gemeinde hat 5 Zeichen, die SIREN der Körperschaft 9 Ziffern.' },
			'libelle : aucun nom de personne': { fr: 'Le nom ou l’objet ne doit nommer personne.', de: 'Name oder Gegenstand dürfen keine Person nennen.' }
		},
		commune: { fr: (insee) => `la commune ${insee}`, de: (insee) => `Gemeinde ${insee}` },
		daterActe: { fr: 'Dater cet acte', de: 'Diesen Rechtsakt datieren' },
		daterDocument: { fr: 'Dater ce document', de: 'Dieses Dokument datieren' },
		natures: { deliberation: { fr: 'Délibération', de: 'Beschluss' }, arrete: { fr: 'Arrêté', de: 'Verfügung' }, decision: { fr: 'Décision', de: 'Entscheidung' } },
		rattachement: { 'site-officiel': { fr: 'adresse sur son site officiel', de: 'Adresse auf ihrer offiziellen Website' }, declaree: { fr: 'déclarée', de: 'angegeben' } },
		collectivite: { fr: 'Collectivité', de: 'Gebietskörperschaft' },
		luA: { fr: 'lu à', de: 'gelesen unter' },
		calculee: { fr: 'calculée sur votre appareil', de: 'auf Ihrem Gerät berechnet' },
		recuActe: { fr: (nature, j, h) => `${nature} en ligne le ${j}, ${h}${NBSP}UTC`, de: (nature, j, h) => `${nature} online am ${j}, ${h}${NBSP}UTC` },
		recuDocument: { fr: (j) => `Document daté du ${j}`, de: (j) => `Dokument datiert am ${j}` },
		enLigne: { fr: 'Ce fichier était en ligne à cette adresse à cet instant.', de: 'Diese Datei war in diesem Moment unter dieser Adresse online.' },
		gardez: {
			fr: `Gardez ce reçu avec le document${NBSP}: ensemble, ils prouvent qu’il existait ce jour-là, sans modification.`,
			de: 'Bewahren Sie diesen Beleg zusammen mit dem Dokument auf: Gemeinsam beweisen sie, dass es an diesem Tag unverändert existiert hat.'
		},
		imprimer: { fr: 'Imprimer le reçu', de: 'Beleg drucken' },
		telecharger: { fr: 'Télécharger le reçu', de: 'Beleg herunterladen' },
		nom: { fr: 'Nom', de: 'Name' },
		empreinte: { fr: 'Empreinte', de: 'Prüfsumme' },
		ligne: { fr: 'Entrée publique', de: 'Öffentlicher Eintrag' },
		place: { fr: (place, j) => `n°${NBSP}${place} du ${j}`, de: (place, j) => `Nr.${NBSP}${place} vom ${j}` },
		emis: { fr: 'Émis', de: 'Ausgestellt' },
		instant: { fr: (j, h) => `le ${j} à ${h}${NBSP}UTC`, de: (j, h) => `am ${j} um ${h}${NBSP}UTC` },
		adresse: { fr: 'Adresse', de: 'Adresse' },
		fichier: { fr: 'recu', de: 'beleg' }
	},
	verifier: {
		preuveOts: { fr: 'preuve .ots', de: 'Beweis .ots' },
		horodatageTsr: { fr: 'horodatage .tsr', de: 'Zeitstempel .tsr' },
		identique: { fr: (j) => `Identique au document daté du ${j}`, de: (j) => `Identisch mit dem am ${j} datierten Dokument` },
		nonConforme: { fr: 'Preuve non conforme', de: 'Beweis nicht gültig' },
		details: { fr: 'Détails de la preuve', de: 'Details des Beweises' },
		objet: { fr: 'Objet', de: 'Objekt' },
		vu: { fr: 'Vu', de: 'Gesehen' },
		duTourAu: { fr: (a, b) => `du tour ${a} au tour ${b}`, de: (a, b) => `von Runde ${a} bis Runde ${b}` },
		chemin: { fr: 'Chemin d’audit', de: 'Prüfpfad' },
		etapes: { fr: (n) => `${n} étapes, racine recalculée`, de: (n) => `${n} Schritte, Wurzel nachgerechnet` },
		absent: { fr: 'absent du relevé', de: 'nicht im Protokoll' },
		racine: { fr: 'Racine du tour', de: 'Wurzel der Runde' },
		jamais: { fr: 'Ce document n’a jamais été daté ici', de: 'Dieses Dokument wurde hier nie datiert' },
		authentique: { fr: (j) => `Reçu authentique${NBSP}: document daté du ${j}`, de: (j) => `Echter Beleg: Dokument datiert am ${j}` },
		inconnu: { fr: 'Reçu inconnu', de: 'Unbekannter Beleg' },
		recalcule: {
			fr: (n, h) => `Le dernier tour, ${h}, est recalculé depuis ses ${n.toLocaleString('fr-FR').replace(/ /g, NBSP)} empreintes.`,
			de: (n, h) => `Die letzte Runde, ${h}, ist aus ihren ${n.toLocaleString('de-DE')} Prüfsummen neu berechnet.`
		},
		intacte: { fr: (n) => `Chaîne intacte, ${n} tours`, de: (n) => `Kette intakt, ${n} Runden` },
		derniere: { fr: `Dernière racine${NBSP}:`, de: 'Letzte Wurzel:' },
		rompue: { fr: 'Chaîne rompue', de: 'Kette unterbrochen' },
		signature: { fr: 'Signature du journal', de: 'Signatur des Journals' },
		signatureValide: { fr: 'valide', de: 'gültig' },
		signatureNonConforme: { fr: 'non conforme', de: 'ungültig' },
		signeePar: { fr: 'Signé par', de: 'Signiert von' },
		signeeValide: { fr: (sujet, emetteur) => `${sujet}, certificat émis par ${emetteur}${NBSP}: signature valide`, de: (sujet, emetteur) => `${sujet}, Zertifikat ausgestellt von ${emetteur}: Signatur gültig` },
		signeeNonConforme: { fr: 'signature non conforme', de: 'Signatur ungültig' },
		sansNom: { fr: 'certificat sans nom', de: 'Zertifikat ohne Namen' },
		autorite: { fr: 'Autorité', de: 'Aussteller' },
		inscrite: { fr: (nom, pays) => `${nom}, inscrite sur la liste de confiance européenne (${pays}) quand elle a émis le certificat`, de: (nom, pays) => `${nom}, bei Ausstellung des Zertifikats in der europäischen Vertrauensliste eingetragen (${pays})` },
		signatures: { fr: (n) => `${n} signatures du journal valides`, de: (n) => `${n} gültige Signaturen des Journals` },
		signaturePq: { fr: 'Signature post-quantique', de: 'Post-Quanten-Signatur' },
		signaturesPq: { fr: (n) => `${n} signatures post-quantiques valides`, de: (n) => `${n} gültige Post-Quanten-Signaturen` },
		horodatage: { fr: 'Horodatage eIDAS', de: 'eIDAS-Zeitstempel' },
		horodatageValide: { fr: (h) => `valide, ${h}`, de: (h) => `gültig, ${h}` },
		horodatages: { fr: (n) => `${n} horodatages eIDAS valides`, de: (n) => `${n} gültige eIDAS-Zeitstempel` },
		serie: {
			complete: { fr: (n) => `Série complète${NBSP}: ${n} jours, chacun au registre`, de: (n) => `Vollständige Serie: ${n} Tage, jeder im Register` },
			enCours: { fr: (a, n) => `Série en cours${NBSP}: ${a} jours sur ${n} au registre, aucun manqué`, de: (a, n) => `Laufende Serie: ${a} von ${n} Tagen im Register, keiner ausgelassen` },
			interrompue: { fr: (n, j) => (n > 1 ? `Série interrompue${NBSP}: ${n} jours sans photo, le premier le ${j}` : `Série interrompue${NBSP}: le ${j} n’a pas de photo`), de: (n, j) => (n > 1 ? `Serie unterbrochen: ${n} Tage ohne Foto, der erste am ${j}` : `Serie unterbrochen: der ${j} hat kein Foto`) },
			nonConforme: { fr: (n) => (n > 1 ? `Certificat non conforme${NBSP}: ${n} jours ne correspondent pas au registre` : `Certificat non conforme${NBSP}: un jour ne correspond pas au registre`), de: (n) => (n > 1 ? `Bescheinigung ungültig: ${n} Tage stimmen nicht mit dem Register überein` : 'Bescheinigung ungültig: ein Tag stimmt nicht mit dem Register überein') },
			illisible: { fr: 'Certificat de série illisible', de: 'Serienbescheinigung nicht lesbar' },
			erreurs: {
				version: { fr: 'Version du certificat inconnue.', de: 'Unbekannte Version der Bescheinigung.' },
				permis: { fr: 'Le numéro du permis n’a pas la forme PC 069 123 24 A0001.', de: 'Die Nummer der Genehmigung hat nicht die Form PC 069 123 24 A0001.' },
				pose: { fr: 'La date de pose est illisible.', de: 'Das Datum des Aushangs ist nicht lesbar.' },
				fin: { fr: 'La période ne couvre pas deux mois depuis la pose.', de: 'Der Zeitraum umfasst nicht zwei Monate ab dem Aushang.' },
				jours: { fr: 'La liste des jours est illisible.', de: 'Die Liste der Tage ist nicht lesbar.' },
				'hors-periode': { fr: 'Un jour tombe hors de la période d’affichage.', de: 'Ein Tag liegt außerhalb des Aushangzeitraums.' },
				ordre: { fr: 'Les jours ne se suivent pas, ou un jour revient deux fois.', de: 'Die Tage folgen nicht aufeinander, oder ein Tag kommt doppelt vor.' }
			},
			permis: { fr: 'Permis', de: 'Genehmigung' },
			permisRelu: { fr: 'numéro relu dans chaque reçu', de: 'Nummer in jedem Beleg nachgelesen' },
			permisNonRelu: {
				fr: (r, n) => (r === 0 ? 'numéro non relu, le certificat ne joint pas les reçus' : `numéro relu dans ${r} reçus sur ${n}`),
				de: (r, n) => (r === 0 ? 'Nummer nicht nachgelesen, die Bescheinigung enthält keine Belege' : `Nummer in ${r} von ${n} Belegen nachgelesen`)
			},
			periode: { fr: 'Affichage', de: 'Aushang' },
			duAu: { fr: (a, b) => `du ${a} au ${b}`, de: (a, b) => `vom ${a} bis ${b}` },
			auRegistre: { fr: 'Au registre', de: 'Im Register' },
			compte: { fr: (a, n) => `${a} jours sur ${n}`, de: (a, n) => `${a} von ${n} Tagen` },
			photos: { fr: 'Déposez une photo de la série sur cette page pour retrouver son jour.', de: 'Laden Sie ein Foto der Serie auf dieser Seite hoch, um seinen Tag zu finden.' },
			details: { fr: 'Chaque jour', de: 'Jeder Tag' },
			jour: { fr: 'Jour', de: 'Tag' },
			registre: { fr: 'Registre', de: 'Register' },
			empreinte: { fr: 'Empreinte de la photo', de: 'Prüfsumme des Fotos' },
			recu: { fr: 'Reçu', de: 'Beleg' },
			place: { fr: (p) => `n°${NBSP}${p}`, de: (p) => `Nr.${NBSP}${p}` },
			verdicts: {
				'au-registre': { fr: 'au registre', de: 'im Register' },
				inconnu: { fr: 'reçu inconnu', de: 'Beleg unbekannt' },
				different: { fr: 'autre empreinte ou autre jour', de: 'andere Prüfsumme oder anderer Tag' },
				'autre-permis': { fr: 'reçu d’un autre permis', de: 'Beleg einer anderen Genehmigung' },
				'sans-photo': { fr: 'sans photo', de: 'ohne Foto' },
				'a-venir': { fr: 'à venir', de: 'ausstehend' }
			}
		}
	},
	recu: {
		inscrit: { fr: (h) => `inscrit le ${h}`, de: (h) => `eingetragen am ${h}` },
		attente: { fr: 'en attente d’inscription', de: 'Eintragung steht aus' },
		nonConforme: { fr: 'preuve non conforme', de: 'Beweis nicht gültig' },
		illisible: { fr: 'registre illisible pour le moment', de: 'Register im Moment nicht lesbar' }
	},
	editeur: {
		flux: { fr: `Flux${NBSP}: `, de: 'Feed: ' },
		telecharger: { fr: 'Télécharger les reçus', de: 'Belege herunterladen' },
		cesser: { fr: 'Cesser de suivre ce flux', de: 'Diesen Feed nicht mehr verfolgen' },
		confirmer: { fr: `Cesser de suivre ce flux${NBSP}? Les dates déjà enregistrées restent.`, de: 'Diesen Feed nicht mehr verfolgen? Die bereits eingetragenen Datierungen bleiben.' },
		articles: { fr: 'Vos articles', de: 'Ihre Artikel' },
		refuse: { fr: 'Lien privé refusé.', de: 'Privater Link abgelehnt.' },
		fichier: { fr: 'recus', de: 'belege' }
	}
};

export const T = vue(TEXTES, document.documentElement.lang === 'de' ? 'de' : 'fr');

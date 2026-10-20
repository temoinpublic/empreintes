// Les textes des pages, les deux langues cote a cote : chaque feuille `{ fr, de }`
// se lit dans une langue par `vue`. Le francais est Témoin public sur
// temoinpublic.fr ; l'allemand Datumszeuge sur datumszeuge.de, sans les actes de
// collectivite. Les scripts du navigateur ont leurs textes dans `public/textes.js`.

const NBSP = '\u00A0';
const jourFr = (j) => j.split('-').reverse().join('/');
const jourDe = (j) => j.split('-').reverse().join('.');
const nombreFr = (n) => n.toLocaleString('fr-FR').replace(/\u202f/g, NBSP);
const nombreDe = (n) => n.toLocaleString('de-DE');
const s = (n) => (n > 1 ? 's' : '');
const en = (n) => (n > 1 ? 'Versionen' : 'Version');

/** Vrai pour une feuille bilingue. */
const bilingue = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'fr' in v && 'de' in v;

/** La table lue dans une langue : chaque feuille `{ fr, de }` devient sa valeur dans cette langue. */
export const vue = (noeud, langue) => (bilingue(noeud) ? noeud[langue] : Object.fromEntries(Object.entries(noeud).map(([k, v]) => [k, vue(v, langue)])));

export const TEXTES = {
	langue: { fr: 'fr', de: 'de' },
	locale: { fr: 'fr_FR', de: 'de_DE' },
	hote: { fr: 'temoinpublic.fr', de: 'datumszeuge.de' },
	adresse: { fr: 'https://temoinpublic.fr', de: 'https://datumszeuge.de' },
	marque: { fr: 'Témoin public', de: 'Datumszeuge' },
	actes: {
		dater: { chemin: { fr: '/deposer', de: '/datieren' }, nom: { fr: 'Dater', de: 'Datieren' }, titre: { fr: 'Dater un document', de: 'Ein Dokument datieren' } },
		verifier: { chemin: { fr: '/verifier', de: '/pruefen' }, nom: { fr: 'Vérifier', de: 'Prüfen' }, titre: { fr: 'Vérifier un document', de: 'Ein Dokument prüfen' } },
		journal: { chemin: { fr: '/journal', de: '/register' }, nom: { fr: 'Registre', de: 'Register' }, titre: { fr: 'Registre des dates', de: 'Datumsregister' } },
		communes: { fr: { chemin: '/collectivite', nom: 'Communes', titre: 'Actes des communes' }, de: undefined },
		acte: { fr: { chemin: '/acte', nom: 'Acte de collectivité', titre: 'Dater la mise en ligne d’un acte' }, de: undefined },
		preuve: { chemin: { fr: '/preuve', de: '/beweiswert' }, nom: { fr: 'Valeur de preuve', de: 'Beweiswert' }, titre: { fr: 'Valeur de preuve', de: 'Beweiswert' } },
		documentation: { chemin: { fr: '/documentation', de: '/dokumentation' }, nom: { fr: 'Documentation', de: 'Dokumentation' }, titre: { fr: 'Documentation', de: 'Dokumentation' } },
		mentions: { chemin: { fr: '/mentions-legales', de: '/impressum' }, nom: { fr: 'Mentions légales', de: 'Impressum' }, titre: { fr: 'Mentions légales', de: 'Impressum' } },
		pratiques: { chemin: { fr: '/pratiques', de: '/praktiken' }, nom: { fr: 'Pratiques du registre', de: 'Praktiken des Registers' }, titre: { fr: 'Pratiques du registre', de: 'Praktiken des Registers' } },
		conditions: { chemin: { fr: '/conditions', de: '/bedingungen' }, nom: { fr: 'Conditions générales', de: 'Nutzungsbedingungen' }, titre: { fr: 'Conditions générales', de: 'Nutzungsbedingungen' } },
		roles: { chemin: { fr: '/roles', de: '/rollen' }, nom: { fr: 'Rôles de confiance', de: 'Vertrauensrollen' }, titre: { fr: 'Rôles de confiance', de: 'Vertrauensrollen' } },
		archivage: { chemin: { fr: '/archivage', de: '/archiv' }, nom: { fr: 'Pratiques de l’archivage', de: 'Praktiken des Archivs' }, titre: { fr: 'Pratiques de l’archivage', de: 'Praktiken des Archivs' } },
		conditionsArchivage: { chemin: { fr: '/conditions-archivage', de: '/archivbedingungen' }, nom: { fr: 'Conditions de l’archivage', de: 'Archivbedingungen' }, titre: { fr: 'Conditions de l’archivage', de: 'Archivbedingungen' } }
	},
	jour: { fr: jourFr, de: jourDe },
	nombre: { fr: nombreFr, de: nombreDe },
	structure: {
		description: {
			fr: "Prouver gratuitement qu'un document existait à une date, sans modification : son empreinte est inscrite dans un registre public ancré dans Bitcoin.",
			de: 'Kostenlos beweisen, dass ein Dokument an einem bestimmten Tag unverändert existiert hat: seine Prüfsumme wird in ein öffentliches, in Bitcoin verankertes Register eingetragen.'
		}
	},
	navigation: { fr: 'Principal', de: 'Hauptnavigation' },
	codeSource: { fr: 'Code source', de: 'Quellcode' },
	ancrage: {
		bitcoin: { fr: (bloc) => `Bitcoin, bloc ${bloc}`, de: (bloc) => `Bitcoin, Block ${bloc}` },
		calendrier: { fr: 'en cours d’inscription dans Bitcoin', de: 'Eintragung in Bitcoin läuft' },
		aucun: { fr: 'aucun', de: 'keine' }
	},
	fichiers: { json: { fr: 'relevé', de: 'Protokoll' }, racine: { fr: 'racine', de: 'Wurzel' }, 'racine.ots': { fr: '.ots', de: '.ots' }, 'racine.tsr': { fr: '.tsr', de: '.tsr' }, 'racine.jws': { fr: 'signature', de: 'Signatur' } },
	zone: {
		glisser: { fr: 'Glissez-le ici, ou ', de: 'Hierher ziehen oder ' },
		choisir: { fr: 'choisissez-le sur votre appareil', de: 'auf Ihrem Gerät auswählen' },
		aucun: { fr: 'Aucun document choisi', de: 'Kein Dokument ausgewählt' }
	},
	empreinte: {
		question: { fr: `Une empreinte SHA-256${NBSP}?`, de: 'Eine SHA-256-Prüfsumme?' },
		libelle: { fr: 'Son empreinte SHA-256', de: 'Die SHA-256-Prüfsumme' }
	},
	formulaire: {
		deposez: { fr: 'Déposez le document à dater', de: 'Dokument zum Datieren hier ablegen' },
		ou: { fr: 'ou', de: 'oder' },
		lien: { fr: 'Le lien d’un document en ligne', de: 'Der Link zu einem Dokument im Internet' },
		exemple: { fr: 'https://www.ma-commune.fr/deliberation.pdf', de: 'https://www.beispiel.de/vertrag.pdf' },
		nommer: { fr: 'Lui donner un nom (facultatif)', de: 'Einen Namen vergeben (optional)' },
		nom: { fr: 'Un nom', de: 'Name' },
		bouton: { fr: 'Dater ce document', de: 'Dieses Dokument datieren' },
		accepter: { fr: 'En datant, vous acceptez les', de: 'Mit dem Datieren akzeptieren Sie die' },
		recoit: {
			fr: 'Vous recevez un reçu à imprimer ou à télécharger, à garder avec le document. Un fichier déposé ne quitte jamais votre appareil.',
			de: 'Sie erhalten einen Beleg zum Ausdrucken oder Herunterladen, den Sie zusammen mit dem Dokument aufbewahren. Eine abgelegte Datei verlässt Ihr Gerät nie.'
		}
	},
	etapes: {
		fr: [
			['Déposez', 'Un devis, un contrat, une photo, un PDF.'],
			['Gardez le reçu', 'Daté, à imprimer, avec le document.'],
			['Vérifiez', 'N’importe qui, à tout moment, sans compte.']
		],
		de: [
			['Ablegen', 'Ein Angebot, ein Vertrag, ein Foto, ein PDF.'],
			['Beleg aufbewahren', 'Datiert, zum Ausdrucken, zusammen mit dem Dokument.'],
			['Prüfen', 'Jeder, jederzeit, ohne Konto.']
		]
	},
	accueil: {
		titre: { fr: 'Prouver la date d’un document', de: 'Das Datum eines Dokuments beweisen' },
		description: {
			fr: "Prouvez gratuitement qu'un document existait à une date, sans modification. Sans compte ; seule son empreinte est publiée, jamais le document.",
			de: 'Beweisen Sie kostenlos, dass ein Dokument an einem bestimmten Tag unverändert existiert hat. Ohne Konto; nur seine Prüfsumme wird veröffentlicht, nie das Dokument.'
		},
		h1: { fr: 'Prouvez qu’un document existait à une date, sans modification.', de: 'Beweisen Sie, dass ein Dokument an einem Tag unverändert existiert hat.' },
		chapeau: { fr: 'Gratuit, sans compte. Vérifiable par tous, même sans ce site.', de: 'Kostenlos, ohne Konto. Für jeden nachprüfbar, auch ohne diese Website.' },
		deja: { fr: `Déjà daté${NBSP}?`, de: 'Schon datiert?' },
		compte: { fr: (n, j) => `${nombreFr(n)} dates enregistrées depuis le ${j}.`, de: (n, j) => `${nombreDe(n)} Datierungen seit dem ${j}.` }
	},
	journal: {
		description: {
			fr: 'Chaque tour du journal des empreintes : documents, racine chaînée, ancrage Bitcoin, fichiers de preuve.',
			de: 'Jede Runde des Prüfsummenregisters: Dokumente, verkettete Wurzel, Bitcoin-Verankerung, Beweisdateien.'
		},
		sousTitre: { fr: 'La liste publique des dates, sans les documents.', de: 'Die öffentliche Liste der Datierungen, ohne die Dokumente.' },
		chiffres: { fr: ['Documents', 'Tours', 'Depuis le'], de: ['Dokumente', 'Runden', 'Seit dem'] },
		derniereRacine: { fr: (dh) => `Dernière racine, ${dh}`, de: (dh) => `Letzte Wurzel, ${dh}` },
		verifierChaine: { fr: 'Vérifier la chaîne', de: 'Kette prüfen' },
		aucunTour: { fr: 'Aucun tour publié.', de: 'Noch keine Runde veröffentlicht.' },
		tours: { fr: (n) => `${nombreFr(n)} tours`, de: (n) => `${nombreDe(n)} Runden` },
		colonnes: { fr: ['Tour', 'Documents', 'Racine', 'Bitcoin', 'Fichiers'], de: ['Runde', 'Dokumente', 'Wurzel', 'Bitcoin', 'Dateien'] },
		script: { fr: 'Script de vérification', de: 'Prüfskript' }
	},
	verifier: {
		description: {
			fr: "Vérifier qu'un document est identique à celui qui a été daté, et à quelle date.",
			de: 'Prüfen, ob ein Dokument mit dem datierten Dokument übereinstimmt, und an welchem Tag es datiert wurde.'
		},
		deposez: { fr: 'Déposez le document ou son reçu', de: 'Dokument oder Beleg hier ablegen' },
		autrement: { fr: `Pas le fichier sous la main${NBSP}?`, de: 'Datei nicht zur Hand?' },
		bouton: { fr: 'Vérifier', de: 'Prüfen' }
	},
	deposer: {
		description: {
			fr: 'Dater gratuitement un document, ancré dans Bitcoin, et recevoir un reçu à imprimer. Seule son empreinte est publiée, jamais le document.',
			de: 'Ein Dokument kostenlos datieren, in Bitcoin verankert, mit Beleg zum Ausdrucken. Nur seine Prüfsumme wird veröffentlicht, nie das Dokument.'
		},
		compte: {
			fr: (preuve) => `Gratuit, sans compte, jusqu’à 20 documents par jour. ${preuve}${NBSP}: un élément de preuve, que le juge apprécie librement.`,
			de: (preuve) => `Kostenlos, ohne Konto, bis zu 20 Dokumente pro Tag. ${preuve}: ein Beweismittel, das das Gericht frei würdigt.`
		}
	},
	recu: {
		titre: { fr: (j) => `Reçu de date du ${j}`, de: (j) => `Datumsbeleg vom ${j}` },
		description: {
			fr: (acte, j, place) => `Reçu de date${NBSP}: ${acte ? 'acte en ligne' : 'document daté'} le ${j}, ligne ${place}.`,
			de: (acte, j, place) => `Datumsbeleg: ${acte ? 'Dokument online' : 'Dokument datiert'} am ${j}, Zeile ${place}.`
		},
		h1: { fr: 'Reçu de date', de: 'Datumsbeleg' },
		enLigne: { fr: (j) => `En ligne le ${j}`, de: (j) => `Online am ${j}` },
		date: { fr: (j) => `Document daté du ${j}`, de: (j) => `Dokument datiert am ${j}` },
		acte: { fr: 'Acte', de: 'Rechtsakt' },
		collectivite: { fr: 'Collectivité', de: 'Gebietskörperschaft' },
		adresseCollectivite: { fr: (code) => `/collectivite/${code}`, de: (code) => `https://temoinpublic.fr/collectivite/${code}` },
		adresseActe: { fr: 'Adresse de l’acte', de: 'Adresse des Rechtsakts' },
		sansObjet: { fr: 'Sans objet', de: 'Ohne Gegenstand' },
		natures: {
			deliberation: { fr: 'Délibération', de: 'Beschluss' },
			arrete: { fr: 'Arrêté', de: 'Verfügung' },
			decision: { fr: 'Décision', de: 'Entscheidung' }
		},
		empreinte: { fr: 'Empreinte', de: 'Prüfsumme' },
		ligne: { fr: 'Entrée publique', de: 'Öffentlicher Eintrag' },
		place: { fr: (place, j) => `n°${NBSP}${place} du ${j}`, de: (place, j) => `Nr.${NBSP}${place} vom ${j}` },
		registre: { fr: 'Registre', de: 'Register' },
		lecture: { fr: 'lecture du registre', de: 'Register wird gelesen' },
		produit: { fr: 'Produit', de: 'Produkt' },
		recuDuProduit: { fr: 'Reçu du produit', de: 'Beleg des Produkts' },
		imprimer: { fr: 'Imprimer le reçu', de: 'Beleg drucken' }
	},
	editeur: {
		titre: { fr: (id) => `Registre de l’éditeur ${id}`, de: (id) => `Register des Herausgebers ${id}` },
		description: {
			fr: (id) => `Les versions datées des articles du flux ${id}${NBSP}: date, ligne du registre, empreinte.`,
			de: (id) => `Die datierten Versionen der Artikel des Feeds ${id}: Datum, Zeile im Register, Prüfsumme.`
		},
		h1: { fr: 'Registre de l’éditeur', de: 'Register des Herausgebers' },
		flux: { fr: (id, etat) => `Flux ${id}. ${etat}.`, de: (id, etat) => `Feed ${id}. ${etat}.` },
		suiviDepuis: { fr: (j) => `Suivi depuis le ${j}`, de: (j) => `Verfolgt seit dem ${j}` },
		suiviDuAu: { fr: (a, b) => `Suivi du ${a} au ${b}`, de: (a, b) => `Verfolgt vom ${a} bis ${b}` },
		colonnes: { fr: ['Article', 'Versions', 'Datée le', 'Ligne', 'Empreinte'], de: ['Artikel', 'Versionen', 'Datiert am', 'Zeile', 'Prüfsumme'] },
		compte: {
			fr: (articles, versions) => `${nombreFr(versions)} version${s(versions)}, ${nombreFr(articles)} article${s(articles)}`,
			de: (articles, versions) => `${nombreDe(versions)} ${en(versions)}, ${nombreDe(articles)} Artikel`
		},
		aucune: { fr: 'Aucune version datée', de: 'Keine datierte Version' },
		coupe: { fr: (montrees, total) => `Les ${nombreFr(montrees)} plus récentes sur ${nombreFr(total)}.`, de: (montrees, total) => `Die ${nombreDe(montrees)} neuesten von ${nombreDe(total)}.` }
	},
	recuInconnu: {
		titre: { fr: 'Reçu inconnu', de: 'Unbekannter Beleg' },
		description: { fr: 'Aucun dépôt ne porte ce reçu.', de: 'Kein Eintrag trägt diesen Beleg.' }
	},
	introuvable: {
		titre: { fr: 'Page introuvable', de: 'Seite nicht gefunden' },
		description: { fr: 'Aucune page à cette adresse.', de: 'Unter dieser Adresse gibt es keine Seite.' }
	},
	documentation: {
		description: {
			fr: 'Adresses, limites et formules du registre des dates : dater, lire et vérifier sans ce site.',
			de: 'Adressen, Grenzen und Formeln des Datumsregisters: datieren, lesen und ohne diese Website prüfen.'
		},
		titres: { fr: ['Dater', 'Agents', 'Lire', 'Vérifier sans ce site', 'Textes du registre', 'Textes de l’archivage'], de: ['Datieren', 'Agenten', 'Lesen', 'Ohne diese Website prüfen', 'Texte des Registers', 'Texte des Archivs'] },
		dater: {
			empreinte: { fr: 'une empreinte calculée par vous\u00A0; le libellé reste dans le reçu', de: 'eine von Ihnen berechnete Prüfsumme; der Name bleibt im Beleg' },
			url: { fr: 'le service lit lui-même le document en ligne et date ses octets', de: 'der Dienst liest das Dokument selbst im Internet und datiert seine Bytes' },
			acte: { fr: 'un acte de collectivité, lu à son adresse, avec son objet\u00A0; reçu version 2, ligne publique inchangée', de: undefined },
			affichage: {
				fr: 'la photo du jour d’un panneau de permis de construire, son empreinte calculée par vous, le numéro du permis en libellé\u00A0; reçu version 3, ligne publique inchangée',
				de: undefined
			},
			signe: {
				fr: 'une empreinte signée par vous\u00A0: JWS compact JAdES, certificat dans <code>x5c</code>, ou signature CAdES détachée du document (le <code>.p7s</code> en base64, condensat SHA-256), aussi avec <code>url</code> ou un <code>type</code>\u00A0; reçu version 4 avec la signature et le nom du certificat, ligne publique inchangée',
				de: 'eine von Ihnen signierte Prüfsumme: kompaktes JWS JAdES, Zertifikat in <code>x5c</code>, oder abgetrennte CAdES-Signatur des Dokuments (die <code>.p7s</code> in Base64, Hashwert SHA-256), auch mit <code>url</code> oder einem <code>type</code>; Beleg Version 4 mit der Signatur und dem Namen des Zertifikats, öffentliche Zeile unverändert'
			},
			cree: { fr: 'le reçu, son identifiant, la ligne publique', de: 'der Beleg, seine Kennung, die öffentliche Zeile' },
			flux: {
				fr: 'suivre un flux\u00A0: chaque heure, chaque article nouveau ou modifié est lu et daté\u00A0; rend l’identifiant du flux et son jeton',
				de: 'einen Feed verfolgen: jede Stunde wird jeder neue oder geänderte Artikel gelesen und datiert; gibt die Kennung des Feeds und sein Token zurück'
			},
			editeur: {
				fr: 'le registre public d’un flux\u00A0: chaque version datée, sans adresse ni titre\u00A0; avec <code>#&lt;jeton&gt;</code>, les adresses et les reçus',
				de: 'das öffentliche Register eines Feeds: jede datierte Version, ohne Adresse und Titel; mit <code>#&lt;Token&gt;</code> auch die Adressen und Belege'
			},
			fluxPrive: { fr: 'le registre privé d’un flux, <code>authorization: Bearer &lt;jeton&gt;</code>', de: 'das private Register eines Feeds, <code>authorization: Bearer &lt;Token&gt;</code>' },
			fluxRetire: {
				fr: 'cesser de suivre un flux, <code>authorization: Bearer &lt;jeton&gt;</code>\u00A0; les dates déjà enregistrées restent',
				de: 'einen Feed nicht mehr verfolgen, <code>authorization: Bearer &lt;Token&gt;</code>; die bereits eingetragenen Datierungen bleiben'
			},
			plafond: {
				fr: `20 dépôts par jour et par adresse, 2${NBSP}000 par jour, <code>retry-after</code> jusqu’à minuit UTC`,
				de: '20 Datierungen pro Tag und Adresse, 2.000 pro Tag, <code>retry-after</code> bis Mitternacht UTC'
			},
			unJour: { fr: 'une même adresse en ligne lue une fois par jour', de: 'dieselbe Internetadresse wird einmal pro Tag gelesen' },
			illisible: { fr: 'lecture impossible\u00A0: 20 Mo, 30 s, 5 redirections au plus, adresses publiques seulement ; refusée aussi quand le site renvoie autre chose que le document (page web à la place d’un PDF, page de connexion, vérification anti-robot, moins de 512 octets)', de: 'Lesen nicht möglich: höchstens 20 MB, 30 s, 5 Weiterleitungen, nur öffentliche Adressen; auch abgelehnt, wenn die Website etwas anderes als das Dokument liefert (Webseite statt PDF, Anmeldeseite, Roboterprüfung, weniger als 512 Byte)' }
		},
		agents: {
			mcp: {
				fr: 'serveur MCP, HTTP sans session\u00A0: <code>dater_url</code>, <code>dater_empreinte</code>, <code>chercher_empreinte</code>, <code>lire_recu</code>\u00A0; mêmes limites',
				de: 'MCP-Server, HTTP ohne Sitzung: <code>dater_url</code>, <code>dater_empreinte</code>, <code>chercher_empreinte</code>, <code>lire_recu</code>; dieselben Grenzen'
			},
			openapi: { fr: 'la description OpenAPI de l’API', de: 'die OpenAPI-Beschreibung der API' }
		},
		lire: {
			jour: { fr: 'les dépôts du jour, une ligne <code>{"sha256","jour","place","recu"}</code> par dépôt', de: 'die Datierungen des Tages, eine Zeile <code>{"sha256","jour","place","recu"}</code> je Datierung' },
			recu: { fr: 'la page d’un reçu', de: 'die Seite eines Belegs' },
			ligneDuRecu: { fr: 'la ligne publique d’un reçu', de: 'die öffentliche Zeile eines Belegs' },
			depotsDeLEmpreinte: { fr: 'les dépôts d’une empreinte', de: 'die Datierungen einer Prüfsumme' },
			indexCommunes: { fr: 'les départements dont au moins une commune a un acte daté, avec leurs comptes', de: undefined },
			departement: { fr: 'les communes d’un département qui ont un acte daté, avec leur compte', de: undefined },
			collectivite: { fr: 'les actes d’une commune lus sur son site officiel\u00A0: date, nature, empreinte, reçu\u00A0; le SIREN y renvoie', de: undefined },
			adresseActe: { fr: 'l’adresse pérenne d’un acte\u00A0: sa page, ou sa fiche JSON avec <code>Accept: application/json</code>. Schéma\u00A0: <a href="/adresse-des-actes">adresse des actes</a>', de: undefined },
			communes: { fr: 'le nom de chaque commune, code INSEE ou SIREN vers <code>[nom, INSEE, SIREN]</code>', de: undefined },
			sites: {
				fr: 'les sites officiels des communes, code INSEE ou SIREN vers <code>[hôte, préfixe]</code>. Source\u00A0: <a href="https://www.data.gouv.fr/datasets/service-public-fr-annuaire-de-l-administration-base-de-donnees-locales/">Annuaire de l’administration, Service-Public.fr</a> (DILA), <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/">Licence Ouverte 2.0</a>',
				de: undefined
			},
			bilanCommunes: { fr: 'les communes qui ont un acte daté, leurs actes et leurs départements', de: undefined },
			bilan: { fr: 'dépôts et déposants distincts, jour par jour', de: 'Datierungen und verschiedene Einreicher, Tag für Tag' },
			tours: { fr: 'les tours du registre', de: 'die Runden des Registers' },
			releve: { fr: 'le relevé d’un tour, avec <code>.racine</code>, <code>.racine.ots</code>, <code>.racine.tsr</code>', de: 'das Protokoll einer Runde, mit <code>.racine</code>, <code>.racine.ots</code>, <code>.racine.tsr</code>' },
			signature: {
				fr: 'la signature du journal d’un tour\u00A0: JWS compact ES256, la racine en charge utile, <code>x5c</code> épinglé dans la formule ci-dessous',
				de: 'die Signatur des Journals einer Runde: kompaktes JWS ES256, die Wurzel als Nutzlast, <code>x5c</code> wie in der Formel unten festgelegt'
			},
			signaturePostQuantique: {
				fr: 'la signature post-quantique d’un tour\u00A0: SLH-DSA-SHA2-128s (FIPS 205), 7\u00A0856 octets bruts, sur le texte hexadécimal de la racine',
				de: 'die Post-Quanten-Signatur einer Runde: SLH-DSA-SHA2-128s (FIPS 205), 7 856 rohe Bytes, über den Hexadezimaltext der Wurzel'
			},
			clePostQuantique: {
				fr: 'la clé publique SLH-DSA du journal, 32 octets bruts, épinglée dans la formule ci-dessous',
				de: 'der öffentliche SLH-DSA-Schlüssel des Journals, 32 rohe Bytes, wie in der Formel unten festgelegt'
			},
			attestations: {
				fr: 'les documents des listes publiques vus par l’entrepôt\u00A0: adresse, empreinte, premier et dernier jour vu, preuve',
				de: 'die vom Archiv gesehenen Dokumente der öffentlichen Listen: Adresse, Prüfsumme, erster und letzter Tag, Beweis'
			},
			autorites: {
				fr: 'les autorités (services <code>CA/QC</code>) des listes de confiance européennes, <code>sha256</code> du certificat vers pays, nom, usages et <code>periodes</code> où elles étaient inscrites, relues à chaque publication\u00A0; une signature de déposant dont <code>x5c</code> remonte à l’une d’elles la nomme si elle était inscrite quand elle a émis le certificat',
				de: 'die Zertifizierungsstellen (Dienste <code>CA/QC</code>) der europäischen Vertrauenslisten, <code>sha256</code> des Zertifikats zu Land, Name, Verwendung und den <code>periodes</code> ihrer Eintragung, bei jeder Veröffentlichung neu gelesen; eine Signatur, deren <code>x5c</code> zu einer von ihnen führt, nennt sie, wenn sie bei Ausstellung des Zertifikats eingetragen war'
			},
			preuveDUnObjet: {
				fr: 'la preuve d’un document\u00A0: chemin d’audit, racine, <code>.ots</code>, signature du journal',
				de: 'der Beweis eines Dokuments: Prüfpfad, Wurzel, <code>.ots</code>, Signatur des Journals'
			},
			depots: { fr: 'les dépôts lus par l’entrepôt, dans l’ordre de leur inscription', de: 'die vom Archiv gelesenen Datierungen, in der Reihenfolge ihrer Eintragung' },
			sante: { fr: 'l’état du registre publié', de: 'der Zustand des veröffentlichten Registers' }
		},
		verifier: {
			feuille: { fr: ['feuille'], de: ['Blatt'] },
			arbre: {
				fr: ['arbre', 'Merkle SHA-256 sur les octets des deux enfants\u00A0; un niveau impair double son dernier nœud'],
				de: ['Baum', 'Merkle-Baum, SHA-256 über die Bytes der beiden Kinder; eine ungerade Ebene verdoppelt ihren letzten Knoten']
			},
			racine: { fr: ['racine', '\u00A0; le premier tour suit 64 zéros'], de: ['Wurzel', '; die erste Runde folgt auf 64 Nullen'] },
			depots: {
				fr: ['depots:&lt;n&gt;', 'la feuille des dépôts\u00A0: <code>sha256</code> des <code>n</code> premières lignes de <code>depots.jsonl</code>, chacune suivie de <code>"\\n"</code>'],
				de: ['depots:&lt;n&gt;', 'das Blatt der Datierungen: <code>sha256</code> der ersten <code>n</code> Zeilen von <code>depots.jsonl</code>, jede gefolgt von <code>"\\n"</code>']
			},
			recu: {
				fr: ['reçu', 'identifiant\u00A0: <code>sha256</code> de sa forme canonique, clés triées, sans espace'],
				de: ['Beleg', 'Kennung: <code>sha256</code> seiner kanonischen Form, Schlüssel sortiert, ohne Leerzeichen']
			},
			bitcoin: { fr: ['Bitcoin'], de: ['Bitcoin'] },
			signature: { fr: ['signature du journal', '\u00A0; ES256 sur <code>en-tête.charge</code>'], de: ['Signatur des Journals', '; ES256 über <code>Header.Nutzlast</code>'] },
			signaturePostQuantique: { fr: ['signature post-quantique', '\u00A0; SLH-DSA-SHA2-128s pur, contexte vide, sur la racine en 64 caractères hexadécimaux'], de: ['Post-Quanten-Signatur', '; reines SLH-DSA-SHA2-128s, leerer Kontext, über die Wurzel in 64 Hexadezimalzeichen'] },
			signatureDuDeposant: {
				fr: ['signature du déposant', '\u00A0; JAdES\u00A0: ES256, ES384, RS256 ou PS256 sous la clé de <code>x5c[0]</code>, charge jointe ou détachée\u00A0; CAdES\u00A0: un signataire, attributs signés, RSA ou ECDSA\u00A0; certificat valide à l’instant du dépôt'],
				de: ['Signatur des Einreichers', '; JAdES: ES256, ES384, RS256 oder PS256 unter dem Schlüssel von <code>x5c[0]</code>, Nutzlast angehängt oder abgetrennt; CAdES: ein Unterzeichner, signierte Attribute, RSA oder ECDSA; Zertifikat zum Zeitpunkt der Datierung gültig']
			},
			horodatage: {
				fr: ['horodatage eIDAS', '\u00A0; RFC 3161 sur les octets de <code>&lt;tour&gt;.racine</code>, autorité épinglée <code>sha256 = cd0a3e00a1bdae3a159fa9e3d70f8e664f560fdce16357cbe440ed0b0d88244f</code>'],
				de: ['eIDAS-Zeitstempel', '; RFC 3161 über die Bytes von <code>&lt;tour&gt;.racine</code>, festgelegte Behörde <code>sha256 = cd0a3e00a1bdae3a159fa9e3d70f8e664f560fdce16357cbe440ed0b0d88244f</code>']
			},
			script: { fr: ['script'], de: ['Skript'] }
		}
	},
	preuve: {
		description: {
			fr: "Ce que prouve un reçu de Témoin public, ce qu'il ne prouve pas, les textes applicables, et comment le vérifier sans ce site.",
			de: 'Was ein Beleg von Datumszeuge beweist, was er nicht beweist, die anwendbaren Rechtstexte, und wie man ihn ohne diese Website prüft.'
		},
		prouve: { fr: 'Ce que prouve un reçu', de: 'Was ein Beleg beweist' },
		existait: {
			fr: 'Le document existait, identique à l’octet près, au plus tard à la date du reçu.',
			de: 'Das Dokument existierte, Byte für Byte identisch, spätestens am Tag des Belegs.'
		},
		lien: { fr: `Pour un lien${NBSP}: ce fichier était servi à cette adresse à cet instant.`, de: 'Bei einem Link: Diese Datei wurde in diesem Moment unter dieser Adresse ausgeliefert.' },
		ancrage: { fr: 'Chaque jour, la date est ancrée dans Bitcoin.', de: 'Jeden Tag wird das Datum in Bitcoin verankert.' },
		ancrageQualifie: {
			fr: (j) => `Chaque jour, la date est ancrée dans Bitcoin et horodatée par un prestataire de la liste de confiance européenne (eIDAS), depuis le ${j}.`,
			de: (j) => `Jeden Tag wird das Datum in Bitcoin verankert und seit dem ${j} von einem Anbieter der europäischen Vertrauensliste (eIDAS) mit einem Zeitstempel versehen.`
		},
		neProuvePas: { fr: 'Ce qu’il ne prouve pas', de: 'Was er nicht beweist' },
		limites: {
			fr: ['Qui est l’auteur du document.', 'Que son contenu est exact.', 'Qu’il n’existait pas avant.', `L’apparence d’une page à l’écran${NBSP}: seul le fichier lu est daté.`],
			de: ['Wer der Urheber des Dokuments ist.', 'Dass sein Inhalt richtig ist.', 'Dass es nicht schon früher existiert hat.', 'Das Aussehen einer Seite am Bildschirm: Nur die gelesene Datei wird datiert.']
		},
		textes: { fr: 'Textes', de: 'Rechtstexte' },
		lois: {
			fr: [
				`<a href="https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070721">Code civil, article 1358</a>${NBSP}: hors les cas où la loi en dispose autrement, la preuve peut être apportée par tout moyen.`,
				`<a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32014R0910">Règlement eIDAS, article 41</a>${NBSP}: un horodatage électronique ne peut être écarté comme preuve au seul motif qu’il est électronique.`
			],
			de: [
				'<a href="https://www.gesetze-im-internet.de/zpo/__286.html">§ 286 ZPO</a>: Das Gericht entscheidet nach freier Überzeugung, ob eine tatsächliche Behauptung für wahr zu erachten ist.',
				'<a href="https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32014R0910">eIDAS-Verordnung, Artikel 41</a>: Einem elektronischen Zeitstempel darf die Beweiskraft nicht allein deshalb abgesprochen werden, weil er in elektronischer Form vorliegt.'
			]
		},
		// D-201 : ce qui tient quand les signatures d'aujourd'hui deviennent falsifiables.
		dureeTitre: { fr: 'Dans trente ans', de: 'In dreißig Jahren' },
		signeePq: {
			fr: (j, verifier) => `Depuis le ${j}, chaque racine est aussi signée en SLH-DSA (FIPS 205), conçue pour résister à un ordinateur quantique, à la différence de RSA et des courbes elliptiques. La page ${verifier} relit les deux signatures.`,
			de: (j, verifier) => `Seit dem ${j} wird jede Wurzel zusätzlich mit SLH-DSA (FIPS 205) signiert, das anders als RSA und elliptische Kurven einem Quantencomputer standhalten soll. Die Seite ${verifier} liest beide Signaturen.`
		},
		chaineDuree: {
			fr: `Le registre est une chaîne d’empreintes SHA-256, qui résiste à un ordinateur quantique${NBSP}: modifier un tour change toutes les racines suivantes.`,
			de: 'Das Register ist eine Kette von SHA-256-Prüfsummen, die einem Quantencomputer standhält: Wer eine Runde ändert, ändert alle folgenden Wurzeln.'
		},
		bitcoinDuree: {
			fr: `L’ancrage dans Bitcoin ne dépend d’aucune clé${NBSP}: la preuve OpenTimestamps est une suite d’empreintes qui mène à un bloc.`,
			de: 'Die Verankerung in Bitcoin hängt von keinem Schlüssel ab: Der OpenTimestamps-Beweis ist eine Folge von Prüfsummen, die zu einem Block führt.'
		},
		disparait: { fr: 'Si ce site disparaît', de: 'Wenn diese Website verschwindet' },
		suffisent: {
			fr: (documentation) => `Le document et son reçu suffisent${NBSP}: les formules sont publiques (${documentation}). Copies du registre${NBSP}:`,
			de: (documentation) => `Das Dokument und sein Beleg genügen: Die Formeln sind öffentlich (${documentation}). Kopien des Registers:`
		},
		et: { fr: 'et', de: 'und' },
		copies: {
			fr: ['Dépôt Git public', 'Software Heritage', 'Bitcoin, par OpenTimestamps'],
			de: ['Öffentliches Git-Repository', 'Software Heritage', 'Bitcoin, über OpenTimestamps']
		}
	},
	mentions: {
		description: { fr: (marque) => `Éditeur, hébergeur et données conservées par ${marque}.`, de: (marque) => `Anbieter, Hosting und gespeicherte Daten von ${marque}.` },
		sections: {
			fr: [
				['Éditeur', `<a href="https://florianmousseau.com">Florian Mousseau</a>, directeur de la publication. Contact${NBSP}: <a href="mailto:contact@florianmousseau.com">contact@florianmousseau.com</a>`],
				['Hébergeur', 'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis.'],
				[
					'Données',
					`Aucun document n’est reçu ni conservé, seulement son empreinte. Le libellé et l’adresse d’un dépôt restent dans le reçu. L’adresse IP d’un déposant n’est jamais écrite${NBSP}: seul son haché salé du jour sert au plafond, et le sel est effacé le lendemain. Une adresse électronique laissée sur une liste d’attente ne sert qu’au message d’ouverture de l’offre et s’efface sur demande. Aucun cookie.`
				]
			],
			de: [
				['Anbieter', '<a href="https://florianmousseau.com">Florian Mousseau</a>. Kontakt: <a href="mailto:contact@florianmousseau.com">contact@florianmousseau.com</a>'],
				['Hosting', 'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA.'],
				[
					'Datenschutz',
					'Es wird kein Dokument empfangen oder gespeichert, nur seine Prüfsumme. Name und Adresse einer Datierung bleiben im Beleg. Die IP-Adresse eines Einreichers wird nie gespeichert: nur ihr gesalzener Tageshash dient der Tagesgrenze, und das Salz wird am nächsten Tag gelöscht. Eine auf einer Warteliste hinterlassene E-Mail-Adresse dient nur der Nachricht zur Eröffnung des Angebots und wird auf Anfrage gelöscht. Keine Cookies.'
				]
			]
		},
		code: { fr: 'Code', de: 'Quellcode' }
	},
	version: { fr: (n, jour) => `Version ${n}, ${jour}`, de: (n, jour) => `Version ${n}, ${jour}` },
	pratiques: {
		description: {
			fr: 'Ce que le registre des dates enregistre, comment il ordonne, lie et signe chaque tour, et comment une modification se voit.',
			de: 'Was das Datumsregister einträgt, wie es jede Runde ordnet, verknüpft und signiert, und wie eine Änderung sichtbar wird.'
		},
		sections: {
			fr: [
				['Ce qui est enregistré', 'Des empreintes SHA-256, jamais un document\u00A0: celles des dépôts et celles des documents publics conservés par l’entrepôt. Quatre tours par jour\u00A0; chaque tour publie un relevé et sa racine.'],
				[
					'L’origine',
					'Le relevé nomme la source et la clé de chaque empreinte. Chaque racine porte la signature du journal, un JWS compact ES256 dont la clé est épinglée dans la documentation. Un dépôt porte son reçu\u00A0; le déposant n’y est désigné que par ce qu’il a déclaré.'
				],
				[
					'L’ordre',
					'Un tour porte l’instant de son début. Sa racine est chaînée à celle du tour précédent, le premier suit 64 zéros\u00A0: insérer un tour dans le passé change toutes les racines suivantes. Chaque racine est ancrée dans Bitcoin par OpenTimestamps\u00A0; une fois par jour, une racine reçoit aussi un horodatage RFC 3161 d’un prestataire de la liste de confiance européenne.'
				],
				['Les liens', 'Dans un tour, un arbre de Merkle SHA-256\u00A0: le chemin d’audit d’une empreinte la relie à la racine. Entre les tours, la racine chaînée. Hors du registre, Bitcoin et l’horodatage.'],
				['La finalité', 'Prouver qu’une empreinte était inscrite à une place donnée, et que rien n’a changé depuis. Le registre ne dit rien du contenu ni de son auteur.'],
				[
					'L’intégrité',
					(liens) =>
						`Un relevé publié n’est jamais réécrit\u00A0; seul son <code>.ots</code> grandit. La copie publique s’arrête si un relevé déjà publié change. Le vérificateur de ce site est écrit sans le code du producteur et recalcule chaque racine et la chaîne entière (${liens.documentation}).`
				],
				['La surveillance', '<code>/health</code> publie l’âge du dernier tour et les preuves restées en attente plus de 48\u00A0h.'],
				['La fin du service', 'Relevés, racines, signatures et preuves sont publics\u00A0: le registre reste vérifiable sans ce site.']
			],
			de: [
				['Was eingetragen wird', 'SHA-256-Prüfsummen, nie ein Dokument: die der Datierungen und die der öffentlichen Dokumente, die das Archiv aufbewahrt. Vier Runden pro Tag; jede Runde veröffentlicht ein Protokoll und seine Wurzel.'],
				[
					'Herkunft',
					'Das Protokoll nennt Quelle und Schlüssel jeder Prüfsumme. Jede Wurzel trägt die Signatur des Journals, ein kompaktes JWS ES256, dessen Schlüssel in der Dokumentation festgelegt ist. Eine Datierung trägt ihren Beleg; der Einreicher wird darin nur durch seine eigenen Angaben bezeichnet.'
				],
				[
					'Reihenfolge',
					'Eine Runde trägt den Zeitpunkt ihres Beginns. Ihre Wurzel ist mit der der vorherigen Runde verkettet, die erste folgt auf 64 Nullen: Eine nachträglich eingefügte Runde ändert alle folgenden Wurzeln. Jede Wurzel wird über OpenTimestamps in Bitcoin verankert; einmal pro Tag erhält eine Wurzel zusätzlich einen RFC-3161-Zeitstempel eines Anbieters der europäischen Vertrauensliste.'
				],
				['Verknüpfungen', 'In einer Runde ein Merkle-Baum mit SHA-256: Der Prüfpfad einer Prüfsumme verbindet sie mit der Wurzel. Zwischen den Runden die verkettete Wurzel. Außerhalb des Registers Bitcoin und der Zeitstempel.'],
				['Zweck', 'Beweisen, dass eine Prüfsumme an einer bestimmten Stelle eingetragen war und sich seitdem nichts geändert hat. Über den Inhalt und seinen Urheber sagt das Register nichts.'],
				[
					'Integrität',
					(liens) =>
						`Ein veröffentlichtes Protokoll wird nie neu geschrieben; nur seine <code>.ots</code>-Datei wächst. Die öffentliche Kopie hält an, wenn sich ein bereits veröffentlichtes Protokoll ändert. Der Prüfer dieser Website ist ohne den Code des Erzeugers geschrieben und berechnet jede Wurzel und die ganze Kette neu (${liens.documentation}).`
				],
				['Überwachung', '<code>/health</code> veröffentlicht das Alter der letzten Runde und die Beweise, die länger als 48 h ausstehen.'],
				['Ende des Dienstes', 'Protokolle, Wurzeln, Signaturen und Beweise sind öffentlich: Das Register bleibt ohne diese Website prüfbar.']
			]
		}
	},
	conditions: {
		description: {
			fr: 'Conditions générales du registre des dates, pour qui le consulte et pour qui y dépose une empreinte.',
			de: 'Nutzungsbedingungen des Datumsregisters, für alle, die es lesen oder eine Prüfsumme eintragen.'
		},
		sections: {
			fr: [
				[
					'Le service',
					(liens) =>
						`Un registre public d’empreintes SHA-256, ordonné, chaîné, signé et ancré dans Bitcoin. Aucun document n’y est enregistré. Gratuit, sans compte. Le prestataire est l’éditeur nommé aux ${liens.mentions}.`
				],
				[
					'Ce que le prestataire s’engage à faire',
					'Inscrire chaque empreinte admise au tour qui suit son arrivée\u00A0; ne jamais réécrire un relevé\u00A0; publier relevés, racines et preuves, vérifiables sans lui\u00A0; dire sur ce site toute anomalie de la chaîne\u00A0; garder chaque version de ces conditions.'
				],
				[
					'Ce que le déposant s’engage à faire',
					(liens) =>
						`Déposer une empreinte, jamais un fichier, et aucune donnée personnelle dans le libellé\u00A0; respecter les plafonds de la ${liens.documentation}\u00A0; garder son reçu, seul lien entre son empreinte et ce qu’il a déclaré.`
				],
				[
					'Ce qui se publie',
					'L’empreinte, le jour et la place dans le registre. Le libellé et l’adresse restent dans le reçu, sauf pour un acte lu sur le site officiel d’une commune\u00A0: sa nature, son objet et son adresse paraissent sur la page de la commune.'
				],
				[
					'Les limites',
					'Le registre prouve qu’une empreinte était inscrite à une place. Il ne dit ni qui a produit le fichier, ni qu’il est exact, ni qu’il est licite. Un ancrage peut tarder\u00A0: la preuve le dit. Le prestataire ne répond pas de l’usage fait d’un reçu.'
				],
				[
					'Les données personnelles',
					'Aucune n’est inscrite dans le registre. L’adresse IP d’un déposant n’est jamais écrite\u00A0: seul son haché salé du jour sert au plafond, et le sel est effacé le lendemain.'
				],
				['La fin du service', 'Le registre publié reste vérifiable sans le prestataire.'],
				['La loi et le juge', 'Droit français. En cas de litige, après une tentative de règlement amiable, les tribunaux de Paris.']
			],
			de: [
				[
					'Der Dienst',
					(liens) =>
						`Ein öffentliches Register von SHA-256-Prüfsummen, geordnet, verkettet, signiert und in Bitcoin verankert. Kein Dokument wird darin eingetragen. Kostenlos, ohne Konto. Anbieter ist der im ${liens.mentions} genannte.`
				],
				[
					'Pflichten des Anbieters',
					'Jede angenommene Prüfsumme in der Runde nach ihrem Eingang eintragen; nie ein Protokoll neu schreiben; Protokolle, Wurzeln und Beweise veröffentlichen, prüfbar ohne ihn; jede Unregelmäßigkeit der Kette auf dieser Website nennen; jede Fassung dieser Bedingungen aufbewahren.'
				],
				[
					'Pflichten des Einreichers',
					(liens) =>
						`Eine Prüfsumme einreichen, nie eine Datei, und keine personenbezogenen Daten im Namen; die Grenzen der ${liens.documentation} einhalten; den Beleg aufbewahren, die einzige Verbindung zwischen der Prüfsumme und den eigenen Angaben.`
				],
				['Was veröffentlicht wird', 'Die Prüfsumme, der Tag und die Stelle im Register. Name und Adresse bleiben im Beleg.'],
				[
					'Grenzen',
					'Das Register beweist, dass eine Prüfsumme an einer Stelle eingetragen war. Es sagt weder, wer die Datei erstellt hat, noch dass sie richtig oder rechtmäßig ist. Eine Verankerung kann sich verzögern: Der Beweis sagt es. Der Anbieter haftet nicht für die Verwendung eines Belegs.'
				],
				[
					'Personenbezogene Daten',
					'Im Register werden keine eingetragen. Die IP-Adresse eines Einreichers wird nie gespeichert: nur ihr gesalzener Tageshash dient der Tagesgrenze, und das Salz wird am nächsten Tag gelöscht.'
				],
				['Ende des Dienstes', 'Das veröffentlichte Register bleibt ohne den Anbieter prüfbar.'],
				['Recht und Gerichtsstand', 'Es gilt französisches Recht. Bei Streitigkeiten, nach einem Versuch gütlicher Einigung, die Gerichte in Paris.']
			]
		}
	},
	archivage: {
		description: {
			fr: 'Ce que l’entrepôt archive, comment il le range, le contrôle et le prouve, et ce qui reste à la fin du service.',
			de: 'Was das Archiv aufbewahrt, wie es ablegt, prüft und beweist, und was am Ende des Dienstes bleibt.'
		},
		sections: {
			fr: [
				['Ce qui est archivé', 'L’entrepôt archive des données et des documents publics que leur source publie puis écrase ou retire\u00A0: chaque fichier tel que reçu, avec son adresse, l’instant de sa lecture et son empreinte SHA-256. L’archive est privée\u00A0; ce site n’en publie que les empreintes.'],
				['La collecte', 'Le service lit ses sources en quatre tours par jour, chacune à son rythme, avec un intervalle par hôte\u00A0; un hôte qui refuse est laissé. Le format de chaque fichier est identifié à la réception\u00A0; un écart se note, le fichier est gardé.'],
				['Le stockage', 'L’archive vit en deux copies, sur deux sites distincts, et chaque copie a son instantané quotidien. Le service n’efface rien.'],
				[
					'Les contrôles',
					'À chaque tour, chaque objet attendu doit être présent à sa taille\u00A0; cent empreintes sont recalculées sur la copie, les plus anciennement contrôlées d’abord\u00A0; la preuve d’un objet tiré au hasard est produite et relue. Chaque semaine, un objet tiré au hasard est restauré depuis la seconde copie et comparé à son empreinte. Une anomalie est un événement critique.'
				],
				['La piste d’audit', 'Chaque tour tient un journal d’événements, haché dans l’arbre du tour\u00A0: versements, anomalies, formats, horloge, algorithmes. Chaque consultation, preuve ou recherche, y est consignée.'],
				[
					'La preuve',
					(liens) =>
						`La preuve d’un objet donne son identité, le premier et le dernier tour qui l’ont vu, les chemins d’audit jusqu’aux racines publiées dans le registre, leur ancrage dans Bitcoin. Elle se relit sans le service (${liens.documentation}).`
				],
				['Les algorithmes', 'Le service emploie SHA-256, ES256 et l’horodatage RFC 3161, et les revoit chaque année\u00A0; un algorithme jugé faible ouvre un nouveau profil d’archivage et le recalcul des empreintes.'],
				['Les rôles', (liens) => `Les rôles de confiance sont ceux du registre\u00A0: ${liens.roles}.`],
				['La fin du service', 'L’archive, ses métadonnées, ses journaux et ses preuves sont rendus à l’abonné, ou transférés au prestataire qu’il désigne, dans les trente jours. Les racines publiées restent vérifiables sans ce site.']
			],
			de: [
				['Was aufbewahrt wird', 'Das Archiv bewahrt öffentliche Daten und Dokumente auf, die ihre Quelle veröffentlicht und dann überschreibt oder zurückzieht: jede Datei so, wie sie empfangen wurde, mit ihrer Adresse, dem Zeitpunkt des Lesens und ihrer SHA-256-Prüfsumme. Das Archiv ist privat; diese Website veröffentlicht nur seine Prüfsummen.'],
				['Erfassung', 'Der Dienst liest seine Quellen in vier Runden pro Tag, jede in ihrem Rhythmus, mit einem Abstand pro Host; ein Host, der ablehnt, wird ausgelassen. Das Format jeder Datei wird beim Empfang bestimmt; eine Abweichung wird vermerkt, die Datei bleibt erhalten.'],
				['Speicherung', 'Das Archiv liegt in zwei Kopien an zwei getrennten Standorten, und jede Kopie hat einen täglichen Snapshot. Der Dienst löscht nichts.'],
				[
					'Kontrollen',
					'In jeder Runde muss jedes erwartete Objekt in seiner Größe vorhanden sein; hundert Prüfsummen werden auf der Kopie neu berechnet, die am längsten nicht geprüften zuerst; der Beweis eines zufällig gezogenen Objekts wird erstellt und nachgelesen. Jede Woche wird ein zufällig gezogenes Objekt aus der zweiten Kopie wiederhergestellt und mit seiner Prüfsumme verglichen. Eine Unregelmäßigkeit ist ein kritisches Ereignis.'
				],
				['Prüfpfad', 'Jede Runde führt ein Ereignisjournal, im Baum der Runde gehasht: Einlieferungen, Unregelmäßigkeiten, Formate, Uhr, Algorithmen. Jede Abfrage, ob Beweis oder Suche, wird darin vermerkt.'],
				[
					'Beweis',
					(liens) =>
						`Der Beweis eines Objekts nennt seine Identität, die erste und die letzte Runde, die es gesehen haben, die Prüfpfade bis zu den im Register veröffentlichten Wurzeln, deren Verankerung in Bitcoin. Er ist ohne den Dienst prüfbar (${liens.documentation}).`
				],
				['Algorithmen', 'Der Dienst verwendet SHA-256, ES256 und den RFC-3161-Zeitstempel und überprüft sie jedes Jahr; ein als schwach beurteilter Algorithmus eröffnet ein neues Archivprofil und die Neuberechnung der Prüfsummen.'],
				['Rollen', (liens) => `Die Vertrauensrollen sind die des Registers: ${liens.roles}.`],
				['Ende des Dienstes', 'Archiv, Metadaten, Journale und Beweise werden innerhalb von dreißig Tagen dem Abonnenten zurückgegeben oder an den von ihm benannten Anbieter übertragen. Die veröffentlichten Wurzeln bleiben ohne diese Website prüfbar.']
			]
		}
	},
	conditionsArchivage: {
		description: {
			fr: 'Conditions générales du service d’archivage de l’entrepôt, pour l’abonné qui lui confie ses sources.',
			de: 'Bedingungen des Archivdienstes, für den Abonnenten, der ihm seine Quellen anvertraut.'
		},
		sections: {
			fr: [
				[
					'Le service',
					(liens) =>
						`Archiver pour l’abonné les données et documents publics de sources déclarées, en garder les octets d’origine avec leur provenance et leur empreinte, en prouver l’existence et l’intégrité, et les lui rendre avec leur preuve. Le prestataire est l’éditeur nommé aux ${liens.mentions}.`
				],
				['Ce que le prestataire s’engage à faire', 'Lire chaque source au rythme déclaré\u00A0; garder chaque objet tel que reçu\u00A0; ne jamais republier l’archive\u00A0; contrôler l’intégrité à chaque tour et dire toute anomalie à l’abonné\u00A0; tenir la piste d’audit et les preuves\u00A0; conserver sans terme\u00A0; garder chaque version de ces conditions.'],
				['Ce que l’abonné s’engage à faire', 'Déclarer ses sources avec leur raison d’entrée et vérifier que leurs conditions permettent la conservation\u00A0; ne pas republier ce qui ne peut l’être\u00A0; demander toute suppression par écrit, avec son motif.'],
				['Les limites', 'Une source peut cesser d’être lisible\u00A0: le manifeste du tour le dit. Le prestataire ne répond pas de l’usage fait de ce que l’abonné relit.'],
				['La confidentialité', 'L’archive est privée et ses accès sont ceux du prestataire. Un document qui nomme des personnes n’est jamais diffusé\u00A0; le RGPD s’applique à sa conservation. Les preuves publiques ne portent que des empreintes.'],
				['La restitution et le transfert', 'Sur demande, ou à la fin du service, le prestataire rend tous les objets, leurs métadonnées, manifestes, relevés, preuves et journaux, dans les trente jours, par un canal chiffré, sans format propriétaire et sans frais\u00A0; il remet une attestation de transfert sur demande.'],
				['La loi et le juge', 'Le droit français s’applique. En cas de litige, après une tentative de règlement amiable, les tribunaux de Paris.']
			],
			de: [
				[
					'Der Dienst',
					(liens) =>
						`Für den Abonnenten öffentliche Daten und Dokumente angemeldeter Quellen archivieren, ihre ursprünglichen Bytes mit Herkunft und Prüfsumme aufbewahren, ihre Existenz und Integrität beweisen und sie ihm mit ihrem Beweis zurückgeben. Anbieter ist der im ${liens.mentions} genannte.`
				],
				['Pflichten des Anbieters', 'Jede Quelle im angemeldeten Rhythmus lesen; jedes Objekt so aufbewahren, wie es empfangen wurde; das Archiv nie wieder veröffentlichen; die Integrität in jeder Runde prüfen und jede Unregelmäßigkeit dem Abonnenten mitteilen; Prüfpfad und Beweise führen; ohne Frist aufbewahren; jede Fassung dieser Bedingungen aufbewahren.'],
				['Pflichten des Abonnenten', 'Seine Quellen mit ihrem Aufnahmegrund anmelden und prüfen, dass ihre Bedingungen die Aufbewahrung erlauben; nichts wieder veröffentlichen, was nicht veröffentlicht werden darf; jede Löschung schriftlich und mit Begründung verlangen.'],
				['Grenzen', 'Eine Quelle kann unlesbar werden: Das Manifest der Runde sagt es. Der Anbieter haftet nicht für die Verwendung dessen, was der Abonnent nachliest.'],
				['Vertraulichkeit', 'Das Archiv ist privat, Zugriff hat nur der Anbieter. Ein Dokument, das Personen nennt, wird nie verbreitet; für seine Aufbewahrung gilt die DSGVO. Die öffentlichen Beweise tragen nur Prüfsummen.'],
				['Rückgabe und Übertragung', 'Auf Verlangen oder am Ende des Dienstes gibt der Anbieter alle Objekte zurück, ihre Metadaten, Manifeste, Protokolle, Beweise und Journale, innerhalb von dreißig Tagen, über einen verschlüsselten Kanal, ohne proprietäres Format und kostenlos; eine Übertragungsbescheinigung gibt es auf Verlangen.'],
				['Recht und Gerichtsstand', 'Es gilt französisches Recht. Bei Streitigkeiten, nach einem Versuch gütlicher Einigung, die Gerichte in Paris.']
			]
		}
	},
	roles: {
		description: {
			fr: 'Les rôles de confiance du registre des dates, ce que chacun fait, et les formations suivies.',
			de: 'Die Vertrauensrollen des Datumsregisters, was jede tut, und die absolvierten Schulungen.'
		},
		colonnes: { fr: ['Rôle', 'Ce qu’il fait', 'Garde-fou'], de: ['Rolle', 'Aufgabe', 'Absicherung'] },
		liste: {
			fr: [
				['Direction', 'approuve les pratiques et les conditions\u00A0; décide une fin de service', 'décision écrite et datée'],
				['Sécurité', 'tient les accès, les clés et les incidents', 'aucune clé dans un dépôt de code'],
				['Exploitation', 'fait tourner le registre et ce site', 'tout changement relu et contrôlé avant sa mise en ligne'],
				['Audit interne', 'relit les journaux et les écarts', 'relecture distincte de l’écriture']
			],
			de: [
				['Leitung', 'genehmigt Praktiken und Bedingungen; entscheidet über ein Ende des Dienstes', 'schriftliche, datierte Entscheidung'],
				['Sicherheit', 'verwaltet Zugänge, Schlüssel und Vorfälle', 'kein Schlüssel in einem Code-Repository'],
				['Betrieb', 'betreibt das Register und diese Website', 'jede Änderung vor der Inbetriebnahme geprüft'],
				['Interne Prüfung', 'prüft Protokolle und Abweichungen', 'Prüfung getrennt vom Schreiben']
			]
		},
		titulaire: {
			fr: (mentions, jour) => `Les quatre rôles sont tenus par l’éditeur nommé aux ${mentions}, depuis le ${jour}.`,
			de: (mentions, jour) => `Alle vier Rollen hat der im ${mentions} genannte Anbieter inne, seit dem ${jour}.`
		},
		formations: { fr: 'Aucune formation enregistrée', de: 'Keine Schulung eingetragen' }
	},
	llms: {
		fr: `# Témoin public

> Service gratuit, sans compte, qui prouve qu'un document existait à une date sans modification. Seule l'empreinte SHA-256 du document est publiée, jamais le document. Le registre est public, chaîné et ancré dans Bitcoin par OpenTimestamps.

- Dater un document : https://temoinpublic.fr/deposer (empreinte calculée dans le navigateur, ou adresse publique lue par le service ; un lien sur le site officiel d’une commune propose d’en faire un acte)
- Dater la mise en ligne d’un acte de collectivité (délibération, arrêté, décision), lu à son adresse : https://temoinpublic.fr/acte
- Adresse pérenne de chaque acte daté, à citer : https://temoinpublic.fr/actes/<code INSEE>/<jour de la datation>/<nature>-<12 premiers caractères de l’empreinte> (un préfixe d’au moins 8 caractères y renvoie) ; toutes les adresses : https://temoinpublic.fr/sitemap-actes.xml
- Schéma ouvert de cette adresse (segments, résolution, fiche JSON servie avec Accept: application/json, profil local d’ELI) : https://temoinpublic.fr/adresse-des-actes et https://temoinpublic.fr/schema/adresse-des-actes/1.json
- Vérifier un document ou un reçu : https://temoinpublic.fr/verifier
- Registre public des dates : https://temoinpublic.fr/journal
- API et formules de vérification sans le site : https://temoinpublic.fr/documentation
- Code source et miroir du registre : https://github.com/temoinpublic/empreintes
- Valeur de preuve, textes applicables, copies du registre hors du site : https://temoinpublic.fr/preuve
- Serveur MCP (HTTP sans session) pour les agents, outils dater_url, dater_empreinte, chercher_empreinte, lire_recu : https://temoinpublic.fr/mcp
- Description OpenAPI : https://temoinpublic.fr/openapi.json
`,
		de: `# Datumszeuge

> Kostenloser Dienst ohne Konto, der beweist, dass ein Dokument an einem bestimmten Tag unverändert existiert hat. Nur die SHA-256-Prüfsumme des Dokuments wird veröffentlicht, nie das Dokument. Das Register ist öffentlich, verkettet und über OpenTimestamps in Bitcoin verankert.

- Ein Dokument datieren: https://datumszeuge.de/datieren (Prüfsumme im Browser berechnet, oder öffentliche Adresse, die der Dienst selbst liest)
- Ein Dokument oder einen Beleg prüfen: https://datumszeuge.de/pruefen
- Öffentliches Datumsregister: https://datumszeuge.de/register
- API und Formeln zur Prüfung ohne die Website: https://datumszeuge.de/dokumentation
- Quellcode und Spiegel des Registers: https://github.com/temoinpublic/empreintes
- Beweiswert, anwendbare Rechtstexte, Kopien des Registers außerhalb der Website: https://datumszeuge.de/beweiswert
- MCP-Server (HTTP ohne Sitzung) für Agenten, Werkzeuge dater_url, dater_empreinte, chercher_empreinte, lire_recu: https://datumszeuge.de/mcp
- OpenAPI-Beschreibung: https://datumszeuge.de/openapi.json
`
	}
};

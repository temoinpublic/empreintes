# empreintes

Le journal public des empreintes de l'entrepôt. À chaque tour, le SHA-256 de
chaque fichier archivé entre dans un arbre de Merkle. Sa racine est chaînée au
tour précédent et ancrée dans Bitcoin par OpenTimestamps. Le journal ne garde
aucun contenu, seulement des empreintes.

Le site est https://temoinpublic.fr (Témoin public). L'ancienne adresse
empreintes.florianmousseau.com redirige ses pages et sert toujours son API.

- `donnees/empreintes/` : le miroir du journal (relevés, racines, preuves
  `.ots`, horodatages `.tsr`, `ancrages.json`), poussé par l'entrepôt.
- `/verifier` vérifie un fichier ou une empreinte, et la chaîne des racines.
- `/memento/timemap/link/<adresse>`, `/memento/timegate/<adresse>` et
  `/memento/<tour>/<adresse>` servent les versions datées des sources témoins
  de l'entrepôt, au protocole Memento (RFC 7089), en empreintes seulement.

```sh
node scripts/verifier.mjs <fichier|sha256>   # servi tel quel, et quand
node scripts/verifier.mjs --chaine           # la chaine de bout en bout
node scripts/verifier.mjs <fichier|sha256> --garder preuve.json   # le dossier de preuve, a garder avec le document
node scripts/verifier.mjs --dossier preuve.json [fichier]          # le relit sans reseau, cles epinglees dans le code
ots verify donnees/empreintes/<tour>.racine.ots   # l'ancrage Bitcoin
openssl ts -verify -data donnees/empreintes/<tour>.racine \n  -in donnees/empreintes/<tour>.racine.tsr -CAfile <autorite.pem> -partial_chain   # l'horodatage eIDAS
```

Le vérificateur (`src/chaine.mjs`, et `src/horodatage.mjs` pour l'horodatage
eIDAS) est écrit à part du code qui produit le journal. Il n'a aucune
dépendance et tourne dans le navigateur comme sous Node.

## Licences

- Le code : [AGPL-3.0-or-later](LICENSE), Florian Mousseau.
- Le vérificateur, `src/chaine.mjs`, `src/dossier.mjs`, `src/horodatage.mjs`, `src/origine.mjs`, `src/confiance.mjs` et `scripts/verifier.mjs` : [MIT](LICENSES/MIT.txt),
  pour qu'un logiciel fermé puisse vérifier le journal sans contrainte.
- Le journal, `donnees/` : [CC0 1.0](donnees/LICENSE), aucun droit réservé sur
  les empreintes, les racines et les preuves. Recopiez-le, chaque copie ajoute
  un ancrage.

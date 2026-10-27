# empreintes

Le journal public des empreintes de l'entrepot : chaque tour, le SHA-256 de
chaque fichier archive, assemble en arbre de Merkle, chaine au tour precedent
et ancre dans Bitcoin par OpenTimestamps. Aucun contenu, seulement des
empreintes.

https://temoinpublic.fr (Temoin public ; l'ancienne adresse
empreintes.florianmousseau.com redirige ses pages, son API reste servie).

- `donnees/empreintes/` : le miroir du journal (releves, racines, preuves
  `.ots`, horodatages `.tsr`, `ancrages.json`), pousse par l'entrepot.
- `/verifier` : un fichier ou une empreinte, et la chaine des racines.
- `/memento/timemap/link/<adresse>`, `/memento/timegate/<adresse>`,
  `/memento/<tour>/<adresse>` : les versions datees des sources temoin de
  l'entrepot, au protocole Memento (RFC 7089), empreintes seulement.

```sh
node scripts/verifier.mjs <fichier|sha256>   # servi tel quel, et quand
node scripts/verifier.mjs --chaine           # la chaine de bout en bout
ots verify donnees/empreintes/<tour>.racine.ots   # l'ancrage Bitcoin
openssl ts -verify -data donnees/empreintes/<tour>.racine \n  -in donnees/empreintes/<tour>.racine.tsr -CAfile <autorite.pem> -partial_chain   # l'horodatage eIDAS
```

Le verificateur (`src/chaine.mjs`, et `src/horodatage.mjs` pour l'horodatage
eIDAS) est ecrit a part du code qui produit le
journal, sans dependance, et tourne dans le navigateur comme sous Node.

## Licences

- Le code : [AGPL-3.0-or-later](LICENSE), Florian Mousseau.
- Le verificateur, `src/chaine.mjs`, `src/horodatage.mjs`, `src/origine.mjs`, `src/confiance.mjs` et `scripts/verifier.mjs` : [MIT](LICENSES/MIT.txt),
  pour qu'un logiciel ferme puisse verifier le journal sans contrainte.
- Le journal, `donnees/` : [CC0 1.0](donnees/LICENSE), aucun droit reserve sur
  les empreintes, les racines et les preuves ; recopiez-le, c'est un ancrage de plus.

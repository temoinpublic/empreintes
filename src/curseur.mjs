// Le curseur d'une liste longue, du plus recent au plus ancien : le jour et la
// place de la derniere ligne montree. Une liste qui s'arrete a son plafond sans
// suite rendait les preuves anciennes introuvables (audit Codex du 2026-11-11).

const FORME = /^(\d{4}-\d{2}-\d{2})\.(\d{1,9})$/;

/** Le curseur `<jour>.<place>` d'une ligne. */
export const curseurDe = (ligne) => `${ligne.jour}.${ligne.place}`;

/** `{ jour, place }` lu dans un curseur, ou null quand il ne se lit pas. */
export function lireCurseur(texte) {
	const m = FORME.exec(String(texte ?? ''));
	return m ? { jour: m[1], place: Number(m[2]) } : null;
}

/** La condition SQL « plus ancien que le curseur » sur `d.jour` et `d.place`, et ses parametres. */
export const avantLeCurseur = (curseur) => (curseur ? { sql: ' AND (d.jour < ? OR (d.jour = ? AND d.place < ?))', args: [curseur.jour, curseur.jour, curseur.place] } : { sql: '', args: [] });

/** Les lignes d'une page lue avec une ligne de plus, et le curseur de la suivante s'il y en a une. */
export function pageDe(lignes, limite) {
	const page = lignes.slice(0, limite);
	return { lignes: page, suivant: lignes.length > limite ? curseurDe(page.at(-1)) : null };
}

/** La condition SQL « plus recent que le curseur », pour une liste lue du plus ancien au plus recent. */
export const apresLeCurseur = (curseur) => (curseur ? { sql: ' AND (d.jour > ? OR (d.jour = ? AND d.place > ?))', args: [curseur.jour, curseur.jour, curseur.place] } : { sql: '', args: [] });

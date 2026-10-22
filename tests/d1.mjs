// Une base de la forme de D1 sur node:sqlite, pour jouer le vrai SQL dans les tests.
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../src/service.mjs';

export function baseDeTest() {
	const sqlite = new DatabaseSync(':memory:');
	for (const sql of SCHEMA) sqlite.exec(sql);
	return {
		sqlite,
		prepare(sql) {
			const instruction = sqlite.prepare(sql);
			let args = [];
			const lie = {
				bind: (...a) => ((args = a), lie),
				first: async () => instruction.get(...args) ?? null,
				all: async () => ({ results: instruction.all(...args) }),
				run: async () => ({ meta: { changes: Number(instruction.run(...args).changes) } }),
				executer: () => ({ results: instruction.all(...args) })
			};
			return lie;
		},
		// Comme D1 : les instructions dans l'ordre, en une transaction, tout ou rien.
		async batch(instructions) {
			sqlite.exec('BEGIN');
			try {
				const resultats = instructions.map((i) => i.executer());
				sqlite.exec('COMMIT');
				return resultats;
			} catch (erreur) {
				sqlite.exec('ROLLBACK');
				throw erreur;
			}
		}
	};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armerLaGardeDArret, scriptDeGarde } from '../src/garde-arret.mjs';

const MODULE = fileURLToPath(new URL('../src/garde-arret.mjs', import.meta.url));

test('le script de garde lit le demarrage du processus, attend, et ne tue que le meme processus', () => {
	const s = scriptDeGarde(4242, 30000);
	assert.match(s, /\/proc\/4242\/stat/);
	assert.match(s, /sleep 30;/);
	assert.match(s, /kill -KILL 4242$/);
	assert.match(s, /\[ "\$\(.*\)" = "\$d" \]/);
	assert.match(scriptDeGarde(1, 10), /sleep 1;/);
});

test('armer la garde lance sh detache, sans tenir le processus', () => {
	const appels = [];
	const faux = { unref: () => appels.push('unref') };
	const garde = armerLaGardeDArret(5000, { pid: 77, lancer: (cmd, args, options) => (appels.push({ cmd, args, options }), faux) });
	assert.equal(garde, faux);
	assert.equal(appels[0].cmd, 'sh');
	assert.deepEqual(appels[0].args.slice(0, 1), ['-c']);
	assert.equal(appels[0].args[1], scriptDeGarde(77, 5000));
	assert.equal(appels[0].options.detached, true);
	assert.equal(appels[1], 'unref');
});

function lancerEnfant(code, env = {}) {
	return new Promise((resoudre) => {
		const debut = Date.now();
		const enfant = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
		let sortie = '';
		enfant.stdout.on('data', (d) => (sortie += d));
		enfant.stderr.on('data', (d) => (sortie += d));
		enfant.on('exit', (codeDeSortie, signal) => resoudre({ codeDeSortie, signal, sortie, duree: Date.now() - debut }));
	});
}

test('un processus dont un thread du pool est coince ne finit pas seul : la garde le tue', { skip: process.platform !== 'linux' }, async () => {
	const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'garde-'));
	const fifo = path.join(dossier, 'fifo');
	execFileSync('mkfifo', [fifo]);
	const code = `import fs from 'node:fs'; import { armerLaGardeDArret } from ${JSON.stringify(MODULE)};
fs.open(${JSON.stringify(fifo)}, 'r', () => {});
setTimeout(() => { armerLaGardeDArret(1000); console.log('fini'); process.exit(0); }, 100);`;
	const r = await lancerEnfant(code, { UV_THREADPOOL_SIZE: '1' });
	fs.rmSync(dossier, { recursive: true, force: true });
	assert.match(r.sortie, /fini/);
	assert.match(r.sortie, /gardeDArret/);
	assert.equal(r.signal, 'SIGKILL');
	assert.ok(r.duree < 10000, `${r.duree} ms`);
});

test('un processus qui finit normalement n est pas touche par la garde', async () => {
	const code = `import { armerLaGardeDArret } from ${JSON.stringify(MODULE)}; armerLaGardeDArret(1000); console.log('fini');`;
	const r = await lancerEnfant(code);
	assert.match(r.sortie, /fini/);
	assert.equal(r.codeDeSortie, 0);
	assert.equal(r.signal, null);
	assert.ok(r.duree < 1000, `${r.duree} ms : la garde a retenu le processus`);
});

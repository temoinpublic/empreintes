// La garde d'arret de la glane (D-178). Node joint les threads de son pool a
// l'arret du processus (`uv_library_shutdown`) : un seul thread coince dans un
// appel bloquant (`getaddrinfo` sous un resolveur muet, `open()` d'une FIFO) et
// le processus ne finit jamais, thread principal en `pthread_join`. Sur le VPS,
// un tour FINI de `glane-actes` resterait alors actif jusqu'au `TimeoutStartSec`
// de 20 h, et le tour suivant ne partirait pas. Une minuterie en JavaScript ne
// suffit pas : le thread principal est deja bloque. La garde est donc un
// processus a part, qui tue le notre s'il est encore la a l'echeance.

import { spawn } from 'node:child_process';

/**
 * Le script de la garde : attend `ms`, puis tue `pid` par SIGKILL s'il vit
 * encore ET que c'est toujours le meme processus (meme instant de demarrage,
 * champ 22 de `/proc/<pid>/stat`, lu apres la parenthese qui ferme le nom).
 */
export function scriptDeGarde(pid, ms) {
	const demarrage = `cut -d')' -f2- /proc/${pid}/stat 2>/dev/null | awk '{print $20}'`;
	const secondes = Math.max(1, Math.ceil(ms / 1000));
	return `d=$(${demarrage}); sleep ${secondes}; [ -n "$d" ] && [ "$(${demarrage})" = "$d" ] && echo '{"gardeDArret":"processus ${pid} toujours la apres ${secondes} s, tue"}' >&2 && kill -KILL ${pid}`;
}

/**
 * Arme la garde : dans `ms`, le processus courant est tue s'il n'a pas fini.
 * A appeler quand le travail est fait et ecrit, juste avant que le processus
 * ne s'arrete de lui-meme. Rend le processus de garde, detache.
 */
export function armerLaGardeDArret(ms, { pid = process.pid, lancer = spawn } = {}) {
	const garde = lancer('sh', ['-c', scriptDeGarde(pid, ms)], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
	garde.unref();
	return garde;
}

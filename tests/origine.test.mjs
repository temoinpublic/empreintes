// La signature du deposant (D-164, REQ-7.5-03) : un JWS JAdES sur l'empreinte
// du document, relu sous la cle de son certificat. Les certificats et les cles
// sont fabriques ici, jetables ; le service ne juge pas l'emetteur, donc la
// signature du certificat lui-meme n'a pas a tenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseDeTest } from './d1.mjs';
import { autoriteDuCertificat, estUnJws, inscriteA, nomLisible, verifierSignatureDuDeposant } from '../src/origine.mjs';
import { element } from '../src/horodatage.mjs';
import { estUnRecu, idDuRecu, lireDemande } from '../src/depot.mjs';
import { deposer } from '../src/service.mjs';

const { subtle } = globalThis.crypto;
const H = createHash('sha256').update('PV du conseil').digest('hex');
const midi = new Date('2026-10-15T12:00:00Z');
const corpsDe = (r) => JSON.parse(r.corps);

const longueur = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const tlv = (etiquette, ...parties) => {
	const corps = Buffer.concat(parties.map((p) => Buffer.from(p)));
	return Buffer.concat([Buffer.from([etiquette, ...longueur(corps.length)]), corps]);
};
const seq = (...p) => tlv(0x30, ...p);
const oid = (h) => tlv(0x06, Buffer.from(h, 'hex'));
const attribut = (o, valeur, etiquette = 0x0c) => tlv(0x31, seq(oid(o), tlv(etiquette, valeur)));
const nom = ({ cn, o }) => seq(...[o && attribut('55040a', Buffer.from(o)), cn && attribut('550403', Buffer.from(cn))].filter(Boolean));
const temps = (d) => tlv(0x18, Buffer.from(`${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`));
const ECDSA_SHA256 = seq(oid('2a8648ce3d040302'));

const ALGORITHMES_X509 = { ES256: seq(oid('2a8648ce3d040302')), ES384: seq(oid('2a8648ce3d040303')), RS256: seq(oid('2a864886f70d01010b'), tlv(0x05)), PS256: seq(oid('2a864886f70d01010a')) };
const entierDer = (octets) => {
	let o = Buffer.from(octets);
	while (o.length > 1 && o[0] === 0 && !(o[1] & 0x80)) o = o.subarray(1);
	return tlv(0x02, o[0] & 0x80 ? Buffer.concat([Buffer.from([0]), o]) : o);
};
/** La signature ECDSA brute de WebCrypto (r||s) dans sa forme X.509, deux entiers DER. */
const ecdsaDer = (brute) => {
	const b = Buffer.from(brute);
	return seq(entierDer(b.subarray(0, b.length / 2)), entierDer(b.subarray(b.length / 2)));
};

/**
 * Un certificat X.509 minimal : version 3, sujet, emetteur, validite, cle,
 * QcCompliance au besoin. Signe pour de vrai quand `par` (une cle et son
 * algorithme) est donne ; sinon sa signature est trois octets quelconques.
 */
async function certificatDe({ spki, sujet, emetteur, debut = new Date('2026-01-01'), fin = new Date('2027-01-01'), qc = true, par = null, ca = null, pathLen = null, usage = null }) {
	const extensions = [
		...(qc ? [seq(oid('2b06010505070103'), tlv(0x04, seq(seq(oid('04008e460101')))))] : []),
		...(ca === null ? [] : [seq(oid('551d13'), tlv(0x01, [0xff]), tlv(0x04, seq(...(ca ? [tlv(0x01, [0xff])] : []), ...(pathLen === null ? [] : [tlv(0x02, [pathLen])]))))]),
		...(usage === null ? [] : [seq(oid('551d0f'), tlv(0x01, [0xff]), tlv(0x04, tlv(0x03, [1, usage])))])
	];
	const algorithme = par ? ALGORITHMES_X509[par.alg] : ECDSA_SHA256;
	const tbs = seq(tlv(0xa0, tlv(0x02, [2])), tlv(0x02, [7]), algorithme, nom(emetteur), seq(temps(debut), temps(fin)), nom(sujet), spki, ...(extensions.length ? [tlv(0xa3, seq(...extensions))] : []));
	let signature = Buffer.from([1, 2, 3]);
	if (par) {
		const brute = await subtle.sign(ALGOS[par.alg].signer, par.cle, tbs);
		signature = par.alg.startsWith('ES') ? ecdsaDer(brute) : Buffer.from(brute);
	}
	return seq(tbs, algorithme, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));
}

const ALGOS = {
	ES256: { generer: { name: 'ECDSA', namedCurve: 'P-256' }, signer: { name: 'ECDSA', hash: 'SHA-256' } },
	ES384: { generer: { name: 'ECDSA', namedCurve: 'P-384' }, signer: { name: 'ECDSA', hash: 'SHA-384' } },
	RS256: { generer: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, signer: { name: 'RSASSA-PKCS1-v1_5' } },
	PS256: { generer: { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, signer: { name: 'RSA-PSS', saltLength: 32 } }
};
const cles = {};
async function signataire(alg, certificat = {}) {
	cles[alg] ??= await subtle.generateKey(ALGOS[alg].generer, true, ['sign', 'verify']);
	const spki = Buffer.from(await subtle.exportKey('spki', cles[alg].publicKey));
	const der = await certificatDe({ spki, sujet: { cn: 'Cachet de la mairie', o: 'Commune de Cravans' }, emetteur: { cn: 'Autorite de test', o: 'Test' }, ...certificat });
	return { cle: cles[alg].privateKey, der };
}

const b64u = (b) => Buffer.from(b).toString('base64url');
/** Un JWS compact du deposant ; `charge` est l'empreinte, jointe sauf `detachee`. */
async function jwsDe({ alg = 'ES256', certificat, entete = {}, charge = H, detachee = false, chaine = [] } = {}) {
	const { cle, der } = await signataire(alg, certificat);
	const h = b64u(JSON.stringify({ alg, x5c: [der, ...chaine].map((c) => Buffer.from(c).toString('base64')), ...entete }));
	const p = b64u(charge);
	const s = await subtle.sign(ALGOS[alg].signer, cle, Buffer.from(`${h}.${p}`));
	return { jws: `${h}.${detachee ? '' : p}.${b64u(s)}`, der };
}

test('une signature ES256, ES384, RS256 ou PS256 sur l empreinte tient, et nomme son certificat', async () => {
	for (const alg of Object.keys(ALGOS)) {
		const { jws, der } = await jwsDe({ alg });
		const v = await verifierSignatureDuDeposant(jws, H, midi.toISOString());
		assert.deepEqual(v.raisons, [], alg);
		assert.deepEqual(v.certificat, {
			empreinte: createHash('sha256').update(der).digest('hex'),
			sujet: 'Cachet de la mairie, Commune de Cravans',
			emetteur: 'Autorite de test, Test',
			jusquau: '2027-01-01T00:00:00.000Z',
			qcCompliance: true
		});
	}
});

test('la charge peut etre detachee, et x5t#S256 comme sigT critique sont compris', async () => {
	const { jws } = await jwsDe({ detachee: true });
	assert.match(jws, /^[^.]+\.\.[^.]+$/);
	assert.ok((await verifierSignatureDuDeposant(jws, H, midi.toISOString())).ok);
	const { der } = await signataire('ES256');
	const x5t = createHash('sha256').update(der).digest('base64url');
	const { jws: complet } = await jwsDe({ entete: { 'x5t#S256': x5t, sigT: '2026-10-15T11:59:00Z', crit: ['sigT'] } });
	assert.ok((await verifierSignatureDuDeposant(complet, H, midi.toISOString())).ok);
	const { jws: sansQc } = await jwsDe({ certificat: { qc: false } });
	assert.equal((await verifierSignatureDuDeposant(sansQc, H, midi.toISOString())).certificat.qcCompliance, false);
});

test('chaque ecart se dit : autre document, octet de signature, algorithme, en-tete critique, x5t, validite', async () => {
	const raisons = async (jws, empreinte = H, instant = midi.toISOString()) => (await verifierSignatureDuDeposant(jws, empreinte, instant)).raisons;
	const { jws } = await jwsDe();
	assert.deepEqual(await raisons(jws, 'b'.repeat(64)), ["la charge utile n'est pas l'empreinte du document"]);
	const [h, p, s] = jws.split('.');
	const octets = Buffer.from(s, 'base64url');
	octets[3] ^= 1;
	assert.deepEqual(await raisons(`${h}.${p}.${octets.toString('base64url')}`), ['la signature ne correspond pas']);
	assert.deepEqual(await raisons((await jwsDe({ detachee: true })).jws, 'b'.repeat(64)), ['la signature ne correspond pas']);
	const entete = JSON.parse(Buffer.from(h, 'base64url'));
	const avec = (modif) => `${b64u(JSON.stringify({ ...entete, ...modif }))}.${p}.${s}`;
	assert.ok((await raisons(avec({ alg: 'HS256' }))).includes('algorithme HS256 non admis'));
	assert.deepEqual(await raisons(avec({ alg: 'ES384' })), ['la signature ne correspond pas'], 'une cle P-256 ne se lit pas en P-384');
	assert.ok((await raisons(avec({ crit: ['b64'], b64: false }))).includes('en-tete critique non compris'));
	assert.ok((await raisons(avec({ crit: ['sigT'] }))).includes('en-tete critique non compris'), 'sigT declare critique mais absent');
	assert.ok((await raisons(avec({ crit: 'sigT' }))).includes('en-tete critique non compris'));
	assert.ok((await raisons(avec({ 'x5t#S256': 'AAAA' }))).includes('x5t#S256 ne designe pas le certificat'));
	assert.ok((await raisons(jws, H, '2027-03-01T00:00:00Z')).includes("le certificat n'est pas valide a l'instant du depot"));
	assert.ok((await raisons(jws, H, '2025-12-31T23:59:59Z')).includes("le certificat n'est pas valide a l'instant du depot"));
});

test('ce qui ne se lit pas est refuse sans lever', async () => {
	const raisons = async (jws, empreinte = H) => (await verifierSignatureDuDeposant(jws, empreinte, midi.toISOString())).raisons;
	const { jws } = await jwsDe();
	const [, p, s] = jws.split('.');
	assert.deepEqual(await raisons('pas.un'), ['ni JWS compact ni CAdES en base64']);
	assert.deepEqual(await raisons(42), ['ni JWS compact ni CAdES en base64']);
	assert.deepEqual(await raisons(jws, 'court'), ['empreinte illisible']);
	assert.deepEqual(await raisons(`${b64u('{')}.${p}.${s}`), ['en-tete illisible']);
	assert.deepEqual(await raisons(`${b64u(JSON.stringify({ alg: 'ES256' }))}.${p}.${s}`), ['certificat absent (x5c)']);
	assert.deepEqual(await raisons(`${b64u(JSON.stringify({ alg: 'ES256', x5c: ['MIIB'] }))}.${p}.${s}`), ['certificat illisible']);
	assert.ok(estUnJws(jws));
	assert.ok(!estUnJws(`${jws}.x`));
	assert.ok(!estUnJws('a'.repeat(32769)));
});

test('le nom lisible prend le nom commun et l organisation, en UTF-8 ou en BMPString, sans doublon', () => {
	const lire = (der) => nomLisible(element(der, 0));
	const bmp = Buffer.from('Mairie', 'utf16le').swap16();
	assert.equal(lire(seq(attribut('550403', bmp, 0x1e))), 'Mairie');
	assert.equal(lire(seq(attribut('550403', Buffer.from('Cravans')), attribut('55040a', Buffer.from('Cravans')))), 'Cravans');
	assert.equal(lire(seq(attribut('550406', Buffer.from('FR'), 0x13))), null);
});

test('un depot signe rend un recu version 4 ; une signature fausse est refusee sans rien inscrire', async () => {
	const db = baseDeTest();
	const { jws } = await jwsDe();
	assert.deepEqual(lireDemande({ sha256: H, signature: 'x' }).erreurs, ['signature : un JWS compact (JAdES) ou une signature CAdES detachee en base64, 32 768 caracteres au plus']);
	const ok = await deposer({ db, corps: { sha256: H, signature: jws }, adresse: '203.0.113.1', maintenant: midi });
	assert.equal(ok.statut, 201);
	const { recu, id, ligne } = corpsDe(ok);
	assert.equal(recu.version, 4);
	assert.deepEqual(Object.keys(recu.signature), ['jws', 'certificat', 'sujet', 'emetteur']);
	assert.equal(recu.signature.jws, jws);
	assert.equal(recu.signature.sujet, 'Cachet de la mairie, Commune de Cravans');
	assert.ok(estUnRecu(recu));
	assert.equal(id, await idDuRecu(recu));
	assert.deepEqual(Object.keys(JSON.parse(ligne)), ['sha256', 'jour', 'place', 'recu'], 'la ligne publique ne change pas');
	const faux = await deposer({ db, corps: { sha256: 'b'.repeat(64), signature: jws }, adresse: '203.0.113.1', maintenant: midi });
	assert.equal(faux.statut, 400);
	assert.deepEqual(corpsDe(faux), { erreur: 'signature refusee', details: ["la charge utile n'est pas l'empreinte du document"] });
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM depot').get().n, 1);
	assert.equal(db.sqlite.prepare('SELECT n FROM compte').get().n, 1, 'un refus ne compte pas dans le plafond');
});

test('avec le temoin, une signature refusee rend la lecture du jour : la bonne passe ensuite', async () => {
	const db = baseDeTest();
	const temoin = async (admise) => ({ url: admise.url, taille: 13, type: 'application/pdf', lu: midi.toISOString(), sha256: H });
	const { jws: autre } = await jwsDe({ charge: 'c'.repeat(64) });
	const refuse = await deposer({ db, corps: { url: 'https://cravans.fr/pv.pdf', signature: autre }, adresse: 'a', maintenant: midi, temoin });
	assert.equal(refuse.statut, 400);
	assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lecture').get().n, 0);
	const { jws } = await jwsDe();
	const accepte = await deposer({ db, corps: { url: 'https://cravans.fr/pv.pdf', signature: jws }, adresse: 'a', maintenant: midi, temoin });
	assert.equal(accepte.statut, 201);
	assert.equal(corpsDe(accepte).recu.version, 4);
	assert.equal(corpsDe(accepte).recu.temoin.url, 'https://cravans.fr/pv.pdf');
});

/*
 * L'autorite : une chaine racine (P-384) -> intermediaire (RSA) -> deposant
 * (P-256), chaque certificat signe pour de vrai par le suivant. Les autorites
 * sont indexees comme dans `/confiance/autorites.json`.
 */
const empreinteDe = (der) => createHash('sha256').update(der).digest('hex');
async function chaineDeTest() {
	const racine = await subtle.generateKey(ALGOS.ES384.generer, true, ['sign', 'verify']);
	const inter = await subtle.generateKey(ALGOS.RS256.generer, true, ['sign', 'verify']);
	const spki = async (k) => Buffer.from(await subtle.exportKey('spki', k.publicKey));
	const derRacine = await certificatDe({ spki: await spki(racine), sujet: { cn: 'Racine de test' }, emetteur: { cn: 'Racine de test' }, qc: false, par: { alg: 'ES384', cle: racine.privateKey } });
	const derInter = await certificatDe({ spki: await spki(inter), sujet: { cn: 'Intermediaire de test' }, emetteur: { cn: 'Racine de test' }, qc: false, ca: true, usage: 0x06, par: { alg: 'ES384', cle: racine.privateKey } });
	return { racine, inter, derRacine, derInter, spki };
}

test("un maillon qui n'est pas une autorite de certification ne mene a personne", async () => {
	const { racine, inter, derRacine, derInter, spki } = await chaineDeTest();
	const tout = { [empreinteDe(derRacine)]: { pays: 'FR', nom: 'Racine de test', usages: [] } };
	const maillon = async (options) => {
		const cle = await subtle.generateKey(ALGOS.ES256.generer, true, ['sign', 'verify']);
		const der = await certificatDe({ spki: await spki(cle), sujet: { cn: 'Maillon' }, emetteur: { cn: 'Intermediaire de test' }, qc: false, par: { alg: 'RS256', cle: inter.privateKey }, ...options });
		return { cle, der };
	};
	const fauxSous = async (parent) => {
		const { jws } = await jwsDe({ certificat: { sujet: { cn: 'Identite fabriquee' }, par: { alg: 'ES256', cle: parent.cle.privateKey } }, chaine: [parent.der, derInter, derRacine] });
		return JSON.parse(Buffer.from(jws.split('.')[0], 'base64url')).x5c;
	};
	// Le certificat d'un particulier, emis pour de vrai sous la racine, signe une identite fabriquee.
	assert.equal(await autoriteDuCertificat(await fauxSous(await maillon({})), tout), null, 'sans basicConstraints');
	assert.equal(await autoriteDuCertificat(await fauxSous(await maillon({ ca: false })), tout), null, 'cA faux');
	assert.equal(await autoriteDuCertificat(await fauxSous(await maillon({ ca: true, usage: 0x80 })), tout), null, 'sans keyCertSign');
	// Une autorite de certification en regle, elle, mene a la racine.
	assert.deepEqual(await autoriteDuCertificat(await fauxSous(await maillon({ ca: true, usage: 0x06 })), tout), { pays: 'FR', nom: 'Racine de test' });
	// pathLenConstraint : l'intermediaire n'admet aucune autorite sous lui.
	const borne = await certificatDe({ spki: await spki(inter), sujet: { cn: 'Intermediaire de test' }, emetteur: { cn: 'Racine de test' }, qc: false, ca: true, pathLen: 0, par: { alg: 'ES384', cle: racine.privateKey } });
	const sous = await maillon({ ca: true });
	const { jws } = await jwsDe({ certificat: { par: { alg: 'ES256', cle: sous.cle.privateKey } }, chaine: [sous.der, borne, derRacine] });
	assert.equal(await autoriteDuCertificat(JSON.parse(Buffer.from(jws.split('.')[0], 'base64url')).x5c, tout), null, 'pathLen 0 et une autorite en dessous');
	const direct = await jwsDe({ certificat: { par: { alg: 'RS256', cle: inter.privateKey } }, chaine: [borne, derRacine] });
	assert.deepEqual(await autoriteDuCertificat(JSON.parse(Buffer.from(direct.jws.split('.')[0], 'base64url')).x5c, tout), { pays: 'FR', nom: 'Racine de test' }, 'pathLen 0 au-dessus du seul deposant');
});

test("l'autorite se trouve en remontant x5c, chaque certificat signe par le suivant", async () => {
	const { inter, derRacine, derInter } = await chaineDeTest();
	const { jws } = await jwsDe({ certificat: { emetteur: { cn: 'Intermediaire de test' }, par: { alg: 'RS256', cle: inter.privateKey } }, chaine: [derInter, derRacine] });
	const x5c = JSON.parse(Buffer.from(jws.split('.')[0], 'base64url')).x5c;
	const autorites = { [empreinteDe(derRacine)]: { pays: 'FR', nom: 'Racine de test', usages: ['cachets'] } };
	assert.deepEqual(await autoriteDuCertificat(x5c, autorites), { pays: 'FR', nom: 'Racine de test' });
	assert.deepEqual(await autoriteDuCertificat(x5c, { [empreinteDe(derInter)]: { pays: 'DE', nom: 'Intermediaire', usages: [] } }), { pays: 'DE', nom: 'Intermediaire' });
	const v = await verifierSignatureDuDeposant(jws, H, midi.toISOString(), autorites);
	assert.ok(v.ok);
	assert.deepEqual(v.certificat.autorite, { pays: 'FR', nom: 'Racine de test' });
	assert.equal(v.certificat.emetteur, 'Intermediaire de test');
	assert.equal((await verifierSignatureDuDeposant(jws, H, midi.toISOString(), {})).certificat.autorite, null);
	assert.ok(!('autorite' in (await verifierSignatureDuDeposant(jws, H, midi.toISOString())).certificat), 'sans registre, rien n est dit');
});

test("une autorite qui n'a pas signe, le certificat du deposant lui-meme ou un maillon illisible ne nomment personne", async () => {
	const { inter, racine, derRacine, derInter } = await chaineDeTest();
	const tout = { [empreinteDe(derRacine)]: { pays: 'FR', nom: 'R' }, [empreinteDe(derInter)]: { pays: 'FR', nom: 'I' } };
	const x5cDe = async (opts) => JSON.parse(Buffer.from((await jwsDe(opts)).jws.split('.')[0], 'base64url')).x5c;
	// le deposant signe par l'intermediaire, mais la chaine saute directement a la racine
	assert.equal(await autoriteDuCertificat(await x5cDe({ certificat: { par: { alg: 'RS256', cle: inter.privateKey } }, chaine: [derRacine] }), tout), null);
	// le certificat du deposant inscrit lui-meme
	const seul = await x5cDe({ certificat: { par: { alg: 'RS256', cle: inter.privateKey } } });
	assert.equal(await autoriteDuCertificat(seul, { [empreinteDe(Buffer.from(seul[0], 'base64'))]: { pays: 'FR', nom: 'X' } }), null);
	// un maillon illisible, une signature RSA-PSS non lue, une signature ECDSA sous une cle RSA
	assert.equal(await autoriteDuCertificat([seul[0], 'MIIB'], tout), null);
	const pss = await subtle.generateKey(ALGOS.PS256.generer, true, ['sign', 'verify']);
	assert.equal(await autoriteDuCertificat(await x5cDe({ certificat: { par: { alg: 'PS256', cle: pss.privateKey } }, chaine: [derInter] }), tout), null);
	assert.equal(await autoriteDuCertificat(await x5cDe({ certificat: { par: { alg: 'ES384', cle: racine.privateKey } }, chaine: [derInter] }), tout), null);
	assert.equal(await autoriteDuCertificat(await x5cDe({ chaine: [derRacine] }), tout), null, 'une signature ECDSA qui n est pas du DER');
	assert.equal(await autoriteDuCertificat(null, tout), null);
	assert.equal(await autoriteDuCertificat([seul[0], '%%%%'], tout), null, 'un maillon qui n est pas du base64');
	const { jws: casse } = await jwsDe({ chaine: [Buffer.from('x')] });
	const [h, p, s] = casse.split('.');
	const entete = JSON.parse(Buffer.from(h, 'base64url'));
	const avecMaillon = `${Buffer.from(JSON.stringify({ ...entete, x5c: [entete.x5c[0], '%%%%'] })).toString('base64url')}.${p}.${s}`;
	const v = await verifierSignatureDuDeposant(avecMaillon, H, midi.toISOString(), tout);
	assert.deepEqual([v.raisons, v.certificat.autorite], [['la signature ne correspond pas'], null], 'l en-tete change casse la signature, la chaine illisible ne nomme personne');
	assert.equal(await autoriteDuCertificat(seul, null), null);
});

test("l'autorite se juge a l'emission du certificat qu'elle a signe, pas au jour du depot", async () => {
	const { inter, derRacine, derInter } = await chaineDeTest();
	const { jws } = await jwsDe({ certificat: { par: { alg: 'RS256', cle: inter.privateKey } }, chaine: [derInter, derRacine] });
	const x5c = JSON.parse(Buffer.from(jws.split('.')[0], 'base64url')).x5c;
	const avec = (periodes) => ({ [empreinteDe(derInter)]: { pays: 'FR', nom: 'Intermediaire', usages: [], periodes } });
	// le certificat du deposant est emis le 2026-01-01
	const nomme = { pays: 'FR', nom: 'Intermediaire' };
	assert.deepEqual(await autoriteDuCertificat(x5c, avec([['2016-07-01T00:00:00Z', null]])), nomme, 'en vigueur depuis');
	assert.deepEqual(await autoriteDuCertificat(x5c, avec([['2020-01-01T00:00:00Z', '2026-06-01T00:00:00Z']])), nomme, 'retiree apres l emission : le certificat reste emis par une autorite inscrite');
	assert.deepEqual(await autoriteDuCertificat(x5c, avec([[null, null]])), nomme, 'une periode sans debut');
	assert.equal(await autoriteDuCertificat(x5c, avec([['2016-07-01T00:00:00Z', '2025-12-31T00:00:00Z']])), null, 'retiree avant l emission');
	assert.equal(await autoriteDuCertificat(x5c, avec([['2026-02-01T00:00:00Z', null]])), null, 'inscrite apres l emission');
	assert.equal(await autoriteDuCertificat(x5c, avec([])), null, 'jamais inscrite');
	const v = await verifierSignatureDuDeposant(jws, H, midi.toISOString(), avec([['2016-07-01T00:00:00Z', '2025-12-31T00:00:00Z']]));
	assert.deepEqual([v.ok, v.certificat.autorite], [true, null], 'la signature reste valide, l autorite n est pas nommee');
	assert.equal(inscriteA({ pays: 'FR', nom: 'X' }, 0), true, 'un registre sans periodes vaut inscrite');
});

test("un depot signe nomme l'autorite dans son recu ; un registre absent ou illisible n'empeche pas le depot", async () => {
	const { inter, derRacine, derInter } = await chaineDeTest();
	const { jws } = await jwsDe({ certificat: { par: { alg: 'RS256', cle: inter.privateKey } }, chaine: [derInter, derRacine] });
	const autorites = async () => ({ autorites: { [empreinteDe(derRacine)]: { pays: 'FR', nom: 'Racine de test', usages: [] } } });
	const ok = await deposer({ db: baseDeTest(), corps: { sha256: H, signature: jws }, adresse: 'a', maintenant: midi, autorites });
	assert.deepEqual(corpsDe(ok).recu.signature.autorite, { pays: 'FR', nom: 'Racine de test' });
	const sans = await deposer({ db: baseDeTest(), corps: { sha256: H, signature: jws }, adresse: 'a', maintenant: midi, autorites: async () => { throw new Error('absent'); } });
	assert.equal(sans.statut, 201);
	assert.ok(!('autorite' in corpsDe(sans).recu.signature));
});

// Lu avant l'affichage : arrive par un lien de preuve, la page cache le formulaire
// des le premier rendu, sans le montrer puis le retirer. La regle est celle de
// verifier.js, mot pour mot : le premier `empreinte`, decode, et 64 chiffres hexadecimaux.
if (/^[0-9a-f]{64}$/i.test(new URLSearchParams(location.search).get('empreinte') ?? '')) document.documentElement.classList.add('par-lien');

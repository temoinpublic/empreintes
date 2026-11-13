// Lu avant l'affichage : arrive par un lien de preuve, la page cache le formulaire
// des le premier rendu, sans le montrer puis le retirer.
if (/[?&]empreinte=[0-9a-f]{64}(&|$)/i.test(location.search)) document.documentElement.classList.add('par-lien');

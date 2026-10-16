/* DocuPrêt — encarts partenaires (liens d'affiliation).
 *
 * Pour activer un partenaire : collez son lien d'affiliation entre les guillemets ci-dessous.
 * Tant qu'un lien est vide, ses encarts restent invisibles partout sur le site.
 *
 * Dans les pages : <div class="partenaire" data-partenaire="qonto" hidden></div>
 *   - sans data-quand            → affiché dès que le lien existe
 *   - data-quand="telechargement" → affiché après un téléchargement (évènement « docupret-partenaire »)
 *   - data-quand="condition"      → affiché quand la page appelle DocuPartenaires.condition('qonto', true)
 *   - data-titre / data-texte / data-bouton → remplacent les textes par défaut
 * Chaque clic est compté dans les statistiques (clic_qonto, clic_sumup…).
 */
(function(){
  'use strict';
  const LIENS = {
    qonto: '',
    indy: '',
    sumup: '',
    vistaprint: ''
  };

  const TEXTES = {
    qonto: {titre: 'Un compte pro pour recevoir vos virements', texte: "Qonto : compte professionnel en ligne, ouvert en quelques minutes depuis votre téléphone.", bouton: 'Découvrir Qonto'},
    sumup: {titre: 'Faites payer vos clients par carte', texte: 'Un petit terminal SumUp pour encaisser la carte bancaire, sans abonnement.', bouton: 'Découvrir SumUp'},
    indy: {titre: 'Facturation et comptabilité au même endroit', texte: 'Indy : logiciel pour indépendants qui suit vos factures, vos dépenses et votre comptabilité.', bouton: 'Découvrir Indy'},
    vistaprint: {titre: 'Faites-le imprimer par un pro', texte: "Envoyez votre fichier « Pour un imprimeur » à Vistaprint et recevez vos impressions chez vous.", bouton: 'Imprimer chez Vistaprint'}
  };

  const lien = cle => { const l = LIENS[cle] || ''; return /^https:\/\//.test(l) ? l : ''; };
  const etat = {};   // cle → conditions remplies / téléchargement fait

  const css = `
  .partenaire{margin:16px 0}
  .partenaire .pt-boite{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;background:#F6F9FE;border:1px solid #DCE6F6;border-radius:14px;padding:14px 16px}
  .partenaire .pt-txt{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:3px}
  .partenaire .pt-txt b{font-size:.95rem;color:#1E2A42;line-height:1.3}
  .partenaire .pt-txt span{font-size:.85rem;color:#5B6678;line-height:1.4}
  .partenaire .pt-btn{flex:0 0 auto;background:#4A7BD0;color:#fff;text-decoration:none;font-weight:600;font-size:.9rem;border-radius:50px;padding:10px 18px;white-space:nowrap}
  .partenaire .pt-btn:hover{background:#3964B4}
  .partenaire .pt-mention{flex:1 1 100%;font-size:.72rem;color:#8A94A6}
  @media (max-width:420px){.partenaire .pt-btn{flex:1 1 100%;text-align:center}}`;

  function remplir(el){
    if (el.dataset.ptPret) return;
    const cle = el.dataset.partenaire, t = TEXTES[cle] || {}, d = el.dataset;
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    el.innerHTML = `<div class="pt-boite"><div class="pt-txt"><b>${esc(d.titre || t.titre)}</b><span>${esc(d.texte || t.texte)}</span></div>`
      + `<a class="pt-btn" href="${esc(lien(cle))}" target="_blank" rel="sponsored noopener">${esc(d.bouton || t.bouton)}</a>`
      + `<small class="pt-mention">Lien partenaire : DocuPrêt peut recevoir une commission, sans aucun surcoût pour vous.</small></div>`;
    el.dataset.ptPret = '1';
  }

  function maj(){
    document.querySelectorAll('[data-partenaire]').forEach(el => {
      const cle = el.dataset.partenaire, q = el.dataset.quand || '';
      const visible = !!lien(cle) && (!q || (q === 'telechargement' && etat[cle + ':telechargement']) || (q === 'condition' && etat[cle + ':condition']));
      if (visible) remplir(el);
      el.hidden = !visible;
    });
  }

  function demarrer(){
    if (Object.values(LIENS).some(l => l)){
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    }
    maj();
  }

  // Comptage des clics
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('.partenaire .pt-btn');
    if (!a) return;
    const cle = a.closest('[data-partenaire]').dataset.partenaire;
    try{ window.DocuStats && DocuStats.evenement('clic_' + cle); }catch(err){}
  }, true);

  window.addEventListener('docupret-partenaire', e => {
    const cle = e.detail && e.detail.cle; if (!cle) return;
    etat[cle + ':telechargement'] = true; maj();
  });

  window.DocuPartenaires = {
    actif: cle => !!lien(cle),
    condition(cle, oui){ etat[cle + ':condition'] = !!oui; maj(); },
    maj
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

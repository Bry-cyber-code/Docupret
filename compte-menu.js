/* Bouton « retour » du téléphone : il ferme d'abord le menu, « Mon compte » ou la fenêtre ouverte,
 * au lieu de quitter le site. Chaque ouverture ajoute une étape dans l'historique du navigateur. */
(function(){
  'use strict';
  if (!window.history || !history.pushState || !window.MutationObserver) return;
  const clic = el => el && el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
  const COUCHES = [
    {trouver: () => [...document.querySelectorAll('#tiroir.ouvert')], fermer: () => clic(document.getElementById('tiroir-fond'))},
    {trouver: () => [...document.querySelectorAll('.cm.ouvert')], fermer: () => clic(document.querySelector('.cm-fond'))},
    {trouver: () => [...document.querySelectorAll('body > .env-fond, body > .loupe, body > .fond, body > .cp-fond, body > .ia-fond, body > .tf-fond, body > .ph-fond, body > .ph-zoom, body > .pz-fond')], fermer: el => clic(el)}
  ];
  let pile = [], aIgnorer = 0, navigation = null;
  const ouvertes = () => { const r = []; COUCHES.forEach(c => c.trouver().forEach(el => { if (!el.hidden) r.push({el, fermer: () => c.fermer(el)}); })); return r; };
  function verifier(){
    if (navigation) return;
    const o = ouvertes(), els = o.map(x => x.el);
    const fermees = pile.filter(x => !els.includes(x.el)).length;
    const nouvelles = o.filter(x => !pile.some(p => p.el === x.el));
    pile = pile.filter(x => els.includes(x.el)).concat(nouvelles);
    const net = nouvelles.length - fermees;
    if (net > 0) for (let i = 0; i < net; i++) history.pushState({docuCouche: true}, '');
    else if (net < 0){ aIgnorer++; history.go(net); setTimeout(() => { aIgnorer = 0; }, 1500); }   // fermée avec la croix, le fond ou Échap
  }
  window.addEventListener('popstate', e => {
    if (navigation){
      e.stopImmediatePropagation();
      // (navigation remise à zéro avant : un lien vers la même page avec un « # » relance aussitôt cet évènement)
      const n = navigation; navigation = null; n.fermer.forEach(f => f());
      location.href = n.url;
      setTimeout(verifier, 0);
      return;
    }
    if (aIgnorer){ aIgnorer--; e.stopImmediatePropagation(); return; }
    if (!pile.length) return;
    e.stopImmediatePropagation();
    pile.pop().fermer();
  }, true);
  // Lien touché dans le menu : on retire d'abord les étapes ajoutées, puis on y va
  document.addEventListener('click', e => {
    if (!pile.length || navigation || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.getAttribute('href') === '#' || !pile.some(p => p.el.contains(a)) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault(); e.stopPropagation();
    navigation = {url: url.href, fermer: pile.map(p => p.fermer)};
    const n = pile.length; pile = [];
    history.go(-n);
    // Sécurité : si le navigateur ne revient pas en arrière, on suit le lien directement (sinon le clic ne ferait rien)
    const cible = navigation;
    setTimeout(() => { if (navigation === cible){ navigation = null; cible.fermer.forEach(f => { try{ f(); }catch(err){} }); location.href = cible.url; } }, 700);
  }, true);
  const lancer = () => {
    new MutationObserver(verifier).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden']});
    verifier();
  };
  if (document.body) lancer(); else document.addEventListener('DOMContentLoaded', lancer);
})();

/* DocuPrêt — menu « Mon compte » qui s'ouvre sur la droite (toutes les pages) */
(function(){
  'use strict';
  const lien = document.querySelector('.compte-lien');
  if (!lien) return;

  const CSS = `
  .cm-fond{position:fixed;inset:0;background:rgba(20,28,45,.45);z-index:52}
  .compte-lien .compte-nom{max-width:96px;overflow:hidden;white-space:normal;text-align:center;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  @media (min-width:561px){.compte-lien .compte-nom{max-width:210px;display:block;white-space:nowrap;text-overflow:ellipsis}}
  .pz-fond{position:fixed;inset:0;z-index:80;background:rgba(20,28,45,.55);display:flex;align-items:center;justify-content:center;padding:16px}
  .pz{background:var(--blanc,#fff);width:100%;max-width:420px;border-radius:20px;padding:20px 18px 16px;display:grid;gap:10px;box-shadow:0 20px 50px rgba(0,0,0,.25);animation:pzv .25s ease}
  @keyframes pzv{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
  .pz-ico{width:48px;height:48px;border-radius:50%;background:var(--bleu-clair,#EAF1FD);display:grid;place-items:center;font-size:1.5rem;justify-self:center}
  .pz h2{font-size:1.12rem;text-align:center;margin:0}
  .pz p{font-size:.9rem;color:#3B4558;text-align:center;line-height:1.5;margin:0}
  .cm-connexion2{background:none!important;color:var(--bleu,#4A7BD0)!important;border:1.5px solid var(--bleu,#4A7BD0);margin-top:8px!important;padding:10px!important}
  .pz input{font:inherit;font-size:16px;padding:12px;border:1.5px solid var(--bord,#e2e8f0);border-radius:12px;width:100%;background:#fff;color:var(--texte,#123);outline:none}
  .pz input:focus{border-color:var(--bleu,#4A7BD0)}
  .pz small{font-size:.78rem;color:var(--gris,#667);text-align:center}
  .pz-ok{border:0;border-radius:12px;background:var(--bleu,#4A7BD0);color:#fff;font:inherit;font-weight:750;font-size:.98rem;padding:13px;cursor:pointer}
  .pz-bas{display:flex;justify-content:space-between;gap:10px}
  .pz-choix{display:grid;gap:8px}
  .pz-choix button{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;text-align:left;border:1.5px solid var(--bord,#e2e8f0);background:var(--blanc,#fff);border-radius:14px;padding:10px 12px;font:inherit;color:var(--texte,#123);cursor:pointer}
  .pz-choix button:hover{border-color:var(--bleu,#4A7BD0);background:var(--bleu-clair,#EAF1FD)}
  .pz-choix span{grid-row:1 / 3;font-size:1.4rem}
  .pz-choix b{font-size:.94rem}
  .pz-choix small{font-size:.76rem;color:var(--gris,#667);text-align:left}
  .pz-bas button{border:0;background:none;font:inherit;font-size:.86rem;color:var(--gris,#667);text-decoration:underline;padding:6px 2px;cursor:pointer}
  .cm{position:fixed;top:0;right:0;bottom:0;width:min(300px,84vw);background:var(--blanc,#fff);z-index:53;transform:translateX(102%);transition:transform .25s ease;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,.12);padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column}
  .cm.ouvert{transform:none}
  .cm-tete{display:flex;align-items:center;justify-content:space-between;height:60px;padding:env(safe-area-inset-top,0px) 10px 0 16px;border-bottom:1px solid var(--bord,#e2e8f0);flex-shrink:0}
  .cm-tete b{font-size:1.05rem}
  .cm-fermer{width:36px;height:36px;border:0;background:none;border-radius:50%;font-size:1.6rem;line-height:1;color:var(--gris,#667);cursor:pointer}
  .cm-fermer:hover{background:var(--fond,#f4f6fa)}
  .cm-qui{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid var(--bord,#e2e8f0)}
  .cm-avatar{align-self:center;aspect-ratio:1;width:44px;height:44px;border-radius:50%;background:var(--bleu,#4A7BD0);color:#fff;display:grid;place-items:center;font-weight:800;font-size:1.15rem;flex-shrink:0}
  .cm-avatar.vide{background:var(--bleu-clair,#EAF1FD);color:var(--bleu,#4A7BD0)}
  .cm-avatar svg{width:26px;height:26px}
  .cm-qui small{display:block;font-size:.76rem;color:var(--gris,#667)}
  .cm-qui b{display:block;font-size:.92rem;word-break:break-all;line-height:1.3}
  .cm-connexion{display:block;margin:12px 16px 4px;background:var(--bleu,#4A7BD0);color:#fff;text-align:center;border-radius:12px;padding:12px;font-weight:700;font-size:.95rem}
  .cm-lien{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--bord,#e2e8f0);color:var(--texte,#1E2A42)}
  .cm-lien:hover{background:var(--fond,#f4f6fa);color:var(--bleu,#4A7BD0)}
  .cm-ico{width:38px;height:38px;border-radius:11px;background:var(--bleu-clair,#EAF1FD);color:var(--bleu,#4A7BD0);display:grid;place-items:center;flex-shrink:0}
  .cm-ico svg{width:20px;height:20px}
  .cm-txt{flex:1;min-width:0;display:grid;gap:1px}
  .cm-txt b{font-size:1rem;font-weight:700}
  .cm-txt span{font-size:.78rem;color:var(--gris,#667)}
  .cm-raccourcis{border-bottom:1px solid var(--bord,#e2e8f0)}
  .cm-epingles{border-bottom:1px solid var(--bord,#e2e8f0);padding:2px 0 6px}
  .cm-epingles small{display:block;font-size:.7rem;font-weight:700;color:var(--gris,#667);text-transform:uppercase;letter-spacing:.05em;padding:8px 16px 2px 68px}
  .cm-epingles a{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 24px;color:var(--texte,#123);font-size:.92rem;font-weight:650}
  .cm-epingles a:hover{background:var(--fond,#f4f6fa);color:var(--bleu,#4A7BD0)}
  .cm-epingles i{font-style:normal;width:30px;height:30px;border-radius:9px;background:var(--fond,#f4f6fa);display:grid;place-items:center;font-size:.95rem;flex-shrink:0;margin-left:10px}
  .cm-lien.cm-sous{border-bottom:1px solid var(--bord,#e2e8f0)}
  .cm-raccourcis .cm-lien.cm-sous:last-child{border-bottom:0}
  .cm-nb.rouge{background:#C23B36}
  .cm-nb{font-size:.74rem;font-weight:700;background:var(--bleu,#4A7BD0);color:#fff;border-radius:50px;padding:2px 8px;flex-shrink:0}
  .cm-note{font-size:.76rem;color:var(--gris,#667);padding:14px 16px;line-height:1.45;margin-top:auto}
  .cm-avatar.logo{background:#fff;border:1px solid var(--bord,#e2e8f0);overflow:hidden}
  .cm-avatar.logo img{max-width:88%;max-height:88%;object-fit:contain}
  .compte-lien img.compte-logo{width:26px;height:26px;border-radius:50%;object-fit:contain;background:#fff;border:1.5px solid var(--bord,#e2e8f0);display:block}
  @media (min-width:561px){.compte-lien img.compte-logo{width:22px;height:22px}}
  @media (prefers-reduced-motion:reduce){.cm{transition:none}}`;

  const sv = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICO2 = {
    factures: sv('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    devis: sv('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h4"/>'),
    impayees: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    brouillons: sv('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>')
  };
  const ICO = {
    clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    param: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    compte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3.2"/><path d="M6.2 18.4c1.3-2.1 3.3-3.2 5.8-3.2s4.5 1.1 5.8 3.2"/></svg>'
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const lire = (k, d) => { try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }catch(e){ return d; } };

  let fond, menu, dernierFocus;
  // Logo de l'entreprise à la place de l'icône (option dans Mon compte → Paramètres)
  const logoAvatar = () => { try{ return localStorage.getItem('docupret_avatar') === '1' && lire('docupret_compte', null) ? ((lire('docufacile_v1', {}) || {}).em || {}).logo || '' : ''; }catch(e){ return ''; } };
  const ICONE = lien.querySelector('svg') ? lien.querySelector('svg').outerHTML : '';
  let styleMis = false;
  function majAvatar(){
    if (!styleMis){ const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styleMis = true; }
    const l = logoAvatar(), actuel = lien.querySelector('svg,img.compte-logo');
    if (l){ const img = document.createElement('img'); img.className = 'compte-logo'; img.alt = ''; img.src = l; if (actuel) actuel.replaceWith(img); else lien.prepend(img); }
    else if (actuel && actuel.tagName === 'IMG'){ const t = document.createElement('span'); t.innerHTML = ICONE; actuel.replaceWith(t.firstChild); }
  }
  // Nom choisi par la personne (Mon compte › Compte) à la place de « Mon compte » en haut à droite
  const nomAffiche = () => { const p = lire('docupret_profil', {}) || {}; return lire('docupret_compte', null) && p.pseudo ? String(p.pseudo) : ''; };
  function majNom(){
    const sp = [...lien.querySelectorAll('span')].find(x => !x.querySelector('svg') && !x.closest('svg')); if (!sp) return;
    const n = nomAffiche();
    sp.textContent = n || 'Mon compte'; sp.classList.toggle('compte-nom', !!n);
    lien.setAttribute('aria-label', n ? `Mon compte (${n})` : 'Mon compte');
  }
  window.majAvatarCompte = () => { majAvatar(); majNom(); };
  function construire(){
    fond = document.createElement('div'); fond.className = 'cm-fond'; fond.hidden = true;
    menu = document.createElement('nav'); menu.className = 'cm'; menu.setAttribute('aria-label', 'Mon compte'); menu.setAttribute('aria-hidden', 'true');
    document.body.append(fond, menu);
    fond.addEventListener('click', fermer);
    menu.addEventListener('click', e => {
      if (e.target.closest('.cm-fermer')) return fermer();
      const a = e.target.closest('a');
      if (a && /^tableau-de-bord\.html#/.test(a.getAttribute('href')) && /tableau-de-bord\.html$/.test(location.pathname)){
        e.preventDefault(); fermer(); location.hash = a.getAttribute('href').split('#')[1]; return;
      }
      if (a && /compte\.html#/.test(a.getAttribute('href')) && /compte\.html$/.test(location.pathname)){
        // déjà sur la page Mon compte : changer de rubrique sans recharger
        e.preventDefault(); fermer(); location.hash = a.getAttribute('href').split('#')[1];
      }
    });
  }
  // Raccourcis vers les rubriques de « Mes clients » (comptes connectés)
  // Réglages (Mon compte › Paramètres) : nombres sur les cases (non par défaut), pastilles rouges (oui par défaut)
  const nombres = () => { try{ return localStorage.getItem('docupret_menu_nombres') === '1'; }catch(e){ return false; } };
  const alertes = () => { try{ return localStorage.getItem('docupret_menu_alertes') !== '0'; }catch(e){ return true; } };
  function raccourcis(){
    const d = (lire('docupret_documents', []) || []).filter(x => x && !x.supprime);
    const fin = d.filter(x => !x.brouillon);
    const n = {factures: fin.filter(x => x.type !== 'devis').length, devis: fin.filter(x => x.type === 'devis').length,
      impayees: fin.filter(x => x.type === 'facture' && !x.paye).length, brouillons: d.filter(x => x.brouillon).length};
    // Pastilles rouges (activées par défaut) : factures impayées et devis en attente
    const rouge = {impayees: n.impayees, devis: fin.filter(x => x.type === 'devis' && !x.facture && !x.accepte).length};
    const pastille = k => alertes() && rouge[k] ? `<span class="cm-nb rouge">${rouge[k]}</span>` : nombres() && n[k] ? `<span class="cm-nb">${n[k]}</span>` : '';
    const L = [['factures', 'Factures', 'Reçus, avoirs, bons de commande'], ['devis', 'Devis', 'En attente, acceptés, facturés'], ['impayees', 'Impayées', 'Factures à encaisser'], ['brouillons', 'Brouillons', 'Documents à finir']];
    return `<div class="cm-raccourcis">${L.map(([k, t, st]) => `<a class="cm-lien cm-sous" href="compte.html#${k}"><span class="cm-ico">${ICO2[k]}</span><span class="cm-txt"><b>${t}</b><span>${st}</span></span>${pastille(k)}</a>`).join('')}</div>`;
  }
  // Tableau de bord : en préparation, visible seulement par le propriétaire du site tant que TB_PUBLIC = false
  const TB_PUBLIC = true, ADMIN_UID = 'QOC6tTqjsKTdO9zR5NfQkhJqkup2';
  const tableauVisible = () => { if (TB_PUBLIC) return true; try{ const u = window.Compte && window.Compte.utilisateur(); if (u) return u.id === ADMIN_UID; const l = lire('docupret_compte', null); return !!l && l.uid === ADMIN_UID; }catch(e){ return false; } };
  // Activité choisie (Mon compte › Compte) : services, vente ou les deux
  const activite = () => { const a = (lire('docupret_profil', {}) || {}).activite; return ['services', 'vente'].includes(a) ? a : 'les2'; };
  // Cases du tableau de bord épinglées (Personnaliser › 📌) : raccourcis juste sous « Tableau de bord »
  function epingles(){
    const act = activite(), r = (((lire('docupret_tableau', []) || []).find(x => x && x.id === 'reglages-tableau' && !x.supprime) || {}).raccourcis || []).filter(x => act === 'les2' || x.mode === act);
    if (!r.length) return '';
    const T = {services: 'Services', vente: 'Vente'}, deux = new Set(r.map(x => x.mode)).size > 1;
    return `<div class="cm-epingles"><small>📌 Raccourcis</small>${r.map(x => `<a href="tableau-de-bord.html#${esc(x.mode)}-${esc(x.k)}"><i>${esc(x.ico || '•')}</i><span>${esc(x.titre)}${deux ? ` <span style="color:var(--gris,#667);font-weight:500;font-size:.78rem">· ${T[x.mode] || ''}</span>` : ''}</span></a>`).join('')}</div>`;
  }
  function remplir(){
    const qui = lire('docupret_compte', null), email = (window.Compte && window.Compte.connecte && !window.Compte.connecte()) ? '' : (qui && qui.email);
    const nb = (lire('docupret_clients', []) || []).filter(c => c && !c.supprime).length;
    menu.innerHTML = `<div class="cm-tete"><b>Mon compte</b><button type="button" class="cm-fermer" aria-label="Fermer">×</button></div>
      <div class="cm-qui">${email
        ? (logoAvatar() ? `<span class="cm-avatar logo"><img src="${logoAvatar()}" alt=""></span>` : `<span class="cm-avatar">${esc((nomAffiche() || email)[0].toUpperCase())}</span>`) + (nomAffiche() ? `<div><b>${esc(nomAffiche())}</b><small>${esc(email)}</small></div>` : `<div><small>Connecté avec</small><b>${esc(email)}</b></div>`)
        : `<span class="cm-avatar vide">${ICO.compte}</span><div><b>Vous n'êtes pas connecté</b><small>Gratuit, avec une simple adresse e-mail</small></div>`}</div>
      ${email ? '' : '<a class="cm-connexion" href="compte.html#creer">Créer mon compte gratuit</a><a class="cm-connexion cm-connexion2" href="compte.html#connexion">J\'ai déjà un compte</a>'}
      ${email && tableauVisible() ? `<a class="cm-lien cm-tb" href="tableau-de-bord.html"><span class="cm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg></span><span class="cm-txt"><b>Tableau de bord</b><span>${TB_PUBLIC ? (activite() === 'vente' ? 'Ventes, catalogue, stock' : 'Chiffres, paiements, rendez-vous') : 'Caché aux visiteurs (vous seul)'}</span></span></a>${epingles()}` : ''}
      <a class="cm-lien" href="compte.html#clients"><span class="cm-ico">${ICO.clients}</span><span class="cm-txt"><b>Mes clients${email ? '' : ' 🔒'}</b><span>${email ? 'Coordonnées enregistrées' : 'Avec un compte gratuit'}</span></span>${email && nb && nombres() ? `<span class="cm-nb">${nb}</span>` : ''}</a>
      ${email ? raccourcis() : ''}
      <a class="cm-lien" href="compte.html#parametres"><span class="cm-ico">${ICO.param}</span><span class="cm-txt"><b>Paramètres${email ? '' : ' 🔒'}</b><span>${email ? 'Mon entreprise, préférences' : 'Avec un compte gratuit'}</span></span></a>
      <a class="cm-lien" href="compte.html#compte"><span class="cm-ico">${ICO.compte}</span><span class="cm-txt"><b>Compte</b><span>${email ? 'Mot de passe, déconnexion' : 'Connexion, inscription'}</span></span></a>
      ${email && lire('docupret_admin', null) !== null ? `<a class="cm-lien" href="stats.html"><span class="cm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg></span><span class="cm-txt"><b>Statistiques</b><span>Visites et documents du site</span></span></a>` : ''}
      <p class="cm-note">${email ? '☁️ Vos clients et paramètres sont synchronisés sur tous vos appareils.' : '🔒 Clients, paramètres et envoi Gmail sont réservés aux comptes gratuits.'}</p>`;
  }
  function ouvrir(){
    if (!menu) construire();
    remplir();
    dernierFocus = document.activeElement;
    fond.hidden = false; menu.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => menu.classList.add('ouvert'));
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const b = menu.querySelector('.cm-fermer'); if (b) b.focus(); }, 50);
  }
  function fermer(){
    if (!menu) return;
    menu.classList.remove('ouvert'); menu.setAttribute('aria-hidden', 'true');
    fond.hidden = true; document.body.style.overflow = '';
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }
  majAvatar(); majNom();
  window.addEventListener('docupret-profil', () => { majNom(); demanderNom(); });
  window.addEventListener('storage', e => { if (e.key === 'docupret_profil' || e.key === 'docupret_compte') majNom(); });
  if (window.Compte && window.Compte.surChangement) window.Compte.surChangement(majNom);
  // Comptes créés avant l'option : on propose une fois de choisir un nom (facultatif)
  function demanderNom(){
    const C = window.Compte;
    if (!C || !C.profilPret || !C.profilPret() || !C.utilisateur() || window.self !== window.top) return;
    const p = C.profil();
    if (document.querySelector('.pz-fond')) return;
    if (p.pseudo || p.refus) return annoncerTableau();
    try{ if (sessionStorage.getItem('docupret_pz_plus_tard')) return; }catch(e){}
    setTimeout(() => {
      if (document.querySelector('.pz-fond, .fond, .cp-fond, .env-fond, .tf-fond, .cm.ouvert')) return;
      const f = document.createElement('div'); f.className = 'pz-fond';
      f.innerHTML = `<form class="pz" role="dialog" aria-modal="true" aria-labelledby="pz-titre"><span class="pz-ico">👋</span><h2 id="pz-titre">Comment souhaitez-vous apparaître ?</h2>
        <p>Choisissez le nom affiché en haut du site, à la place de « Mon compte » : votre nom et prénom, un pseudo ou le nom de votre entreprise.</p>
        <input name="pseudo" maxlength="40" autocomplete="organization" placeholder="ex. : Nom, pseudo ou entreprise" aria-label="Nom, pseudo ou entreprise">
        <small>Facultatif. Ce nom n'apparaît jamais sur vos factures, devis ou documents. Vous pourrez le changer dans Mon compte.</small>
        <button type="submit" class="pz-ok">Enregistrer</button>
        <div class="pz-bas"><button type="button" data-plus-tard>Plus tard</button><button type="button" data-jamais>Ne plus me demander</button></div></form>`;
      const fermer = () => { f.remove(); setTimeout(annoncerTableau, 400); };
      f.addEventListener('submit', e => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v){ f.querySelector('input').focus(); return; } C.definirProfil({pseudo: v, refus: false}); fermer(); if (C.toast) C.toast(`✓ Bienvenue ${v} !`); });
      f.addEventListener('click', e => {
        if (e.target.closest('[data-jamais]')){ C.definirProfil({refus: true}); fermer(); }
        else if (e.target === f || e.target.closest('[data-plus-tard]')){ try{ sessionStorage.setItem('docupret_pz_plus_tard', '1'); }catch(err){} fermer(); }
      });
      document.body.appendChild(f);
    }, 1200);
  }
  // Comptes déjà créés : une seule fois, on présente le tableau de bord et on demande l'activité
  function annoncerTableau(){
    const C = window.Compte;
    if (!C || !C.profilPret || !C.profilPret() || !C.utilisateur() || window.self !== window.top) return;
    const p = C.profil();
    if (p.annonceTb || document.querySelector('.pz-fond')) return;
    if (document.querySelector('.fond, .cp-fond, .env-fond, .tf-fond, .cm.ouvert')) return;
    const f = document.createElement('div'); f.className = 'pz-fond';
    f.innerHTML = `<div class="pz" role="dialog" aria-modal="true" aria-labelledby="tb-an-titre"><span class="pz-ico">🎉</span><h2 id="tb-an-titre">Nouveau sur DocuPrêt.fr</h2>
      <p>Profitez maintenant d'un <b>tableau de bord avancé</b>, gratuit : chiffre d'affaires, bilan du mois, paiements, rendez-vous, et pour les commerçants catalogue, stock et marges.</p>
      <p style="font-weight:700;color:var(--texte,#123)">Quelle est votre activité ?</p>
      <div class="pz-choix">
        <button type="button" data-act="services"><span>🛠️</span><b>Prestations de services</b><small>Artisan, entrepreneur, entreprise</small></button>
        <button type="button" data-act="vente"><span>🛍️</span><b>Ventes et commerce</b><small>Vendeur, commerçant</small></button>
        <button type="button" data-act="les2"><span>✨</span><b>Les deux</b><small>Les 2 tableaux, au choix</small></button>
      </div>
      <small>Vous pourrez changer à tout moment dans Mon compte › Compte.</small>
      <div class="pz-bas" style="justify-content:center"><button type="button" data-fermer-an>Fermer</button></div></div>`;
    f.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b){
        C.definirProfil({activite: b.dataset.act, annonceTb: true}); f.remove();
        const t = {services: 'Prestations de services', vente: 'Ventes et commerce', les2: 'Les deux tableaux'}[b.dataset.act];
        if (C.toast) C.toast(`✓ ${t} : retrouvez votre tableau de bord dans Mon compte`);
        return;
      }
      if (e.target === f || e.target.closest('[data-fermer-an]')){ C.definirProfil({activite: C.profil().activite || 'les2', annonceTb: true}); f.remove(); }
    });
    document.body.appendChild(f);
  }
  lien.setAttribute('aria-haspopup', 'true');
  lien.addEventListener('click', e => { e.preventDefault(); ouvrir(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu && menu.classList.contains('ouvert')) fermer(); });
})();

/* DocuPrêt — « Installer l'application » : icône sur l'écran d'accueil, ouverture en plein écran,
 * et pages déjà ouvertes utilisables sans réseau. */
(function(){
  'use strict';
  if ('serviceWorker' in navigator && location.protocol === 'https:'){
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
  const installee = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (installee()) return;
  let invite = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); invite = e; });
  window.addEventListener('appinstalled', () => { invite = null; const l = document.querySelector('.tiroir-installer'); if (l) l.remove(); });

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const CSS = `.tiroir-installer{display:flex!important;align-items:center;gap:10px;color:var(--bleu,#4A7BD0)!important}
  .tiroir-installer svg{width:20px;height:20px;flex-shrink:0}
  .ia-fond{position:fixed;inset:0;z-index:80;background:rgba(20,28,45,.5);display:flex;align-items:flex-end;justify-content:center}
  @media (min-width:640px){.ia-fond{align-items:center}}
  .ia-boite{background:#fff;width:100%;max-width:440px;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:12px}
  @media (min-width:640px){.ia-boite{border-radius:18px}}
  .ia-tete{display:flex;align-items:center;justify-content:space-between}
  .ia-tete b{font-size:1.08rem;color:var(--texte,#1E2A42)}
  .ia-tete button{border:0;background:none;font-size:1.6rem;line-height:1;color:var(--gris,#667);width:36px;height:36px;border-radius:50%}
  .ia-boite ol{margin:0;padding-left:22px;display:grid;gap:8px;font-size:.94rem;color:#3B4558;line-height:1.45}
  .ia-boite p{margin:0;font-size:.86rem;color:var(--gris,#667);line-height:1.45}`;
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 8v6M9 11l3 3 3-3"/><path d="M10.5 18.5h3"/></svg>';

  function aide(){
    const f = document.createElement('div'); f.className = 'ia-fond';
    f.innerHTML = `<div class="ia-boite" role="dialog" aria-modal="true" aria-label="Installer DocuPrêt"><div class="ia-tete"><b>Installer DocuPrêt</b><button type="button" data-fermer aria-label="Fermer">×</button></div>
      ${ios ? `<ol><li>En bas de Safari, touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l'écran d'accueil »</b>.</li><li>Touchez <b>« Ajouter »</b>.</li></ol>`
            : `<ol><li>Touchez le menu <b>⋮</b> de votre navigateur, en haut à droite.</li><li>Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li><li>Confirmez.</li></ol>`}
      <p>DocuPrêt apparaît alors avec son icône sur votre téléphone, comme une application : il s'ouvre en plein écran, et les pages déjà utilisées fonctionnent même sans réseau.</p></div>`;
    f.addEventListener('click', e => { if (e.target === f || e.target.closest('[data-fermer]')) f.remove(); });
    document.body.appendChild(f);
  }
  function ajouter(){
    const t = document.getElementById('tiroir');
    if (!t || t.querySelector('.tiroir-installer')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const a = document.createElement('a'); a.href = '#'; a.className = 'tiroir-lien tiroir-installer';
    a.innerHTML = ICONE + 'Installer l\'application';
    a.addEventListener('click', async e => {
      e.preventDefault();
      if (invite){ invite.prompt(); try{ await invite.userChoice; }catch(err){} invite = null; return; }
      aide();
    });
    const apropos = t.querySelector('.apropos');
    if (apropos) t.insertBefore(a, apropos); else t.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ajouter); else ajouter();
})();

// Correcteur d'orthographe du navigateur sur tous les champs où l'on écrit du texte (ordinateur compris)
(function(){
  const SANS = /email|tel|url|number|date|time|password|search|color|file|range|checkbox|radio|hidden/;
  function activer(racine){
    (racine.querySelectorAll ? racine : document).querySelectorAll('textarea, input, [contenteditable]').forEach(el => {
      if (el.getAttribute('spellcheck') === 'false') return;          // IBAN, SIRET, e-mail… : laissés sans correction
      if (el.tagName === 'INPUT' && SANS.test(el.type || '')) return;
      if (el.isContentEditable === false && el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') === 'false') return;
      el.spellcheck = true; if (!el.lang) el.lang = 'fr';
    });
  }
  function demarrer(){
    document.documentElement.lang = document.documentElement.lang || 'fr';
    activer(document);
    // Un seul passage par zone modifiée (les listes se redessinent souvent)
    try{ new MutationObserver(l => { const z = new Set(); l.forEach(m => { if (m.addedNodes.length && m.target.nodeType === 1) z.add(m.target); }); z.forEach(activer); }).observe(document.body, {childList: true, subtree: true}); }catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

// Mode sombre pour tout le monde (avec ou sans compte) : interrupteur dans le menu ☰, gardé sur l'appareil
(function(){
  const CLE = 'docupret_theme', html = document.documentElement;
  const lire = () => { try{ return localStorage.getItem(CLE) === 'sombre'; }catch(e){ return false; } };
  const CSS = `.tiroir-theme{display:flex!important;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;border-bottom:1px solid var(--bord,#E2E8F2);background:none;font:inherit;font-weight:700;font-size:1rem;color:var(--texte,#1E2A42);cursor:pointer;text-align:left;padding:14px 16px}
  .tiroir-theme .tt-int{position:relative;width:44px;height:26px;border-radius:50px;background:#CBD5E3;flex-shrink:0;transition:background .2s}
  .tiroir-theme .tt-int::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
  .tiroir-theme[aria-checked="true"] .tt-int{background:var(--bleu,#4A7BD0)}
  .tiroir-theme[aria-checked="true"] .tt-int::after{transform:translateX(18px)}`;
  function appliquer(on){
    html.classList.toggle('sombre', on && window.self === window.top);
    try{ localStorage.setItem(CLE, on ? 'sombre' : 'clair'); }catch(e){}
    document.querySelectorAll('.tiroir-theme').forEach(b => b.setAttribute('aria-checked', String(on)));
  }
  function ajouter(){
    const t = document.getElementById('tiroir');
    if (!t || t.querySelector('.tiroir-theme')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tiroir-theme'; b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(lire()));
    b.innerHTML = '<span>🌙 Mode sombre</span><span class="tt-int" aria-hidden="true"></span>';
    b.addEventListener('click', () => appliquer(!lire()));
    const apropos = t.querySelector('.apropos');
    if (apropos) t.insertBefore(b, apropos); else t.appendChild(b);
  }
  // Un autre onglet a changé le mode : on suit
  window.addEventListener('storage', e => { if (e.key === CLE) appliquer(lire()); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ajouter); else ajouter();
})();

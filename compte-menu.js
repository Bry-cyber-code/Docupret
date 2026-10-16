/* Bouton « retour » du téléphone : il ferme d'abord le menu, « Mon compte » ou la fenêtre ouverte,
 * au lieu de quitter le site. Chaque ouverture ajoute une étape dans l'historique du navigateur. */
(function(){
  'use strict';
  if (!window.history || !history.pushState || !window.MutationObserver) return;
  const clic = el => el && el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
  const COUCHES = [
    {trouver: () => [...document.querySelectorAll('#tiroir.ouvert')], fermer: () => clic(document.getElementById('tiroir-fond'))},
    {trouver: () => [...document.querySelectorAll('.cm.ouvert')], fermer: () => clic(document.querySelector('.cm-fond'))},
    {trouver: () => [...document.querySelectorAll('body > .env-fond, body > .loupe, body > .fond, body > .cp-fond, body > .ia-fond')], fermer: el => clic(el)}
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
      const n = navigation; n.fermer.forEach(f => f());
      location.href = n.url;
      setTimeout(() => { navigation = null; verifier(); }, 0);
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
  .cm{position:fixed;top:0;right:0;bottom:0;width:min(300px,84vw);background:var(--blanc,#fff);z-index:53;transform:translateX(102%);transition:transform .25s ease;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,.12);padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column}
  .cm.ouvert{transform:none}
  .cm-tete{display:flex;align-items:center;justify-content:space-between;height:60px;padding:env(safe-area-inset-top,0px) 10px 0 16px;border-bottom:1px solid var(--bord,#e2e8f0);flex-shrink:0}
  .cm-tete b{font-size:1.05rem}
  .cm-fermer{width:36px;height:36px;border:0;background:none;border-radius:50%;font-size:1.6rem;line-height:1;color:var(--gris,#667);cursor:pointer}
  .cm-fermer:hover{background:var(--fond,#f4f6fa)}
  .cm-qui{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid var(--bord,#e2e8f0)}
  .cm-avatar{width:44px;height:44px;border-radius:50%;background:var(--bleu,#4A7BD0);color:#fff;display:grid;place-items:center;font-weight:800;font-size:1.15rem;flex-shrink:0}
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
  .cm-nb{font-size:.74rem;font-weight:700;background:var(--bleu,#4A7BD0);color:#fff;border-radius:50px;padding:2px 8px;flex-shrink:0}
  .cm-note{font-size:.76rem;color:var(--gris,#667);padding:14px 16px;line-height:1.45;margin-top:auto}
  .cm-avatar.logo{background:#fff;border:1px solid var(--bord,#e2e8f0);overflow:hidden}
  .cm-avatar.logo img{max-width:88%;max-height:88%;object-fit:contain}
  .compte-lien img.compte-logo{width:26px;height:26px;border-radius:50%;object-fit:contain;background:#fff;border:1.5px solid var(--bord,#e2e8f0);display:block}
  @media (min-width:561px){.compte-lien img.compte-logo{width:22px;height:22px}}
  @media (prefers-reduced-motion:reduce){.cm{transition:none}}`;

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
  window.majAvatarCompte = majAvatar;
  function construire(){
    fond = document.createElement('div'); fond.className = 'cm-fond'; fond.hidden = true;
    menu = document.createElement('nav'); menu.className = 'cm'; menu.setAttribute('aria-label', 'Mon compte'); menu.setAttribute('aria-hidden', 'true');
    document.body.append(fond, menu);
    fond.addEventListener('click', fermer);
    menu.addEventListener('click', e => {
      if (e.target.closest('.cm-fermer')) return fermer();
      const a = e.target.closest('a');
      if (a && /compte\.html#/.test(a.getAttribute('href')) && /compte\.html$/.test(location.pathname)){
        // déjà sur la page Mon compte : changer de rubrique sans recharger
        e.preventDefault(); fermer(); location.hash = a.getAttribute('href').split('#')[1];
      }
    });
  }
  function remplir(){
    const qui = lire('docupret_compte', null), email = (window.Compte && window.Compte.connecte && !window.Compte.connecte()) ? '' : (qui && qui.email);
    const nb = (lire('docupret_clients', []) || []).filter(c => c && !c.supprime).length;
    menu.innerHTML = `<div class="cm-tete"><b>Mon compte</b><button type="button" class="cm-fermer" aria-label="Fermer">×</button></div>
      <div class="cm-qui">${email
        ? (logoAvatar() ? `<span class="cm-avatar logo"><img src="${logoAvatar()}" alt=""></span>` : `<span class="cm-avatar">${esc(email[0].toUpperCase())}</span>`) + `<div><small>Connecté avec</small><b>${esc(email)}</b></div>`
        : `<span class="cm-avatar vide">${ICO.compte}</span><div><b>Vous n'êtes pas connecté</b><small>Gratuit, avec une simple adresse e-mail</small></div>`}</div>
      ${email ? '' : '<a class="cm-connexion" href="compte.html#compte">Se connecter ou créer un compte</a>'}
      <a class="cm-lien" href="compte.html#clients"><span class="cm-ico">${ICO.clients}</span><span class="cm-txt"><b>Mes clients${email ? '' : ' 🔒'}</b><span>${email ? 'Coordonnées enregistrées' : 'Avec un compte gratuit'}</span></span>${email && nb ? `<span class="cm-nb">${nb}</span>` : ''}</a>
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
  majAvatar();
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

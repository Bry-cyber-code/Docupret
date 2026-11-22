// Correcteur d'orthographe de DocuPrêt : fonctionne pareil sur ordinateur et téléphone, sans dépendre du navigateur.
// Dictionnaire français (dico-fr.txt, ≈ 450 000 mots, Grammalecte / Dicollecte, licence MPL 2.0) chargé depuis le site,
// seulement quand la page contient des champs à écrire. Rien n'est envoyé ailleurs : tout est vérifié sur l'appareil.
//  - Feuille (factures, devis…) : les mots inconnus sont soulignés en rouge ; un toucher propose les corrections.
//  - Champs de formulaire (lettres, CV, fiches…) : une petite ligne sous le champ propose les corrections.
//  - Une pastille « Orthographe » en bas de l'écran liste toutes les fautes de la page.
(function(){
  'use strict';
  if (window.DocuCorrecteur) return;
  const VERSION_DICO = '1';
  const LETTRES = 'a-zA-ZÀ-ÖØ-öø-ÿœŒæÆ';
  const RE_MOT = new RegExp(`[${LETTRES}]+(?:[-'’][${LETTRES}]+)*`, 'g');
  const ELISIONS = new Set(['l', 'd', 'j', 'm', 'n', 's', 't', 'c', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'presqu', 'quelqu']);
  const ALPHA = 'abcdefghijklmnopqrstuvwxyzàâäçéèêëîïôöùûüÿœæ';
  let mots = null, chargement = null, actif = true;
  const perso = new Set(), ignores = new Set();
  const lireLS = (k, d) => { try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }catch(e){ return d; } };
  try{ (lireLS('docupret_dico_perso', []) || []).forEach(w => perso.add(String(w).toLowerCase())); }catch(e){}
  try{ (JSON.parse(sessionStorage.getItem('docupret_dico_ignore') || '[]')).forEach(w => ignores.add(w)); }catch(e){}

  // ---------- Dictionnaire ----------
  function charger(){
    if (chargement) return chargement;
    chargement = fetch('dico-fr.txt?v=' + VERSION_DICO).then(r => { if (!r.ok) throw new Error('dico'); return r.text(); }).then(t => {
      const s = new Set(); let prev = '';
      for (const l of t.split('\n')){ if (!l) continue; const w = prev.slice(0, l.charCodeAt(0) - 48) + l.slice(1); s.add(w); prev = w; }
      mots = s; apprendre(); return s;
    }).catch(e => { chargement = null; throw e; });
    return chargement;
  }
  // Les noms de l'entreprise, des clients, des produits… ne sont pas des fautes
  function apprendre(){
    const ajouter = t => String(t || '').split(/[^a-zA-ZÀ-ÖØ-öø-ÿœŒæÆ'’-]+/).forEach(w => { if (w.length > 1) perso.add(w.toLowerCase()); });
    try{ const d = lireLS('docufacile_v1', {}) || {}; const em = d.em || {}; [em.nom, em.adresse, em.cpville, em.mentions].forEach(ajouter); }catch(e){}
    try{ (lireLS('docupret_clients', []) || []).forEach(c => { if (c && !c.supprime) [c.nom, c.adresse, c.cpville].forEach(ajouter); }); }catch(e){}
    try{ (lireLS('docupret_tableau', []) || []).forEach(x => { if (x && !x.supprime && (x.genre === 'produit' || x.genre === 'abonne')) [x.nom, x.categorie, x.formule].forEach(ajouter); }); }catch(e){}
    try{ ajouter((lireLS('docupret_profil', {}) || {}).pseudo); }catch(e){}
  }
  const connu = w => mots.has(w) || perso.has(w.toLowerCase());
  const minus = w => w.toLowerCase();
  // Mots qui gardent leur apostrophe
  const APOS = new Set(["aujourd'hui", "prud'homme", "prud'hommes", "prud'homal", "prud'homale", "prud'homaux", "presqu'île", "presqu'îles", "quelqu'un", "quelqu'une", "entr'ouvert", "entr'ouverte", "grand'mère", "grand'rue"]);
  function motCorrect(w){
    if (connu(w) || connu(minus(w))) return true;
    if (APOS.has(minus(w).replace(/’/g, "'"))) return true;
    // l'élagage, qu'il, jusqu'au…
    const m = /^([a-zA-Z]+)['’](.+)$/.exec(w);
    if (m && ELISIONS.has(minus(m[1]))) return motCorrect(m[2]);
    // mots composés : chaque partie connue (rendez-vous, peut-être, dit-il…)
    if (/-/.test(w)){ const p = w.split('-').filter(Boolean); if (p.length > 1 && p.every(x => x.length < 2 || connu(x) || connu(minus(x)) || /^(t|il|elle|on|ils|elles|je|tu|nous|vous|ce|là|ci|y|en|moi|toi|lui|leur)$/i.test(x))) return true; }
    return false;
  }
  // Propositions : une ou deux lettres de différence (accents compris), les plus proches d'abord
  function edits1(w){
    const r = new Set();
    for (let i = 0; i <= w.length; i++){
      const a = w.slice(0, i), b = w.slice(i);
      if (b) r.add(a + b.slice(1));
      if (b.length > 1) r.add(a + b[1] + b[0] + b.slice(2));
      for (const c of ALPHA){ if (b) r.add(a + c + b.slice(1)); r.add(a + c + b); }
    }
    return r;
  }
  const VOY = /[aeiouyàâäéèêëîïôöùûüÿ]/;
  // Toutes les façons d'accentuer un mot (deja → déjà, a cote → à côté…)
  const ACC = {a: 'aàâä', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', c: 'cç', y: 'yÿ'};
  function accents(w){
    let r = [''];
    for (const ch of w){ const o = ACC[ch] || ch; const n = []; for (const p of r) for (const x of o) n.push(p + x); r = n; if (r.length > 3000) return []; }
    return r;
  }
  const sansAccent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const memo = new Map();
  function suggestions(w){
    if (memo.has(w)) return memo.get(w);
    const r = suggestions0(w); if (memo.size > 500) memo.clear(); memo.set(w, r); return r;
  }
  function suggestions0(w){
    const maj = /^[A-ZÀ-ÖØ-Þ]/.test(w), tout = w.length > 1 && w === w.toUpperCase(), base = minus(w), res = new Map();
    // Classement selon les fautes les plus courantes en français
    const note = c => {
      let n = 0;
      if (sansAccent(c) === sansAccent(base)) n -= 6;                                      // seulement un accent (dechets → déchets)
      else if (c.replace(/([bcdfglmnprst])\1/g, '$1') === base.replace(/([bcdfglmnprst])\1/g, '$1')) n -= 5;   // lettre doublée (terain → terrain)
      else if (c.length === base.length + 1) n -= 4;                                       // une lettre oubliée (Paiment → Paiement)
      else if (sansAccent(c).replace(/([a-z])\1/g, '$1') === sansAccent(base).replace(/([a-z])\1/g, '$1')) n -= 4;
      else if (c.length === base.length - 1) n -= 1;                                       // une lettre en trop
      else if (c.length === base.length){ const i = [...c].findIndex((x, k) => x !== base[k]); if (i >= 0 && VOY.test(c[i]) && VOY.test(base[i])) n -= 3.5; }   // voyelle (confience → confiance)
      if (c[0] === base[0]) n -= 1.5;
      if (c.slice(-2) === base.slice(-2)) n -= .5;
      return n;
    };
    accents(sansAccent(base)).forEach(c => { if (c !== base && mots.has(c)) res.set(c, note(c) - 1); });
    const e1 = edits1(base);
    e1.forEach(c => { if (c && !res.has(c) && mots.has(c)) res.set(c, note(c)); });
    if (!res.size && base.length >= 4 && base.length <= 14){
      let n = 0;
      for (const x of e1){ if (++n > 1500) break; for (const c of edits1(x)){ if (c && !res.has(c) && mots.has(c)) res.set(c, note(c) + 2); } if (res.size > 8) break; }
    }
    return [...res.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).map(([c]) => tout ? c.toUpperCase() : maj ? c[0].toUpperCase() + c.slice(1) : c);
  }
  // Mots à vérifier dans un texte : [{mot, debut, fin}]
  function fautes(texte){
    if (!mots || !texte) return [];
    const r = []; let m; RE_MOT.lastIndex = 0;
    while ((m = RE_MOT.exec(texte))){
      const w = m[0].replace(/['’-]+$/, ''), i = m.index;
      if (w.length < 2 || ignores.has(w)) continue;
      const avant = texte.slice(Math.max(0, i - 1), i), apres = texte.slice(i + m[0].length, i + m[0].length + 1);
      if (/[\d@/._]/.test(avant) || /[\d@/_]/.test(apres) || /\.[a-z]/i.test(texte.slice(i + m[0].length, i + m[0].length + 2))) continue;   // e-mail, site, référence
      if (motCorrect(w)) continue;
      const debutPhrase = !texte.slice(0, i).trim() || /[.!?:\n]\s*$/.test(texte.slice(0, i));
      if (/^[A-ZÀ-ÖØ-Þ]/.test(w)){
        if (w === w.toUpperCase() && w.length <= 6) continue;                // sigles (SARL, EURL…)
        if (!debutPhrase) continue;                                           // noms propres (Martin, Lyon…)
        if (!suggestions(w).length) continue;
      }
      r.push({mot: w, debut: i, fin: i + w.length});
    }
    return r;
  }

  // ---------- Quels champs vérifier ----------
  const SANS_TYPE = /email|tel|url|number|date|time|password|search|color|file|range|checkbox|radio|hidden|submit|button/;
  function eligible(el){
    if (!actif || !el || el.closest('[data-sans-correcteur], .cor-pop, .cor-liste, .cm, .tiroir')) return false;
    if (el.getAttribute('spellcheck') === 'false') return false;
    if (el.matches('.ed')) return el.isContentEditable && !el.dataset.fmt && !/^T:/.test(el.dataset.ed || '');
    if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
    if (el.tagName === 'INPUT') return !SANS_TYPE.test(el.type || 'text') && !/numeric|decimal|tel|email/.test(el.inputMode || '') && !/email|tel|url|postal|cc-/.test(el.autocomplete || '') && !el.readOnly && !el.disabled;
    return false;
  }
  const champs = () => [...document.querySelectorAll('textarea, input, .ed[contenteditable]')].filter(eligible).filter(el => el.offsetParent !== null || el.getClientRects().length);
  const texteChamp = el => el.matches('.ed') ? el.innerText.replace(/\u00a0/g, ' ') : el.value;

  // ---------- Feuille : soulignement en rouge ----------
  function nettoyer(el){ el.querySelectorAll('mark.cor-m').forEach(m => m.replaceWith(document.createTextNode(m.textContent))); el.normalize(); }
  function souligner(el){
    if (el === document.activeElement || el.contains(document.activeElement)) return;
    nettoyer(el);
    const f = fautes(el.textContent); if (!f.length) return;
    // Parcours des morceaux de texte pour placer chaque mot souligné au bon endroit
    const morceaux = []; let pos = 0;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())){ morceaux.push({n, a: pos, b: pos + n.nodeValue.length}); pos += n.nodeValue.length; }
    for (let k = f.length - 1; k >= 0; k--){
      const x = f[k], m = morceaux.find(o => x.debut >= o.a && x.fin <= o.b); if (!m) continue;
      const r = document.createRange(); r.setStart(m.n, x.debut - m.a); r.setEnd(m.n, x.fin - m.a);
      const mk = document.createElement('mark'); mk.className = 'cor-m'; mk.dataset.mot = x.mot; mk.setAttribute('contenteditable', 'false');
      try{ r.surroundContents(mk); }catch(e){}
    }
  }

  // ---------- Champs de formulaire : ligne de propositions sous le champ ----------
  function aideChamp(el){
    let a = el._corAide;
    const f = fautes(texteChamp(el));
    el.classList.toggle('cor-faute', f.length > 0);
    if (!f.length){ if (a){ a.remove(); el._corAide = null; } return; }
    if (!a){ a = document.createElement('div'); a.className = 'cor-aide'; a._champ = el; el._corAide = a; el.insertAdjacentElement('afterend', a); }
    const vus = new Set();
    a.innerHTML = '<span class="cor-t">Orthographe :</span>' + f.filter(x => !vus.has(x.mot) && vus.add(x.mot)).slice(0, 4).map(x => {
      const s = suggestions(x.mot);
      return `<span class="cor-item"><s>${esc(x.mot)}</s>${s.length ? s.slice(0, 3).map(c => ` <button type="button" data-cor-rempl="${attr(x.mot)}" data-par="${attr(c)}">${esc(c)}</button>`).join('') : ' <em>pas de proposition</em>'} <button type="button" class="cor-ign" data-cor-ign="${attr(x.mot)}" title="Ce mot est correct">Ignorer</button></span>`;
    }).join('');
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const attr = esc;

  // ---------- Remplacer un mot ----------
  function remplacer(el, mot, par, index){
    const t = texteChamp(el);
    let i = -1, k = 0, re = new RegExp(`(^|[^${LETTRES}])(${mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![${LETTRES}])`, 'g'), m;
    while ((m = re.exec(t))){ const pos = m.index + m[1].length; if (index == null || k === index){ i = pos; break; } k++; }
    if (i < 0) return;
    const nv = t.slice(0, i) + par + t.slice(i + mot.length);
    if (el.matches('.ed')){
      nettoyer(el);
      if (el.dataset.multi) el.innerText = nv; else el.textContent = nv;
      el.dispatchEvent(new Event('input', {bubbles: true}));
    } else {
      const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(el, nv);
      el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
    }
    toast(`✓ « ${mot} » corrigé en « ${par} »`);
    setTimeout(verifierTout, 60);
  }
  function ignorer(mot, toujours){
    if (toujours){ perso.add(mot.toLowerCase()); try{ const l = lireLS('docupret_dico_perso', []) || []; if (!l.includes(mot.toLowerCase())) l.push(mot.toLowerCase()); localStorage.setItem('docupret_dico_perso', JSON.stringify(l.slice(-2000))); }catch(e){} }
    else { ignores.add(mot); try{ sessionStorage.setItem('docupret_dico_ignore', JSON.stringify([...ignores])); }catch(e){} }
    verifierTout();
  }

  // ---------- Fenêtre de propositions (toucher un mot souligné) ----------
  let pop = null;
  function fermerPop(){ if (pop){ pop.remove(); pop = null; } }
  function ouvrirPop(mk){
    fermerPop();
    const el = mk.closest('.ed'), mot = mk.dataset.mot, s = suggestions(mot);
    const idx = [...el.querySelectorAll('mark.cor-m')].filter(x => x.dataset.mot === mot).indexOf(mk);
    pop = document.createElement('div'); pop.className = 'cor-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Correction de « ' + mot + ' »');
    pop.innerHTML = `<div class="cor-pop-t">« ${esc(mot)} » : mot inconnu</div>${s.length ? `<div class="cor-pop-s">${s.map(c => `<button type="button" data-par="${attr(c)}">${esc(c)}</button>`).join('')}</div>` : '<p class="cor-pop-v">Aucune proposition.</p>'}
      <div class="cor-pop-b"><button type="button" data-act="modif">✏️ Modifier</button><button type="button" data-act="ign">Ignorer</button><button type="button" data-act="ajout">Ajouter au dictionnaire</button></div>`;
    document.body.appendChild(pop);
    const r = mk.getBoundingClientRect(), w = Math.min(320, innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + window.scrollX - 10)) + 'px';
    const h = pop.offsetHeight, bas = r.bottom + 8 + h < innerHeight;
    pop.style.top = (bas ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + window.scrollY + 'px';
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.par){ fermerPop(); remplacer(el, mot, b.dataset.par, idx); }
      else if (b.dataset.act === 'ign'){ fermerPop(); ignorer(mot); }
      else if (b.dataset.act === 'ajout'){ fermerPop(); ignorer(mot, true); toast(`« ${mot} » ajouté à votre dictionnaire`); }
      else if (b.dataset.act === 'modif'){
        fermerPop(); const t = mk.textContent, txt = el.textContent, debut = txt.indexOf(t);
        nettoyer(el); el.focus();
        try{ const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n = tw.nextNode(); if (n && debut >= 0){ const rg = document.createRange(); rg.setStart(n, Math.min(n.length, debut)); rg.setEnd(n, Math.min(n.length, debut + t.length)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); } }catch(err){}
      }
    });
  }

  // ---------- Pastille + liste de toutes les fautes ----------
  let pastille = null, liste = null, total = 0;
  function majPastille(n){
    total = n;
    if (!pastille){
      pastille = document.createElement('button'); pastille.type = 'button'; pastille.className = 'cor-pastille';
      pastille.addEventListener('click', ouvrirListe); document.body.appendChild(pastille);
    }
    pastille.hidden = !n;
    // Au-dessus d'une barre de boutons fixée en bas de l'écran (Envoyer, PDF…)
    if (n){
      let h = 0;
      document.querySelectorAll('body *').forEach(x => { if (x === pastille || x.offsetParent === undefined) return; const cs = getComputedStyle(x); if (cs.position !== 'fixed' || x.hidden) return; const r = x.getBoundingClientRect(); if (r.height && r.height < 160 && r.bottom >= innerHeight - 4 && r.width > innerWidth * .5) h = Math.max(h, r.height); });
      pastille.style.bottom = `calc(${h ? h + 10 : 14}px + env(safe-area-inset-bottom,0px))`;
    }
    pastille.innerHTML = `<span>✍️</span> ${n} mot${n > 1 ? 's' : ''} à vérifier`;
    pastille.setAttribute('aria-label', `Orthographe : ${n} mot${n > 1 ? 's' : ''} à vérifier`);
  }
  function ouvrirListe(){
    fermerListe();
    liste = document.createElement('div'); liste.className = 'cor-liste-fond';
    const lignes = [];
    champs().forEach(el => { const t = texteChamp(el); fautes(t).forEach((f, k, arr) => { const idx = arr.slice(0, k).filter(x => x.mot === f.mot).length; lignes.push({el, f, idx, ctx: t.slice(Math.max(0, f.debut - 25), f.fin + 25)}); }); });
    liste.innerHTML = `<div class="cor-liste" role="dialog" aria-modal="true" aria-label="Orthographe"><div class="cor-liste-t"><b>✍️ Orthographe</b><button type="button" data-fermer aria-label="Fermer">×</button></div>
      <div class="cor-liste-c">${lignes.length ? lignes.map((l, i) => { const s = suggestions(l.f.mot); return `<div class="cor-l" data-i="${i}"><div class="cor-ctx">…${esc(l.ctx).replace(esc(l.f.mot), `<mark>${esc(l.f.mot)}</mark>`)}…</div>
        <div class="cor-ch">${s.length ? s.map(c => `<button type="button" data-par="${attr(c)}">${esc(c)}</button>`).join('') : '<em>Aucune proposition</em>'}<button type="button" class="cor-ign" data-ign>Ignorer</button><button type="button" class="cor-ign" data-voir>Voir</button></div></div>`; }).join('') : '<p class="cor-vide">✓ Aucune faute trouvée.</p>'}</div>
      <p class="cor-note">Vérifié avec le dictionnaire français de DocuPrêt, directement sur votre appareil.</p></div>`;
    liste.addEventListener('click', e => {
      if (e.target === liste || e.target.closest('[data-fermer]')) return fermerListe();
      const ligne = e.target.closest('[data-i]'); if (!ligne) return; const l = lignes[+ligne.dataset.i];
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.par){ remplacer(l.el, l.f.mot, b.dataset.par, l.idx); setTimeout(() => { if (liste) ouvrirListe(); if (!total) fermerListe(); }, 150); }
      else if ('ign' in b.dataset){ ignorer(l.f.mot); setTimeout(() => { if (liste) ouvrirListe(); }, 60); }
      else if ('voir' in b.dataset){ fermerListe(); l.el.scrollIntoView({block: 'center', behavior: 'smooth'}); setTimeout(() => { if (l.el.matches('.ed')){ const mk = [...l.el.querySelectorAll('mark.cor-m')].find(x => x.dataset.mot === l.f.mot); if (mk) ouvrirPop(mk); } else l.el.focus(); }, 400); }
    });
    document.body.appendChild(liste);
  }
  function fermerListe(){ if (liste){ liste.remove(); liste = null; } }

  // ---------- Vérifications ----------
  let minut = null, obs = null;
  function verifierTout(){
    if (!mots) return;
    let n = 0;
    champs().forEach(el => {
      if (el.matches('.ed')){ souligner(el); n += el === document.activeElement ? fautes(el.textContent).length : el.querySelectorAll('mark.cor-m').length; }
      else { if (el !== document.activeElement) aideChamp(el); n += fautes(el.value).length; }
    });
    // Lignes d'aide de champs qui ont disparu ou ne sont plus à vérifier
    document.querySelectorAll('.cor-aide').forEach(a => { if (!a._champ || !a._champ.isConnected || !eligible(a._champ)) a.remove(); });
    majPastille(n);
    if (obs) obs.takeRecords();   // nos propres changements ne relancent pas une vérification
  }
  const plusTard = (ms = 350) => { clearTimeout(minut); minut = setTimeout(verifierTout, ms); };
  function toast(t){
    if (window.Compte && window.Compte.toast) return window.Compte.toast(t);
    const d = document.createElement('div'); d.className = 'cor-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
  }

  const CSS = `
  mark.cor-m{background:none;color:inherit;text-decoration:underline wavy #E0352B;text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-skip-ink:none;cursor:pointer;border-radius:2px}
  mark.cor-m:hover{background:rgba(224,53,43,.08)}
  .cor-faute{background-image:linear-gradient(#fff,#fff),none;box-shadow:inset 0 -2px 0 #E0352B!important}
  .cor-aide{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:.8rem;color:#5B6475;margin:4px 0 6px;line-height:1.5;font-weight:500;text-align:left}
  .cor-aide .cor-t{font-weight:700;color:#B3372F}
  .cor-aide s{color:#B3372F;text-decoration:line-through}
  .cor-aide button,.cor-pop button,.cor-liste button{font:inherit;cursor:pointer;border-radius:8px}
  .cor-aide button{border:1px solid #BFD0EE;background:#EEF4FD;color:#2F5DAE;padding:1px 8px;font-weight:700;font-size:.8rem}
  .cor-aide .cor-ign,.cor-liste .cor-ign{border-color:#E2E8F0;background:#fff;color:#6B778C;font-weight:600}
  .cor-pop{position:absolute;z-index:90;background:#fff;color:#1E2A42;border:1px solid #DCE3EE;border-radius:14px;box-shadow:0 12px 32px rgba(20,30,50,.22);padding:10px;display:grid;gap:8px;font-size:.9rem}
  .cor-pop-t{font-weight:700;font-size:.86rem;color:#B3372F}
  .cor-pop-s{display:flex;flex-wrap:wrap;gap:6px}
  .cor-pop-s button{border:0;background:#4A7BD0;color:#fff;padding:7px 12px;font-weight:750;font-size:.92rem}
  .cor-pop-v{margin:0;color:#6B778C;font-size:.84rem}
  .cor-pop-b{display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid #EEF1F6;padding-top:8px}
  .cor-pop-b button{border:1px solid #E2E8F0;background:#fff;color:#3B4558;padding:5px 9px;font-size:.8rem;font-weight:650}
  .cor-pastille{position:fixed;left:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:55;border:0;border-radius:50px;background:#fff;color:#B3372F;font:inherit;font-weight:750;font-size:.86rem;padding:9px 14px;box-shadow:0 6px 18px rgba(20,30,50,.22);cursor:pointer;display:flex;align-items:center;gap:6px;border:1.5px solid #F2C4C0}
  .cor-pastille[hidden]{display:none}
  .cor-liste-fond{position:fixed;inset:0;z-index:95;background:rgba(20,28,45,.5);display:flex;align-items:flex-end;justify-content:center}
  @media (min-width:640px){.cor-liste-fond{align-items:center}}
  .cor-liste{background:#fff;color:#1E2A42;width:100%;max-width:520px;max-height:85dvh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}
  @media (min-width:640px){.cor-liste{border-radius:18px}}
  .cor-liste-t{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px;font-size:1.05rem}
  .cor-liste-t button{border:0;background:none;font-size:1.6rem;line-height:1;color:#6B778C;width:36px;height:36px}
  .cor-liste-c{overflow-y:auto;padding:0 16px 8px;display:grid;gap:10px}
  .cor-l{border:1px solid #E6EBF3;border-radius:12px;padding:9px 10px;display:grid;gap:7px}
  .cor-ctx{font-size:.88rem;color:#3B4558;overflow-wrap:anywhere}
  .cor-ctx mark{background:none;color:#B3372F;font-weight:700;text-decoration:underline wavy #E0352B}
  .cor-ch{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .cor-ch button{border:0;background:#4A7BD0;color:#fff;padding:6px 11px;font-weight:750;font-size:.88rem}
  .cor-ch .cor-ign{border:1px solid #E2E8F0;padding:5px 9px;font-size:.8rem}
  .cor-ch em{font-size:.82rem;color:#6B778C}
  .cor-vide{text-align:center;color:#1F7A45;font-weight:700;padding:20px 0}
  .cor-note{font-size:.74rem;color:#8A94A6;padding:8px 16px 14px;margin:0;border-top:1px solid #EEF1F6}
  .cor-toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:#1E2A42;color:#fff;border-radius:12px;padding:10px 16px;z-index:96;font-size:.9rem}
  html.sombre .cor-pop,html.sombre .cor-liste,html.sombre .cor-pastille{background:#1B2434;color:#E6ECF5;border-color:#33415A}
  html.sombre .cor-pop-b button,html.sombre .cor-liste .cor-ign,html.sombre .cor-aide .cor-ign{background:#222D40;color:#C9D3E3;border-color:#33415A}
  html.sombre .cor-ctx{color:#C9D3E3}
  html.sombre .cor-aide{color:#AEB8C9}
  html.sombre .cor-aide button{background:#233456;border-color:#3A5384;color:#BFD3F7}
  html.sombre .cor-faute{background-image:none}
  @media print{mark.cor-m{text-decoration:none}.cor-aide,.cor-pastille{display:none!important}}`;

  function demarrer(){
    if (!champs().length && !document.querySelector('#page, textarea')) return;   // rien à écrire sur cette page
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    // Le dictionnaire se charge quand la page est calme (ou dès qu'on écrit)
    const go = () => charger().then(() => verifierTout()).catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(go, {timeout: 2500}); else setTimeout(go, 1200);
    document.addEventListener('focusin', e => {
      if (!eligible(e.target)) return;
      if (!mots) go();
      if (e.target.matches('.ed')) nettoyer(e.target);
      fermerPop();
    });
    document.addEventListener('focusout', e => { if (eligible(e.target)) plusTard(120); });
    document.addEventListener('input', e => { if (eligible(e.target) && !e.target.matches('.ed')){ if (e.target._corAide) plusTard(700); } else if (e.target.matches && e.target.matches('.ed')) plusTard(900); });
    // Toucher un mot souligné : propositions (sans entrer dans le champ)
    document.addEventListener('pointerdown', e => { const mk = e.target.closest && e.target.closest('mark.cor-m'); if (mk){ e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('click', e => {
      const mk = e.target.closest && e.target.closest('mark.cor-m');
      if (mk){ e.preventDefault(); e.stopPropagation(); ouvrirPop(mk); return; }
      if (pop && !e.target.closest('.cor-pop')) fermerPop();
      const b = e.target.closest && e.target.closest('.cor-aide button'); if (!b) return;
      const a = b.closest('.cor-aide'), el = a._champ;
      if (b.dataset.corRempl) remplacer(el, b.dataset.corRempl, b.dataset.par);
      else if (b.dataset.corIgn) ignorer(b.dataset.corIgn);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape'){ fermerPop(); fermerListe(); } });
    // La feuille se redessine souvent : on revérifie après chaque changement
    try{
      obs = new MutationObserver(l => { if (l.some(m => m.target.nodeType === 1 && !m.target.closest('.cor-pop, .cor-liste-fond, .cor-aide, .cor-pastille, .cor-toast') && ![...m.addedNodes, ...m.removedNodes].every(n => n.nodeType === 1 && n.matches('.cor-aide, .cor-pop, .cor-pastille, .cor-toast, .cor-liste-fond')))) plusTard(400); });
      obs.observe(document.body, {childList: true, subtree: true});
    }catch(e){}
    window.addEventListener('scroll', fermerPop, {passive: true});
  }
  window.DocuCorrecteur = {charger, fautes: t => fautes(t), suggestions: w => suggestions(w), verifier: verifierTout, pret: () => !!mots};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

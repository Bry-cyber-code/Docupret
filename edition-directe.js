/* DocuPrêt — édition directe sur l'aperçu (carte de visite, logo, flyer)
 *
 * On touche un texte ou une image sur l'aperçu : une petite fenêtre s'ouvre juste à côté
 * (en bas de l'écran sur téléphone) pour écrire, changer la taille, la police, la couleur,
 * importer une photo ou un logo. Tout passe par les réglages déjà présents dans la page :
 * on remplit le champ existant et on déclenche son événement, la page fait le reste
 * (dessin, sauvegarde, bouton Annuler).
 *
 * La page appelle :
 *   EditionDirecte.init(cfg)              une fois
 *   EditionDirecte.debut() / .fin()       autour du dessin de l'aperçu (repérage automatique des textes)
 *   EditionDirecte.poser(zones)           ou bien : zones fournies directement (logo)
 *   ctx.zoneEdition?.(cle, x, y, w, h)    zone dessinée à la main (emplacement photo…)
 */
(function(){
  'use strict';
  const ED = window.EditionDirecte = {};
  const $ = id => document.getElementById(id);
  let cfg = null, toile = null, ctx = null, capture = false, brutes = [], zones = [], choisi = null, precedent = null;
  let calque = null, fenetre = null, aide = null;

  // ---------- Styles ----------
  const STYLES = `
  .ed-scene{position:relative}
  .ed-calque{position:absolute;z-index:3;cursor:pointer;touch-action:manipulation}
  .ed-zone{position:absolute;border:1.5px dashed rgba(74,123,208,.75);border-radius:5px;box-shadow:0 0 0 1px rgba(255,255,255,.75),inset 0 0 0 1px rgba(255,255,255,.55);transition:background .15s,border-color .15s;pointer-events:none}
  .ed-calque:hover .ed-zone{border-color:rgba(74,123,208,.85)}
  .ed-zone.sel{border:2px solid #4A7BD0;background:rgba(74,123,208,.10);box-shadow:0 0 0 3px rgba(74,123,208,.18)}
  .ed-zone.img{border-color:rgba(46,160,107,.75)}
  .ed-zone.vide{background:rgba(46,160,107,.06)}
  .ed-aide{font-size:.78rem;color:var(--gris,#6B778C);text-align:center;margin:0;line-height:1.35}
  .ed-aide b{color:var(--bleu,#4A7BD0)}
  .ed-fen{position:fixed;z-index:60;background:var(--blanc,#fff);color:var(--texte,#1E2A42);border:1px solid var(--bord,#E2E8F2);border-radius:16px;box-shadow:0 14px 40px rgba(20,30,50,.28);padding:12px 14px 14px;width:min(360px,calc(100vw - 20px));max-height:min(70vh,560px);overflow:auto;overscroll-behavior:contain;font-size:.9rem}
  .ed-fen.bas{left:0!important;right:0;bottom:0;top:auto!important;width:auto;border-radius:18px 18px 0 0;max-height:58vh;padding-bottom:calc(14px + env(safe-area-inset-bottom))}
  .ed-tete{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .ed-tete b{font-size:.95rem}
  .ed-x{border:0;background:var(--fond,#F6F9FD);width:30px;height:30px;border-radius:50%;font-size:1rem;line-height:1;color:var(--texte,#1E2A42);flex-shrink:0}
  .ed-fen input[type=text],.ed-fen textarea{width:100%;border:1.5px solid var(--bord,#E2E8F2);border-radius:10px;padding:9px 11px;font:inherit;font-size:16px;background:var(--blanc,#fff);color:var(--texte,#1E2A42);resize:vertical}
  .ed-fen input[type=text]:focus,.ed-fen textarea:focus{outline:none;border-color:var(--bleu,#4A7BD0)}
  .ed-lib{display:flex;justify-content:space-between;font-size:.76rem;font-weight:700;color:var(--gris,#6B778C);margin:10px 0 4px}
  .ed-fen input[type=range]{width:100%;accent-color:var(--bleu,#4A7BD0)}
  .ed-rang{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:thin}
  .ed-rang button{flex-shrink:0}
  .ed-pol{border:1.5px solid var(--bord,#E2E8F2);background:var(--blanc,#fff);border-radius:10px;padding:4px 8px;display:grid;justify-items:center;min-width:58px;color:var(--texte,#1E2A42)}
  .ed-pol svg{width:26px;height:26px;display:block;margin:3px 0}
  .ed-pol b{font-size:1.05rem;line-height:1.2}.ed-pol small{font-size:.62rem;color:var(--gris,#6B778C)}
  .ed-pol.on,.ed-seg button.on{border-color:var(--bleu,#4A7BD0);background:var(--bleu-clair,#EAF1FB)}
  .ed-pas{width:28px;height:28px;border-radius:50%;border:2px solid rgba(0,0,0,.08);padding:0}
  .ed-pas.on{box-shadow:0 0 0 2px var(--blanc,#fff),0 0 0 4px var(--bleu,#4A7BD0)}
  .ed-perso{width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;position:relative;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);border:2px solid rgba(0,0,0,.08)}
  .ed-perso input{position:absolute;inset:-6px;opacity:0;width:40px;height:40px;cursor:pointer}
  .ed-seg{display:flex;gap:6px;flex-wrap:wrap}
  .ed-seg button{border:1.5px solid var(--bord,#E2E8F2);background:var(--blanc,#fff);border-radius:50px;padding:5px 11px;font-size:.8rem;color:var(--texte,#1E2A42)}
  .ed-coche{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:.85rem}
  .ed-bas{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .ed-bas button{border-radius:50px;padding:8px 14px;font-weight:700;font-size:.85rem;border:1.5px solid var(--bord,#E2E8F2);background:var(--blanc,#fff);color:var(--texte,#1E2A42)}
  .ed-bas .ok{background:var(--bleu,#4A7BD0);border-color:var(--bleu,#4A7BD0);color:#fff;margin-left:auto}
  .ed-bas .imp{background:#2E9F6B;border-color:#2E9F6B;color:#fff}
  .ed-note{font-size:.74rem;color:var(--gris,#6B778C);margin-top:8px}
  .ed-loupe{position:fixed;inset:0;z-index:70;background:rgba(12,18,30,.96);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:grid;grid-template-rows:auto 1fr auto;gap:10px;padding:14px;color:#fff}
  .ed-loupe-tete{display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:700}
  .ed-loupe-tete button{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:50px;padding:7px 14px;font-weight:700}
  .ed-loupe-img{display:grid;place-items:center;min-height:0;overflow:auto}
  .ed-loupe-img img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
  .ed-loupe-img.damier img{background:#fff;background-image:linear-gradient(45deg,#E9EDF3 25%,transparent 25%,transparent 75%,#E9EDF3 75%),linear-gradient(45deg,#E9EDF3 25%,transparent 25%,transparent 75%,#E9EDF3 75%);background-size:20px 20px;background-position:0 0,10px 10px}
  .ed-loupe-pied{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
  .ed-loupe-pied button{border:1.5px solid rgba(255,255,255,.35);background:transparent;color:#fff;border-radius:50px;padding:6px 14px;font-weight:700}
  .ed-loupe-pied button.on{background:#fff;color:#1E2A42}
  html.sombre .ed-fen{background:#1b2027;color:#c9d3e7;border-color:#2a3a55}
  html.sombre .ed-fen input[type=text],html.sombre .ed-fen textarea,html.sombre .ed-pol,html.sombre .ed-seg button,html.sombre .ed-bas button:not(.ok):not(.imp){background:#141a22;color:#c9d3e7;border-color:#2a3a55}
  html.sombre .ed-x{background:#141a22;color:#c9d3e7}`;

  // ---------- Outils ----------
  const norm = t => String(t == null ? '' : t).toLowerCase().replace(/[…]+$/, '').replace(/\s+/g, ' ').trim();
  const valeur = cle => cfg.valeur ? cfg.valeur(cle) : ($(cle) ? $(cle).value : '');
  function declencher(el, type){ if (el) el.dispatchEvent(new Event(type || 'input', {bubbles: true})); }

  // Quel champ correspond à ce texte dessiné ?
  // « prefere » : champ du texte dessiné juste avant (une ligne coupée continue le même bloc)
  function champDuTexte(txt, prefere){
    const t = norm(txt); if (!t) return null;
    let meilleur = null, score = 0, long = 1e9, scorePref = 0;
    Object.keys(cfg.champs || {}).forEach(cle => {
      if (cfg.champs[cle].reperer === false) return;
      const brut = String(valeur(cle) || ''), v = norm(brut); if (!v) return;
      const segs = [v].concat(brut.split(/\n|\|/).map(norm).filter(Boolean));
      let s = 0;
      if (segs.includes(t)) s = 3;
      else if (t.length > 1 && v.includes(t)) s = 2;
      else if (t.length > 3 && segs.some(g => g.length > 3 && t.includes(g))) s = 1;
      if (cle === prefere) scorePref = s;
      if (s > score || (s && s === score && v.length < long)){ meilleur = cle; score = s; long = v.length; }
    });
    return scorePref >= 2 ? prefere : meilleur;
  }

  // Rectangle (repère du dessin) → pixels de la toile
  function versToile(c, x, y, w, h){
    const m = c.getTransform();
    const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [m.a * a + m.c * b + m.e, m.b * a + m.d * b + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
  }

  // Espion posé sur la toile de l'aperçu : on note où chaque texte et chaque image sont dessinés
  function espionner(){
    ctx = toile.getContext('2d');
    if (ctx.__ed) return; ctx.__ed = true;
    const fillText = ctx.fillText, drawImage = ctx.drawImage;
    ctx.fillText = function(txt, x, y){
      fillText.apply(this, arguments);
      if (!capture) return;
      try{
        const s = String(txt), m = this.measureText(s);
        const g = x - (m.actualBoundingBoxLeft || 0), d = x + (m.actualBoundingBoxRight || m.width);
        const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 10, desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 3;
        const haut = y - (m.actualBoundingBoxAscent != null ? Math.max(m.actualBoundingBoxAscent, asc * .75) : asc), bas = y + Math.max(m.actualBoundingBoxDescent || 0, desc * .5);
        // Ligne qui réunit plusieurs coordonnées (« tél · e-mail ») : une zone par morceau
        const sep = /\s+·\s+/g; let parts = [], dernier = 0, r;
        while ((r = sep.exec(s))){ parts.push([dernier, r.index]); dernier = r.index + r[0].length; }
        parts.push([dernier, s.length]);
        if (parts.length > 1 && this.textAlign !== 'right' && this.textAlign !== 'end'){
          const l0 = this.measureText(s).width, k = (d - g) / (l0 || 1);
          parts.forEach(([a, b]) => {
            const morceau = s.slice(a, b), xa = g + this.measureText(s.slice(0, a)).width * k, xb = g + this.measureText(s.slice(0, b)).width * k;
            const cle = champDuTexte(morceau); if (cle) brutes.push({cle, ...versToile(this, xa, haut, xb - xa, bas - haut)});
            precedent = null;
          });
          return;
        }
        const r0 = versToile(this, g, haut, d - g, bas - haut);
        // la ligne précédente compte seulement si elle est juste au-dessus
        const pref = precedent && Math.abs(r0.y - (precedent.y + precedent.h)) < r0.h * 1.2 && Math.abs(r0.x - precedent.x) < r0.h * 6 ? precedent.cle : null;
        const cle = champDuTexte(s, pref);
        if (cle){ const z = {cle, ...r0}; brutes.push(z); precedent = z; } else precedent = null;
      }catch(e){}
    };
    ctx.drawImage = function(img){
      drawImage.apply(this, arguments);
      if (!capture || !cfg.imageCle) return;
      try{
        const cle = cfg.imageCle(img); if (!cle) return;
        const a = arguments, n = a.length;
        const x = n >= 9 ? a[5] : a[1], y = n >= 9 ? a[6] : a[2], w = n >= 5 ? a[n === 9 ? 7 : 3] : img.width, h = n >= 5 ? a[n === 9 ? 8 : 4] : img.height;
        brutes.push({cle, ...versToile(this, x, y, w, h)});
      }catch(e){}
    };
    ctx.zoneEdition = function(cle, x, y, w, h, opt){ if (capture) brutes.push({cle, vide: !!(opt && opt.vide), ...versToile(this, x, y, w, h)}); };
  }

  // Les lignes d'un même texte (paragraphe, liste) forment une seule zone
  function regrouper(liste){
    const res = [];
    liste.forEach(z => {
      if (z.w < 1 || z.h < 1) return;
      const voisin = res.find(r => r.cle === z.cle && !(z.x > r.x + r.w + z.h * 1.2 || z.x + z.w < r.x - z.h * 1.2 || z.y > r.y + r.h + z.h * .9 || z.y + z.h < r.y - z.h * .9));
      if (voisin){
        const x = Math.min(voisin.x, z.x), y = Math.min(voisin.y, z.y);
        voisin.w = Math.max(voisin.x + voisin.w, z.x + z.w) - x; voisin.h = Math.max(voisin.y + voisin.h, z.y + z.h) - y; voisin.x = x; voisin.y = y;
        voisin.vide = voisin.vide && z.vide;
      } else res.push({...z});
    });
    // un regroupement peut en rapprocher deux autres : on recommence tant que ça bouge
    return res.length < liste.length && res.length > 1 ? regrouper(res) : res;
  }

  // ---------- Calque des zones sur l'aperçu ----------
  function placerCalque(){
    if (!calque || !toile) return;
    const l = toile.clientWidth, h = toile.clientHeight;
    calque.style.left = toile.offsetLeft + 'px'; calque.style.top = toile.offsetTop + 'px';
    calque.style.width = l + 'px'; calque.style.height = h + 'px';
    const kx = l / (toile.width || 1), ky = h / (toile.height || 1), m = 2;
    calque.innerHTML = zones.map((z, i) => {
      const img = cfg.images && cfg.images[z.cle];
      return `<div class="ed-zone${img ? ' img' : ''}${z.vide ? ' vide' : ''}${choisi && choisi.cle === z.cle ? ' sel' : ''}" data-i="${i}" style="left:${(z.x * kx - m).toFixed(1)}px;top:${(z.y * ky - m).toFixed(1)}px;width:${(z.w * kx + 2 * m).toFixed(1)}px;height:${(z.h * ky + 2 * m).toFixed(1)}px"></div>`;
    }).join('');
  }

  function zoneSous(px, py){
    const kx = (toile.width || 1) / toile.clientWidth, ky = (toile.height || 1) / toile.clientHeight;
    const x = px * kx, y = py * ky, tol = 10 * kx;
    let best = null, bestScore = 1e18;
    zones.forEach(z => {
      const dx = Math.max(z.x - x, 0, x - (z.x + z.w)), dy = Math.max(z.y - y, 0, y - (z.y + z.h));
      const dist = Math.hypot(dx, dy); if (dist > tol) return;
      const score = dist * 1e7 + z.w * z.h;   // dedans d'abord, puis la plus petite
      if (score < bestScore){ best = z; bestScore = score; }
    });
    return best;
  }

  // ---------- Petite fenêtre d'édition ----------
  function fermer(){
    if (fenetre){ fenetre.remove(); fenetre = null; }
    choisi = null; placerCalque();
  }
  ED.fermer = fermer;

  function rangee(html){ const d = document.createElement('div'); d.className = 'ed-rang'; d.innerHTML = html; return d; }
  function libelle(txt, sortie){ const d = document.createElement('div'); d.className = 'ed-lib'; d.innerHTML = `<span>${txt}</span><span>${sortie || ''}</span>`; return d; }

  // Curseur relié à un curseur existant de la page
  function curseur(fen, id, titre){
    const o = $(id); if (!o) return;
    const lib = libelle(titre), sortie = lib.lastChild;
    const r = document.createElement('input'); r.type = 'range';
    ['min', 'max', 'step'].forEach(a => r.setAttribute(a, o.getAttribute(a)));
    r.value = o.value; r.setAttribute('aria-label', titre);
    const maj = () => { const out = $('v-' + id); sortie.textContent = out ? out.textContent : ''; };
    r.addEventListener('input', () => { o.value = r.value; declencher(o); maj(); });
    r.dataset.miroir = id;
    fen.append(lib, r); maj();
  }

  // Polices : copies des boutons de la page
  function polices(fen, conteneur, titre){
    const c = $(conteneur); if (!c) return;
    fen.append(libelle(titre || 'Police'));
    const rg = rangee('');
    c.querySelectorAll('[data-v]').forEach(b => {
      const n = document.createElement('button'); n.type = 'button'; n.className = 'ed-pol'; n.innerHTML = b.innerHTML; n.dataset.v = b.dataset.v; n.dataset.miroirPol = conteneur;
      n.addEventListener('click', () => { b.click(); synchroniser(); });
      rg.appendChild(n);
    });
    fen.append(rg);
  }

  // Couleurs : copies des pastilles de la page + couleur personnalisée
  function couleurs(fen, conteneur, titre){
    const c = $(conteneur); if (!c) return;
    fen.append(libelle(titre || 'Couleur'));
    const rg = rangee('');
    c.querySelectorAll('.pastille').forEach(b => {
      const n = document.createElement('button'); n.type = 'button'; n.className = 'ed-pas'; n.style.background = b.dataset.v; n.dataset.v = b.dataset.v; n.dataset.miroirPas = conteneur;
      n.setAttribute('aria-label', b.getAttribute('aria-label') || 'Couleur');
      n.addEventListener('click', () => { b.click(); synchroniser(); });
      rg.appendChild(n);
    });
    const perso = $(conteneur + '-perso') || c.querySelector('input[type=color]');
    if (perso){
      const l = document.createElement('label'); l.className = 'ed-perso'; l.title = 'Autre couleur';
      const i = document.createElement('input'); i.type = 'color'; i.value = perso.value || '#4A7BD0'; i.setAttribute('aria-label', 'Autre couleur');
      i.addEventListener('input', () => { perso.value = i.value; declencher(perso); });
      l.appendChild(i); rg.appendChild(l);
    }
    fen.append(rg);
  }

  // Boutons à choix (segments) : copies d'un groupe de boutons data-v de la page
  function segments(fen, conteneur, titre){
    const c = $(conteneur); if (!c) return;
    fen.append(libelle(titre));
    const d = document.createElement('div'); d.className = 'ed-seg';
    c.querySelectorAll('[data-v]').forEach(b => {
      const n = document.createElement('button'); n.type = 'button'; n.textContent = b.textContent.trim(); n.dataset.v = b.dataset.v; n.dataset.miroirSeg = conteneur;
      n.addEventListener('click', () => { b.click(); synchroniser(); });
      d.appendChild(n);
    });
    fen.append(d);
  }

  function coche(fen, id, titre){
    const o = $(id); if (!o) return;
    const l = document.createElement('label'); l.className = 'ed-coche';
    const i = document.createElement('input'); i.type = 'checkbox'; i.checked = o.checked; i.dataset.miroirCoche = id;
    i.addEventListener('change', () => { o.checked = i.checked; declencher(o, 'change'); });
    l.append(i, document.createTextNode(' ' + titre)); fen.append(l);
  }

  // Remet la fenêtre à jour après un nouveau dessin (états « choisi », curseurs…)
  function synchroniser(){
    if (!fenetre) return;
    fenetre.querySelectorAll('[data-miroir-pol]').forEach(n => { const o = $(n.dataset.miroirPol).querySelector(`[data-v="${CSS.escape(n.dataset.v)}"]`); n.classList.toggle('on', !!(o && o.classList.contains('on'))); });
    fenetre.querySelectorAll('[data-miroir-pas]').forEach(n => { const o = $(n.dataset.miroirPas).querySelector(`[data-v="${CSS.escape(n.dataset.v)}"]`); n.classList.toggle('on', !!(o && o.classList.contains('on'))); });
    fenetre.querySelectorAll('[data-miroir-seg]').forEach(n => { const o = $(n.dataset.miroirSeg).querySelector(`[data-v="${CSS.escape(n.dataset.v)}"]`); n.classList.toggle('on', !!(o && o.classList.contains('on'))); });
    fenetre.querySelectorAll('[data-miroir]').forEach(r => { const o = $(r.dataset.miroir); if (o && document.activeElement !== r) r.value = o.value; const out = $('v-' + r.dataset.miroir); if (out && r.previousSibling) r.previousSibling.lastChild.textContent = out.textContent; });
    fenetre.querySelectorAll('[data-miroir-coche]').forEach(i => { const o = $(i.dataset.miroirCoche); if (o) i.checked = o.checked; });
    fenetre.querySelectorAll('[data-texte]').forEach(i => { if (document.activeElement !== i) i.value = valeur(i.dataset.texte) || ''; });
    const img = fenetre.dataset.image && cfg.images[fenetre.dataset.image];
    if (img){ const a = fenetre.querySelector('.imp'); if (a) a.textContent = img.present() ? img.changer || '📷 Changer' : img.ajouter || '📷 Importer'; const r = fenetre.querySelector('.ret'); if (r) r.hidden = !img.present(); }
  }

  function boutons(fen, liste){
    const d = document.createElement('div'); d.className = 'ed-bas';
    liste.forEach(([txt, cls, action]) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || ''; b.textContent = txt; b.addEventListener('click', action); d.appendChild(b); });
    fen.append(d); return d;
  }

  function ouvrirFenetre(z){
    if (fenetre) fenetre.remove();
    choisi = z; placerCalque();
    const fen = fenetre = document.createElement('div');
    fen.className = 'ed-fen'; fen.setAttribute('role', 'dialog');
    const champ = cfg.champs && cfg.champs[z.cle], img = cfg.images && cfg.images[z.cle], zf = z.cle === '__fond' ? cfg.fond : null, sp = cfg.speciaux && cfg.speciaux[z.cle];
    const def = champ || img || zf || sp || {};
    fen.setAttribute('aria-label', def.titre || 'Modifier');
    const tete = document.createElement('div'); tete.className = 'ed-tete';
    tete.innerHTML = `<b>${def.titre || 'Modifier'}</b><button type="button" class="ed-x" aria-label="Fermer">✕</button>`;
    tete.lastChild.addEventListener('click', fermer);
    fen.append(tete);

    if (champ){
      const o = $(champ.id || z.cle);
      const multi = champ.multi || (o && o.tagName === 'TEXTAREA');
      const e = document.createElement(multi ? 'textarea' : 'input');
      if (!multi) e.type = 'text';
      if (multi) e.rows = Math.min(6, Math.max(2, String(valeur(z.cle) || '').split('\n').length + 1));
      if (o && o.maxLength > 0) e.maxLength = o.maxLength;
      e.value = valeur(z.cle) || ''; e.dataset.texte = z.cle; e.setAttribute('aria-label', def.titre || z.cle);
      if (o && o.placeholder) e.placeholder = o.placeholder;
      e.spellcheck = true; e.setAttribute('lang', 'fr');
      e.addEventListener('input', () => { if (o){ o.value = e.value; declencher(o); } });
      if (!multi) e.addEventListener('keydown', ev => { if (ev.key === 'Enter'){ ev.preventDefault(); fermer(); } });
      fen.append(e);
      if (champ.note) { const n = document.createElement('p'); n.className = 'ed-note'; n.textContent = champ.note; fen.append(n); }
      setTimeout(() => { try{ e.focus({preventScroll: true}); const n = e.value.length; e.setSelectionRange(n, n); }catch(er){} }, 30);
    }
    if (img){
      fen.dataset.image = z.cle;
      const liste = [[img.present() ? (img.changer || '📷 Changer') : (img.ajouter || '📷 Importer'), 'imp', () => { $(img.fichier).click(); }]];
      if (img.retirer) liste.push(['Retirer', 'ret', () => { $(img.retirer).click(); setTimeout(fermer, 50); }]);
      boutons(fen, liste);
      if (img.note){ const n = document.createElement('p'); n.className = 'ed-note'; n.textContent = img.note; fen.append(n); }
    }
    (def.reglages || []).forEach(r => {
      if (r.curseur) curseur(fen, r.curseur, r.titre);
      else if (r.polices) polices(fen, r.polices, r.titre);
      else if (r.couleurs) couleurs(fen, r.couleurs, r.titre);
      else if (r.segments) segments(fen, r.segments, r.titre);
      else if (r.coche) coche(fen, r.coche, r.titre);
    });
    const fin = [];
    (def.actions || []).forEach(a => fin.push([a.texte, a.cls || '', () => { a.faire(); if (a.fermer !== false) fermer(); }]));
    fin.push(['Terminé', 'ok', fermer]);
    boutons(fen, fin);
    document.body.appendChild(fen);
    synchroniser();
    // l'élément choisi visible dans chaque rangée
    fen.querySelectorAll('.ed-rang').forEach(rg => { const on = rg.querySelector('.on'); if (on) rg.scrollLeft = on.offsetLeft - rg.clientWidth / 2 + on.offsetWidth / 2; });
    positionner();
  }

  // Sur téléphone : en bas de l'écran ; sur ordinateur : juste sous (ou au-dessus de) la zone touchée
  function positionner(){
    if (!fenetre) return;
    const etroit = window.innerWidth < 900;
    fenetre.classList.toggle('bas', etroit);
    if (etroit){ fenetre.style.left = ''; fenetre.style.top = ''; return; }
    const r = toile.getBoundingClientRect(), kx = r.width / (toile.width || 1), ky = r.height / (toile.height || 1);
    const z = choisi && choisi.cle !== '__fond' ? choisi : {x: 0, y: 0, w: toile.width, h: toile.height};
    const zr = {l: r.left + z.x * kx, t: r.top + z.y * ky, b: r.top + (z.y + z.h) * ky, w: z.w * kx};
    const fw = fenetre.offsetWidth, fh = fenetre.offsetHeight;
    let left, top;
    if (r.right + 16 + fw < window.innerWidth - 10){ left = r.right + 16; top = zr.t - 20; }          // à droite de l'aperçu
    else if (r.left - 16 - fw > 10){ left = r.left - 16 - fw; top = zr.t - 20; }                       // à gauche
    else {                                                                                               // dessous, sinon au-dessus
      left = Math.min(window.innerWidth - fw - 10, Math.max(10, zr.l + zr.w / 2 - fw / 2));
      top = zr.b + 10;
      if (top + fh > window.innerHeight - 10) top = zr.t - fh - 10;
    }
    top = Math.max(70, Math.min(top, window.innerHeight - fh - 10));
    fenetre.style.left = left + 'px'; fenetre.style.top = top + 'px';
  }

  // ---------- Aperçu en grand ----------
  ED.apercu = function(){
    const faces = (cfg.imagesApercu ? cfg.imagesApercu() : [{nom: '', src: toile.toDataURL('image/png')}]).filter(f => f && f.src);
    if (!faces.length) return;
    fermer();
    const d = document.createElement('div'); d.className = 'ed-loupe'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Aperçu');
    d.innerHTML = `<div class="ed-loupe-tete"><span>👁️ Aperçu</span><button type="button">Fermer ✕</button></div><div class="ed-loupe-img${cfg.damier ? ' damier' : ''}"><img alt="Aperçu"></div><div class="ed-loupe-pied"></div>`;
    const im = d.querySelector('img'), pied = d.querySelector('.ed-loupe-pied');
    const voir = i => { im.src = faces[i].src; pied.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', i === j)); };
    if (faces.length > 1) pied.innerHTML = faces.map(f => `<button type="button">${f.nom}</button>`).join('');
    pied.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', e => { e.stopPropagation(); voir(i); }));
    const fermerLoupe = () => { d.remove(); document.removeEventListener('keydown', echap); };
    const echap = e => { if (e.key === 'Escape') fermerLoupe(); };
    d.querySelector('.ed-loupe-tete button').addEventListener('click', fermerLoupe);
    d.querySelector('.ed-loupe-img').addEventListener('click', e => { if (e.target === e.currentTarget) fermerLoupe(); });
    document.addEventListener('keydown', echap);
    document.body.appendChild(d); voir(Math.min(cfg.faceActive ? cfg.faceActive() : 0, faces.length - 1));
  };

  // ---------- Mise en route ----------
  ED.init = function(c){
    cfg = c; toile = c.toile;
    if (!$('ed-css')){ const st = document.createElement('style'); st.id = 'ed-css'; st.textContent = STYLES; document.head.appendChild(st); }
    const scene = toile.parentElement; scene.classList.add('ed-scene');
    calque = document.createElement('div'); calque.className = 'ed-calque'; calque.setAttribute('aria-hidden', 'true');
    scene.appendChild(calque);
    if (!c.manuel) espionner();
    // Phrase d'aide + bouton Aperçu
    if (c.aideDans){
      aide = document.createElement('p'); aide.className = 'ed-aide';
      aide.innerHTML = c.aide || '✏️ <b>Touchez un texte ou une image</b> pour le modifier';
      c.aideDans.parentElement.insertBefore(aide, c.aideDans);
    }
    if (c.boutonApercuDans){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'outil'; b.id = 'ed-apercu';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>Aperçu';
      b.addEventListener('click', ED.apercu);
      c.boutonApercuDans.insertBefore(b, c.boutonApercuDans.firstChild);
    }
    // Toucher l'aperçu
    let depart = null;
    calque.addEventListener('pointerdown', e => { depart = [e.clientX, e.clientY]; });
    calque.addEventListener('click', e => {
      if (depart && Math.hypot(e.clientX - depart[0], e.clientY - depart[1]) > 12) return;
      const r = calque.getBoundingClientRect();
      const z = zoneSous(e.clientX - r.left, e.clientY - r.top);
      if (z){
        const img = cfg.images && cfg.images[z.cle];
        // Emplacement photo vide : on ouvre directement l'import
        if (img && !img.present() && img.importDirect !== false){ choisi = z; placerCalque(); $(img.fichier).click(); ouvrirFenetre(z); return; }
        ouvrirFenetre(z);
      } else if (cfg.fond) ouvrirFenetre({cle: '__fond', x: 0, y: 0, w: toile.width, h: toile.height});
    });
    // Toucher le fond autour de l'aperçu
    scene.addEventListener('click', e => { if (e.target === scene && cfg.fond) ouvrirFenetre({cle: '__fond', x: 0, y: 0, w: toile.width, h: toile.height}); });
    // Fermer en touchant ailleurs
    document.addEventListener('pointerdown', e => {
      if (!fenetre || fenetre.contains(e.target) || calque.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.ed-loupe')) return;
      fermer();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && fenetre) fermer(); });
    window.addEventListener('resize', () => { placerCalque(); positionner(); });
    if (window.ResizeObserver) new ResizeObserver(() => { placerCalque(); positionner(); }).observe(toile);
    window.addEventListener('scroll', () => { if (fenetre && !fenetre.classList.contains('bas')) positionner(); }, {passive: true});
  };

  ED.debut = function(){ brutes = []; precedent = null; capture = true; };
  ED.fin = function(){
    capture = false;
    ED.poser(brutes);
  };
  ED.poser = function(liste){
    zones = regrouper(liste || []);
    if (choisi && choisi.cle !== '__fond'){
      const z = zones.find(x => x.cle === choisi.cle);
      if (z) choisi = z;
    }
    placerCalque(); synchroniser(); positionner();
    // la page fixe la taille affichée de la toile juste après le dessin : on se recale ensuite
    requestAnimationFrame(() => { placerCalque(); positionner(); });
  };
  ED.zones = () => zones.map(z => ({...z}));
})();

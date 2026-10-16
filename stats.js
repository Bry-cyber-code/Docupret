/* DocuPrêt — statistiques de visite, maison et anonymes.
 * Chaque visite ajoute +1 à des compteurs du jour dans Firebase (stats/j-AAAA-MM-JJ).
 * Rien de personnel n'est enregistré : ni adresse IP, ni identifiant, ni cookie.
 * Seul le propriétaire du site peut lire ces chiffres (page stats.html).
 */
(function(){
  'use strict';
  const PROJET = 'docupret-cd4f0', CLE = 'AIzaSyDSvwqeTZZeOaz92Yz5QIlgTP1VTKK9Jwg';
  const URL_ = `https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents:commit?key=${CLE}`;
  const actif = /(^|\.)docupret\.fr$/.test(location.hostname) && !navigator.webdriver;
  const lireLS = (k, s) => { try{ return (s || localStorage).getItem(k); }catch(e){ return null; } };
  const ecrireLS = (k, v, s) => { try{ (s || localStorage).setItem(k, v); }catch(e){} };
  const moi = () => lireLS('docupret_admin') === '1';   // vos propres visites ne sont pas comptées

  const nom = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'inconnu';
  const cle = s => { const n = nom(s); return /^[a-z_]/.test(n) ? n : 'x' + n; };
  function jour(){ const d = new Date(), p = n => String(n).padStart(2, '0'); return `j-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

  // Envoie des +1 : {chemin: nombre}
  function ajouter(champs){
    if (!actif || moi()) return;
    const doc = `projects/${PROJET}/databases/(default)/documents/stats/${jour()}`;
    const corps = JSON.stringify({writes: [{
      update: {name: doc, fields: {}}, updateMask: {fieldPaths: []},
      updateTransforms: Object.entries(champs).map(([f, n]) => ({fieldPath: f, increment: {integerValue: String(n)}}))
    }]});
    try{ fetch(URL_, {method: 'POST', body: corps, keepalive: true, headers: {'Content-Type': 'application/json'}}).catch(() => {}); }catch(e){}
  }

  // ---------- Page vue ----------
  function page(){
    const q = new URLSearchParams(location.search), f = location.pathname.split('/').pop().replace(/\.html$/, '') || 'accueil';
    const t = q.get('type');
    return f === 'index' ? 'accueil' : (t && /^[a-z]+$/.test(t) && (f === 'facture' || f === 'lettre') ? `${f}_${t}` : f);
  }
  function source(){
    if (new URLSearchParams(location.search).get('source') === 'appli' || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)) return 'appli';
    let r = ''; try{ r = document.referrer ? new URL(document.referrer).hostname : ''; }catch(e){}
    if (!r) return 'direct';
    if (/(^|\.)docupret\.fr$/.test(r)) return null;
    const connus = {google: /google\./, bing: /bing\./, facebook: /facebook\.|fb\./, instagram: /instagram\./, whatsapp: /whatsapp/, youtube: /youtube\./, tiktok: /tiktok\./, chatgpt: /chatgpt|openai/, yahoo: /yahoo\./, qwant: /qwant\./, ecosia: /ecosia\./};
    for (const [k, re] of Object.entries(connus)) if (re.test(r)) return k;
    return 'autre_site';
  }
  function vue(){
    const c = {v: 1};
    c['p.' + cle(page())] = 1;
    if (!lireLS('docupret_vu', sessionStorage)){
      ecrireLS('docupret_vu', '1', sessionStorage);
      c.vis = 1;
      const s = source(); c['src.' + cle(s || 'direct')] = 1;
      c['app.' + (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'telephone' : 'ordinateur')] = 1;
      if (!lireLS('docupret_deja')){ ecrireLS('docupret_deja', '1'); c.nv = 1; }
    }
    ajouter(c);
  }

  // ---------- Actions ----------
  const evenement = (nomEv, n) => ajouter({['ev.' + cle(nomEv)]: n || 1});
  window.DocuStats = {evenement};

  // Téléchargements (factures : précis, par type ; autres pages : bouton « Télécharger » / « PDF » / « Imprimer »)
  window.addEventListener('docupret-telecharge', e => { const d = e.detail || {}; evenement('pdf_' + (d.type || 'document')); });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button, a');
    if (!b || b.id === 'telecharger' || b.closest('#env-gmail, .env-boite')) return;
    const t = (b.textContent || '').trim();
    if (/t[ée]l[ée]charger|^pdf$|imprimer/i.test(t) && !/application/i.test(t)) evenement('pdf_' + page());
  }, true);
  window.addEventListener('appinstalled', () => evenement('appli_installee'));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vue); else vue();
})();

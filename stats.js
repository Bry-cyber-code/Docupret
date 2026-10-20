/* DocuPrêt — statistiques de visite, maison et anonymes.
 * Chaque visite ajoute +1 à des compteurs du jour dans Firebase (stats/j-AAAA-MM-JJ).
 * Rien de personnel n'est enregistré pour les visiteurs : ni adresse IP, ni identifiant, ni cookie.
 * Seule exception : pour les personnes connectées à un compte, le nombre de documents
 * téléchargés (et leur type) est rattaché au compte, pour le classement (classement/{uid}).
 * Seul le propriétaire du site peut lire ces chiffres (page stats.html).
 */
(function(){
  'use strict';
  const PROJET = 'docupret-cd4f0', CLE = 'AIzaSyDSvwqeTZZeOaz92Yz5QIlgTP1VTKK9Jwg', ADMIN = 'QOC6tTqjsKTdO9zR5NfQkhJqkup2';
  const URL_ = `https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents:commit?key=${CLE}`;
  const actif = /(^|\.)docupret\.fr$/.test(location.hostname) && !navigator.webdriver && (() => { try{ return window.self === window.top; }catch(e){ return false; } })();
  const lireLS = (k, s) => { try{ return (s || localStorage).getItem(k); }catch(e){ return null; } };
  const ecrireLS = (k, v, s) => { try{ (s || localStorage).setItem(k, v); }catch(e){} };
  const SS = (() => { try{ return sessionStorage; }catch(e){ return null; } })();
  const lireS = k => SS ? lireLS(k, SS) : null, ecrireS = (k, v) => SS && ecrireLS(k, v, SS);
  const moi = () => lireLS('docupret_admin') === '1';   // vos propres visites ne sont pas comptées

  const nom = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'inconnu';
  const cle = s => { const n = nom(s); return /^[a-z_]/.test(n) ? n : 'x' + n; };
  function jour(){ const d = new Date(), p = n => String(n).padStart(2, '0'); return `j-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

  // Envoie des +1 (ou -1) : {chemin: nombre}
  // Les compteurs d'origine et les compteurs détaillés partent séparément :
  // si les règles Firebase refusent les uns, les autres sont quand même comptés.
  const ORIGINE = /^(v|vis|nv|p|src|app|ev)(\.|$)/;
  function ajouter(champs){
    const l = Object.entries(champs);
    envoyer(l.filter(([f]) => ORIGINE.test(f)));
    envoyer(l.filter(([f]) => !ORIGINE.test(f)));
  }
  function envoyer(l){
    if (!actif || moi()) return;
    l = l.filter(([, n]) => n);
    if (!l.length) return;
    const doc = `projects/${PROJET}/databases/(default)/documents/stats/${jour()}`;
    const corps = JSON.stringify({writes: [{
      update: {name: doc, fields: {}}, updateMask: {fieldPaths: []},
      updateTransforms: l.map(([f, n]) => ({fieldPath: f, increment: {integerValue: String(n)}}))
    }]});
    try{ fetch(URL_, {method: 'POST', body: corps, keepalive: true, headers: {'Content-Type': 'application/json'}}).catch(() => {}); }catch(e){}
  }

  // ---------- Page vue ----------
  function page(){
    const q = new URLSearchParams(location.search), f = location.pathname.split('/').pop().replace(/\.html$/, '') || 'accueil';
    const t = q.get('type');
    if (f === 'index') return 'accueil';
    if (t && /^[a-z]+$/.test(t) && (f === 'facture' || f === 'lettre')) return `${f}_${t}`;
    return window.DOCU_PAGE_STATS || f;
  }
  const P = cle(page());
  // Nom du document de la page, le même que pour les téléchargements (pdf_facture, pdf_lettre_demission…)
  const docPage = () => { const p = page(); return /^facture_/.test(p) ? p.slice(8) : p; };
  const PAS_UN_DOCUMENT = /^(accueil|compte|stats|apropos|mentions_legales|cgu|tva|simulateur|frais_kilometriques|kits|kit|x404|lettre)$/;

  function source(){
    if (new URLSearchParams(location.search).get('source') === 'appli' || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)) return 'appli';
    let r = ''; try{ r = document.referrer ? new URL(document.referrer).hostname : ''; }catch(e){}
    const ua = navigator.userAgent;
    if (!r){
      // Navigateurs intégrés aux applications : elles ne disent pas d'où vient la personne, mais se reconnaissent
      if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) return 'facebook';
      if (/Instagram/i.test(ua)) return 'instagram';
      if (/Snapchat/i.test(ua)) return 'snapchat';
      if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'tiktok';
      if (/LinkedInApp/i.test(ua)) return 'linkedin';
      return 'direct';
    }
    if (/(^|\.)docupret\.fr$/.test(r)) return null;
    const connus = {google: /google\.|googlequicksearchbox/, gmail: /mail\.google|com\.google\.android\.gm$/, bing: /bing\./, facebook: /facebook\.|fb\.|messenger/, instagram: /instagram\./, whatsapp: /whatsapp/, youtube: /youtube\./, tiktok: /tiktok\./, snapchat: /snapchat/, linkedin: /linkedin|lnkd\.in/, chatgpt: /chatgpt|openai/, yahoo: /yahoo\./, qwant: /qwant\./, ecosia: /ecosia\./, duckduckgo: /duckduckgo/, outlook: /outlook\.|live\.com|hotmail/, leboncoin: /leboncoin/};
    for (const [k, re] of Object.entries(connus)) if (re.test(r)) return k;
    return 'autre_site';
  }

  // ---------- Appareil précis ----------
  function appareil(){
    const ua = navigator.userAgent, w = Math.min(screen.width || 0, screen.height || 0) || window.innerWidth, larg = screen.width || window.innerWidth;
    const tactile = navigator.maxTouchPoints > 1;
    let os = 'autre';
    if (/iPhone|iPod/.test(ua)) os = 'iphone';
    else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && tactile)) os = 'ipad';
    else if (/Android/.test(ua)) os = /Mobile/.test(ua) ? 'android' : 'tablette_android';
    else if (/Windows/.test(ua)) os = 'windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'mac';
    else if (/CrOS/.test(ua)) os = 'chromebook';
    else if (/Linux/.test(ua)) os = 'linux';
    let nav = 'autre';
    if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) nav = 'appli_facebook';
    else if (/Instagram/i.test(ua)) nav = 'appli_instagram';
    else if (/Snapchat/i.test(ua)) nav = 'appli_snapchat';
    else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) nav = 'appli_tiktok';
    else if (/SamsungBrowser/.test(ua)) nav = 'samsung';
    else if (/Edg(e|A|iOS)?\//.test(ua)) nav = 'edge';
    else if (/OPR\/|Opera|OPX/.test(ua)) nav = 'opera';
    else if (/Firefox|FxiOS/.test(ua)) nav = 'firefox';
    else if (/GSA\//.test(ua)) nav = 'appli_google';
    else if (/CriOS|Chrome/.test(ua)) nav = 'chrome';
    else if (/Safari/.test(ua)) nav = 'safari';
    const ecr = larg < 768 ? (w < 375 ? 'petit_telephone' : 'telephone') : larg < 1024 ? 'tablette' : larg < 1440 ? 'ordinateur' : 'grand_ecran';
    return {os, nav, ecr};
  }

  // ---------- Lieu (d'après le fuseau horaire de l'appareil : aucune adresse IP n'est utilisée) ----------
  function pays(){
    let tz = ''; try{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }catch(e){}
    const T = {'Europe/Paris': 'france', 'Europe/Brussels': 'belgique', 'Europe/Zurich': 'suisse', 'Europe/Luxembourg': 'luxembourg', 'Europe/Monaco': 'monaco',
      'Indian/Reunion': 'la_reunion', 'Indian/Mayotte': 'mayotte', 'America/Guadeloupe': 'guadeloupe', 'America/Martinique': 'martinique', 'America/Cayenne': 'guyane',
      'America/St_Barthelemy': 'saint_barthelemy', 'America/Marigot': 'saint_martin', 'America/Miquelon': 'saint_pierre_et_miquelon', 'Pacific/Noumea': 'nouvelle_caledonie',
      'Pacific/Tahiti': 'polynesie', 'Pacific/Wallis': 'wallis_et_futuna', 'America/Montreal': 'canada', 'America/Toronto': 'canada', 'America/Vancouver': 'canada', 'America/Edmonton': 'canada', 'America/Winnipeg': 'canada', 'America/Halifax': 'canada', 'America/Moncton': 'canada',
      'Africa/Casablanca': 'maroc', 'Africa/El_Aaiun': 'maroc', 'Africa/Algiers': 'algerie', 'Africa/Tunis': 'tunisie', 'Africa/Dakar': 'senegal', 'Africa/Abidjan': 'cote_d_ivoire',
      'Africa/Douala': 'cameroun', 'Africa/Kinshasa': 'rd_congo', 'Africa/Lubumbashi': 'rd_congo', 'Africa/Brazzaville': 'congo', 'Africa/Libreville': 'gabon', 'Africa/Bamako': 'mali',
      'Africa/Ouagadougou': 'burkina_faso', 'Africa/Conakry': 'guinee', 'Africa/Lome': 'togo', 'Africa/Porto-Novo': 'benin', 'Africa/Niamey': 'niger', 'Indian/Antananarivo': 'madagascar',
      'Indian/Mauritius': 'maurice', 'Indian/Comoro': 'comores', 'America/Port-au-Prince': 'haiti', 'Europe/London': 'royaume_uni', 'Europe/Madrid': 'espagne', 'Europe/Rome': 'italie',
      'Europe/Berlin': 'allemagne', 'Europe/Lisbon': 'portugal', 'Europe/Amsterdam': 'pays_bas', 'Europe/Dublin': 'irlande', 'Europe/Andorra': 'andorre'};
    if (T[tz]) return T[tz];
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)/.test(tz) || tz === 'Pacific/Honolulu') return 'etats_unis';
    const zone = tz.split('/')[0];
    return {Europe: 'autre_europe', Africa: 'autre_afrique', America: 'autre_amerique', Asia: 'asie', Australia: 'oceanie', Pacific: 'oceanie', Indian: 'ocean_indien'}[zone] || 'inconnu';
  }

  // Tranches pour la durée et le nombre de pages d'une visite
  const trancheDuree = s => s < 30 ? 'a_moins_30s' : s < 120 ? 'b_30s_2min' : s < 300 ? 'c_2_5min' : s < 900 ? 'd_5_15min' : 'e_plus_15min';
  const tranchePages = n => n <= 1 ? 'p1' : n === 2 ? 'p2' : n <= 4 ? 'p3_4' : n <= 9 ? 'p5_9' : 'p10_plus';

  // ---------- Visite ----------
  function vue(){
    const c = {v: 1};
    c['p.' + P] = 1;
    if (!lireS('docupret_vu')){
      ecrireS('docupret_vu', '1');
      c.vis = 1;
      const s = source(); c['src.' + cle(s || 'direct')] = 1;
      c['app.' + (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'telephone' : 'ordinateur')] = 1;
      if (!lireLS('docupret_deja')){ ecrireLS('docupret_deja', '1'); c.nv = 1; }
      const a = appareil(), h = new Date().getHours();
      c['os.' + a.os] = 1; c['nav.' + a.nav] = 1; c['ecr.' + a.ecr] = 1;
      c['pays.' + pays()] = 1;
      c['h.h' + String(h).padStart(2, '0')] = 1;
      // Page d'arrivée, page de sortie (pour l'instant la même), 1 page vue, moins de 30 s
      c['ent.' + P] = 1; c['sort.' + P] = 1; c['ppv.p1'] = 1; c['dur.' + trancheDuree(0)] = 1;
      ecrireS('docupret_derniere', P); ecrireS('docupret_nbp', '1'); ecrireS('docupret_tps', '0');
    } else {
      // Nouvelle page dans la même visite : la page de sortie et le nombre de pages se déplacent
      const avant = lireS('docupret_derniere');
      if (avant && avant !== P){ c['sort.' + avant] = -1; c['sort.' + P] = (c['sort.' + P] || 0) + 1; }
      ecrireS('docupret_derniere', P);
      const nb = (+lireS('docupret_nbp') || 1) + 1, a = tranchePages(nb - 1), b = tranchePages(nb);
      ecrireS('docupret_nbp', String(nb));
      if (a !== b){ c['ppv.' + a] = -1; c['ppv.' + b] = 1; }
    }
    ajouter(c);
  }

  // ---------- Temps passé (seulement quand la page est à l'écran, 15 min max par page) ----------
  let debut = document.visibilityState === 'visible' ? Date.now() : 0, surPage = 0;
  function compterTemps(){
    if (!debut) return;
    let s = Math.round((Date.now() - debut) / 1000); debut = 0;
    s = Math.max(0, Math.min(s, 900 - surPage)); surPage += s;
    if (!s || !lireS('docupret_vu')) return;
    const avant = +lireS('docupret_tps') || 0, apres = avant + s;
    ecrireS('docupret_tps', String(apres));
    const c = {t: s}, a = trancheDuree(avant), b = trancheDuree(apres);
    if (a !== b){ c['dur.' + a] = -1; c['dur.' + b] = 1; }
    ajouter(c);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') compterTemps(); else debut = Date.now(); });
  window.addEventListener('pagehide', compterTemps);

  // ---------- Actions ----------
  const evenement = (nomEv, n) => ajouter({['ev.' + cle(nomEv)]: n || 1});
  window.DocuStats = {evenement};

  // Une seule fois par visite et par clé
  function unique(k){ const deja = (lireS('docupret_u') || '').split('|'); if (deja.includes(k)) return false; deja.push(k); ecrireS('docupret_u', deja.slice(-200).join('|')); return true; }

  // Document commencé (première saisie dans un formulaire) et terminé (premier téléchargement)
  document.addEventListener('input', e => {
    const d = docPage(); if (PAS_UN_DOCUMENT.test(cle(d))) return;
    if (!e.target.closest || !e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.target.closest('#recherche, .cp-boite, .tiroir, header')) return;
    if (unique('deb_' + d)) ajouter({['deb.' + cle(d)]: 1});
  }, true);
  function telecharge(type){
    const k = cle(type);
    evenement('pdf_' + k);
    if (unique('fin_' + k)) ajouter({['fin.' + k]: 1});
    classement(k);
  }

  // Téléchargements (factures : précis, par type ; autres pages : bouton « Télécharger » / « PDF » / « Imprimer »)
  window.addEventListener('docupret-telecharge', e => { const d = e.detail || {}; telecharge(d.type || 'document'); });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button, a');
    if (!b || b.id === 'telecharger' || b.closest('#env-gmail, .env-boite, .partenaire')) return;
    const t = (b.textContent || '').trim();
    if (/t[ée]l[ée]charger|^pdf$|imprimer/i.test(t) && !/application/i.test(t)) telecharge(page());
  }, true);
  window.addEventListener('appinstalled', () => evenement('appli_installee'));

  // ---------- Recherches tapées dans la barre de recherche ----------
  const champ = document.getElementById('recherche');
  if (champ){
    let tempo;
    const noter = () => {
      clearTimeout(tempo);
      const q = nom(champ.value).replace(/_/g, ' ').trim();
      if (q.length < 3) return;
      const k = cle(q);
      if (!unique('rech_' + k)) return;
      const vide = document.getElementById('vide'), aucun = vide && getComputedStyle(vide).display !== 'none';
      ajouter(aucun ? {['rech.' + k]: 1, ['rech0.' + k]: 1} : {['rech.' + k]: 1});
    };
    champ.addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(noter, 2000); });
    champ.addEventListener('blur', noter);
    window.addEventListener('pagehide', noter);
  }

  // ---------- Classement des comptes qui téléchargent le plus ----------
  // Uniquement pour les personnes connectées à un compte DocuPrêt : +1 sur leur fiche, avec le type de document.
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const charger = src => new Promise((ok, ko) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  let attente = Promise.resolve();
  function classement(type){
    if (!actif || moi() || !lireLS('docupret_compte')) return;
    attente = attente.then(async () => {
      try{
        if (!(window.firebase && firebase.auth && firebase.firestore)){
          for (const l of ['firebase-app-compat', 'firebase-auth-compat', 'firebase-firestore-compat']) await charger(FB + l + '.js');
        }
        if (!firebase.apps.length) firebase.initializeApp({apiKey: CLE, authDomain: PROJET + '.firebaseapp.com', projectId: PROJET, appId: '1:657987325283:web:398f5925bf81a610eb9756'});
        const u = await new Promise(ok => { const fin = firebase.auth().onAuthStateChanged(x => { fin(); ok(x); }); });
        if (!u || u.uid === ADMIN) return;
        const inc = firebase.firestore.FieldValue.increment(1);
        await firebase.firestore().collection('classement').doc(u.uid).set({
          n: inc, email: u.email || '', maj: firebase.firestore.FieldValue.serverTimestamp(), types: {[type]: inc}
        }, {merge: true});
      }catch(e){}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vue); else vue();
})();

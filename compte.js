/* DocuPrêt — Mon compte et clients enregistrés
 *
 * Les clients sont toujours enregistrés sur l'appareil (localStorage).
 * Quand le compte en ligne est configuré (Firebase, voir CONFIG ci-dessous)
 * et que la personne est connectée, ils sont aussi synchronisés avec son
 * compte : elle les retrouve sur tous ses appareils.
 * Base Firestore : utilisateurs/{uid}/clients/{id}
 */
(function(){
  'use strict';

  // ===== Configuration Firebase =====
  // Coller ici le bloc firebaseConfig du projet (console Firebase → Paramètres du projet → Vos applications).
  // Ces valeurs sont publiques par nature : la sécurité est assurée par les règles Firestore
  // (chaque compte ne peut lire et écrire que ses propres clients).
  const CONFIG = {
    apiKey: 'AIzaSyDSvwqeTZZeOaz92Yz5QIlgTP1VTKK9Jwg',
    authDomain: 'docupret-cd4f0.firebaseapp.com',
    projectId: 'docupret-cd4f0',
    storageBucket: 'docupret-cd4f0.firebasestorage.app',
    messagingSenderId: '657987325283',
    appId: '1:657987325283:web:398f5925bf81a610eb9756'
  };

  const CLE_CLIENTS = 'docupret_clients';
  const V = '10.12.2';
  const LIBS = ['firebase-app-compat', 'firebase-auth-compat', 'firebase-firestore-compat'];
  const actif = !!(CONFIG.apiKey && CONFIG.projectId);
  const ecouteurs = new Set();
  let auth = null, db = null, utilisateur = null, pret = null;

  // ---------- Outils ----------
  const lireLocal = () => { try{ const v = JSON.parse(localStorage.getItem(CLE_CLIENTS)); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
  const ecrireLocal = l => { try{ localStorage.setItem(CLE_CLIENTS, JSON.stringify(l)); }catch(e){} };
  const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const prevenir = () => ecouteurs.forEach(f => { try{ f(); }catch(e){} });
  const CHAMPS = ['nom', 'adresse', 'cpville', 'email', 'tel', 'pro', 'siret', 'note'];
  const date = x => Date.parse(x || 0) || 0;

  function charger(src){
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  async function demarrer(){
    if (!actif) return;
    try{
      for (const l of LIBS) await charger(`https://www.gstatic.com/firebasejs/${V}/${l}.js`);
    }catch(e){ console.warn('Firebase indisponible', e); return; }
    if (!window.firebase) return;
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CONFIG);
    auth = app.auth(); auth.languageCode = 'fr';
    db = app.firestore();
    await new Promise(ok => {
      let premier = true;
      auth.onAuthStateChanged(async u => {
        const avant = utilisateur && utilisateur.uid;
        utilisateur = u || null;
        try{ if (utilisateur) localStorage.setItem('docupret_compte', JSON.stringify({email: utilisateur.email})); else localStorage.removeItem('docupret_compte'); }catch(e){}
        if (utilisateur && utilisateur.uid !== avant){ await synchroniser(); await synchroniserParametres(); await synchroniserDocuments(); }
        prevenir();
        if (premier){ premier = false; resolu = true; ok(); }
      });
    });
  }
  const collection = () => db.collection('utilisateurs').doc(utilisateur.uid).collection('clients');

  // ---------- Synchronisation ----------
  async function synchroniser(){
    if (!db || !utilisateur) return;
    try{
      const snap = await collection().get();
      const distants = new Map();
      snap.forEach(d => distants.set(d.id, {...d.data(), id: d.id}));
      const locaux = new Map(lireLocal().map(c => [c.id, c]));
      const fusion = new Map(), aEnvoyer = [];
      for (const id of new Set([...distants.keys(), ...locaux.keys()])){
        const d = distants.get(id), l = locaux.get(id);
        if (d && (!l || date(d.maj) >= date(l.maj))) fusion.set(id, d);
        else { fusion.set(id, l); aEnvoyer.push(l); }
      }
      ecrireLocal([...fusion.values()]);
      if (aEnvoyer.length) await envoyer(aEnvoyer);
      prevenir();
    }catch(e){ console.warn('Synchronisation impossible', e); }
  }
  async function envoyer(liste){
    if (!db || !utilisateur || !liste.length) return;
    try{
      const lot = db.batch();
      liste.forEach(c => {
        const data = {maj: c.maj || new Date().toISOString(), supprime: !!c.supprime};
        CHAMPS.forEach(k => { if (c[k] !== undefined) data[k] = c[k]; });
        lot.set(collection().doc(c.id), data);
      });
      await lot.commit();
    }catch(e){ console.warn('Envoi impossible', e); }
  }

  // ---------- Paramètres (infos d'entreprise, logo, paiement, numérotation, affichage) ----------
  // Document Firestore : utilisateurs/{uid} → {parametres, majParam}
  // Le plus récent gagne ; les compteurs de numérotation gardent le plus grand numéro
  // (pour ne jamais redonner un numéro déjà utilisé), sauf réglage manuel plus récent.
  const CLE_DOC = 'docufacile_v1', CLE_MAJ = 'docupret_param_maj';
  const ecouteursParam = new Set();
  const lireDoc = () => { try{ return JSON.parse(localStorage.getItem(CLE_DOC)) || {}; }catch(e){ return {}; } };
  const propre = o => JSON.parse(JSON.stringify(o ?? null));
  function extraire(){
    const d = lireDoc(), p = d.paiement || {};
    return propre({
      em: d.em || {}, franchise: !!d.franchise,
      paiement: {conditions: p.conditions, moyen: p.moyen, iban: p.iban},
      numerotation: d.numerotation || {annee: true}, compteurs: d.compteurs || {}, numMaj: d.numMaj || '',
      tauxDefaut: d.tauxDefaut, tvaMode: d.tvaMode, envoiMessage: d.envoiMessage || '', textes: d.textes || {},
      affichage: localStorage.getItem('docupret_affichage') || '', avatar: localStorage.getItem('docupret_avatar') || '', envoiGmail: localStorage.getItem('docupret_envoi_gmail') || '',
      menuNombres: localStorage.getItem('docupret_menu_nombres') || '', menuAlertes: localStorage.getItem('docupret_menu_alertes') || ''
    });
  }
  function appliquer(p){
    const d = lireDoc();
    d.em = Object.assign({}, d.em || {}, p.em || {});
    if ('franchise' in p) d.franchise = !!p.franchise;
    d.paiement = Object.assign({}, d.paiement || {}, p.paiement || {});
    if (p.numerotation) d.numerotation = p.numerotation;
    const loc = d.compteurs || {}, dist = p.compteurs || {};
    if (date(p.numMaj) > date(d.numMaj)){ d.compteurs = Object.assign({}, loc, dist); d.numMaj = p.numMaj; }
    else { d.compteurs = Object.assign({}, loc); for (const t in dist) d.compteurs[t] = Math.max(loc[t] || 0, dist[t] || 0); }
    if (p.tauxDefaut != null) d.tauxDefaut = p.tauxDefaut;
    if (p.tvaMode) d.tvaMode = p.tvaMode;
    if (typeof p.envoiMessage === 'string') d.envoiMessage = p.envoiMessage;
    if (p.textes && typeof p.textes === 'object') d.textes = Object.assign({}, d.textes || {}, p.textes);
    if (d.doc) d.doc.numero = '';
    try{
      localStorage.setItem(CLE_DOC, JSON.stringify(d));
      if (p.affichage) localStorage.setItem('docupret_affichage', p.affichage);
      if (p.avatar) localStorage.setItem('docupret_avatar', p.avatar);
      if (p.envoiGmail) localStorage.setItem('docupret_envoi_gmail', p.envoiGmail);
      if (p.menuNombres) localStorage.setItem('docupret_menu_nombres', p.menuNombres);
      if (p.menuAlertes) localStorage.setItem('docupret_menu_alertes', p.menuAlertes);
    }catch(e){}
  }
  async function synchroniserParametres(){
    if (!db || !utilisateur) return;
    try{
      const snap = await db.collection('utilisateurs').doc(utilisateur.uid).get();
      const r = snap.exists ? snap.data() : null;
      const majLocal = localStorage.getItem(CLE_MAJ) || '';
      if (r && r.parametres && date(r.majParam) > date(majLocal)){
        appliquer(r.parametres);
        try{ localStorage.setItem(CLE_MAJ, r.majParam); }catch(e){}
        ecouteursParam.forEach(f => { try{ f(); }catch(e){} });
        window.dispatchEvent(new Event('docupret-parametres'));
      } else if (!r || !r.parametres || date(majLocal) > date(r.majParam)){
        await envoyerParametres();
      }
    }catch(e){ console.warn('Synchronisation des paramètres impossible', e); }
  }
  async function envoyerParametres(){
    if (!db || !utilisateur) return;
    try{
      const maj = localStorage.getItem(CLE_MAJ) || new Date().toISOString();
      await db.collection('utilisateurs').doc(utilisateur.uid).set({parametres: extraire(), majParam: maj}, {merge: true});
    }catch(e){ console.warn('Envoi des paramètres impossible', e); }
  }
  let minuterieParam;
  // À appeler après chaque modification locale des paramètres
  function parametresModifies(){
    try{ localStorage.setItem(CLE_MAJ, new Date().toISOString()); }catch(e){}
    clearTimeout(minuterieParam);
    minuterieParam = setTimeout(envoyerParametres, 1500);
  }

  // ---------- Documents (devis, factures…) gardés dans la fiche du client ----------
  // Local : docupret_documents ; compte : utilisateurs/{uid}/documents/{id}
  const CLE_DOCS = 'docupret_documents';
  const lireDocs = () => { try{ const v = JSON.parse(localStorage.getItem(CLE_DOCS)); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
  const ecrireDocs = l => { try{ localStorage.setItem(CLE_DOCS, JSON.stringify(l)); }catch(e){} };
  const colDocs = () => db.collection('utilisateurs').doc(utilisateur.uid).collection('documents');
  async function synchroniserDocuments(){
    if (!db || !utilisateur) return;
    try{
      const snap = await colDocs().get();
      const distants = new Map(); snap.forEach(d => distants.set(d.id, {...d.data(), id: d.id}));
      const locaux = new Map(lireDocs().map(c => [c.id, c]));
      const fusion = new Map(), aEnvoyer = [];
      for (const id of new Set([...distants.keys(), ...locaux.keys()])){
        const d = distants.get(id), l = locaux.get(id);
        if (d && (!l || date(d.maj) >= date(l.maj))) fusion.set(id, d); else { fusion.set(id, l); aEnvoyer.push(l); }
      }
      ecrireDocs([...fusion.values()]);
      if (aEnvoyer.length) await envoyerDocs(aEnvoyer);
      prevenir();
    }catch(e){ console.warn('Synchronisation des documents impossible', e); }
  }
  async function envoyerDocs(liste){
    if (!db || !utilisateur || !liste.length) return;
    try{
      const lot = db.batch();
      liste.forEach(c => { const {id, ...data} = c; lot.set(colDocs().doc(id), propre(data)); });
      await lot.commit();
    }catch(e){ console.warn('Envoi des documents impossible', e); }
  }
  // Documents terminés (les brouillons sont à part, voir brouillons())
  function documents(clientId){
    return lireDocs().filter(d => !d.supprime && !d.brouillon && (!clientId || d.clientId === clientId))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || date(b.maj) - date(a.maj));
  }
  const brouillons = () => lireDocs().filter(d => !d.supprime && d.brouillon).sort((a, b) => date(b.maj) - date(a.maj));
  const documentId = id => lireDocs().find(d => d.id === id && !d.supprime) || null;
  // Réservé aux comptes : sans compte, rien n'est gardé
  function enregistrerDocument(o){
    if (!connecte()) return null;
    const liste = lireDocs(), brouillon = !!o.brouillon;
    let d = o.id ? liste.find(x => x.id === o.id) : null;
    if (d && !!d.brouillon !== brouillon && !brouillon) d = null;
    if (!d && !brouillon) d = liste.find(x => !x.supprime && !x.brouillon && x.type === o.type && x.numero === o.numero && x.clientId === o.clientId);
    if (!d){ d = {id: nouvelId()}; liste.push(d); }
    Object.assign(d, propre({type: o.type, numero: o.numero, date: o.date, clientId: o.clientId, clientNom: o.clientNom, total: o.total, snap: o.snap, envoye: o.envoye || d.envoye || null, brouillon}));
    d.supprime = false; d.maj = new Date().toISOString();
    ecrireDocs(liste); envoyerDocs([d]); prevenir();
    return d;
  }
  function majDocument(id, champs){
    const liste = lireDocs(), d = liste.find(x => x.id === id); if (!d) return;
    Object.assign(d, champs); d.maj = new Date().toISOString();
    ecrireDocs(liste); envoyerDocs([d]); prevenir();
  }
  const supprimerDocument = id => majDocument(id, {supprime: true});

  // ---------- Clients ----------
  function clients(){
    return lireLocal().filter(c => !c.supprime).sort((a, b) => norm(a.nom).localeCompare(norm(b.nom), 'fr'));
  }
  function client(id){ return lireLocal().find(c => c.id === id && !c.supprime) || null; }
  function enregistrerClient(donnees){
    if (!connecte()) return {erreur: 'Créez votre compte gratuit pour enregistrer vos clients.', compte: true};
    const nom = String(donnees.nom || '').trim();
    if (!nom) return {erreur: 'Indiquez au moins le nom du client.'};
    const liste = lireLocal();
    let c = donnees.id ? liste.find(x => x.id === donnees.id) : null;
    if (!c) c = liste.find(x => !x.supprime && norm(x.nom) === norm(nom));
    const nouveau = !c;
    if (nouveau){ c = {id: nouvelId()}; liste.push(c); }
    CHAMPS.forEach(k => { if (donnees[k] !== undefined) c[k] = k === 'pro' ? !!donnees[k] : String(donnees[k] ?? '').trim(); });
    c.nom = nom; c.supprime = false; c.maj = new Date().toISOString();
    ecrireLocal(liste); envoyer([c]); prevenir();
    return {client: c, nouveau};
  }
  function supprimerClient(id){
    const liste = lireLocal(), c = liste.find(x => x.id === id);
    if (!c) return;
    c.supprime = true; c.maj = new Date().toISOString();
    ecrireLocal(liste); envoyer([c]); prevenir();
  }

  // ---------- Compte ----------
  const MESSAGES = {
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse. Touchez « Me connecter ».',
    'auth/invalid-email': 'Cette adresse e-mail n\'est pas valide.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 8 caractères.',
    'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/invalid-login-credentials': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/user-disabled': 'Ce compte a été désactivé.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/network-request-failed': 'Connexion impossible. Vérifiez votre connexion internet.',
    'auth/requires-recent-login': 'Par sécurité, déconnectez-vous puis reconnectez-vous avant de faire cette action.',
    'auth/operation-not-allowed': 'La connexion par e-mail n\'est pas encore activée.'
  };
  const traduire = e => new Error((e && MESSAGES[e.code]) || 'Une erreur est survenue. Réessayez.');
  async function attendre(){
    if (!actif) throw new Error('Les comptes en ligne ne sont pas encore ouverts.');
    await pret;
    if (!auth) throw new Error('Connexion impossible. Vérifiez votre connexion internet.');
  }
  async function inscrire(email, mdp){
    await attendre();
    try{ await auth.createUserWithEmailAndPassword(email, mdp); }catch(e){ throw traduire(e); }
    try{ window.DocuStats && window.DocuStats.evenement('compte_cree'); }catch(e){}
    return {aConfirmer: false};
  }
  async function connecter(email, mdp){
    await attendre();
    try{ await auth.signInWithEmailAndPassword(email, mdp); }catch(e){ throw traduire(e); }
    try{ window.DocuStats && window.DocuStats.evenement('connexion'); }catch(e){}
  }
  // Déconnexion : on termine d'abord l'envoi vers le compte, puis on efface les données de cet appareil
  // (paramètres, clients, documents, boîte Gmail). Tout revient à la prochaine connexion.
  async function deconnecter(){
    if (utilisateur){
      if (navigator.onLine === false) throw new Error('Pas de connexion internet : reconnectez-vous à internet avant de vous déconnecter, pour ne rien perdre.');
      try{ await synchroniser(); await synchroniserDocuments(); await synchroniserParametres(); }catch(e){}
    }
    try{ if (window.Gmail) window.Gmail.deconnecter(); }catch(e){}
    if (auth) await auth.signOut();
    utilisateur = null;
    try{ ['docufacile_v1', CLE_CLIENTS, CLE_DOCS, CLE_MAJ, 'docupret_affichage', 'docupret_avatar', 'docupret_envoi_gmail', 'docupret_brouillon_auto', 'docupret_menu_nombres', 'docupret_menu_alertes'].forEach(k => localStorage.removeItem(k)); }catch(e){}
    prevenir();
  }
  async function motDePasseOublie(email){
    await attendre();
    try{ await auth.sendPasswordResetEmail(email); }
    catch(e){ if (e.code !== 'auth/user-not-found') throw traduire(e); }
  }
  async function changerMotDePasse(mdp){
    await attendre();
    if (!auth.currentUser) throw new Error('Connectez-vous d\'abord.');
    try{ await auth.currentUser.updatePassword(mdp); }catch(e){ throw traduire(e); }
  }
  async function supprimerCompte(){
    await attendre();
    const u = auth.currentUser; if (!u) throw new Error('Connectez-vous d\'abord.');
    try{
      const snap = await collection().get();
      const lot = db.batch(); snap.forEach(d => lot.delete(d.ref)); await lot.commit();
      try{ const sd = await colDocs().get(); const l2 = db.batch(); sd.forEach(d => l2.delete(d.ref)); await l2.commit(); }catch(e){}
      try{ await db.collection('utilisateurs').doc(u.uid).delete(); }catch(e){}
      try{ await db.collection('classement').doc(u.uid).delete(); }catch(e){}
      try{ localStorage.removeItem(CLE_DOCS); }catch(e){}
      await u.delete();
      try{ window.DocuStats && window.DocuStats.evenement('compte_supprime'); }catch(e){}
    }catch(e){ throw traduire(e); }
    utilisateur = null; prevenir();
  }

  // ---------- Fenêtre de choix d'un client (utilisée par la facture) ----------
  const CSS = `
  .cp-fond{position:fixed;inset:0;z-index:60;background:rgba(20,28,45,.5);display:flex;align-items:flex-end;justify-content:center}
  @media (min-width:640px){.cp-fond{align-items:center}}
  .cp-boite{background:var(--blanc,#fff);width:100%;max-width:480px;max-height:86vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0px)}
  @media (min-width:640px){.cp-boite{border-radius:18px}}
  .cp-tete{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
  .cp-tete b{font-size:1.08rem}
  .cp-tete button{border:0;background:none;font-size:1.6rem;line-height:1;color:var(--gris,#667);width:36px;height:36px;border-radius:50%}
  .cp-cherche{margin:0 16px 8px;font:inherit;font-size:16px;padding:10px 12px;border:1.5px solid var(--bord,#dde);border-radius:10px;color:var(--texte,#123);background:#fff;outline:none}
  .cp-cherche:focus{border-color:var(--bleu,#4A7BD0)}
  .cp-liste{overflow-y:auto;padding:0 10px 12px;display:grid;gap:6px}
  .cp-item{display:grid;gap:2px;text-align:left;border:1px solid var(--bord,#dde);background:#fff;border-radius:12px;padding:11px 12px;font:inherit;color:var(--texte,#123);width:100%}
  .cp-item:active,.cp-item:hover{border-color:var(--bleu,#4A7BD0);background:var(--bleu-clair,#EAF1FD)}
  .cp-item b{font-size:.96rem}
  .cp-item span{font-size:.8rem;color:var(--gris,#667);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cp-note{color:#8A5A00!important;font-size:.78rem!important}
  .cp-vide{padding:16px;text-align:center;color:var(--gris,#667);font-size:.9rem;line-height:1.5}
  .cp-vide a{color:var(--bleu,#4A7BD0);text-decoration:underline}
  .cp-pied{padding:10px 16px 14px;border-top:1px solid var(--bord,#dde);font-size:.82rem;color:var(--gris,#667);text-align:center}
  .cp-pied a{color:var(--bleu,#4A7BD0);font-weight:650}
  .cp-verrou{padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}
  .cp-txt{padding:0 16px;font-size:.92rem;color:var(--texte,#123);line-height:1.5}
  .cp-av{list-style:none;margin:10px 16px 14px;padding:0;display:grid;gap:7px}
  .cp-av li{font-size:.88rem;color:#3B4558;padding-left:22px;position:relative;line-height:1.4}
  .cp-av li::before{content:"✓";position:absolute;left:0;color:var(--bleu,#4A7BD0);font-weight:800}
  .cp-btn{display:block;margin:0 16px;background:var(--bleu,#4A7BD0);color:#fff;text-align:center;border-radius:12px;padding:13px;font-weight:700;font-size:.98rem;text-decoration:none}
  .cp-petit{padding:10px 16px 0;font-size:.8rem;color:var(--gris,#667);text-align:center}
  .cp-petit a{color:var(--bleu,#4A7BD0);font-weight:650}
  .cp-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);background:var(--texte,#123);color:#fff;padding:10px 16px;border-radius:12px;font-size:.9rem;z-index:70;max-width:90vw;text-align:center}`;
  let cssMis = false;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  function styler(){ if (cssMis) return; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssMis = true; }
  function toast(t){ styler(); document.querySelectorAll('.cp-toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'cp-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
  // ---------- Avantages réservés aux comptes ----------
  // Tant que Firebase n'a pas répondu, on se fie au dernier état connu ; ensuite, seule la vraie connexion compte.
  let resolu = false;
  function connecte(){
    if (utilisateur) return true;
    if (resolu) return false;
    try{ return !!JSON.parse(localStorage.getItem('docupret_compte')); }catch(e){ return false; }
  }
  const AVANTAGES = ['Vos clients enregistrés, à choisir en un geste', 'Vos paramètres : numérotation, logo, message d\'envoi…', 'Un devis transformé en facture en un clic', 'L\'envoi de vos documents depuis votre Gmail', 'Tout retrouvé sur votre téléphone et votre ordinateur'];
  function demanderCompte(texte){
    styler();
    document.querySelectorAll('.cp-fond').forEach(x => x.remove());
    const fond = document.createElement('div'); fond.className = 'cp-fond';
    fond.innerHTML = `<div class="cp-boite cp-verrou" role="dialog" aria-modal="true" aria-label="Réservé aux comptes"><div class="cp-tete"><b>🔒 Réservé aux comptes gratuits</b><button type="button" data-fermer aria-label="Fermer">×</button></div>
      <p class="cp-txt">${esc(texte || 'Cette fonction est réservée aux comptes gratuits.')}</p>
      <ul class="cp-av">${AVANTAGES.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      <a class="cp-btn" href="compte.html#compte">Créer mon compte gratuit</a>
      <p class="cp-petit">Une simple adresse e-mail suffit. Déjà un compte ? <a href="compte.html#compte">Me connecter</a></p></div>`;
    const fermer = () => { fond.remove(); document.removeEventListener('keydown', echap); };
    const echap = e => { if (e.key === 'Escape') fermer(); };
    fond.addEventListener('click', e => { if (e.target === fond || e.target.closest('[data-fermer]')) fermer(); });
    document.addEventListener('keydown', echap);
    document.body.appendChild(fond);
  }
  function choisirClient(quandChoisi){
    if (!connecte()) return demanderCompte('Enregistrez vos clients une fois, puis choisissez-les en un geste dans tous vos devis et factures.');
    styler();
    const fond = document.createElement('div'); fond.className = 'cp-fond';
    fond.innerHTML = `<div class="cp-boite" role="dialog" aria-modal="true" aria-label="Mes clients"><div class="cp-tete"><b>Mes clients</b><button type="button" data-fermer aria-label="Fermer">×</button></div>
      <input class="cp-cherche" type="search" placeholder="Rechercher un client" aria-label="Rechercher un client"><div class="cp-liste"></div>
      <div class="cp-pied">Gérez vos clients dans <a href="compte.html">Mon compte</a></div></div>`;
    const liste = fond.querySelector('.cp-liste'), cherche = fond.querySelector('.cp-cherche');
    const rendre = () => {
      const q = norm(cherche.value), l = clients().filter(c => !q || norm([c.nom, c.cpville, c.email].join(' ')).includes(q));
      liste.innerHTML = l.length ? l.map(c => `<button type="button" class="cp-item" data-id="${esc(c.id)}"><b>${esc(c.nom)}</b><span>${esc([c.adresse, c.cpville].filter(Boolean).join(', ') || c.email || '')}</span>${c.note ? `<span class="cp-note">📝 ${esc(c.note)}</span>` : ''}</button>`).join('')
        : clients().length ? '<p class="cp-vide">Aucun client ne correspond.</p>'
        : '<p class="cp-vide">Vous n\'avez encore aucun client enregistré.<br>Remplissez les coordonnées d\'un client, puis touchez <b>« Enregistrer ce client »</b>.</p>';
    };
    const fermer = () => { fond.remove(); document.removeEventListener('keydown', echap); };
    const echap = e => { if (e.key === 'Escape') fermer(); };
    fond.addEventListener('click', e => {
      if (e.target === fond || e.target.closest('[data-fermer]')) return fermer();
      const b = e.target.closest('[data-id]'); if (!b) return;
      const c = client(b.dataset.id); fermer(); if (c) quandChoisi(c);
    });
    cherche.addEventListener('input', rendre);
    document.addEventListener('keydown', echap);
    rendre(); document.body.appendChild(fond);
    if (clients().length > 6) cherche.focus();
  }

  pret = demarrer().finally(() => prevenir());
  window.Compte = {
    actif, pret,
    utilisateur: () => utilisateur && {email: utilisateur.email, id: utilisateur.uid},
    connecte, demanderCompte, avantages: AVANTAGES, verifie: () => resolu,
    clients, client, enregistrerClient, supprimerClient, synchroniser,
    inscrire, connecter, deconnecter, motDePasseOublie, changerMotDePasse, supprimerCompte,
    surChangement: f => ecouteurs.add(f),
    parametresModifies, surParametres: f => ecouteursParam.add(f),
    documents, brouillons, document: documentId, enregistrerDocument, majDocument, supprimerDocument,
    choisirClient, toast, esc, norm
  };
})();

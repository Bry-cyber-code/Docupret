/* DocuPrêt — Mon compte et clients enregistrés
 *
 * Les clients sont toujours enregistrés sur l'appareil (localStorage).
 * Quand un compte en ligne est configuré (Supabase, voir CONFIG ci-dessous)
 * et que la personne est connectée, ils sont aussi synchronisés avec son
 * compte : elle les retrouve sur tous ses appareils.
 */
(function(){
  'use strict';

  // ===== Configuration du compte en ligne =====
  // Remplir avec les valeurs du projet Supabase (Paramètres du projet → API).
  // La « clé publique » (anon) est faite pour être visible : la sécurité est
  // assurée par les règles d'accès de la base (chacun ne voit que ses données).
  const CONFIG = {
    url: '',
    cle: ''
  };

  const CLE_CLIENTS = 'docupret_clients';
  const LIB = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
               'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];
  const actif = !!(CONFIG.url && CONFIG.cle);
  const ecouteurs = new Set();
  let sb = null, utilisateur = null, pret = null;

  // ---------- Outils ----------
  const lireLocal = () => { try{ const v = JSON.parse(localStorage.getItem(CLE_CLIENTS)); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
  const ecrireLocal = l => { try{ localStorage.setItem(CLE_CLIENTS, JSON.stringify(l)); }catch(e){} };
  const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const prevenir = () => ecouteurs.forEach(f => { try{ f(); }catch(e){} });
  const CHAMPS = ['nom', 'adresse', 'cpville', 'email', 'tel', 'pro', 'siret'];

  function charger(src){
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  async function demarrer(){
    if (!actif) return;
    for (const src of LIB){ try{ await charger(src); break; }catch(e){} }
    if (!window.supabase) return;
    sb = window.supabase.createClient(CONFIG.url, CONFIG.cle, {auth: {persistSession: true, autoRefreshToken: true, storageKey: 'docupret_session'}});
    const {data} = await sb.auth.getSession();
    utilisateur = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((evt, session) => {
      const avant = utilisateur && utilisateur.id;
      utilisateur = session ? session.user : null;
      if (utilisateur && utilisateur.id !== avant) synchroniser();
      prevenir();
    });
    if (utilisateur) await synchroniser();
    prevenir();
  }

  // ---------- Synchronisation ----------
  async function synchroniser(){
    if (!sb || !utilisateur) return;
    try{
      const {data, error} = await sb.from('clients').select('id,data,maj,supprime');
      if (error) throw error;
      const distants = new Map((data || []).map(r => [r.id, {...r.data, id: r.id, maj: r.maj, supprime: r.supprime}]));
      const locaux = new Map(lireLocal().map(c => [c.id, c]));
      const fusion = new Map(), aEnvoyer = [];
      for (const id of new Set([...distants.keys(), ...locaux.keys()])){
        const d = distants.get(id), l = locaux.get(id);
        if (d && (!l || (d.maj || '') >= (l.maj || ''))) fusion.set(id, d);
        else { fusion.set(id, l); aEnvoyer.push(l); }
      }
      ecrireLocal([...fusion.values()]);
      if (aEnvoyer.length) await envoyer(aEnvoyer);
      prevenir();
    }catch(e){ console.warn('Synchronisation impossible', e); }
  }
  async function envoyer(liste){
    if (!sb || !utilisateur || !liste.length) return;
    const lignes = liste.map(c => {
      const data = {}; CHAMPS.forEach(k => { if (c[k] !== undefined) data[k] = c[k]; });
      return {user_id: utilisateur.id, id: c.id, data, maj: c.maj, supprime: !!c.supprime};
    });
    const {error} = await sb.from('clients').upsert(lignes, {onConflict: 'user_id,id'});
    if (error) console.warn('Envoi impossible', error);
  }

  // ---------- Clients ----------
  function clients(){
    return lireLocal().filter(c => !c.supprime).sort((a, b) => norm(a.nom).localeCompare(norm(b.nom), 'fr'));
  }
  function client(id){ return lireLocal().find(c => c.id === id && !c.supprime) || null; }
  function enregistrerClient(donnees){
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
    'Invalid login credentials': 'Adresse e-mail ou mot de passe incorrect.',
    'User already registered': 'Un compte existe déjà avec cette adresse. Connectez-vous.',
    'Email not confirmed': "Confirmez d'abord votre adresse : cliquez sur le lien reçu par e-mail.",
    'Password should be at least 6 characters.': 'Le mot de passe doit contenir au moins 8 caractères.'
  };
  const traduire = e => (e && (MESSAGES[e.message] || (/rate limit/i.test(e.message) ? 'Trop de tentatives. Réessayez dans quelques minutes.' : /network|fetch/i.test(e.message) ? 'Connexion impossible. Vérifiez votre connexion internet.' : e.message))) || 'Une erreur est survenue.';
  async function attendre(){ if (!actif) throw new Error('Les comptes en ligne ne sont pas encore ouverts.'); await pret; if (!sb) throw new Error('Connexion impossible. Vérifiez votre connexion internet.'); }

  async function inscrire(email, mdp){
    await attendre();
    const retour = location.href.split('#')[0].split('?')[0];
    const {data, error} = await sb.auth.signUp({email, password: mdp, options: {emailRedirectTo: retour}});
    if (error) throw new Error(traduire(error));
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error(MESSAGES['User already registered']);
    return {aConfirmer: !data.session};
  }
  async function connecter(email, mdp){
    await attendre();
    const {error} = await sb.auth.signInWithPassword({email, password: mdp});
    if (error) throw new Error(traduire(error));
  }
  async function deconnecter(){ if (sb) await sb.auth.signOut(); utilisateur = null; prevenir(); }
  async function motDePasseOublie(email){
    await attendre();
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.href.split('#')[0].split('?')[0] + '?nouveau-mdp=1'});
    if (error) throw new Error(traduire(error));
  }
  async function changerMotDePasse(mdp){
    await attendre();
    const {error} = await sb.auth.updateUser({password: mdp});
    if (error) throw new Error(traduire(error));
  }
  async function supprimerCompte(){
    await attendre();
    const {error} = await sb.rpc('supprimer_mon_compte');
    if (error) throw new Error(traduire(error));
    await deconnecter();
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
  .cp-vide{padding:16px;text-align:center;color:var(--gris,#667);font-size:.9rem;line-height:1.5}
  .cp-vide a{color:var(--bleu,#4A7BD0);text-decoration:underline}
  .cp-pied{padding:10px 16px 14px;border-top:1px solid var(--bord,#dde);font-size:.82rem;color:var(--gris,#667);text-align:center}
  .cp-pied a{color:var(--bleu,#4A7BD0);font-weight:650}
  .cp-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);background:var(--texte,#123);color:#fff;padding:10px 16px;border-radius:12px;font-size:.9rem;z-index:70;max-width:90vw;text-align:center}`;
  let cssMis = false;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  function styler(){ if (cssMis) return; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssMis = true; }
  function toast(t){ styler(); document.querySelectorAll('.cp-toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'cp-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
  function choisirClient(quandChoisi){
    styler();
    const fond = document.createElement('div'); fond.className = 'cp-fond';
    fond.innerHTML = `<div class="cp-boite" role="dialog" aria-modal="true" aria-label="Mes clients"><div class="cp-tete"><b>Mes clients</b><button type="button" data-fermer aria-label="Fermer">×</button></div>
      <input class="cp-cherche" type="search" placeholder="Rechercher un client" aria-label="Rechercher un client"><div class="cp-liste"></div>
      <div class="cp-pied">Gérez vos clients dans <a href="compte.html">Mon compte</a></div></div>`;
    const liste = fond.querySelector('.cp-liste'), cherche = fond.querySelector('.cp-cherche');
    const rendre = () => {
      const q = norm(cherche.value), l = clients().filter(c => !q || norm([c.nom, c.cpville, c.email].join(' ')).includes(q));
      liste.innerHTML = l.length ? l.map(c => `<button type="button" class="cp-item" data-id="${esc(c.id)}"><b>${esc(c.nom)}</b><span>${esc([c.adresse, c.cpville].filter(Boolean).join(', ') || c.email || '')}</span></button>`).join('')
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

  pret = demarrer();
  window.Compte = {
    actif, pret,
    utilisateur: () => utilisateur,
    clients, client, enregistrerClient, supprimerClient, synchroniser,
    inscrire, connecter, deconnecter, motDePasseOublie, changerMotDePasse, supprimerCompte,
    surChangement: f => ecouteurs.add(f),
    choisirClient, toast, esc, norm
  };
})();

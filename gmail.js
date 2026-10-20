/* DocuPrêt — envoi des devis, factures, reçus et avoirs depuis la boîte Gmail de l'utilisateur
 *
 * L'utilisateur autorise une seule fois DocuPrêt à « envoyer des e-mails en son nom »
 * (permission Google gmail.send : le site ne peut PAS lire ses e-mails).
 * Ensuite, le document part de sa propre adresse, avec le PDF en pièce jointe,
 * et apparaît dans ses « Messages envoyés ».
 * Aucun serveur : l'autorisation reste dans le navigateur de l'utilisateur.
 */
(function(){
  'use strict';

  // ===== Configuration =====
  // Identifiant client OAuth (console Google Cloud → API et services → Identifiants).
  // Il est public par nature.
  const CLIENT_ID = '657987325283-kkrj0dtgikabpsn65mq1tedt69ke5in0.apps.googleusercontent.com';

  const ENVOI = 'https://www.googleapis.com/auth/gmail.send';
  const PORTEE = 'openid email ' + ENVOI;
  const CLE_OK = 'docupret_gmail_ok';
  const CLE_ADRESSE = 'docupret_gmail', CLE_JETON = 'docupret_gmail_jeton', CLE_REGLAGE = 'docupret_envoi_gmail';
  const actif = !!CLIENT_ID;
  let client = null, chargement = null, attente = null;

  const lire = (cle, stock) => { try{ return JSON.parse((stock || localStorage).getItem(cle)); }catch(e){ return null; } };
  const ecrire = (cle, v, stock) => { try{ (stock || localStorage).setItem(cle, JSON.stringify(v)); }catch(e){} };
  const adresse = () => (lire(CLE_ADRESSE) || {}).email || '';
  const jeton = () => { const j = lire(CLE_JETON, sessionStorage); return j && j.exp > Date.now() + 60000 ? j.t : ''; };
  const reglageActive = () => { try{ return localStorage.getItem(CLE_REGLAGE) !== '0'; }catch(e){ return true; } };

  const MSG_CASE = "Google n'a pas donné l'autorisation d'envoyer des e-mails. Touchez « Autoriser et envoyer » : dans la fenêtre Google, cochez bien la case « Envoyer des e-mails en votre nom », puis cliquez sur « Continuer ».";

  function charger(){
    if (!actif) return Promise.resolve(false);
    if (chargement) return chargement;
    chargement = new Promise(ok => {
      if (window.google && google.accounts && google.accounts.oauth2) return ok(true);
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(true); s.onerror = () => { chargement = null; ok(false); };
      document.head.appendChild(s);
    }).then(r => {
      if (r && !client) client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: PORTEE,
        callback: rep => {
          const a = attente; attente = null; if (!a) return;
          if (rep.error || !rep.access_token) return a.ko(new Error(rep.error === 'access_denied' ? 'Autorisation refusée.' : 'Connexion à Gmail impossible.'));
          // Sur ordinateur, Google affiche une case « Envoyer des e-mails en votre nom » : si elle n'est pas cochée, l'envoi est impossible
          let ok = true;
          try{ ok = google.accounts.oauth2.hasGrantedAllScopes(rep, ENVOI); }catch(e){ ok = String(rep.scope || '').includes(ENVOI); }
          if (!ok){ const e = new Error(MSG_CASE); e.reautoriser = true; return a.ko(e); }
          try{ localStorage.setItem(CLE_OK, '1'); }catch(e){}   // autorisation réussie sur cet appareil : le guide ne s'affiche plus
          ecrire(CLE_JETON, {t: rep.access_token, exp: Date.now() + (rep.expires_in || 3600) * 1000}, sessionStorage);
          a.ok(rep.access_token);
        },
        error_callback: () => { const a = attente; attente = null; if (a) a.ko(new Error('Fenêtre Google fermée.')); }
      });
      return r;
    });
    return chargement;
  }

  // Doit être appelé directement dans le clic (sinon le navigateur bloque la fenêtre Google)
  function autoriser(forcer){
    if (!client) return Promise.reject(new Error('Gmail n\'est pas encore prêt. Réessayez dans un instant.'));
    return new Promise((ok, ko) => {
      attente = {ok, ko};
      const a = adresse();
      client.requestAccessToken(Object.assign({prompt: a && !forcer ? '' : 'consent'}, a ? {login_hint: a} : {}));
    }).then(async t => {
      // L'adresse d'envoi est toujours celle du compte Google réellement choisi dans la fenêtre
      try{
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {headers: {Authorization: 'Bearer ' + t}});
        const u = await r.json(); if (u.email) ecrire(CLE_ADRESSE, {email: u.email});
      }catch(e){}
      return t;
    });
  }

  // ---------- Construction de l'e-mail ----------
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const entete = s => /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
  const couper = s => s.replace(/(.{76})/g, '$1\r\n');
  const blobB64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(blob); });

  // E-mail complet et bien formé (texte + version HTML, PDF et pièces jointes en plus) :
  // un message soigné a beaucoup moins de risques de finir dans les spams du client.
  const echapper = t => String(t || '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const nomPropre = n => String(n || 'piece-jointe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '-').slice(0, 80) || 'piece-jointe';
  function html(texte){
    const paras = String(texte || '').replace(/\r/g, '').split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${echapper(p).replace(/\n/g, '<br>')}</p>`).join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">${paras}</body></html>`;
  }
  async function mime(o){
    const limite = 'docupret_' + Math.random().toString(36).slice(2), alt = 'alt_' + Math.random().toString(36).slice(2);
    const ad = adresse(), de = ad ? (o.nom ? `${entete(o.nom.replace(/["<>]/g, ''))} <${ad}>` : ad) : '';
    const fichiers = [{nom: o.fichier, type: 'application/pdf', blob: o.pdf}].concat((o.pieces || []).map(f => ({nom: f.name, type: f.type || 'application/octet-stream', blob: f})));
    const parties = [];
    for (const f of fichiers){
      const n = nomPropre(f.nom), b = await blobB64(f.blob);
      parties.push(`--${limite}`, `Content-Type: ${f.type}; name="${n}"`, `Content-Disposition: attachment; filename="${n}"`, 'Content-Transfer-Encoding: base64', '', couper(b), '');
    }
    return [
      ...(de ? [`From: ${de}`] : []), `To: ${o.a}`, `Subject: ${entete(o.sujet)}`, `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, 'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${limite}"`, '',
      `--${limite}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '',
      `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', couper(b64(o.texte)), '',
      `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', couper(b64(html(o.texte))), '',
      `--${alt}--`, '',
      ...parties,
      `--${limite}--`, ''
    ].join('\r\n');
  }

  async function envoyer(t, o){
    const corps = await mime(o);
    if (corps.length > 34 * 1024 * 1024) throw new Error('Les pièces jointes sont trop lourdes : Gmail accepte 25 Mo au total. Retirez une photo et réessayez.');
    // Envoi « upload » : accepte les gros messages (photos en pièces jointes)
    const simple = () => fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: {Authorization: 'Bearer ' + t, 'Content-Type': 'application/json'}, body: JSON.stringify({raw: b64url(corps)})
    });
    let r;
    try{
      r = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
        method: 'POST', headers: {Authorization: 'Bearer ' + t, 'Content-Type': 'message/rfc822'}, body: corps
      });
      if (r.status === 404 && corps.length < 4.5 * 1024 * 1024) r = await simple();
    }catch(e){
      if (corps.length < 4.5 * 1024 * 1024) r = await simple(); else throw new Error('L\'envoi a échoué. Vérifiez votre connexion internet et réessayez.');
    }
    if (r.status === 401){ try{ sessionStorage.removeItem(CLE_JETON); }catch(e){} const e = new Error('Votre connexion Gmail a expiré. Touchez à nouveau « Envoyer ».'); e.expire = true; throw e; }
    if (r.status === 403 || r.status === 400){
      let detail = '';
      try{ const j = await r.json(); detail = JSON.stringify(j.error || j); }catch(e){}
      // On repart d'une autorisation neuve au prochain essai
      try{ sessionStorage.removeItem(CLE_JETON); }catch(e){}
      let e;
      if (/insufficient|scope|PERMISSION/i.test(detail)) e = new Error(MSG_CASE);
      else if (/delegation|from|sender|invalid.*(address|header)/i.test(detail)){ try{ localStorage.removeItem(CLE_ADRESSE); }catch(x){} e = new Error("Gmail a refusé l'adresse d'expéditeur. Touchez « Autoriser et envoyer » et choisissez le compte Gmail avec lequel vous voulez envoyer."); }
      else if (r.status === 400) e = new Error("Gmail n'a pas accepté ce message. Vérifiez l'adresse du client, puis réessayez.");
      else e = new Error("Gmail a refusé l'envoi. Touchez « Autoriser et envoyer » pour donner à nouveau l'autorisation, en cochant bien la case « Envoyer des e-mails en votre nom ».");
      e.reautoriser = r.status === 403 || /delegation|from|sender/i.test(detail); e.detail = detail;
      throw e;
    }
    if (!r.ok) throw new Error('L\'envoi a échoué. Vérifiez votre connexion internet et réessayez.');
    return r.json();
  }

  function deconnecter(){
    const t = jeton();
    // Retire vraiment l'autorisation chez Google (même si le module Google n'est pas chargé sur la page)
    if (t) try{ fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).catch(() => {}); }catch(e){}
    try{ localStorage.removeItem(CLE_ADRESSE); localStorage.removeItem(CLE_OK); sessionStorage.removeItem(CLE_JETON); }catch(e){}
  }

  window.Gmail = {
    actif, charger, adresse, jeton, autoriser, envoyer, deconnecter,
    dejaAutorise: () => { try{ return localStorage.getItem(CLE_OK) === '1'; }catch(e){ return false; } },
    active: () => actif && reglageActive(),
    regler: v => { try{ localStorage.setItem(CLE_REGLAGE, v ? '1' : '0'); }catch(e){} }
  };
})();

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

  const PORTEE = 'openid email https://www.googleapis.com/auth/gmail.send';
  const CLE_ADRESSE = 'docupret_gmail', CLE_JETON = 'docupret_gmail_jeton', CLE_REGLAGE = 'docupret_envoi_gmail';
  const actif = !!CLIENT_ID;
  let client = null, chargement = null, attente = null;

  const lire = (cle, stock) => { try{ return JSON.parse((stock || localStorage).getItem(cle)); }catch(e){ return null; } };
  const ecrire = (cle, v, stock) => { try{ (stock || localStorage).setItem(cle, JSON.stringify(v)); }catch(e){} };
  const adresse = () => (lire(CLE_ADRESSE) || {}).email || '';
  const jeton = () => { const j = lire(CLE_JETON, sessionStorage); return j && j.exp > Date.now() + 60000 ? j.t : ''; };
  const reglageActive = () => { try{ return localStorage.getItem(CLE_REGLAGE) !== '0'; }catch(e){ return true; } };

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
      if (!adresse() || forcer){
        try{
          const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {headers: {Authorization: 'Bearer ' + t}});
          const u = await r.json(); if (u.email) ecrire(CLE_ADRESSE, {email: u.email});
        }catch(e){}
      }
      return t;
    });
  }

  // ---------- Construction de l'e-mail ----------
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const entete = s => /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
  const couper = s => s.replace(/(.{76})/g, '$1\r\n');
  const blobB64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(blob); });

  async function mime(o){
    const limite = 'docupret_' + Math.random().toString(36).slice(2);
    const de = o.nom ? `${entete(o.nom.replace(/["<>]/g, ''))} <${adresse()}>` : adresse();
    const pj = await blobB64(o.pdf);
    return [
      `From: ${de}`, `To: ${o.a}`, `Subject: ${entete(o.sujet)}`, 'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${limite}"`, '',
      `--${limite}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', couper(b64(o.texte)), '',
      `--${limite}`, `Content-Type: application/pdf; name="${o.fichier}"`, `Content-Disposition: attachment; filename="${o.fichier}"`, 'Content-Transfer-Encoding: base64', '', couper(pj), '',
      `--${limite}--`, ''
    ].join('\r\n');
  }
  const b64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function envoyer(t, o){
    const raw = b64url(await mime(o));
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: {Authorization: 'Bearer ' + t, 'Content-Type': 'application/json'}, body: JSON.stringify({raw})
    });
    if (r.status === 401){ try{ sessionStorage.removeItem(CLE_JETON); }catch(e){} const e = new Error('Votre connexion Gmail a expiré. Touchez à nouveau « Envoyer ».'); e.expire = true; throw e; }
    if (r.status === 403) throw new Error('Gmail a refusé l\'envoi. Vérifiez que vous avez bien autorisé l\'envoi d\'e-mails, puis réessayez.');
    if (!r.ok) throw new Error('L\'envoi a échoué. Vérifiez votre connexion internet et réessayez.');
    return r.json();
  }

  function deconnecter(){
    const t = jeton();
    try{ if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, () => {}); }catch(e){}
    try{ localStorage.removeItem(CLE_ADRESSE); sessionStorage.removeItem(CLE_JETON); }catch(e){}
  }

  window.Gmail = {
    actif, charger, adresse, jeton, autoriser, envoyer, deconnecter,
    active: () => actif && reglageActive(),
    regler: v => { try{ localStorage.setItem(CLE_REGLAGE, v ? '1' : '0'); }catch(e){} }
  };
})();

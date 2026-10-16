/* DocuPrêt — application installée sur le téléphone.
 * Toujours la dernière version quand il y a internet ; sans réseau (chantier, cave…),
 * les pages et outils déjà ouverts une fois restent utilisables. */
const CACHE = 'docupret-v1';
const AUTRES = ['https://cdnjs.cloudflare.com/'];   // modules PDF
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(l => Promise.all(l.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const ici = u.origin === self.location.origin;
  if (!ici && !AUTRES.some(a => r.url.startsWith(a))) return;
  e.respondWith(
    fetch(r).then(rep => {
      if (rep && (rep.ok || rep.type === 'opaque')){ const copie = rep.clone(); caches.open(CACHE).then(c => c.put(r, copie)).catch(() => {}); }
      return rep;
    }).catch(() => caches.match(r).then(m => m || caches.match(r, {ignoreSearch: true})).then(m => m || (r.mode === 'navigate' ? caches.match('/') : undefined)).then(m => m || Response.error()))
  );
});

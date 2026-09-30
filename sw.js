// Service worker : rend le site installable et affiche l'appli instantanément.
// La page (index.html, manifest, icônes) est servie depuis le cache puis rafraîchie
// en arrière-plan : une mise à jour du site apparaît au lancement suivant.
// Les appels à l'API Apps Script (autre domaine) ne sont jamais mis en cache.
const CACHE = 'coursup-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        });
        if (hit) { net.catch(() => {}); return hit; }
        return net;
      })
    )
  );
});

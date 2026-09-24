// Service worker minimal — sert uniquement à rendre le site "installable"
// (condition technique des navigateurs). Aucune mise en cache forcée :
// chaque page continue d'être chargée normalement depuis le réseau,
// donc les mises à jour du site restent visibles immédiatement.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

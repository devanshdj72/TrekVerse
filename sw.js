// TrekVerse Service Worker v4 — force clears ALL old caches
const CACHE = 'trekverse-v4';

// On install — skip waiting immediately, take over all tabs
self.addEventListener('install', () => self.skipWaiting());

// On activate — delete EVERY old cache, claim all clients
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, NO caching — always serve fresh files
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .catch(() => caches.match(e.request))
  );
});

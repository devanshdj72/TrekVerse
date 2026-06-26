// TrekVerse Service Worker — bump version to force cache clear
const CACHE = 'trekverse-v3';
const ASSETS = [
  '/TrekVerse/',
  '/TrekVerse/index.html',
  '/TrekVerse/login.html',
  '/TrekVerse/journey-hub.js',
  '/TrekVerse/manifest.json',
  '/TrekVerse/icon.svg',
  '/TrekVerse/icon-192.png',
  '/TrekVerse/icon-512.png',
  '/TrekVerse/apple-touch-icon.png',
  '/TrekVerse/firebase-config.js',
];

// INSTALL — cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting(); // activate immediately
});

// ACTIVATE — delete ALL old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        if (k !== CACHE) { console.log('[SW] Deleting old cache:', k); return caches.delete(k); }
      }))
    )
  );
  self.clients.claim(); // take control of all tabs immediately
});

// FETCH — network first, fall back to cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

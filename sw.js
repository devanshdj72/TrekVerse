const CACHE = 'summitlog-v5';
const ASSETS = [
  '/summitlog/',
  '/summitlog/index.html',
  '/summitlog/journey-hub.js',
  '/summitlog/manifest.json',
  '/summitlog/icon.svg',
  '/summitlog/icon-192.png',
  '/summitlog/icon-512.png',
  '/summitlog/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  // Never cache cross-origin requests (CDN libraries, map tiles) —
  // only cache our own same-origin app shell files.
  const url = new URL(e.request.url);
  if(url.origin !== self.location.origin){
    return; // let the browser handle it normally
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// Bumped to v4 to force-evict any stale caches from previous deploys.
const CACHE_NAME = 'sada-v4';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // NEVER touch API calls — let the network handle them, no SW interception.
  // (Was: returned early but still inside respondWith stack — be explicit.)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Hashed Vite assets — let the browser HTTP cache handle them, no SW caching.
  if (url.pathname.startsWith('/assets/')) {
    return;
  }

  // HTML / shell — network-first, fall back to cache offline.
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

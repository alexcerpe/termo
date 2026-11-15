/* Cache exclusivo do /sudoku/. Navegação busca a versão nova primeiro. */
const CACHE = 'sudoku-offline-v2';
const ASSETS = [
  '/sudoku/', '/sudoku/index.html',
  '/sudoku/styles.css?v=2', '/sudoku/engine.js?v=2', '/sudoku/app.js?v=2',
  '/sudoku/manifest.webmanifest', '/sudoku/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key =>
      key.startsWith('sudoku-offline-') && key !== CACHE
    ).map(key => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/sudoku/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('/sudoku/')))
    );
  } else {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});
/* Apenas os recursos do Sudoku; não interfere no Termo ou no Xadrez. */
const CACHE = 'sudoku-offline-v1';
const ASSETS = [
  '/sudoku/', '/sudoku/index.html',
  '/sudoku/styles.css?v=1', '/sudoku/engine.js?v=1', '/sudoku/app.js?v=1',
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
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
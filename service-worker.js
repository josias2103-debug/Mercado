const CACHE_NAME = 'marketplanner-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app_icon_marketplanner_1766378047051.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(ASSETS);
      })
  );
});

// Estrategia: Cache First para Assets, Network First para API
self.addEventListener('fetch', event => {
  if (event.request.url.includes('script.google.com')) {
    // Para la API, intentamos red primero
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    // Para archivos del sitio, cache primero
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  }
});

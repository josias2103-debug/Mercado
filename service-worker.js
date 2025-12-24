const CACHE_NAME = 'marketplanner-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app_icon_marketplanner_1766378047051.png'
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

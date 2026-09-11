const CACHE_NAME = 'securities-review-pwa-v1.0.3';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './baseline-config.json',
  './assets/app.css', './assets/status-filter-fix.js', './assets/app.js', './assets/app.part1.txt', './assets/app.part2.txt', './assets/app.part3.txt', './assets/app.part4.txt',
  './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});

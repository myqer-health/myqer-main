// Minimal offline shell for MYQER
const CACHE_NAME = 'myqer-v1';
const ASSETS = [
  '/', '/index.html',
  '/styles/site.css',
  '/images/hero-voiced.jpg',
  '/images/icon-192.png', '/images/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Network-first for HTML; cache-first for static
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then(r => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then(c => c.put('/', copy));
        return r;
      }).catch(() => caches.match('/index.html'))
    );
  } else {
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});

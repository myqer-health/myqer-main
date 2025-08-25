const VERSION='v1';
const APP_SHELL=['/','/app.html','/card.html','/reset.html','/scripts/config.js','/scripts/auth.js','/scripts/app.js','/scripts/backend_hooks.js','/myqer_manifest.json','/assets/icon-192.png','/assets/icon-512.png','/locales/en/site.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open('myqer-'+VERSION).then(c=>c.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>!k.endsWith(VERSION)).map(k=>caches.delete(k)));self.clients.claim();})());});
self.addEventListener('fetch',e=>{const url=new URL(e.request.url); if(e.request.method!=='GET') return;
  if(APP_SHELL.includes(url.pathname)||url.pathname.startsWith('/locales/')){
    e.respondWith((async()=>{const cache=await caches.open('myqer-'+VERSION);const cached=await cache.match(e.request);if(cached) return cached;const net=await fetch(e.request);cache.put(e.request, net.clone());return net;})()); return;
});
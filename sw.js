const CACHE = 'cashflow-cache-v3_3fix-vdate';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js',
  'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', e => {
  e.respondWith((async()=>{
    const r = await caches.match(e.request);
    if(r) return r;
    const resp = await fetch(e.request);
    try{ const cache = await caches.open(CACHE); cache.put(e.request, resp.clone()); }catch(e){}
    return resp;
  })());
});

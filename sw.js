const CACHE='cashflow-cache-v3_3-release-v16_7';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'])));
});
self.addEventListener('activate',e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch',e=>{
  e.respondWith((async()=>{
    const r=await caches.match(e.request);
    if(r) return r;
    try{
      const resp=await fetch(e.request);
      try{ const c=await caches.open(CACHE); c.put(e.request, resp.clone()); }catch(_){}
      return resp;
    }catch(_){
      return new Response('offline',{status:200,headers:{'Content-Type':'text/plain'}});
    }
  })());
});

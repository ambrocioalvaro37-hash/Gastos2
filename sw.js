const CACHE="gastos-pwa-v4";
const ASSETS=["./","./index.html","./app.js","./manifest.json","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  e.respondWith(
    fetch(e.request).then(res=>{
      const resClone=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,resClone));
      return res;
    }).catch(()=>caches.match(e.request))
  );
});

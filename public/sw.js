const CACHE='travel-offline-shell-v1';
const ASSETS=['/offline.html','/offline.js','/offline-store.js','/offline.css','/travel-logo.png','/favicon-32.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('travel-offline-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'&&['/','/index.html','/offline.html'].includes(url.pathname)){
    event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;
  }
  if(ASSETS.includes(url.pathname))event.respondWith(fetch(event.request).catch(()=>caches.match(url.pathname)));
});

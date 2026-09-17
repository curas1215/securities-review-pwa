const SHELL='qbank-loader-v1.1.0';
const RUNTIME='qbank-runtime-v1.1.0';
const SHELL_FILES=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('qbank-loader-')&&k!==SHELL)||(k.startsWith('qbank-runtime-')&&k!==RUNTIME)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  const scope=new URL(self.registration.scope).pathname;
  const runtimeBase=scope+'runtime/';
  if(url.pathname.startsWith(runtimeBase)){
    event.respondWith((async()=>{
      const cache=await caches.open(RUNTIME);
      let req=event.request;
      if(url.pathname===runtimeBase){
        const target=new URL('runtime/index.html',self.registration.scope);
        req=new Request(target.href,{method:'GET'});
      }
      const hit=await cache.match(req,{ignoreSearch:true});
      if(hit) return hit;
      return new Response('刷题资源尚未导入，请返回安装页导入 v1.1.0 完整 ZIP。',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })());
    return;
  }
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(r=>{const cp=r.clone();caches.open(SHELL).then(c=>c.put('./index.html',cp));return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
/* Guarda la app en el teléfono para abrirla rápido: muestra al instante la guardada y trae la nueva por detrás.
   La app compara versiones y recarga sola si hay una nueva. Solo toca los archivos de la app, nunca /webhook. */
const CACHE = "armoni-app";   // la app se encarga de borrarla cuando sale una versión nueva
const ARCHIVOS = ["./", "index.html", "manifest.webmanifest", "icon.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" })))).catch(() => {}));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("message", e => { if(e.data === "limpiar") e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n === CACHE).map(n => caches.delete(n))))); });
/* imágenes de Comfandi y la librería de la torta 3D: se muestran al instante desde el teléfono y se
   actualizan por detrás (si la red falla o Comfandi cambia algo, la imagen guardada no desaparece) */
const CACHE_EXT = "armoni-ext";
const EXTERNOS = /(^|\.)comfandivirtual\.com\.co$|(^|\.)comfandi\.com\.co$|^cdnjs\.cloudflare\.com$|^fonts\.(googleapis|gstatic)\.com$|^image\.tmdb\.org$|^upload\.wikimedia\.org$/;
async function recorta(cache, max){ const k = await cache.keys(); for(let i = 0; i < k.length - max; i++) await cache.delete(k[i]); }
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if(r.method === "GET" && u.origin !== location.origin && EXTERNOS.test(u.hostname) && ["image", "script", "style", "font"].includes(r.destination)){
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_EXT);
      const guardada = await cache.match(r);
      const red = fetch(r).then(async res => { if(res && (res.ok || res.type === "opaque")){ try{ await cache.put(r, res.clone()); recorta(cache, 40); }catch{} } return res; });
      if(guardada){ e.waitUntil(red.catch(() => {})); return guardada; }   // al instante; la actualización va por detrás
      return red;
    })());
    return;
  }
  if(r.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/webhook/")) return;
  if(r.cache === "no-store" || u.searchParams.has("v")) return;   // la revisión de versión siempre va directo a la red
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const clave = new Request(u.origin + u.pathname);   // una sola copia por archivo, sin importar el ?v=
    const red = fetch(r).then(res => { if(res && res.ok) cache.put(clave, res.clone()).catch(() => {}); return res; });
    const guardada = await cache.match(clave);
    if(!guardada) return red;
    e.waitUntil(red.catch(() => {}));   // se muestra al instante la guardada y la nueva se trae por detrás (la app avisa y recarga si cambió)
    return guardada;
  })());
});

self.addEventListener("push", event => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }
  catch{ data = { title: "Armoni", body: event.data ? event.data.text() : "" }; }

  const title = data.title || "Armoni";
  const options = {
    body: data.body || "",
    icon: "icon.png",
    badge: "icon.png",
    tag: data.tag || undefined,
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for(const c of list){ if("focus" in c){ if(url !== "./" && "navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); } }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});

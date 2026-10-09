/* Guarda la app en el teléfono para abrirla rápido. Pide siempre la versión nueva a la red; si la red tarda
   más de 1.2 s (o no hay), muestra al instante la guardada. Solo toca los archivos de la app, nunca /webhook. */
const CACHE = "armoni-app";
const ARCHIVOS = ["./", "index.html", "manifest.webmanifest", "icon.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" })))).catch(() => {}));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if(r.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/webhook/")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const red = fetch(r).then(res => { if(res && res.ok) cache.put(r, res.clone()); return res; });
    const guardada = await cache.match(r, { ignoreSearch: true });
    if(!guardada) return red;
    red.catch(() => {});   // si la red falla en segundo plano, no pasa nada
    return Promise.race([red, new Promise(ok => setTimeout(() => ok(guardada), 1200))]).catch(() => guardada);
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
      for(const c of list){ if("focus" in c) return c.focus(); }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});

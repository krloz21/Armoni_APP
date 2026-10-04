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

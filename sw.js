/* COBREI service worker — cache do app + push */
const CACHE = "cobrei-v3";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./sw.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // API Supabase e outros: sempre rede
  if (url.origin !== self.location.origin) return;
  // App shell: cache-first com atualização em segundo plano
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "COBREI", body: "Você tem pendências de cobrança.", url: "./" };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (err) {
    try {
      data.body = e.data.text();
    } catch (e2) {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "COBREI", {
      body: data.body || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: data.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

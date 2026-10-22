// COBREI: service worker. Rede primeiro (o app sempre abre atualizado) e cópia guardada como reserva.
const V = "cobrei-v1";
const BASE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return; // nunca guarda dados do Supabase nem de outros sites
  if (u.search) return; // links com código (aprovação, pagamento) não ficam guardados no aparelho
  e.respondWith(
    fetch(r)
      .then((res) => {
        const copia = res.clone();
        caches.open(V).then((c) => c.put(r, copia));
        return res;
      })
      .catch(() => caches.match(r).then((m) => m || caches.match("index.html")))
  );
});

// Reservado para os avisos no celular (a etapa do servidor de avisos ainda não foi ativada)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || "COBREI", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => {
    for (const c of l) { if ("focus" in c) return c.focus(); }
    return clients.openWindow((e.notification.data && e.notification.data.url) || "./");
  }));
});

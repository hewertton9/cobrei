/* COBREI service worker — cache do app + push */
const CACHE = "cobrei-v4"; // aumente a cada deploy
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const SCOPE = new URL("./", self.registration.scope);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // allSettled: um arquivo faltando não derruba o cache dos demais
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Supabase, CDN, fontes etc.: sempre rede (o navegador cuida)
  if (url.origin !== self.location.origin) return;
  // Nunca interceptar o próprio SW nem o assetlinks
  if (url.pathname.endsWith("/sw.js") || url.pathname.startsWith("/.well-known/")) return;

  // Navegação (inclui /?o=TOKEN, /?c=TOKEN, /?type=recovery&code=...):
  // rede primeiro, para o app sempre abrir na versão nova; cai no shell se offline.
  // Não guarda URLs com query string (tokens/códigos) no cache.
  if (req.mode === "navigate") {
    const isShell = url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + "index.html";
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status === 200 && isShell) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = isShell ? await caches.match("./index.html") : await caches.match(req);
          return hit || (await caches.match("./index.html")) || Response.error();
        })
    );
    return;
  }

  // Demais arquivos do mesmo domínio (ícones, manifest...): cache + atualização em segundo plano
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.status === 200) cache.put(req, res.clone()); // ignora 206 e erros
          return res;
        })
        .catch(() => cached || Response.error());
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
  // só aceita URL do próprio domínio
  let target = SCOPE;
  try {
    const t = new URL((e.notification.data && e.notification.data.url) || "./", SCOPE);
    if (t.origin === self.location.origin) target = t;
  } catch (err) {}

  e.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          await c.focus();
          if ("navigate" in c && target.href !== SCOPE.href && c.url !== target.href) {
            try {
              await c.navigate(target.href);
            } catch (err) {}
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target.href);
    })()
  );
});

const CACHE_NAME = "howmu-shell-v7";
const STATIC_SHELL = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icons/check.svg",
  "/icons/chevron-down.svg",
  "/icons/chevron-right.svg",
  "/icons/chevron-up.svg",
  "/icons/flag-kr.svg",
  "/icons/flag-th.svg",
  "/icons/flag-au.svg",
  "/icons/flag-ca.svg",
  "/icons/flag-cn.svg",
  "/icons/flag-eu.svg",
  "/icons/flag-gb.svg",
  "/icons/flag-hk.svg",
  "/icons/flag-id.svg",
  "/icons/flag-jp.svg",
  "/icons/flag-my.svg",
  "/icons/flag-ph.svg",
  "/icons/flag-sg.svg",
  "/icons/flag-tw.svg",
  "/icons/flag-us.svg",
  "/icons/flag-vn.svg",
  "/icons/search.svg",
  "/icons/sun.svg",
];

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(STATIC_SHELL);

  const response = await fetch(new Request("/", { cache: "reload" }));
  if (!response.ok) throw new Error("app shell request failed");
  await cache.put("/", response.clone());

  const html = await response.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname !== "/")
    .map((url) => url.href);
  await cache.addAll([...new Set(assetUrls)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/", response.clone());
          }
          return response;
        } catch {
          return (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

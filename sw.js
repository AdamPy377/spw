const CACHE_NAME = "spw-v16.2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/core.js",
  "./js/spw.js",
  "./js/breaks.js",
  "./js/food-safety.js",
  "./js/profiles-history.js",
  "./js/network.js",
  "./js/live-operations.js",
  "./js/notifications.js",
  "./js/crew.js",
  "./js/tasks.js",
  "./js/skills.js",
  "./js/results-staffing.js",
  "./js/live-dashboard.js",
  "./js/cash.js",
  "./js/init.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html"))),
  );
});


self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "SPW break reminder", {
      body: data.body || "A break is due in 5 minutes.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: data.tag || "spw-break",
      renotify: false,
      data: { url: data.url || "./?page=breaks" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./?page=breaks", self.location.href).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});

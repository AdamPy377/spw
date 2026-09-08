const CACHE_NAME = "spw-v15.1";
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

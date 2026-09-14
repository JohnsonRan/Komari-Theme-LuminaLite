// Replacement for Komari's root-scoped PWA. No fetch handler: all requests
// return to the server, which selects the correct theme/admin HTML.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names
        .filter((name) => name.startsWith("workbox-precache-") && name.endsWith(self.registration.scope))
        .map((name) => caches.delete(name)));
    } catch (error) {
      console.warn("LuminaLite: could not clear legacy PWA precache", error);
    }
    // Release already-open tabs from the old fetch handler without reloading
    // admin forms or terminals. Future visits need no service worker.
    await self.clients.claim();
    await self.registration.unregister();
  })());
});

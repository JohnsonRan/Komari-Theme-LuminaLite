// Komari's admin HTML loads this path even when a third-party theme is active.
// Retire an existing default PWA; never register one for a fresh visitor.
(() => {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistration("/").then((registration) => {
    if (!registration || registration.scope !== new URL("/", location.href).href) return;
    const worker = registration.active || registration.waiting || registration.installing;
    if (!worker || new URL(worker.scriptURL).pathname !== "/sw.js") return;
    // Stable query bypasses the old Workbox precache and stale CDN /sw.js entry.
    return navigator.serviceWorker.register("/sw.js?luminalite-pwa=off", {
      scope: "/",
      updateViaCache: "none",
    });
  }).catch((error) => console.warn("LuminaLite: could not retire legacy PWA", error));
})();

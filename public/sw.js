// Minimal service worker: no offline caching (call/contact data must always
// be fresh), just enough presence to satisfy PWA installability checks.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));

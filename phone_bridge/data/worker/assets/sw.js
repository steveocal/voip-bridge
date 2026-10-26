// Minimal service worker: no offline caching (call/contact data must always
// be fresh), just enough presence to satisfy PWA installability checks.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));

// Minimal service worker for PWA installability.
// Network-first strategy -- no aggressive caching, just makes the app installable.
self.addEventListener('fetch', () => {})

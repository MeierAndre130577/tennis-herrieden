// Tennis Herrieden Service Worker
// Geändert: erzwingt bei iOS-PWA immer die aktuelle Version vom Server

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Für HTML-Navigationen immer Netzwerk bevorzugen
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    )
  }
})

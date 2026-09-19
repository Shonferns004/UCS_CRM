const CACHE = 'ucs-crm-legacy'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
      self.clients.claim(),
    ])
  )
})

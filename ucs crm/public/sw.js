const CACHE = 'ucs-crm-v2'
const ASSETS = ['/', '/offline']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname === '/sw.js') return

  e.respondWith(
    fetch(e.request).catch(async () => {
      const cached = await caches.match(e.request)
      if (cached) return cached
      if (e.request.mode === 'navigate') {
        const offline = await caches.match('/offline')
        if (offline) return offline
      }
      return new Response('', { status: 503, statusText: 'Unavailable' })
    })
  )
})

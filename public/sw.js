// Kerb service worker — PUSH ONLY.
// Deliberately has NO 'fetch' handler, so it never caches navigations or assets
// (keeps the app always-latest; see the earlier no-stale-cache decision). Its
// only job is to show parking-expiry notifications and handle taps on them.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* non-JSON payload */ }

  const title = data.title || 'Kerb parking'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'parking-reminder', // collapse repeats for the same session
    renotify: true,
    data: { url: data.url || '/sessions' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/sessions'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) { c.navigate(url); return c.focus() }
      }
      return self.clients.openWindow(url)
    }),
  )
})

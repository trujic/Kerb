// Kerb service worker — push notifications + an offline shell.
//
// This deliberately had NO fetch handler, on the principle that a parking app
// must never serve a stale answer. That principle stands; what changed is where
// it is enforced. A driver in an underground garage, on a foreign SIM, or with
// no signal has no network exactly when they need the zone — and "nothing loads"
// is not more honest than "here is what we knew on Tuesday", only less useful.
//
// So the shell is cached to make the app start, and zone data may answer from a
// copy — but only when the network genuinely fails, and every offline answer is
// dated in the UI. Nothing here is served stale while the network works.

const SHELL = 'kerb-shell-v1'
const DATA = 'kerb-data-v1'

// ── LOCAL ALARMS ──────────────────────────────────────────────────────────────
// Expiry reminders are written to IndexedDB by the page (see useLocalReminders)
// so they can be delivered with no network and no account. Whichever of the two
// is awake when one comes due delivers it; the deliverer stamps `firedAt` first
// so the other stays silent.
//
// A service worker cannot hold a timer — it is killed between events. So instead
// of scheduling, it drains: every time something wakes this worker for any
// reason, it checks whether a deadline has passed. That is not a guarantee, and
// nothing in the UI claims it is; it is a second chance for the case where the
// page is already gone.

const ALARM_DB = 'kerb-alarms'
const ALARM_STORE = 'alarms'
const ALARM_STALE_MS = 60 * 60 * 1000
const DRAIN_THROTTLE_MS = 30 * 1000

const alarmDb = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open(ALARM_DB, 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(ALARM_STORE))
        r.result.createObjectStore(ALARM_STORE, { keyPath: 'id' })
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

const readAlarms = async () => {
  try {
    const db = await alarmDb()
    return await new Promise((res) => {
      const tx = db.transaction(ALARM_STORE, 'readonly')
      const q = tx.objectStore(ALARM_STORE).getAll()
      q.onsuccess = () => res(q.result || [])
      q.onerror = () => res([])
    })
  } catch {
    return []
  }
}

const stampFired = async (alarm) => {
  try {
    const db = await alarmDb()
    await new Promise((res, rej) => {
      const tx = db.transaction(ALARM_STORE, 'readwrite')
      tx.objectStore(ALARM_STORE).put(alarm)
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
  } catch { /* the page will re-stamp it; a duplicate buzz beats a missed hour */ }
}

let lastDrain = 0

const drainAlarms = async () => {
  lastDrain = Date.now()
  if (self.Notification?.permission !== 'granted') return
  const alarms = await readAlarms()
  const now = Date.now()
  for (const a of alarms) {
    if (a.firedAt || a.fireAt > now) continue
    await stampFired({ ...a, firedAt: now })
    // A deadline an hour past is not news. A phone switched on at noon must not
    // announce "10 minutes left" about an hour that ended before breakfast.
    if (now - a.fireAt > ALARM_STALE_MS) continue
    await self.registration.showNotification(a.title, {
      body: a.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: a.tag,
      renotify: true,
      data: { url: a.url || '/' },
    })
  }
}

self.addEventListener('install', (e) => {
  // Warm the shell during install. Without this the first visit registers the
  // worker mid-load, so no navigation ever passes through the fetch handler and
  // the very first offline attempt has nothing to fall back on.
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL)
      await cache.add(new Request('/', { cache: 'reload' }))
    } catch { /* offline at install time; the next online visit will fill it */ }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop caches from older shell versions so a deploy cannot be shadowed.
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))
    // Evict assets an earlier worker cached on a dev origin. They are why this
    // guard exists, and leaving them would keep dev broken until a manual
    // "Clear storage" — the one thing a self-healing worker can spare you.
    if (IS_DEV_ORIGIN) {
      const cache = await caches.open(SHELL)
      const stale = (await cache.keys()).filter((r) => isAsset(new URL(r.url)))
      await Promise.all(stale.map((r) => cache.delete(r)))
    }
    await self.clients.claim()
    await drainAlarms()
  })())
})

// Every wake is a chance to deliver: a reconnect, the browser's own periodic
// sync, or the page telling us a deadline just moved.
self.addEventListener('sync', (e) => {
  if (e.tag === 'kerb-alarms') e.waitUntil(drainAlarms())
})
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'kerb-alarms') e.waitUntil(drainAlarms())
})
self.addEventListener('message', (e) => {
  if (e.data?.type === 'kerb:alarms') e.waitUntil?.(drainAlarms())
})

const isZoneData = (url) => url.pathname.startsWith('/zones/')
const isAsset = (url) =>
  url.pathname.startsWith('/_nuxt/') ||
  /\.(css|js|woff2?|png|svg|ico|webp|jpg|jpeg)$/.test(url.pathname)

// The asset cache below is cache-first, which is only safe because production
// builds are content-hashed. The dev server breaks both halves of that: its
// /_nuxt/ paths are not hashed, and Vite serves CSS as a JavaScript module, so
// a replayed /_nuxt/main.css arrives as text/css into a <script type="module">
// and the whole app fails to boot. On a dev origin assets always go to the
// network; caching there bought nothing anyway.
const IS_DEV_ORIGIN = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname)

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Any request at all means this worker is alive right now — the cheapest wake
  // there is, and often the only one a phone will hand us. Throttled so a page
  // load pulling forty assets does not open forty transactions.
  if (Date.now() - lastDrain > DRAIN_THROTTLE_MS) event.waitUntil(drainAlarms())
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Never touch other origins: Supabase, Nominatim and Overpass must fail
  // honestly rather than resolve from a cache the app cannot date.
  if (url.origin !== self.location.origin) return

  // Navigations: network first, falling back to the last good page so the app
  // opens at all. A cached page still re-fetches its own data on boot.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        ;(await caches.open(SHELL)).put('/', fresh.clone())
        return fresh
      } catch {
        const cache = await caches.open(SHELL)
        return (await cache.match(req)) || (await cache.match('/')) || Response.error()
      }
    })())
    return
  }

  // Zone geometry: network first, because a boundary corrected today must win.
  // The copy exists only for when there is no network at all.
  if (isZoneData(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        if (fresh.ok) (await caches.open(DATA)).put(req, fresh.clone())
        return fresh
      } catch {
        const hit = await (await caches.open(DATA)).match(req)
        return hit || Response.error()
      }
    })())
    return
  }

  // Build assets are content-hashed, so a hit is the same bytes forever.
  if (isAsset(url)) {
    if (IS_DEV_ORIGIN) return
    event.respondWith((async () => {
      const cache = await caches.open(SHELL)
      const hit = await cache.match(req)
      if (hit) return hit
      const fresh = await fetch(req)
      if (fresh.ok) cache.put(req, fresh.clone())
      return fresh
    })())
  }
})

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

  event.waitUntil((async () => {
    // The device may have already delivered this exact reminder from its local
    // alarm — offline, or simply a few seconds sooner. Sharing the tag means one
    // entry in the tray either way; this stops the phone buzzing a second time
    // for news the driver already has, while still updating what it says.
    try {
      const local = (await readAlarms()).find((a) => a.tag === options.tag && a.firedAt)
      if (local && Date.now() - local.firedAt < 30 * 60 * 1000) {
        options.renotify = false
        options.silent = true
      }
    } catch { /* no store, no dedupe — show it */ }
    await self.registration.showNotification(title, options)
  })())
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

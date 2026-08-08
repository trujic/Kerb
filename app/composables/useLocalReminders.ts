// ── OFFLINE EXPIRY REMINDERS ──────────────────────────────────────────────────
// Web Push is the online path: a Netlify function wakes every minute and sends
// the reminder (netlify/functions/parking-reminders.mts). That path needs three
// things a parked driver frequently does not have — an account, a network, and a
// push service that can reach the phone. The hour runs out regardless.
//
// So the deadline is also written down on the device. The alarm lives in
// IndexedDB, where both this page and the service worker can read it, and
// whichever of the two is awake when it comes due delivers it. The one that
// fires stamps `firedAt` first, so the other stays quiet, and both use the same
// notification tag as the server push — one entry in the tray, never a stack of
// three saying the same thing. No network is touched at any point.
//
// This also covers guests, who until now got no reminder at all: a local alarm
// needs notification permission, not a login and not a push subscription.
//
// What it cannot do: wake an app the phone has evicted from memory. There is no
// web API that schedules a notification for a sleeping page — Notification
// Triggers never left its origin trial. That is a real limit and the copy says
// so ("while Kerbo is running") rather than promising a guarantee it can't keep.
// Installed to the home screen the app survives far longer, which is why the
// install prompt sits next to this switch.

export type AlarmKind = 'expiry' | 'limit'

export interface Alarm {
  /** `${sessionId}:${kind}` — one alarm per deadline, rewritten on extend. */
  id: string
  sessionId: string
  kind: AlarmKind
  fireAt: number
  title: string
  body: string
  /** Matches the server push tag, so the two collapse instead of stacking. */
  tag: string
  url: string
  firedAt: number | null
}

/** The fields an alarm needs — satisfied by both ParkingSession and GuestSession. */
export interface RemindableSession {
  id: string
  city_id: string | null
  zone_name: string
  street_name: string | null
  started_at: string
  expires_at: string | null
  max_limit_min: number | null
  ended_at?: string | null
}

const DB = 'kerb-alarms'
const STORE = 'alarms'
/**
 * The user's one notification switch, shared with the active-parking notice —
 * two toggles for "tell me about my parking" would be two ways to say the same
 * thing. See useActiveNotice.
 */
export const REMINDERS_PREF_KEY = 'kerb_local_reminders'
const PREF_KEY = REMINDERS_PREF_KEY

/** Same lead time as the server reminder, so the two never disagree by minutes. */
const LEAD_MS = 10 * 60_000
/** Below this there is no reminder worth showing — it would land on the payment. */
const MIN_AHEAD_MS = 60_000
/**
 * A deadline this far past is not news any more. A phone that was off for three
 * hours must not wake up and announce "10 minutes left" about an hour that ended
 * long ago — the alarm is retired unfired instead.
 */
const STALE_MS = 60 * 60_000

// A separate database from kerb-offline on purpose: the service worker opens
// this one too, and a version bump on a store the worker holds open is exactly
// how you get a blocked upgrade that silently never completes.
const idb = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE))
        r.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

const usable = () => import.meta.client && 'indexedDB' in window

export const readAlarms = async (): Promise<Alarm[]> => {
  if (!usable()) return []
  try {
    const db = await idb()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const q = tx.objectStore(STORE).getAll()
      q.onsuccess = () => res((q.result ?? []) as Alarm[])
      q.onerror = () => res([])
    })
  } catch {
    return []
  }
}

const writeAlarms = async (alarms: Alarm[]): Promise<void> => {
  if (!usable() || !alarms.length) return
  try {
    const db = await idb()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      // Vue's reactivity means everything reaching here may be a Proxy, and
      // structured clone throws DataCloneError on those — the same trap that
      // silently emptied the offline zone cache (see useOfflineZones).
      for (const a of alarms) store.put(JSON.parse(JSON.stringify(a)))
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch (e) {
    if (import.meta.dev) console.warn('[Kerb] alarm write failed:', e)
  }
}

/** Drop alarms for one session, or every alarm when no id is given. */
export const dropAlarms = async (sessionId?: string): Promise<void> => {
  if (!usable()) return
  try {
    const db = await idb()
    const gone = sessionId
      ? (await readAlarms()).filter((a) => a.sessionId === sessionId).map((a) => a.id)
      : null
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      if (gone) for (const id of gone) store.delete(id)
      else store.clear()
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* nothing to clean up is not a failure */
  }
}

export const useLocalReminders = () => {
  const { t } = useLang()

  // Read eagerly rather than in onMounted: a session restored from storage can
  // ask to be scheduled before mounted hooks have run, and a support flag that
  // is still false at that moment silently drops the alarm. Safe for SSR — the
  // dashboard this lives on only ever renders after a client-side GPS fix.
  const client = import.meta.client
  const has = (k: string) => client && k in window
  const supported = ref(has('Notification') && has('indexedDB') && client && 'serviceWorker' in navigator)
  const permission = ref<NotificationPermission>(
    has('Notification') ? Notification.permission : 'default',
  )
  /** The user's switch, remembered per device. */
  const wanted = ref(client ? localStorage.getItem(PREF_KEY) === '1' : false)
  const enabled = computed(() => wanted.value && permission.value === 'granted')
  const blocked = computed(() => supported.value && permission.value === 'denied')

  let timer: ReturnType<typeof setTimeout> | undefined

  const show = async (a: Alarm) => {
    const options: NotificationOptions & { renotify?: boolean } = {
      body: a.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: a.tag,
      renotify: true,
      data: { url: a.url },
    }
    const reg = await navigator.serviceWorker?.getRegistration()
    // showNotification via the registration survives the tab closing and is the
    // only form iOS accepts; the constructor is the desktop fallback with no SW.
    if (reg) await reg.showNotification(a.title, options)
    else new Notification(a.title, options)
  }

  /**
   * Deliver everything that has come due. Returns ms until the next pending
   * alarm, or null when nothing is scheduled — the caller uses it to sleep
   * exactly as long as it should rather than polling on a fixed beat.
   */
  const fireDue = async (): Promise<number | null> => {
    if (!import.meta.client || !supported.value) return null
    const alarms = await readAlarms()
    if (!alarms.length) return null

    const now = Date.now()
    const due = alarms.filter((a) => !a.firedAt && a.fireAt <= now)
    const claimed: Alarm[] = []

    for (const a of due) {
      // Claim it in storage BEFORE showing anything. If the service worker is
      // draining the same alarm in the same second, the second writer finds it
      // already stamped and the driver gets one buzz, not two.
      claimed.push({ ...a, firedAt: now })
    }
    if (claimed.length) await writeAlarms(claimed)

    if (permission.value === 'granted') {
      for (const a of claimed) {
        if (now - a.fireAt > STALE_MS) continue // too old to be true
        try { await show(a) } catch { /* permission revoked mid-flight */ }
      }
    }

    const pending = alarms
      .filter((a) => !a.firedAt && a.fireAt > now)
      .map((a) => a.fireAt - now)
    return pending.length ? Math.min(...pending) : null
  }

  /** Self-rearming tick: sleeps until the next alarm, never longer than a minute. */
  const arm = async () => {
    if (timer) clearTimeout(timer)
    if (!enabled.value) return
    const next = await fireDue()
    const wait = next === null ? 60_000 : Math.min(Math.max(next, 1_000), 60_000)
    timer = setTimeout(arm, wait)
  }

  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  /**
   * Nudge the service worker so it drains too — it may be the only one alive by
   * the time the hour is up. Background sync fires on reconnect and periodic
   * sync on the browser's own schedule; both are best-effort and unsupported
   * almost everywhere, which is why the page tick above is the primary path.
   */
  const wakeWorker = async () => {
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'kerb:alarms' })
      const reg = await navigator.serviceWorker?.ready
      await (reg as any)?.sync?.register('kerb-alarms').catch(() => {})
      await (reg as any)?.periodicSync
        ?.register('kerb-alarms', { minInterval: 15 * 60_000 })
        .catch(() => {})
    } catch {
      /* no worker, no permission, or an unsupported browser */
    }
  }

  // ── Scheduling ──────────────────────────────────────────────────────────────
  // The text is baked in now, in the language the driver is reading, because the
  // service worker that may end up delivering it has no access to useLang.

  const buildAlarms = (s: RemindableSession): Alarm[] => {
    const now = Date.now()
    const out: Alarm[] = []
    const where = s.street_name ? ` · ${s.street_name}` : ''
    const expiryMs = s.expires_at ? new Date(s.expires_at).getTime() : null

    // The hard cap is counted in CHARGEABLE minutes, same as atZoneLimit — a
    // ticket bought at 20:47 has barely touched a 120-minute limit by closing
    // time, so plain started_at + limit would warn in the middle of the night.
    const capMs = s.max_limit_min
      ? paidExpiry(
          new Date(s.started_at).getTime(),
          s.max_limit_min,
          getSchedule(s.city_id, s.zone_name),
        )
      : null

    // Expiry — only while extending is still possible. At the cap the honest
    // message is "move the car", and that is the other alarm.
    if (expiryMs && (!capMs || expiryMs < capMs - MIN_AHEAD_MS)) {
      const fireAt = expiryMs - LEAD_MS
      if (fireAt > now + MIN_AHEAD_MS) {
        out.push({
          id: `${s.id}:expiry`,
          sessionId: s.id,
          kind: 'expiry',
          fireAt,
          title: t('remExpiryTitle'),
          body: t('remExpiryBody', {
            mins: Math.round(LEAD_MS / 60_000),
            zone: s.zone_name,
            where,
          }),
          tag: `session-${s.id}-expiry`,
          url: '/',
          firedAt: null,
        })
      }
    }

    // Zone hard limit — you must move, no re-pay.
    if (capMs && s.max_limit_min) {
      const fireAt = capMs - LEAD_MS
      if (fireAt > now + MIN_AHEAD_MS) {
        out.push({
          id: `${s.id}:limit`,
          sessionId: s.id,
          kind: 'limit',
          fireAt,
          title: t('remLimitTitle'),
          body: t('remLimitBody', { zone: s.zone_name, min: s.max_limit_min, where }),
          tag: `session-${s.id}-limit`,
          url: '/',
          firedAt: null,
        })
      }
    }

    return out
  }

  /**
   * Write this session's deadlines to the device. Rewritten wholesale on every
   * call, so extending an hour moves the alarm instead of adding a second one.
   */
  const scheduleFor = async (s: RemindableSession | null) => {
    if (!import.meta.client || !supported.value) return
    // Nothing running, or the switch is off → the device should be holding no
    // deadlines at all. Clearing beats leaving a stale one to fire later.
    if (!enabled.value || !s || s.ended_at) {
      await dropAlarms()
      return
    }

    // Kerb runs one session at a time, so any alarm belonging to another one is
    // left over from an hour that is finished — clear the lot rather than let an
    // old deadline go off in the middle of a new zone.
    const previous = await readAlarms()
    await dropAlarms()

    // Carry the delivered stamp across a rebuild. Without it, reloading the page
    // after the reminder had already gone off would re-arm the same alarm and
    // buzz a second time about the same minute.
    const next = buildAlarms(s).map((a) => {
      const was = previous.find((p) => p.id === a.id && p.fireAt === a.fireAt)
      return was?.firedAt ? { ...a, firedAt: was.firedAt } : a
    })

    await writeAlarms(next)
    await wakeWorker()
    arm()
  }

  const cancelFor = async (sessionId: string) => {
    await dropAlarms(sessionId)
    arm()
  }

  // ── Switch ──────────────────────────────────────────────────────────────────

  const enable = async (): Promise<boolean> => {
    if (!import.meta.client || !supported.value) return false
    // Must be called from a user gesture — Safari refuses it otherwise.
    const perm = await Notification.requestPermission()
    permission.value = perm
    if (perm !== 'granted') return false
    wanted.value = true
    localStorage.setItem(PREF_KEY, '1')
    await ensureServiceWorker()
    arm()
    return true
  }

  const disable = async () => {
    wanted.value = false
    if (import.meta.client) localStorage.removeItem(PREF_KEY)
    stop()
    await dropAlarms()
  }

  const refresh = () => {
    if (!import.meta.client) return
    supported.value =
      'Notification' in window && 'indexedDB' in window && 'serviceWorker' in navigator
    if (!supported.value) return
    permission.value = Notification.permission
    wanted.value = localStorage.getItem(PREF_KEY) === '1'
  }

  const onVisible = () => {
    // Coming back to the app is the most likely moment for a missed alarm to be
    // sitting there — the tab may have been frozen straight through its time.
    if (document.visibilityState === 'visible') arm()
  }

  onMounted(() => {
    refresh()
    if (enabled.value) arm()
    document.addEventListener('visibilitychange', onVisible)
  })
  onUnmounted(() => {
    stop()
    if (import.meta.client) document.removeEventListener('visibilitychange', onVisible)
  })

  return {
    supported, permission, enabled, wanted, blocked,
    enable, disable, scheduleFor, cancelFor, fireDue, refresh,
  }
}

// ── ACTIVE PARKING NOTICE ─────────────────────────────────────────────────────
// One silent notification that sits in the tray for as long as parking is
// running, so waking the phone answers "am I covered, and until when" without
// unlocking it, opening anything, or having any signal.
//
// It carries an ABSOLUTE time — "Active until 15:40", never "42 min left".
// Nothing on the web can tick a notification down: a service worker cannot hold
// a timer, and no browser exposes Android's progress bar to a web app. A frozen
// countdown is a lie the moment the phone sleeps, while an absolute time is
// still true after three hours of the app never running. That is also why the
// wording never asserts a present tense the notice cannot keep updated: every
// line stays correct on its own, however stale.
//
// Platform reality, and why this is written on change rather than on a clock:
// Android replaces a same-tag notification silently, iOS re-alerts on every
// update. Actions are Android-only and simply do not render elsewhere, so the
// notice must still work when a tap is all you get.

import type { RemindableSession } from '~/composables/useLocalReminders'
import { REMINDERS_PREF_KEY } from '~/composables/useLocalReminders'

/** One session at a time, so one stable tag — and clearing is a tag lookup. */
const TAG = 'parking-active'

/** How long an expired session keeps its notice before it is dropped entirely. */
const EXPIRED_GRACE_MS = 30 * 60_000

/** Floor between forced rewrites, so app-switching does not repost in a loop. */
const REARM_THROTTLE_MS = 60_000
/**
 * Module scope on purpose. The composable is instantiated per component — and a
 * page whose setup runs twice would otherwise get two counters, two handlers,
 * and two rewrites for one lock of the screen.
 */
let lastForcedAt = 0

export const useActiveNotice = () => {
  // The text is baked in at write time, in the language the driver is reading —
  // the tray keeps the string, not a key, exactly as the alarms do. Switching
  // language rewrites it on the next sync, because the body no longer matches.
  const { t } = useLang()

  const client = import.meta.client
  const supported =
    client && 'Notification' in window && 'serviceWorker' in navigator

  const clockOf = (iso: string | number) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const registration = async () => {
    try {
      return (await navigator.serviceWorker?.getRegistration()) ?? null
    } catch {
      return null
    }
  }

  const clear = async () => {
    if (!supported) return
    const reg = await registration()
    if (!reg) return
    try {
      for (const n of await reg.getNotifications({ tag: TAG })) n.close()
    } catch {
      /* getNotifications is not everywhere; a stale notice beats a thrown sync */
    }
  }

  /**
   * Put the tray in sync with the session. Safe to call on every change — it
   * skips the write when nothing the driver can read has changed, which matters
   * on iOS where a repeat is a repeat buzz rather than a silent replace.
   *
   * `force` drops that skip and rewrites identical text on purpose. See rearm().
   */
  const syncFor = async (s: RemindableSession | null, force = false) => {
    if (!supported) return
    // The notice rides the reminder switch: same permission, same intent.
    const wanted = localStorage.getItem(REMINDERS_PREF_KEY) === '1'
    if (!wanted || Notification.permission !== 'granted') return clear()
    if (!s || s.ended_at) return clear()

    const expiryMs = s.expires_at ? new Date(s.expires_at).getTime() : null
    const expired = expiryMs !== null && expiryMs <= Date.now()
    // Long over: the record belongs in history, not on the lock screen.
    if (expiryMs !== null && Date.now() - expiryMs > EXPIRED_GRACE_MS) return clear()

    const title = t('noticeTitle', { zone: s.zone_name })
    const lines = [
      expiryMs === null
        ? // No expiry means a start-stop session: it runs until it is stopped,
          // so the only honest fixed point is when it began.
          t('noticeSince', { time: clockOf(s.started_at) })
        : expired
          ? t('noticeEnded', { time: clockOf(expiryMs) })
          : t('noticeUntil', { time: clockOf(expiryMs) }),
      s.street_name,
    ].filter(Boolean)
    const body = lines.join(' · ')

    const reg = await registration()
    // iOS only accepts notifications through the registration, and only one
    // shown that way outlives the tab. With no worker there is nothing to show.
    if (!reg) return

    // Re-showing identical text costs nothing on Android and buzzes on iOS, so
    // read the tray back rather than trusting in-memory state — this survives a
    // reload, which is exactly when the watcher fires with unchanged content.
    try {
      const open = await reg.getNotifications({ tag: TAG })
      if (!force && open.some((n) => n.title === title && n.body === body)) return
      // A same-tag write is a replace, and iOS treats a replaced notification as
      // one it has already shown you. Closing first is what makes it arrive as
      // new — which is the entire point of a forced rewrite.
      if (force) for (const n of open) n.close()
    } catch {
      /* unsupported: fall through and write it */
    }

    await reg.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: TAG,
      silent: true,
      // Never a buzz: this is a status line, and the reminders are what buzz.
      renotify: false,
      // No requireInteraction on purpose. It does nothing on a phone, and on a
      // desktop it pins a popup on screen for the whole hour — the tray is where
      // this belongs, not in front of whatever the driver is doing.
      data: { url: '/', sessionId: s.id },
      // A running-until-stopped session is the one case where the tray can offer
      // something the driver actually needs: the way out. Android renders this;
      // everywhere else it is a plain tap into the app, which is the same place.
      actions: expiryMs === null ? [{ action: 'stop', title: t('noticeStop') }] : [],
    } as NotificationOptions)
  }

  /**
   * Rewrite the notice as the app goes to the background — which on a phone is
   * usually the screen being locked, the moment the driver next wants to read it.
   *
   * This exists because of one iOS rule: the lock screen lists only what you have
   * not already seen, and a notice written while you were holding an unlocked
   * phone counts as seen, so it goes straight to Notification Center. Writing it
   * again at the last instant before the screen goes dark is the only lever a web
   * app has left. Whether iOS accepts that as new is genuinely not knowable from
   * here — if it does not, this changes nothing and the notice stays one swipe
   * away, which is where it already was.
   *
   * Throttled, because visibility also flips on every app switch, and each forced
   * write is a close-then-show that iOS may well announce.
   */
  const rearmOnHide = (getSession: () => RemindableSession | null) => {
    if (!supported) return
    const onHide = () => {
      if (!document.hidden) return
      if (Date.now() - lastForcedAt < REARM_THROTTLE_MS) return
      lastForcedAt = Date.now()
      syncFor(getSession(), true)
    }
    onMounted(() => document.addEventListener('visibilitychange', onHide))
    onUnmounted(() => document.removeEventListener('visibilitychange', onHide))
  }

  return { syncFor, clear, rearmOnHide }
}

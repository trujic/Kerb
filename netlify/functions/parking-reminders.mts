// Scheduled function — runs every minute, sends Web Push reminders for parking
// sessions that are ~10 min from expiry or ~10 min from the zone's hard limit.
//
// Required env (set in Netlify → Site settings → Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const WINDOW_MS = 10 * 60 * 1000 // notify when a deadline is within 10 minutes

export default async () => {
  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
  } = process.env

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response('Missing env', { status: 500 })
  }

  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const now = Date.now()

  // Active sessions that still have at least one reminder pending
  const { data: sessions, error } = await supabase
    .from('parking_sessions')
    .select('*')
    .is('ended_at', null)
    .or('reminder_sent_at.is.null,limit_reminder_sent_at.is.null')
  if (error) return new Response(`query failed: ${error.message}`, { status: 500 })

  let sent = 0

  for (const s of sessions ?? []) {
    const expiryMs = s.expires_at ? new Date(s.expires_at).getTime() : null
    const limitMs = s.max_limit_min
      ? new Date(s.started_at).getTime() + s.max_limit_min * 60_000
      : null

    const due: { kind: 'expiry' | 'limit'; title: string; body: string }[] = []

    // Expiry reminder — only while there's still room to extend (expiry < limit)
    if (
      !s.reminder_sent_at && expiryMs &&
      expiryMs > now && expiryMs <= now + WINDOW_MS &&
      (!limitMs || expiryMs < limitMs - 60_000)
    ) {
      const mins = Math.max(1, Math.round((expiryMs - now) / 60_000))
      due.push({
        kind: 'expiry',
        title: '⏳ Parking running out',
        body: `${mins} min left — ${s.zone_name}${s.street_name ? ` · ${s.street_name}` : ''}. Tap to extend.`,
      })
    }

    // Zone hard-limit reminder — you must move the car (no re-pay)
    if (
      !s.limit_reminder_sent_at && limitMs &&
      limitMs > now && limitMs <= now + WINDOW_MS
    ) {
      due.push({
        kind: 'limit',
        title: '🚗 Time to move your car',
        body: `${s.zone_name} ${s.max_limit_min}-min limit is almost up${s.street_name ? ` on ${s.street_name}` : ''}. You must move — no re-pay here.`,
      })
    }

    if (!due.length) continue

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', s.user_id)
    if (!subs?.length) {
      // No device to notify — still mark as handled so we don't reprocess forever
      await markSent(supabase, s.id, due)
      continue
    }

    for (const n of due) {
      const payload = JSON.stringify({ title: n.title, body: n.body, tag: `session-${s.id}-${n.kind}`, url: '/sessions' })
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          sent++
        } catch (e: any) {
          // Subscription gone (unsubscribed / expired) → clean it up
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }
    }

    await markSent(supabase, s.id, due)
  }

  return new Response(`ok — ${sent} notifications`)
}

async function markSent(supabase: any, id: string, due: { kind: string }[]) {
  const patch: Record<string, string> = {}
  const ts = new Date().toISOString()
  if (due.some(d => d.kind === 'expiry')) patch.reminder_sent_at = ts
  if (due.some(d => d.kind === 'limit')) patch.limit_reminder_sent_at = ts
  if (Object.keys(patch).length) await supabase.from('parking_sessions').update(patch).eq('id', id)
}

export const config: Config = { schedule: '* * * * *' }

// ── RELAY PLUMBING ────────────────────────────────────────────────────────────
// Shared by the four /api/relay routes. Two jobs: hand out a service-key client
// (relay_requests has no RLS policies, so nothing reaches it except through
// here), and decide who is allowed to see the queue.
//
// Who is a relay is an env list, not a table. During the pilot there is exactly
// one relay, and "may this person pay for strangers" is a decision about a real
// human rather than a row somebody could insert.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'

export const relayDb = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw createError({ statusCode: 500, statusMessage: 'No service key configured' })
  return createClient(url, key, { auth: { persistSession: false } })
}

export const relayUserIds = (): string[] =>
  (process.env.RELAY_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)

/** Where the user's id actually lives depends on how the project authenticates:
 *  a full user object carries `id`, while a JWT-claims object carries `sub` and
 *  no `id` at all. `usePushNotifications` already reads both; so does this. */
export const userIdOf = (user: any): string | null => user?.id ?? user?.sub ?? null

export const requireRelay = async (event: H3Event) => {
  const user = await serverSupabaseUser(event)
  const id = userIdOf(user)
  if (!id || !relayUserIds().includes(id)) {
    throw createError({ statusCode: 403, statusMessage: 'Not a relay' })
  }
  return { id, email: (user as any)?.email ?? null }
}

/** web-push demands a URL or a mailto:, and rejects a bare address. A config
 *  detail that small must not decide whether a visitor gets an answer. */
const vapidSubject = (): string => {
  const raw = (process.env.VAPID_SUBJECT || '').trim()
  if (!raw) return 'mailto:office@kerb.rs'
  if (/^(https?:|mailto:)/i.test(raw)) return raw
  return raw.includes('@') ? `mailto:${raw}` : 'mailto:office@kerb.rs'
}

/** Push every relay device. Best effort in the literal sense: this function
 *  never throws. A silent phone is a slower answer; a thrown error here would
 *  mean the guest's request itself failed, after the row was already written —
 *  a request nobody can see and nobody can follow. Notifying is not the job. */
export interface PushAction { action: string; title: string }

export const notifyRelays = async (
  title: string, body: string, url: string,
  actions: PushAction[] = [], actionUrls: Record<string, string> = {},
) => {
  try {
    return await sendToRelays(title, body, url, actions, actionUrls)
  } catch (e: any) {
    console.error('[relay] push failed, request stands:', e?.message ?? e)
    return { sent: 0, reason: 'push failed' }
  }
}

const sendToRelays = async (
  title: string, body: string, url: string,
  actions: PushAction[], actionUrls: Record<string, string>,
) => {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const ids = relayUserIds()
  if (!pub || !priv || !ids.length) return { sent: 0, reason: 'push not configured' }

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(vapidSubject(), pub, priv)

  const db = relayDb()
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', ids)

  let sent = 0
  await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url, actions, actionUrls, tag: 'kerb-relay' }),
      )
      sent++
    } catch (e: any) {
      // 404/410 mean the browser threw the subscription away. Drop it rather
      // than retry it forever.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }
  }))
  return { sent }
}

// ── WHAT THE ZONE ALLOWS ─────────────────────────────────────────────────────
// Mirrors `maxStayFor` in app/composables/useTariff.ts. It is repeated here on
// purpose: the client's version stops a person asking for two hours in a
// sixty-minute zone, and this one stops anything that skips the client. A limit
// enforced only in the interface is a suggestion.
export const maxStayMinutes = (zone: any): number | null => {
  if (zone?.max_minutes != null) return Number(zone.max_minutes)
  const m = /max\s*(\d+)\s*min/i.exec(String(zone?.rules ?? ''))
  return m ? Number(m[1]) : null
}

/** The zone as the registry has it, or null when we do not know this zone. */
export const lookupZone = async (city: string, zone: string) => {
  const { data } = await relayDb()
    .from('zones')
    .select('name, rules, price, sms_shortcode, max_minutes, daily_amount')
    .eq('city_id', city)
    .eq('name', zone)
    .maybeSingle()
  return data
}

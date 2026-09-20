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
  // `max_minutes` is not in this schema today; kept for the day it is, since a
  // structured cap should always beat one parsed out of a sentence.
  if (zone?.max_minutes != null) return Number(zone.max_minutes)
  const m = /max\s*(\d+)\s*min/i.exec(String(zone?.rules ?? ''))
  return m ? Number(m[1]) : null
}

/** The zone as the registry has it, or null when we do not know this zone.
 *
 *  The column list is deliberately short and deliberately checked. An earlier
 *  version asked for `max_minutes`, which this schema does not have; PostgREST
 *  answered with an error, the error was discarded, and every caller received a
 *  null zone — so the relay console lost its send button and the passer-by page
 *  showed a payment with no number and no price, with nothing anywhere saying
 *  why. A lookup that cannot find a zone is information; a lookup that failed is
 *  a fault, and the two must not arrive looking the same. */
export const lookupZone = async (city: string, zone: string) => {
  const { data, error } = await relayDb()
    .from('zones')
    .select('name, rules, price, sms_shortcode, daily_amount, daily_target')
    .eq('city_id', city)
    .eq('name', zone)
    .maybeSingle()

  if (error) {
    console.error('[relay] zone lookup failed:', city, zone, error.message)
    throw createError({ statusCode: 500, statusMessage: `Zone lookup failed: ${error.message}` })
  }
  if (!data) console.warn('[relay] no such zone in registry:', city, zone)
  return data
}

/** Six characters a stranger can read off a screen and type without asking how
 *  to spell it: no O/0, no I/1, no U (which a Serbian speaker may read as V). */
export const shortCode = (token: string): string => {
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTVWXYZ'
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[parseInt(token.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length]
  }
  return out
}

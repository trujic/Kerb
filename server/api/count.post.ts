// ── COUNT ONE EVENT ──────────────────────────────────────────────────────────
// Kerb's own daily totals, beside Plausible (which may be off): one row per day,
// event, city and a short label, and a number. Nothing that can name a person
// arrives here or is kept: no plate, no coordinate, no street. The address the
// request came from is held in memory for a minute, only to stop one script in
// a loop from writing the month's numbers, and is never stored.
//
// The names are a closed list, so the table cannot be filled with anything else.

import { relayDb } from '~~/server/utils/relay'

const EVENTS = new Set([
  'Zone shown',
  'SMS opened',
  'Sign scanned',
  'Returned after 7+ days',
  'Location failed',
  'Zone picked',
  'Car placed',
])
const CITY = /^[a-z][a-z-]{1,40}$/
const KIND = /^[A-Za-z0-9 .:+-]{0,40}$/

// Per server instance, so not a fortress. These numbers are for us; when one
// is shown publicly it will need its own guard.
const PER_MINUTE = 60
const seen = new Map<string, { n: number; since: number }>()
const allowed = (who: string): boolean => {
  const now = Date.now()
  if (seen.size > 5000) for (const [k, v] of seen) if (now - v.since > 60_000) seen.delete(k)
  const s = seen.get(who)
  if (!s || now - s.since > 60_000) {
    seen.set(who, { n: 1, since: now })
    return true
  }
  s.n += 1
  return s.n <= PER_MINUTE
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ event?: string; city?: string; kind?: string }>(event).catch(() => null)
  const name = String(body?.event ?? '')
  if (!EVENTS.has(name)) throw createError({ statusCode: 400, statusMessage: 'Unknown event' })
  const city = CITY.test(String(body?.city ?? '')) ? String(body!.city) : 'unknown'
  const kind = KIND.test(String(body?.kind ?? '')) ? String(body?.kind ?? '') : ''

  if (!allowed(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown')) {
    throw createError({ statusCode: 429, statusMessage: 'Too many' })
  }

  const { error } = await relayDb().rpc('bump_event', { p_event: name, p_city: city, p_kind: kind })
  if (error) {
    const hint = /bump_event|event_counts|schema cache/i.test(error.message)
      ? 'run scripts/migration-event-counts.sql'
      : error.message
    console.error('[count]', hint)
    throw createError({ statusCode: 500, statusMessage: hint })
  }
  setResponseStatus(event, 204)
  return null
})

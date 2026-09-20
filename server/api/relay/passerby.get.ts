// ── WHAT A STRANGER IS ASKED TO SEND ─────────────────────────────────────────
// Public on purpose. Somebody who has never heard of Kerb is standing next to a
// tourist looking at a screen, and everything they need must be on it: the
// plate, the zone, the number, and what it will cost them.
//
// It returns only what goes into one SMS. No guest identity, no history, no
// token — the code is a handle on one payment, not on a person.

import { relayDb, lookupZone, shortCode } from '~~/server/utils/relay'

export default defineEventHandler(async (event) => {
  const code = String(getQuery(event).code ?? '').toUpperCase()
  if (!/^[0-9A-Z]{4}$/.test(code)) throw createError({ statusCode: 400, statusMessage: 'Bad code' })

  // Open requests only, newest first — a code is reusable the moment its
  // request is closed, and an old one must never pay for a car long gone.
  const { data: rows } = await relayDb()
    .from('relay_requests')
    .select('id, city, plate, zone, minutes, state, guest_token, created_at')
    .in('state', ['pending', 'working'])
    .order('created_at', { ascending: false })
    .limit(200)

  const job = (rows ?? []).find((r: any) => shortCode(r.guest_token) === code)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'No open request with that code' })

  const zone = await lookupZone(job.city, job.zone)

  // Where a daily ticket exists it is one message instead of three, and usually
  // cheaper than the hours it replaces. Offer it rather than asking a stranger
  // to press send repeatedly.
  const daily = zone?.daily_amount != null && zone?.daily_target
    ? { target: String(zone.daily_target), amount: Number(zone.daily_amount) }
    : null

  const perHour = Math.max(1, Math.ceil((job.minutes ?? 60) / 60))

  // What this actually costs the person being asked. Null when the tariff is not
  // a plain per-hour number (Niš Red doubles into the second hour) — and a blank
  // is right there, because a stranger must not be told a total we guessed.
  const unit = zone?.price_amount != null && zone?.price_minutes
    ? Number(zone.price_amount) * (60 / Number(zone.price_minutes))
    : null
  const total = daily ? daily.amount : (unit != null ? Math.round(unit * perHour) : null)

  return {
    total,
    plate: job.plate,
    zone: job.zone,
    minutes: job.minutes,
    shortcode: zone?.sms_shortcode ?? null,
    price: zone?.price ?? null,
    repeat: perHour,
    daily,
  }
})

// ── A VISITOR ASKS SOMEBODY TO PAY ───────────────────────────────────────────
// Anonymous: the guest has no account, no local SIM and, usually, no idea which
// zone they are standing in. They get back an opaque token and nothing else —
// that token is how they, and only they, can follow their own request.
//
// The row records what we TOLD them it would cost, not what was charged. Those
// are different numbers and conflating them is how a receipt becomes fiction.

import { relayDb, notifyRelays, lookupZone, maxStayMinutes, shortCode } from '~~/server/utils/relay'

const PLATE_RE = /^[A-Z0-9ČĆŽŠĐ\- ]{4,12}$/i

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    city?: string; plate?: string; zone?: string; shortcode?: string
    minutes?: number; priceText?: string; lat?: number; lng?: number; note?: string
  }>(event)

  const plate = String(body?.plate ?? '').trim().toUpperCase()
  const zone = String(body?.zone ?? '').trim()
  if (!PLATE_RE.test(plate)) throw createError({ statusCode: 400, statusMessage: 'Bad plate' })
  if (!zone) throw createError({ statusCode: 400, statusMessage: 'No zone' })

  const minutes = Number.isFinite(Number(body?.minutes)) ? Math.max(15, Math.min(1440, Number(body!.minutes))) : 60
  const city = String(body?.city ?? 'novi-sad')

  // The zone decides how long anyone may stay, and it decides it here rather
  // than in the browser. Extra Zone in Novi Sad caps at sixty minutes and the
  // cap is not a price — you cannot buy your way past it, and a request for two
  // hours there is not expensive, it is impossible.
  const zoneRow = await lookupZone(city, zone)
  const cap = maxStayMinutes(zoneRow)
  if (cap != null && minutes > cap) {
    throw createError({
      statusCode: 400,
      statusMessage: `${zone} allows a maximum stay of ${cap} minutes. Ask for ${cap} min or less.`,
    })
  }

  // The shortcode comes from the registry, never from the caller. Otherwise the
  // page that asks could choose where the money goes.
  const shortcode = zoneRow?.sms_shortcode ?? null

  const token = crypto.randomUUID().replace(/-/g, '')
  const db = relayDb()

  // One open request per plate. A visitor tapping twice because nothing visibly
  // happened must not cost them two payments.
  const { data: open } = await db
    .from('relay_requests')
    .select('id, guest_token, state')
    .eq('plate', plate)
    .in('state', ['pending', 'working'])
    .order('created_at', { ascending: false })
    .limit(1)
  if (open?.length) return { ok: true, token: open[0].guest_token, code: shortCode(open[0].guest_token), deduped: true }

  const { data, error } = await db
    .from('relay_requests')
    .insert({
      city, plate, zone,
      shortcode,
      minutes,
      price_text: body?.priceText ?? null,
      lat: body?.lat ?? null,
      lng: body?.lng ?? null,
      note: body?.note ?? null,
      guest_token: token,
    })
    .select('id')
    .single()

  if (error) {
    const hint = /relay_requests|schema cache/i.test(error.message)
      ? 'run scripts/migration-relay-requests.sql'
      : error.message
    throw createError({ statusCode: 500, statusMessage: hint })
  }

  // The body tap pins the job at the top of the console with its send button
  // primed; the action button, where the platform draws one, opens the composer
  // outright. Sending a payment for a stranger's plate is worth one deliberate
  // tap, so only the explicit button skips it.
  await notifyRelays(
    `Plati parking · ${plate}`,
    `${zone} · ${minutes} min${body?.priceText ? ` · ${body.priceText}` : ''}`,
    `/relay?job=${data.id}`,
    [{ action: 'sms', title: 'Pošalji SMS' }, { action: 'open', title: 'Otvori' }],
    { sms: `/relay?job=${data.id}&go=sms`, open: '/relay' },
  )

  return { ok: true, id: data.id, token, code: shortCode(token) }
})

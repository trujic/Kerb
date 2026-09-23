// ── A SIGN THAT DISAGREES WITH THE REGISTRY ───────────────────────────────────
// The registry is reliable for rules and unreliable for geography: an operator can
// turn a Blue street Red with a screwdriver and never touch its website. Until now
// the first anyone heard of it was a driver's fine. A confirmed scan is the one
// moment the ground truth is in hand, so this compares it with the map at that
// spot and wakes whoever keeps the map when the two disagree.
//
//   POST /api/sign-alert { id }   — the id of a sign_reports row just written
//
// Called fire-and-forget by the client after a scan is saved. It re-reads the row
// with the service key rather than trusting anything in the request, only acts on
// scans from the last few minutes, and alerts once per scan.

import { rankZones } from '~~/app/utils/zoneClaim.js'
import { adminUserIds, pushToUsers, relayDb } from '~~/server/utils/relay'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FRESH_MS = 15 * 60_000
const FLOOR_M = 10 // the polygons are not sharper than a car length

const seen = new Set<string>()
const hits = new Map<string, number[]>()
const limited = (ip: string) => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 30
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string }>(event)
  const id = String(body?.id ?? '')
  if (!UUID_RE.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad sign id' })
  if (seen.has(id)) return { ok: true, verdict: 'already checked' }
  if (limited(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown')) {
    throw createError({ statusCode: 429, statusMessage: 'Too many checks' })
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { ok: false, verdict: 'no service key configured' }
  }

  const db = relayDb()
  const { data: rep, error } = await db
    .from('sign_reports')
    .select('id, city_id, zone_name, street_name, lat, lng, accuracy, photo_path, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !rep) return { ok: false, verdict: 'no such scan' }
  if (Date.now() - new Date(rep.created_at).getTime() > FRESH_MS) {
    return { ok: true, verdict: 'too old to alert on' }
  }
  seen.add(id)

  // Live geometry first, the published file second — the same order the app uses.
  let geo: any = null
  try {
    const { data } = await db.from('city_zones').select('geojson').eq('city_id', rep.city_id).maybeSingle()
    if (data?.geojson?.features?.length) geo = data.geojson
  } catch { /* table missing — fall through */ }
  if (!geo) {
    const origin = getRequestURL(event).origin
    geo = await $fetch<any>(`${origin}/zones/${rep.city_id}.json`).catch(() => null)
  }
  if (!geo?.features?.length) return { ok: true, verdict: 'no geometry for this city' }

  // Every zone the phone could have been standing in. The scan agrees with the
  // registry if its zone is any of them — a sign on a corner is not a conflict.
  const reach = Math.max(Number(rep.accuracy) || 25, FLOOR_M)
  const ranked = rankZones([rep.lng, rep.lat], geo)
  const inReach = ranked.filter((z: any) => z.dist <= reach)
  if (inReach.some((z: any) => z.zone === rep.zone_name)) return { ok: true, verdict: 'agrees' }

  const registry = inReach[0]?.zone ?? null
  const where = rep.street_name ? `${rep.street_name}, ` : ''
  const title = registry ? 'Tabla se ne slaže sa registrom' : 'Tabla gde registar nema zonu'
  const text = registry
    ? `${where}${rep.city_id}: tabla kaže ${rep.zone_name}, registar ${registry} (±${Math.round(reach)} m).`
    : `${where}${rep.city_id}: tabla kaže ${rep.zone_name}, a u registru ovde nema naplate.`
  const photo = rep.photo_path
    ? `${process.env.SUPABASE_URL}/storage/v1/object/public/sign-photos/${rep.photo_path}`
    : `https://www.openstreetmap.org/?mlat=${rep.lat}&mlon=${rep.lng}#map=19/${rep.lat}/${rep.lng}`

  // The log is the record even when nobody has push turned on.
  console.warn('[sign-alert]', title, '·', text, '·', photo)
  let pushed: any = { sent: 0 }
  try {
    pushed = await pushToUsers(adminUserIds(), { title, body: text, url: photo, tag: `kerb-sign-${id}` })
  } catch (e: any) {
    console.error('[sign-alert] push failed:', e?.message ?? e)
  }
  return { ok: true, verdict: registry ? 'mismatch' : 'no registry zone', sent: pushed.sent ?? 0 }
})

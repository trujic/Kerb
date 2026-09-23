// ── MOVE A SIGN PIN (DEV-ONLY, LIVE EFFECT) ───────────────────────────────────
// Writes a corrected position for one scan. Like /api/zones this holds the service
// key and is unreachable in production: the row it edits is what drivers are shown,
// and an open endpoint would let a stranger walk a city's signs anywhere they liked.
//
// Only fixed_* is written. The capture point stays as the contributor recorded it —
// the photograph is evidence of a place, and moving the pin is a claim about which
// place, not a licence to rewrite where the phone was. Sending null clears the
// correction and hands the pin back to GPS.

import { createClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{ id?: string; lat?: number | null; lng?: number | null }>(event)
  const id = String(body?.id ?? '')
  if (!UUID_RE.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad sign id' })

  const clear = body?.lat == null || body?.lng == null
  const lat = Number(body?.lat), lng = Number(body?.lng)
  if (!clear && (!Number.isFinite(lat) || !Number.isFinite(lng) ||
                 Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad coordinates' })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return { ok: false, reason: 'no service key in .env' }

  const db = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await db
    .from('sign_reports')
    .update(clear
      ? { fixed_lat: null, fixed_lng: null, fixed_at: null }
      : { fixed_lat: lat, fixed_lng: lng, fixed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    const hint = /fixed_lat|column .* does not exist|schema cache/i.test(error.message)
      ? 'run scripts/migration-sign-positions.sql'
      : error.message
    return { ok: false, reason: hint }
  }
  return { ok: true, cleared: clear }
})

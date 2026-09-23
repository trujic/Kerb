// ── SIGN SCANS FOR THE ZONE EDITOR (DEV-ONLY) ─────────────────────────────────
// The editor is a plain HTML page with no Supabase client of its own, so it reads
// the city's scans through here. Dev-only for the same reason as /api/zones: the
// companion POST needs the service key, and the pair belongs together.
//
// Each row reports both positions — where the phone was, and where a human has
// since put the pin — so the editor can draw the correction as a leash back to
// the capture point rather than pretending the scan was always there.

import { createClient } from '@supabase/supabase-js'

const CITY_RE = /^[a-z0-9-]{2,40}$/

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const city = String(getQuery(event).city ?? '')
  if (!CITY_RE.test(city)) throw createError({ statusCode: 400, statusMessage: 'Bad city id' })

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return { ok: true, signs: [], reason: 'no service key in .env' }

  const db = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await db
    .from('sign_reports')
    .select('id, zone_name, zone_color, price, street_name, lat, lng, accuracy, photo_path, created_at, fixed_lat, fixed_lng, fixed_at')
    .eq('city_id', city)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    const hint = /fixed_lat|column .* does not exist|schema cache/i.test(error.message)
      ? 'sign_reports is missing the fixed_* columns — run scripts/migration-sign-positions.sql'
      : error.message
    return { ok: true, signs: [], reason: hint }
  }

  const signs = (data ?? []).map((r: any) => ({
    ...r,
    photo_url: r.photo_path
      ? db.storage.from('sign-photos').getPublicUrl(r.photo_path).data.publicUrl
      : null,
  }))
  return { ok: true, signs }
})

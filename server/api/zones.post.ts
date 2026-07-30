// ── PUBLISH TRACED ZONES (DEV-ONLY ROUTE, LIVE EFFECT) ────────────────────────
// The editor calls this from a local dev server; the row it writes is read by
// production, so a corrected boundary reaches drivers without a deploy.
//
// Deliberately NOT reachable in production. The write needs the service key, and
// that key must never sit in a browser — so the editor stays a local tool and
// this route is the only thing holding the key. An open write endpoint on this
// table would let a stranger rewrite what a whole city is told to pay.
//
// Still writes public/zones/<city>.json alongside, so the repo keeps a committed
// baseline and git keeps the history that a jsonb column does not.

import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const CITY_RE = /^[a-z0-9-]{2,40}$/

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{ city?: string; fc?: any; note?: string }>(event)
  const city = String(body?.city ?? '')
  const fc = body?.fc

  if (!CITY_RE.test(city)) throw createError({ statusCode: 400, statusMessage: 'Bad city id' })
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw createError({ statusCode: 400, statusMessage: 'Not a FeatureCollection' })
  }
  for (const [i, f] of fc.features.entries()) {
    const g = f?.geometry
    const ok =
      (g?.type === 'Polygon' && g.coordinates?.length) ||
      (g?.type === 'LineString' && g.coordinates?.length >= 2) ||
      (g?.type === 'MultiLineString' && g.coordinates?.length)
    if (!ok) throw createError({ statusCode: 400, statusMessage: `Feature ${i} has unusable geometry` })
    if (!f?.properties?.zone) throw createError({ statusCode: 400, statusMessage: `Feature ${i} has no zone` })
  }

  // 1) The repo baseline, so nothing depends on the database being reachable.
  const dir = join(process.cwd(), 'public', 'zones')
  if (existsSync(dir)) writeFileSync(join(dir, `${city}.json`), JSON.stringify(fc), 'utf8')

  // 2) The live copy production reads.
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    return { ok: true, city, features: fc.features.length, live: false, reason: 'no service key in .env' }
  }
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await db
    .from('city_zones')
    .upsert({ city_id: city, geojson: fc, note: body?.note ?? null, updated_at: new Date().toISOString() },
            { onConflict: 'city_id' })

  if (error) {
    // Missing table is the common case before the migration has been run — say so
    // plainly rather than letting the editor report a bare failure.
    const hint = /relation .*city_zones.* does not exist|schema cache/i.test(error.message)
      ? 'table city_zones is missing — run scripts/migration-city-zones.sql'
      : error.message
    return { ok: true, city, features: fc.features.length, live: false, reason: hint }
  }
  return { ok: true, city, features: fc.features.length, live: true }
})

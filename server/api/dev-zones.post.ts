// ── WRITE TRACED ZONES STRAIGHT INTO THE APP (DEV ONLY) ───────────────────────
// Saves the editor's current trace to public/zones/<city>.json so a pass over the
// map no longer means export → find the download → copy over the file.
//
// Refuses to run outside dev, and validates before writing: this endpoint can
// overwrite the file the whole detection layer reads, and a half-formed body
// would take the city's zones down silently.

import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CITY_RE = /^[a-z0-9-]{2,40}$/

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{ city?: string; fc?: any }>(event)
  const city = String(body?.city ?? '')
  const fc = body?.fc

  if (!CITY_RE.test(city)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad city id' })
  }
  const dir = join(process.cwd(), 'public', 'zones')
  if (!existsSync(dir)) {
    throw createError({ statusCode: 500, statusMessage: 'public/zones is missing' })
  }
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw createError({ statusCode: 400, statusMessage: 'Not a FeatureCollection' })
  }
  for (const [i, f] of fc.features.entries()) {
    const g = f?.geometry
    const okGeom =
      (g?.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates.length) ||
      (g?.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) ||
      (g?.type === 'MultiLineString' && Array.isArray(g.coordinates) && g.coordinates.length)
    if (!okGeom) {
      throw createError({ statusCode: 400, statusMessage: `Feature ${i} has unusable geometry` })
    }
    if (!f?.properties?.zone) {
      throw createError({ statusCode: 400, statusMessage: `Feature ${i} has no zone` })
    }
  }

  writeFileSync(join(dir, `${city}.json`), JSON.stringify(fc), 'utf8')
  return { ok: true, city, features: fc.features.length }
})

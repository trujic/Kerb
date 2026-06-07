// ── BUILD NOVI SAD ZONE GEOMETRY ──────────────────────────────────────────────
// Pulls real street geometry from OpenStreetMap (Overpass API) for every street
// in the street→zone mapping, colors each by its zone, and writes a GeoJSON
// FeatureCollection of LineStrings to public/zones/novi-sad.json.
//
// Run:  node scripts/build-novisad-geometry.mjs
//
// The map (app/components/LocationMap.vue) renders these lines directly — each
// drawn parking street appears in its zone color. No invented area boundaries.

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeStreet, zones, streetZones } from './novisad-zones.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dir, '../public/zones/novi-sad.json')

// Our street list (from parkingns.rs) vs OpenStreetMap naming: a handful differ
// (genitive case, fuller official names, or transcription). Verified by token
// search against the OSM data. A couple also corrected typos in the source list.
const ALIASES = {
  'Ilije Ognjanovića': 'Ilije Ognjanovića Abukazema',
  'Bulevar kralja Petra Prvog': 'Bulevar kralja Petra I',
  'Dr Laze Stanojević': 'Dr Laze Stanojevića',
  'Natošević': 'Natoševićeva',
  'Alberta Toma': 'Alberta Tome',
  'Arhimandrita Rajića': 'Arhimandrita Jovana Rajića',
  'Devet Jugović': 'Devet Jugovića',
  'Dr Đorđa Jovanovića': 'Dr Đorđa Joanovića',
  'Zmaj Ognjeva Vuka': 'Zmaj Ognjena Vuka',
  'Marka Maljanova': 'Marka Miljanova',          // source typo (Marko Miljanov)
  'Ognjene Price': 'Ognjena Price',
  'Podunskog odreda': 'Podunavskog odreda',       // source typo
  'Save Vuković': 'Save Vukovića',
  'Stjepana Mitra Ljubiše': 'Stjepana Mitrova Ljubiše',
  'Trg Ferenca Fehéra': 'Trg Feher Ferenca',
  'Feješa Tivadara': 'Felegi Tivadara',           // low-confidence transcription match
  // 'Železnička stanica' intentionally omitted — it's the station parking lot,
  // not a street; 'Železnička' (the street) is already mapped to the Red Zone.
}

// Bounding box around Novi Sad's charged-parking area: S, W, N, E
const BBOX = [45.22, 19.78, 45.30, 19.92]

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const colorOf = Object.fromEntries(zones.map(z => [z.name, z.color]))
const round = n => Math.round(n * 1e5) / 1e5

async function fetchOverpass() {
  // Reuse a cached response if provided (avoids Overpass rate limits on re-runs)
  const cache = process.env.OVERPASS_CACHE
  if (cache && existsSync(cache)) {
    console.log(`Using cached Overpass data: ${cache}`)
    const json = JSON.parse(readFileSync(cache, 'utf8'))
    console.log(`✓ Loaded ${json.elements?.length ?? 0} ways from cache`)
    return json.elements ?? []
  }

  const query = `[out:json][timeout:120];
way["highway"]["name"](${BBOX.join(',')});
out geom;`

  let lastErr
  for (const url of ENDPOINTS) {
    try {
      console.log(`Querying Overpass: ${url} …`)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Kerb-parking/1.0 (zone geometry builder)',
        },
        body: 'data=' + encodeURIComponent(query),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      console.log(`✓ Received ${json.elements?.length ?? 0} ways`)
      return json.elements ?? []
    } catch (e) {
      console.warn(`  ✗ ${url} failed: ${e.message}`)
      lastErr = e
    }
  }
  throw lastErr ?? new Error('All Overpass endpoints failed')
}

function buildIndex(ways) {
  // normalized street name → array of line geometries ([[lng,lat], …])
  const index = new Map()
  for (const w of ways) {
    if (!w.geometry?.length) continue
    const tags = w.tags ?? {}
    // Match on any available name variant (primary, Latin, international)
    const names = [tags.name, tags['name:sr-Latn'], tags['name:sr'], tags.int_name]
      .filter(Boolean)
    if (!names.length) continue
    const line = w.geometry.map(p => [round(p.lon), round(p.lat)])
    for (const n of names) {
      const key = normalizeStreet(n)
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(line)
    }
  }
  return index
}

async function main() {
  const ways = await fetchOverpass()
  const index = buildIndex(ways)

  const features = []
  const matched = []
  const unmatched = []

  for (const { street, zone } of streetZones) {
    const key = normalizeStreet(street)
    const lines =
      index.get(key) ??
      (ALIASES[street] ? index.get(normalizeStreet(ALIASES[street])) : null)
    if (!lines || !lines.length) {
      unmatched.push(street)
      continue
    }
    // Dedupe identical lines that came in via multiple name variants
    const seen = new Set()
    const uniq = []
    for (const l of lines) {
      const sig = JSON.stringify(l)
      if (seen.has(sig)) continue
      seen.add(sig)
      uniq.push(l)
    }
    matched.push(street)
    features.push({
      type: 'Feature',
      properties: { name: street, zone, color: colorOf[zone] ?? '#3B82F6' },
      geometry:
        uniq.length === 1
          ? { type: 'LineString', coordinates: uniq[0] }
          : { type: 'MultiLineString', coordinates: uniq },
    })
  }

  const fc = { type: 'FeatureCollection', features }
  writeFileSync(OUT, JSON.stringify(fc))

  console.log(`\n✓ Wrote ${features.length} street features → ${OUT}`)
  console.log(`  matched   ${matched.length}/${streetZones.length}`)
  if (unmatched.length) {
    console.log(`  unmatched ${unmatched.length}:`)
    for (const s of unmatched) console.log(`    • ${s}`)
  }
}

main().catch(err => {
  console.error('Build failed:', err.message)
  process.exit(1)
})

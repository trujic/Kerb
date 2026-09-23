// Runs the split place/you claim over random points in Novi Sad and prints what
// a driver would actually be told at each one. The point of the test is not that
// it passes — it is the DISTRIBUTION: if nearly every point comes back "loud",
// the hedge is still wallpaper and the thresholds are wrong.
//
//   node scripts/test-zone-claim.mjs [count] [seed]

import { readFileSync } from 'node:fs'
import { zoneClaim, claimLines } from '../app/utils/zoneClaim.js'

const COUNT = Number(process.argv[2] ?? 30)
const SEED = Number(process.argv[3] ?? 20260913)

const geo = JSON.parse(readFileSync(new URL('../public/zones/novi-sad.json', import.meta.url), 'utf8'))

const rnd = (() => { let s = SEED >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 })()

// Uniform points over the city bbox would land in a field nearly every time —
// the zones are thin strips. So we sample around real lots with a spread wide
// enough to land inside, on an edge, and well outside, which is the mix a driver
// actually produces.
function samplePoint() {
  const f = geo.features[Math.floor(rnd() * geo.features.length)]
  const ring = f.geometry.coordinates[0]
  const v = ring[Math.floor(rnd() * (ring.length - 1))]
  const spreadM = 120
  const mPerLat = 111_320
  const mPerLng = 111_320 * Math.cos((v[1] * Math.PI) / 180)
  const a = rnd() * Math.PI * 2
  const d = Math.pow(rnd(), 0.6) * spreadM
  return [v[0] + (Math.cos(a) * d) / mPerLng, v[1] + (Math.sin(a) * d) / mPerLat]
}

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)
const C = { dim: '\x1b[2m', off: '\x1b[0m', red: '\x1b[31m', yel: '\x1b[33m', grn: '\x1b[32m', bold: '\x1b[1m' }
const tint = { quiet: C.grn, normal: C.yel, loud: C.red, none: C.dim }

console.log(`\n${C.bold}Split claim · ${COUNT} tačaka · Novi Sad${C.off}  ${C.dim}(seed ${SEED})${C.off}\n`)
console.log(C.dim + pad('#', 4) + pad('zona', 12) + padL('±GPS', 6) + padL('unutra', 8) + padL('do druge', 10) + padL('margina', 9) + '  nivo' + C.off)
console.log(C.dim + '─'.repeat(84) + C.off)

const tally = { quiet: 0, normal: 0, loud: 0, none: 0 }
const rows = []

for (let i = 0; i < COUNT; i++) {
  const p = samplePoint()
  // Realistic urban fixes: mostly 8–35 m, occasionally much worse between blocks.
  const accuracy = Math.round(8 + rnd() * 27 + (rnd() < 0.12 ? rnd() * 45 : 0))
  const c = zoneClaim({ point: p, accuracy, geo, signs: [], pays: [] })
  const lines = claimLines(c)
  tally[lines.level]++

  const zone = c.place?.zone?.replace(' Zone', '') ?? '—'
  const inside = c.you.inside ? Math.round(c.you.insideByM) + ' m' : (c.state === 'none' ? '—' : 'ne')
  const other = c.you.nearestOther ? Math.round(c.you.nearestOther.distM) + ' m' : '—'
  const margin = c.you.marginM == null ? '—' : (c.you.marginM > 0 ? '+' : '') + Math.round(c.you.marginM) + ' m'

  console.log(
    pad(i + 1, 4) + pad(zone, 12) + padL(accuracy + ' m', 6) + padL(inside, 8) +
    padL(other, 10) + padL(margin, 9) + '  ' + tint[lines.level] + lines.level + C.off,
  )
  rows.push({ i: i + 1, lines, p, c })
}

console.log(C.dim + '─'.repeat(84) + C.off)
const pct = (n) => Math.round((n / COUNT) * 100) + '%'
console.log(
  `\n${C.grn}quiet ${tally.quiet} (${pct(tally.quiet)})${C.off} · ` +
  `${C.yel}normal ${tally.normal} (${pct(tally.normal)})${C.off} · ` +
  `${C.red}loud ${tally.loud} (${pct(tally.loud)})${C.off} · ` +
  `${C.dim}bez zone ${tally.none} (${pct(tally.none)})${C.off}\n`,
)

console.log(C.bold + 'Šta bi vozač video — po jedan primer svakog nivoa:' + C.off + '\n')
for (const lvl of ['quiet', 'normal', 'loud', 'none']) {
  const r = rows.find((x) => x.lines.level === lvl)
  if (!r) continue
  console.log(`${tint[lvl]}▌${lvl}${C.off}  ${C.dim}#${r.i}${C.off}`)
  console.log(`   ${C.bold}${r.lines.place}${C.off}`)
  console.log(`   ${r.lines.you}`)
  if (r.lines.spot) console.log(`   ${C.dim}${r.lines.spot}${C.off}`)
  console.log('')
}

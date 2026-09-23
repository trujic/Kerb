// Runs the payment-deviation detector over REAL Novi Sad geometry with a
// simulated week of behaviour, and prints which streets it would send someone to
// scan. The interesting output is the funnel: at small user counts every cell is
// rejected for sample size, and no amount of threshold tuning changes that.
//
//   node scripts/test-pay-deviation.mjs [users] [seed]

import { readFileSync } from 'node:fs'
import { rankZones } from '../app/utils/zoneClaim.js'
import { aggregate, buildBaselines, flagCells, GATES } from '../app/utils/payDeviation.js'

const USERS = Number(process.argv[2] ?? 10000)
const SEED = Number(process.argv[3] ?? 20260913)

const geo = JSON.parse(readFileSync(new URL('../public/zones/novi-sad.json', import.meta.url), 'utf8'))
const rnd = (() => { let s = SEED >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 })()

// Real lots, so flagged cells carry real zones and real street names.
const SPOTS = []
for (const f of geo.features) {
  const ring = f.geometry.coordinates[0]
  for (let i = 0; i < ring.length - 1; i += 2) {
    SPOTS.push({ lng: ring[i][0], lat: ring[i][1], zone: f.properties.zone, street: f.properties.name || null })
  }
}

// Baseline share that pays through Kerb when nothing is wrong. Well under 100%
// everywhere — nSpark, meters, ePK, and people who risk it exist in every zone.
const BASE = { 'Extra Zone': 0.90, 'Red Zone': 0.88, 'Blue Zone': 0.85, 'White Zone': 0.76 }
const BLOCKS = ['wd-am', 'wd-pm', 'wd-eve', 'sat-am']

// Plant a handful of pockets where almost nobody pays through Kerb, so we can
// check the detector finds them — and see how many it misses.
const planted = new Set()
while (planted.size < 5) planted.add(Math.floor(rnd() * SPOTS.length))
const plantedSpots = [...planted]

const observations = []
const ARRIVALS = Math.round(USERS * 0.27 * 7 / 0.85) // a week of intent-to-park

for (let i = 0; i < ARRIVALS; i++) {
  const si = Math.floor(Math.pow(rnd(), 1.7) * SPOTS.length) // centre is busier
  const s = SPOTS[si]
  const block = BLOCKS[Math.floor(rnd() * BLOCKS.length)]
  const rate = planted.has(si) ? 0.05 + rnd() * 0.07 : Math.max(0, Math.min(1, BASE[s.zone] + (rnd() - 0.5) * 0.12))
  observations.push({
    lat: s.lat + (rnd() - 0.5) * 0.00035,   // GPS scatter + walk-away
    lng: s.lng + (rnd() - 0.5) * 0.00045,
    zone: s.zone,
    block,
    paid: rnd() < rate,
    user: 'u' + Math.floor(rnd() * Math.max(1, USERS * 0.6)),
  })
}

const cells = aggregate(observations)
const baselines = buildBaselines(cells)
const { flags, funnel } = flagCells(cells, baselines)

const C = { d: '\x1b[2m', o: '\x1b[0m', b: '\x1b[1m', y: '\x1b[33m', g: '\x1b[32m', r: '\x1b[31m' }
const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)

console.log(`\n${C.b}Odstupanje od baseline-a · ${USERS.toLocaleString('sr-RS')} korisnika · Novi Sad${C.o} ${C.d}(seed ${SEED})${C.o}`)
console.log(`${C.d}${ARRIVALS.toLocaleString('sr-RS')} dolazaka do plaćanja za nedelju dana · ${cells.length} ćelija (50 m × zona × termin)${C.o}\n`)

console.log(`${C.b}Baseline po zoni i terminu${C.o}`)
for (const z of ['Extra Zone', 'Red Zone', 'Blue Zone', 'White Zone']) {
  const row = BLOCKS.map((bk) => {
    const b = baselines.get(`${z}|${bk}`)
    return b?.rate != null ? padL(Math.round(b.rate * 100) + '%', 7) : padL('—', 7)
  }).join('')
  console.log('  ' + pad(z.replace(' Zone', ''), 8) + row + C.d + '   ' + BLOCKS.join(' · ') + C.o)
  break
}
for (const z of ['Red Zone', 'Blue Zone', 'White Zone']) {
  const row = BLOCKS.map((bk) => {
    const b = baselines.get(`${z}|${bk}`)
    return b?.rate != null ? padL(Math.round(b.rate * 100) + '%', 7) : padL('—', 7)
  }).join('')
  console.log('  ' + pad(z.replace(' Zone', ''), 8) + row)
}

console.log(`\n${C.b}Levak${C.o}`)
console.log(`  ${pad('ćelija ukupno', 26)}${padL(funnel.total, 6)}`)
console.log(`  ${pad(`prošlo k ≥ ${GATES.kUsers}`, 26)}${padL(funnel.anon, 6)}  ${C.d}anonimnost${C.o}`)
console.log(`  ${pad(`prošlo n ≥ ${GATES.arrivals}`, 26)}${padL(funnel.enough, 6)}  ${C.d}dovoljno uzorka da se udeo uopšte računa${C.o}`)
console.log(`  ${pad(`zastavica (−${GATES.dropPP} pp)`, 26)}${padL(funnel.flagged, 6)}  ${C.d}Wilson gornja granica ispod baseline-a${C.o}`)

if (!flags.length) {
  console.log(`\n${C.y}Nijedna zastavica.${C.o} ${funnel.enough === 0
    ? 'Nijedna ćelija nema n ≥ 30 — na ovoj skali sloj ne postoji.'
    : 'Ima uzorka, ali nijedno odstupanje nije dovoljno veliko.'}\n`)
} else {
  console.log(`\n${C.b}Gde poslati nekoga da skenira${C.o}\n`)
  for (const f of flags.slice(0, 10)) {
    const spot = rankZones([f.lng, f.lat], geo)[0]
    const where = spot?.name || `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`
    console.log(`  ${C.y}▌${C.o} ${C.b}${where}${C.o} ${C.d}· ${f.zone.replace(' Zone', '')} · ${f.block}${C.o}`)
    console.log(`    ${f.says}`)
    console.log(`    ${C.d}−${Math.round(f.dropPP)} pp (Wilson) · n=${f.arrivals} · k=${f.payers}${C.o}\n`)
  }
}

// Did it find what was planted? Misses matter more than hits — a detector that
// only reports what it is sure of is the right kind of wrong.
const hit = new Set()
for (const f of flags) {
  for (const si of plantedSpots) {
    const s = SPOTS[si]
    if (Math.abs(s.lat - f.lat) < 0.0006 && Math.abs(s.lng - f.lng) < 0.0008) hit.add(si)
  }
}
console.log(`${C.b}Kontrola:${C.o} podmetnuto ${plantedSpots.length}, pronađeno ${C.g}${hit.size}${C.o}, promašeno ${C.r}${plantedSpots.length - hit.size}${C.o}`)
console.log(`${C.d}Promašaj je prihvatljiv; lažna optužba ulice nije.${C.o}\n`)

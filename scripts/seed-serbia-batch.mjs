import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')] })
)
if (!env.SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1) }
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

// ── CITY DATA ─────────────────────────────────────────────────────────────────

const CITIES = [

  // ── NIŠ ───────────────────────────────────────────────────────────────────
  {
    city: {
      id: 'nis',
      name: 'Niš',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Niš uses 3 color-coded street parking zones managed by JKP Parking Servis Niš. The extra (yellow) zone in the city centre has a 60-minute limit, while the red and green zones allow up to 2 and 3 hours respectively. Payment via SMS or parking meters. Sundays are always free.',
      fine: '1,100 RSD daily ticket',
      official_url: 'https://www.nisparking.rs',
      sms_instructions: 'Send your license plate (no spaces, e.g. Ni123AB) to the zone shortcode. Extra zone → 9180 (60 min), Red zone → 9181 (1h) or 9184 (all-day 700 RSD), Green zone → 9182 (1h) or 9185 (all-day 550 RSD).',
    },
    zones: [
      { name: 'Extra Zone — Yellow', color: '#CA8A04', rules: 'Max 60 min. City centre core. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free on Sundays.', price: '100 RSD/h', sort_order: 1 },
      { name: 'Red Zone — First', color: '#DC2626', rules: 'Max 120 min. Price increases in the 2nd hour. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free on Sundays.', price: '70 RSD/h (2nd h: 210 RSD)', sort_order: 2 },
      { name: 'Green Zone — Second', color: '#16A34A', rules: 'Max 180 min. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free on Sundays.', price: '55 RSD/h', sort_order: 3 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '🅿️ Parking meters (Nikole Pašića 24 & Cara Dušana 2)', sort_order: 2 },
      { label: '📱 eParking Niš portal (nis.eparking.rs)', sort_order: 3 },
    ],
    tips: [
      { icon: '⚠️', text: 'If you do not pay, a 1,100 RSD daily parking ticket is issued automatically — valid from issuance until the same time the next day.', sort_order: 1 },
      { icon: '🟡', text: 'The extra yellow zone is the strictest — 60 min max, right in the city centre around Nikola Pašić Square.', sort_order: 2 },
      { icon: '📈', text: 'Red zone pricing doubles in the 2nd hour (70 → 210 RSD). Plan your visit to stay within 1 hour if possible.', sort_order: 3 },
      { icon: '🕐', text: 'Sundays are completely free in all zones. Saturday enforcement ends at 14:00.', sort_order: 4 },
      { icon: '📋', text: 'For all-day parking in Red zone use SMS 9184 (700 RSD) or Green zone SMS 9185 (550 RSD) — cheaper than paying hourly for a full day.', sort_order: 5 },
    ],
    tags: [{ label: 'Extra zone' }, { label: 'Red zone' }, { label: 'Green zone' }, { label: 'SMS pay' }, { label: 'Free Sundays' }],
  },

  // ── KRAGUJEVAC ────────────────────────────────────────────────────────────
  {
    city: {
      id: 'kragujevac',
      name: 'Kragujevac',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'Sep 2024',
      overview: 'Kragujevac uses a 3-zone street parking system managed by JKP Šumadija. Zone 0 in the city centre has a strict 2-hour limit with escalating pricing, while Zones I and II have no time limit. Prices were last updated September 2024. Sundays and public holidays are free.',
      fine: 'Daily parking card issued if unpaid — 50% discount if paid within 8 days',
      official_url: 'https://www.jkpsumadija.rs/sr/usluge/organizaciona-celina-parking/zone-parkinga-kragujevac.html',
      sms_instructions: 'Send your license plate to the zone shortcode. Zone 0 → 8340 (1h), 8340 again for 2nd/3rd hour, 8346 (24h); Zone I → 8341 (1h), 8343 (24h); Zone II → 8342 (1h), 8344 (24h). Daily pass all zones → 8345.',
    },
    zones: [
      { name: 'Zone 0 — Centre', color: '#F97316', rules: 'Max 120 min. 1st hour 70 RSD, 2nd hour 140 RSD. Cannot re-park in same zone after expiry. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays & holidays.', price: '70 RSD/h (2nd h: 140 RSD)', sort_order: 1 },
      { name: 'Zone I', color: '#2563EB', rules: 'No time limit. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays & holidays.', price: '60 RSD/h', sort_order: 2 },
      { name: 'Zone II', color: '#16A34A', rules: 'No time limit. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays & holidays.', price: '50 RSD/h', sort_order: 3 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '🎟 Physical parking cards', sort_order: 2 },
    ],
    tips: [
      { icon: '⚠️', text: 'Zone 0 is strictly 2 hours max. The 2nd hour costs double (140 RSD). After expiry you must leave the zone.', sort_order: 1 },
      { icon: '💡', text: 'All-day parking available via SMS: Zone I → 8343, Zone II → 8344. Zastava Clock parking lot (Zone 0 edge) offers all-day for 150 RSD — 264 spaces, 200m from centre.', sort_order: 2 },
      { icon: '🕐', text: 'Sundays and public holidays are completely free in all zones.', sort_order: 3 },
      { icon: '📋', text: 'Unpaid parking results in a daily card. Pay within 8 days for a 50% discount.', sort_order: 4 },
    ],
    tags: [{ label: 'Zone 0' }, { label: 'Zone I' }, { label: 'Zone II' }, { label: 'SMS pay' }, { label: 'Free Sundays' }],
  },

  // ── SUBOTICA ──────────────────────────────────────────────────────────────
  {
    city: {
      id: 'subotica',
      name: 'Subotica',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Subotica has 4 parking zones managed by JKP Parking Subotica. Zones are color-coded red, yellow, green and blue with different prices. Payment via SMS or ePayment portal. Towing is active.',
      fine: 'Towing: 5,000–9,000 RSD depending on vehicle weight',
      official_url: 'https://suparking.rs',
      sms_instructions: 'Send your license plate (no spaces, include Serbian characters) to the zone shortcode. Red zone → 9241, Yellow zone → 9242, Green zone → 9243, Blue zone → 9244. Daily cards: Red → 9245 (480 RSD), Yellow → 9246 (330 RSD), Blue → 9247 (276 RSD).',
    },
    zones: [
      { name: 'Red Zone — I', color: '#DC2626', rules: 'City centre. Hourly charge. Check official signage for time limits.', price: '70 RSD/h', sort_order: 1 },
      { name: 'Yellow Zone — II', color: '#CA8A04', rules: 'Inner city. Hourly charge. Check official signage for time limits.', price: '60 RSD/h', sort_order: 2 },
      { name: 'Green Zone — III', color: '#16A34A', rules: 'Outer centre. Daily card only (5:00–15:00). Check official signage.', price: '170 RSD/day', sort_order: 3 },
      { name: 'Blue Zone — IV', color: '#2563EB', rules: 'Wider area. Hourly charge. Check official signage for time limits.', price: '45 RSD/h', sort_order: 4 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '💳 ePayment portal (online card payment)', sort_order: 2 },
      { label: '💳 Visa, Mastercard, Maestro, Amex accepted', sort_order: 3 },
    ],
    tips: [
      { icon: '🚗', text: 'Towing is active. Removal costs 5,000 RSD (under 800kg) or 9,000 RSD (801–1,500kg). Storage at depot is 15 RSD per hour after initial period.', sort_order: 1 },
      { icon: '💡', text: 'Daily cards are cheaper than hourly if staying most of the day: Red 480 RSD (SMS 9245), Yellow 330 RSD (SMS 9246), Blue 276 RSD (SMS 9247).', sort_order: 2 },
      { icon: '📞', text: 'Free information line: 0800 333 024. Complaints and de-clamping: 024/694-961.', sort_order: 3 },
    ],
    tags: [{ label: 'Red zone' }, { label: 'Yellow zone' }, { label: 'Green zone' }, { label: 'Blue zone' }, { label: 'SMS pay' }, { label: 'Card pay' }],
  },

  // ── ČAČAK ─────────────────────────────────────────────────────────────────
  {
    city: {
      id: 'cacak',
      name: 'Čačak',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Čačak has 4 street parking zones managed by JKP Parking Čačak. The extra (red) zone in the city centre has a 2-hour limit. Zones 1–3 have no time limit. Enforcement runs until 22:00 on weekdays — later than most Serbian cities. App payment available via Parking Adria.',
      fine: 'Contact: 0800 300 401 (free complaints line)',
      official_url: 'https://parkingcacak.co.rs',
      sms_instructions: 'Send your license plate to the zone shortcode. Extra zone → 9320 (120 min max), Zone 1 → 9321, Zone 2 → 9322, Zone 3 → 9323. Daily pass (Zones 2–3 only) → 9325.',
    },
    zones: [
      { name: 'Extra Zone — Red', color: '#DC2626', rules: 'Max 120 min. City centre. Mon–Fri 7:00–22:00, Sat 7:00–15:00. Free Sundays & holidays.', price: '80 RSD/h', sort_order: 1 },
      { name: 'Zone 1 — Yellow', color: '#CA8A04', rules: 'No time limit. Mon–Fri 7:00–22:00, Sat 7:00–15:00. Free Sundays & holidays.', price: '60 RSD/h', sort_order: 2 },
      { name: 'Zone 2 — Green', color: '#16A34A', rules: 'No time limit. Mon–Fri 7:00–22:00, Sat 7:00–15:00. Free Sundays & holidays.', price: '40 RSD/h', sort_order: 3 },
      { name: 'Zone 3 — Blue', color: '#2563EB', rules: 'No time limit. Mon–Fri 7:00–22:00, Sat 7:00–15:00. Free Sundays & holidays.', price: '30 RSD/h', sort_order: 4 },
    ],
    payment_methods: [
      { label: '📱 Parking Adria app (iOS & Android)', sort_order: 1 },
      { label: '💬 SMS shortcode', sort_order: 2 },
      { label: '🎟 Scratch cards (zone colors)', sort_order: 3 },
      { label: '👮 Controllers on-site (cash)', sort_order: 4 },
    ],
    tips: [
      { icon: '🕙', text: 'Weekday enforcement runs until 22:00 — later than most Serbian cities. Don\'t assume you\'re safe after 21:00.', sort_order: 1 },
      { icon: '⚠️', text: 'Extra zone is strictly 120 min max. The city centre is actively patrolled.', sort_order: 2 },
      { icon: '📱', text: 'Parking Adria app works in Čačak and auto-detects your zone via GPS — the easiest payment method if you have it installed.', sort_order: 3 },
      { icon: '🎟', text: 'Daily pass available via SMS 9325 for Zones 2 and 3 only — not valid in the extra zone or Zone 1.', sort_order: 4 },
      { icon: '🚗', text: 'Closed facilities on Skadarska Street (65 RSD/h) and near taxi stands (50 RSD/h) if you need guaranteed covered parking.', sort_order: 5 },
    ],
    tags: [{ label: 'Extra zone' }, { label: 'SMS pay' }, { label: 'App pay' }, { label: 'Free Sundays' }, { label: 'Late enforcement' }],
  },

  // ── VRŠAC ─────────────────────────────────────────────────────────────────
  {
    city: {
      id: 'vrsac',
      name: 'Vršac',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Vršac has 2 street parking zones managed by JP Oktobar. Zone 1 (red) covers the city centre and Zone 2 (blue) covers the wider area. Prices are among the lowest in Serbia. A 200 RSD daily card covers both zones. Controlled parking lots operate 24/7.',
      fine: 'Contact JP Oktobar for current fine amounts',
      official_url: 'https://oktobar.co.rs/delatnosti/direkcija-komunalni-poslovi-2/ej-parking-servis/',
      sms_instructions: 'Send your license plate to the zone shortcode. Zone 1 Red → 8131 (1h, 35 RSD), Zone 2 Blue → 8132 (1h, 30 RSD). Daily card both zones → 8133 (200 RSD).',
    },
    zones: [
      { name: 'Zone 1 — Red', color: '#DC2626', rules: 'City centre. 1 card = 1 hour. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays.', price: '35 RSD/h', sort_order: 1 },
      { name: 'Zone 2 — Blue', color: '#2563EB', rules: 'Wider area. 1 card = 1 hour. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays.', price: '30 RSD/h', sort_order: 2 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '🎟 Physical parking cards (kiosks)', sort_order: 2 },
      { label: '📱 PARKING app (Android & iOS)', sort_order: 3 },
    ],
    tips: [
      { icon: '💡', text: 'Daily card covers both zones for 200 RSD (SMS 8133) — best value if staying more than a few hours.', sort_order: 1 },
      { icon: '🅿️', text: 'Controlled parking lots operate 24/7 with fixed rates — useful if arriving late.', sort_order: 2 },
      { icon: '🕐', text: 'Free on Sundays. Saturday enforcement ends at 14:00.', sort_order: 3 },
    ],
    tags: [{ label: 'Red zone' }, { label: 'Blue zone' }, { label: 'SMS pay' }, { label: 'App pay' }, { label: 'Free Sundays' }],
  },

  // ── SMEDEREVO ─────────────────────────────────────────────────────────────
  {
    city: {
      id: 'smederevo',
      name: 'Smederevo',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Smederevo has 3 street parking zones managed by JKP Parking Servis Smederevo. Zone I (red) in the city centre has a 2-hour limit, Zone II (yellow) allows up to 4 hours, and Zone III (green) is unlimited. Payment via SMS, cash or card. Sundays are free.',
      fine: 'Contact parkingsd.rs for current fine amounts',
      official_url: 'https://parkingsd.rs',
      sms_instructions: 'Send your license plate to the zone shortcode. Zone I Red → 8661 (1h), Zone II Yellow → 8662 (1h), Zone III Green → 8663 (1h) or 8664 (daily, 170 RSD).',
    },
    zones: [
      { name: 'Zone I — Red', color: '#DC2626', rules: 'Max 120 min. City centre. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays.', price: '53 RSD/h', sort_order: 1 },
      { name: 'Zone II — Yellow', color: '#CA8A04', rules: 'Max 240 min. Inner city. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays.', price: '44 RSD/h', sort_order: 2 },
      { name: 'Zone III — Green', color: '#16A34A', rules: 'No time limit. Mon–Fri 7:00–21:00, Sat 7:00–14:00. Free Sundays.', price: '35 RSD/h or 170 RSD/day', sort_order: 3 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '💵 Cash (on-site)', sort_order: 2 },
      { label: '💳 Card payment', sort_order: 3 },
    ],
    tips: [
      { icon: '💡', text: 'Zone III daily card (170 RSD via SMS 8664) is the best value for longer stays — cheaper than 5 hourly payments.', sort_order: 1 },
      { icon: '🅿️', text: 'Two dedicated 24/7 parking lots with 152 total spaces available — check parkingsd.rs for locations.', sort_order: 2 },
      { icon: '🕐', text: 'Free on Sundays across all zones.', sort_order: 3 },
    ],
    tags: [{ label: 'Red zone' }, { label: 'Yellow zone' }, { label: 'Green zone' }, { label: 'SMS pay' }, { label: 'Free Sundays' }],
  },

  // ── UŽICE ─────────────────────────────────────────────────────────────────
  {
    city: {
      id: 'uzice',
      name: 'Užice',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Užice has 2 street parking zones managed by JKP Bioktoš. Zone I in the city centre has a 2-hour limit, Zone II is unlimited. Enforcement ends at 20:00 on weekdays — earlier than most Serbian cities. A public garage with 200 spaces is available in the centre.',
      fine: 'Contact JKP Bioktoš for current fine amounts',
      official_url: 'https://uzice.rs/parking-servis/',
      sms_instructions: 'Send your license plate to the zone shortcode. Zone I → 8311 (1h, 50 RSD), Zone II → 8312 (1h, 40 RSD). Multi-hour card (valid all day) → 8313 (150 RSD).',
    },
    zones: [
      { name: 'Zone I', color: '#DC2626', rules: 'Max 120 min (60 min + 60 min extension). City centre. Mon–Fri 7:00–20:00, Sat 7:00–14:00.', price: '50 RSD/h', sort_order: 1 },
      { name: 'Zone II', color: '#16A34A', rules: 'No time limit. Mon–Fri 7:00–20:00, Sat 7:00–14:00. Cards available at Zone II kiosks.', price: '40 RSD/h', sort_order: 2 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '🎟 Parking cards at kiosks (Zone II)', sort_order: 2 },
      { label: '💵 Direct payment at public garage & King Peter I St parking', sort_order: 3 },
    ],
    tips: [
      { icon: '🕗', text: 'Enforcement ends at 20:00 on weekdays — earlier than most Serbian cities. Free after 20:00 and all day Sundays.', sort_order: 1 },
      { icon: '💡', text: 'Multi-hour card (SMS 8313, 150 RSD) is valid until end of the payment day — best value for Zone I if staying more than 3 hours.', sort_order: 2 },
      { icon: '🅿️', text: 'Public garage in the centre has 200 spaces at 50 RSD/h — good option when street parking is full.', sort_order: 3 },
    ],
    tags: [{ label: 'Zone I' }, { label: 'Zone II' }, { label: 'SMS pay' }, { label: 'Public garage' }, { label: 'Early cutoff' }],
  },

  // ── ZAJEČAR ───────────────────────────────────────────────────────────────
  {
    city: {
      id: 'zajecar',
      name: 'Zaječar',
      country: 'Serbia',
      flag: '🇷🇸',
      verified: false,
      last_updated: 'May 2026',
      overview: 'Zaječar has 3 street parking zones managed by JKP Parkiranje, projektovanje i nadzor. Zone I (red) is the most central and most expensive, Zones II and III progressively cheaper. All-day cards available at significant savings. Prices updated April 2026.',
      fine: 'Contact zajecarparking.co.rs for current fine amounts',
      official_url: 'https://zajecarparking.co.rs',
      sms_instructions: 'Send your license plate (no spaces, e.g. ZA123AA — include Serbian characters exactly as on plate) to the zone shortcode. Zone I Red → 9191 (1h) or 9194 (all-day 250 RSD), Zone II Yellow → 9192 (1h) or 9193 (all-day 120 RSD).',
    },
    zones: [
      { name: 'Zone I — Red', color: '#DC2626', rules: 'City centre. Mon–Fri 7:00–21:00, Sat 7:00–15:00. Free Sundays.', price: '50 RSD/h or 250 RSD/day', sort_order: 1 },
      { name: 'Zone II — Yellow', color: '#CA8A04', rules: 'Inner city. Mon–Fri 7:00–21:00, Sat 7:00–15:00. Free Sundays.', price: '40 RSD/h or 120 RSD/day', sort_order: 2 },
      { name: 'Zone III', color: '#16A34A', rules: 'Outer area. Mon–Fri 7:00–21:00, Sat 7:00–15:00. Free Sundays.', price: '25 RSD/h or 80 RSD/day', sort_order: 3 },
    ],
    payment_methods: [
      { label: '💬 SMS shortcode', sort_order: 1 },
      { label: '🎟 Paper parking cards (from controllers)', sort_order: 2 },
      { label: '📋 Monthly subscription cards', sort_order: 3 },
    ],
    tips: [
      { icon: '💡', text: 'All-day cards are excellent value: Zone I 250 RSD (SMS 9194), Zone II 120 RSD (SMS 9193), Zone III 80 RSD/day.', sort_order: 1 },
      { icon: '🕒', text: 'Saturday enforcement runs until 15:00 — 1 hour later than most Serbian cities.', sort_order: 2 },
      { icon: '🅿️', text: 'Garages at Aman and Maxi supermarkets available as alternatives to street parking.', sort_order: 3 },
      { icon: '📈', text: 'Prices were updated April 2026. Always confirm current rates with official signage.', sort_order: 4 },
    ],
    tags: [{ label: 'Red zone' }, { label: 'Yellow zone' }, { label: 'SMS pay' }, { label: 'Free Sundays' }],
  },

]

// ── SEED ──────────────────────────────────────────────────────────────────────

async function seedCity({ city, zones, payment_methods, tips, tags }) {
  const id = city.id
  process.stdout.write(`Seeding ${city.name}... `)

  const { error: cityErr } = await supabase.from('cities').upsert(city, { onConflict: 'id' })
  if (cityErr) throw new Error(`${city.name} city: ${cityErr.message}`)

  for (const table of ['zones', 'payment_methods', 'tips', 'tags']) {
    const { error } = await supabase.from(table).delete().eq('city_id', id)
    if (error) throw new Error(`${city.name} clear ${table}: ${error.message}`)
  }

  const inserts = [
    ['zones', zones],
    ['payment_methods', payment_methods],
    ['tips', tips],
    ['tags', tags],
  ]
  for (const [table, rows] of inserts) {
    const { error } = await supabase.from(table).insert(rows.map(r => ({ ...r, city_id: id })))
    if (error) throw new Error(`${city.name} ${table}: ${error.message}`)
  }

  console.log(`✓ (${zones.length} zones, ${tips.length} tips)`)
}

async function main() {
  console.log(`Seeding ${CITIES.length} cities...\n`)
  for (const c of CITIES) await seedCity(c)
  console.log('\nAll done. Mark as verified=true after cross-checking with official sources.')
}

main().catch(err => { console.error('\nFailed:', err.message); process.exit(1) })

import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeStreet, zones, streetZones } from './novisad-zones.mjs'

// Load .env manually
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const [k, ...v] = l.split('=')
      return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')]
    })
)

const serviceKey = env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_KEY in .env — add the service_role key from Supabase dashboard → Settings → API')
  process.exit(1)
}
const supabase = createClient(env.SUPABASE_URL, serviceKey)

// ── CITY DATA ─────────────────────────────────────────────────────────────────
// normalizeStreet, zones, and streetZones now live in ./novisad-zones.mjs

const CITY_ID = 'novi-sad'

const city = {
  id: CITY_ID,
  name: 'Novi Sad',
  country: 'Serbia',
  flag: '🇷🇸',
  verified: true,
  verified_by: null,
  last_updated: 'May 2026',
  overview: 'Novi Sad uses a 4-zone street parking system managed by JKP Parking Servis. Zones are color-coded (Extra, Red, Blue, White) with different prices and time limits. Payment via the nSpark app, SMS, or electronic parking card (ePK). Charging applies Mon–Fri 07:00–21:00 and Sat 07:00–14:00 — Sundays are free.',
  fine: '6,000–9,000 RSD (towing)',
  official_url: 'https://parkingns.rs',
  sms_instructions: 'Send your license plate in CAPITAL LETTERS (no spaces) to the zone shortcode. Extra zone → 8210, Red zone → 8211, Blue zone → 8212, White zone → 8218. Example: send "NS123AB" to 8211 for Red zone. Daily ticket (where offered) → 8215. Use correct Serbian characters (Č, Š, Ž, etc.) if they appear on your plate.',
}

const paymentMethods = [
  { label: '📱 nSpark app (iOS, Android, Huawei)', sort_order: 1 },
  { label: '💬 SMS shortcode', sort_order: 2 },
  { label: '💳 Electronic Parking Card (ePK)', sort_order: 3 },
  { label: '🎟 Daily ticket — 95 RSD to 8215 (all White-zone lots; marked Blue lots only)', sort_order: 4 },
]

const tips = [
  { icon: '⚠️', text: 'Extra zone strict 60-min limit — you cannot re-enter or re-pay for 60 min after expiry. Plan accordingly.', sort_order: 1 },
  { icon: '⏱', text: 'Red zone limit is 120 min. After that you must vacate the zone for at least 30 min.', sort_order: 2 },
  { icon: '📱', text: 'The nSpark app lets you extend parking remotely — useful for Red and Blue zones when you lose track of time.', sort_order: 3 },
  { icon: '🔤', text: 'SMS payments: use correct Serbian characters (Č, Š, Ž, Đ, Ć). Wrong characters can block other users from paying for the same spot.', sort_order: 4 },
  { icon: '🕐', text: 'Parking is free every evening after 21:00, all day Sunday, and on Saturday afternoons after 14:00.', sort_order: 5 },
  { icon: '🎟', text: 'Staying a while? In the White zone (and certain marked Blue-zone lots) a 95 RSD daily ticket to 8215 beats hourly rates. Look for the extra sign.', sort_order: 6 },
  { icon: '🚗', text: 'Towing ("pauk") is active. Removal fee is 6,000–9,000 RSD depending on vehicle weight, plus storage fees per day.', sort_order: 7 },
]

const tags = [
  { label: 'Extra zone' },
  { label: 'Red zone' },
  { label: 'Blue zone' },
  { label: 'White zone' },
  { label: 'SMS pay' },
  { label: 'App pay' },
  { label: 'Free evenings' },
]


// ── SEED ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding Novi Sad...')

  // Upsert city
  const { error: cityErr } = await supabase
    .from('cities')
    .upsert(city, { onConflict: 'id' })
  if (cityErr) throw new Error(`City upsert failed: ${cityErr.message}`)
  console.log('✓ City upserted')

  // Clear existing related records
  for (const table of ['zones', 'payment_methods', 'tips', 'tags', 'street_zones']) {
    const { error } = await supabase.from(table).delete().eq('city_id', CITY_ID)
    if (error) throw new Error(`Clear ${table} failed: ${error.message}`)
  }
  console.log('✓ Old related records cleared')

  // Insert zones
  const { error: zonesErr } = await supabase
    .from('zones')
    .insert(zones.map(z => ({ ...z, city_id: CITY_ID })))
  if (zonesErr) throw new Error(`Zones insert failed: ${zonesErr.message}`)
  console.log(`✓ ${zones.length} zones inserted`)

  // Insert payment methods
  const { error: pmErr } = await supabase
    .from('payment_methods')
    .insert(paymentMethods.map(p => ({ ...p, city_id: CITY_ID })))
  if (pmErr) throw new Error(`Payment methods insert failed: ${pmErr.message}`)
  console.log(`✓ ${paymentMethods.length} payment methods inserted`)

  // Insert tips
  const { error: tipsErr } = await supabase
    .from('tips')
    .insert(tips.map(t => ({ ...t, city_id: CITY_ID })))
  if (tipsErr) throw new Error(`Tips insert failed: ${tipsErr.message}`)
  console.log(`✓ ${tips.length} tips inserted`)

  // Insert tags
  const { error: tagsErr } = await supabase
    .from('tags')
    .insert(tags.map(t => ({ ...t, city_id: CITY_ID })))
  if (tagsErr) throw new Error(`Tags insert failed: ${tagsErr.message}`)
  console.log(`✓ ${tags.length} tags inserted`)

  // Insert street → zone mappings
  const streetRows = streetZones.map(({ street, zone }) => ({
    city_id: CITY_ID,
    street_name: street,
    street_normalized: normalizeStreet(street),
    zone_name: zone,
  }))
  const { error: streetErr } = await supabase
    .from('street_zones')
    .insert(streetRows)
  if (streetErr) throw new Error(`Street zones insert failed: ${streetErr.message}`)
  console.log(`✓ ${streetRows.length} street zones inserted`)

  console.log('\nDone!')
}

seed().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})

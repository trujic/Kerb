import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

const CITY_ID = 'novi-sad'

const city = {
  id: CITY_ID,
  name: 'Novi Sad',
  country: 'Serbia',
  flag: '🇷🇸',
  verified: true,
  verified_by: null,
  last_updated: 'May 2026',
  overview: 'Novi Sad uses a 4-zone street parking system managed by JKP Parking Servis. Zones are color-coded (Extra, Red, Blue, White) with different prices and time limits. Payment via the nSpark app, SMS, or electronic parking card (ePK). Charging is enforced Mon–Sat 8:00–21:00 and Sun 7:30–13:30.',
  fine: '6,000–9,000 RSD (towing)',
  official_url: 'https://parkingns.rs',
  sms_instructions: 'Send your license plate in CAPITAL LETTERS (no spaces) to the zone shortcode. Extra zone → 8210, Red zone → 8211, Blue zone → 8212, White zone → 8218. Example: send "NS123AB" to 8211 for Red zone. Use correct Serbian characters (Č, Š, Ž, etc.) if they appear on your plate.',
}

const zones = [
  {
    name: 'Extra Zone',
    color: '#F97316',
    rules: 'Max 60 min. After expiry you must leave the zone — cannot re-pay for the next 60 min. Mon–Sat 8:00–21:00, Sun 7:30–13:30.',
    price: '80 RSD/h',
    sort_order: 1,
  },
  {
    name: 'Red Zone',
    color: '#EF4444',
    rules: 'Max 120 min. After expiry you must leave the zone for at least 30 min before paying again. Mon–Sat 8:00–21:00, Sun 7:30–13:30.',
    price: '60 RSD/h',
    sort_order: 2,
  },
  {
    name: 'Blue Zone',
    color: '#3B82F6',
    rules: 'No time limit. Daily card available for 95 RSD. Weekdays 7:00–21:00, Saturday 7:00–14:00.',
    price: '50 RSD/h',
    sort_order: 3,
  },
  {
    name: 'White Zone',
    color: '#9CA3AF',
    rules: 'No time limit. Daily card available for 95 RSD. Weekdays 7:00–21:00, Saturday 7:00–14:00.',
    price: '30 RSD/h',
    sort_order: 4,
  },
]

const paymentMethods = [
  { label: '📱 nSpark app (iOS, Android, Huawei)', sort_order: 1 },
  { label: '💬 SMS shortcode', sort_order: 2 },
  { label: '💳 Electronic Parking Card (ePK)', sort_order: 3 },
  { label: '🎟 Daily card — 95 RSD (Blue & White zones)', sort_order: 4 },
]

const tips = [
  { icon: '⚠️', text: 'Extra zone strict 60-min limit — you cannot re-enter or re-pay for 60 min after expiry. Plan accordingly.', sort_order: 1 },
  { icon: '⏱', text: 'Red zone limit is 120 min. After that you must vacate the zone for at least 30 min.', sort_order: 2 },
  { icon: '📱', text: 'The nSpark app lets you extend parking remotely — useful for Red and Blue zones when you lose track of time.', sort_order: 3 },
  { icon: '🔤', text: 'SMS payments: use correct Serbian characters (Č, Š, Ž, Đ, Ć). Wrong characters can block other users from paying for the same spot.', sort_order: 4 },
  { icon: '🕐', text: 'Sunday hours are shorter: 7:30–13:30 only. Parking is free outside these hours.', sort_order: 5 },
  { icon: '🚗', text: 'Towing ("pauk") is active. Removal fee is 6,000–9,000 RSD depending on vehicle weight, plus storage fees per day.', sort_order: 6 },
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
  for (const table of ['zones', 'payment_methods', 'tips', 'tags']) {
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

  console.log('\nDone! Review at https://parkingns.rs and set verified=true when confirmed.')
}

seed().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})

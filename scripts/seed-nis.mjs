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
const serviceKey = env.SUPABASE_SERVICE_KEY
if (!serviceKey) { console.error('Missing SUPABASE_SERVICE_KEY in .env'); process.exit(1) }
const supabase = createClient(env.SUPABASE_URL, serviceKey)

const CITY_ID = 'nis'

// Sources: nisparking.rs (ценовник + SMS page) + official My Maps zone polygons.
// PLACEHOLDER-UNTIL-VERIFIED: confirm against nisparking.rs before flipping verified.
const city = {
  id: CITY_ID,
  name: 'Niš',
  country: 'Serbia',
  flag: '🇷🇸',
  verified: false,
  verified_by: null,
  last_updated: 'June 2026',
  overview: 'Niš uses a 3-zone street parking system (Extra, Red, Green) run by JKP Parking Servis Niš. Charging applies Mon–Fri 07:00–21:00 and Sat 07:00–14:00 — Sundays are free. Pay by the Parking Servis app, SMS, or a daily ticket. A daily ticket (valid ~24h) is 1,100 RSD across all zones.',
  fine: '1,100 RSD daily ticket if unpaid + towing ("pauk")',
  official_url: 'https://www.nisparking.rs',
  sms_instructions: 'Send your licence plate (CAPITALS, no spaces) to the zone shortcode. Extra → 9180, Red → 9181, Green → 9182. Daily ticket: Red → 9184, Green → 9185. Keep the confirmation SMS — it is your receipt.',
}

// Zone names MATCH public/zones/nis.json so Ask-AI picks and sign scans resolve.
const zones = [
  {
    name: 'Extra Zone', color: '#E6A700', sms_shortcode: '9180', sort_order: 1,
    price: '100 RSD/h',
    rules: 'Max 60 min. Strictest zone (centre). Mon–Fri 07:00–21:00, Sat 07:00–14:00, Sun free.',
  },
  {
    name: 'Red Zone', color: '#E25141', sms_shortcode: '9181', sort_order: 2,
    price: '70 RSD/h',
    rules: 'Max 120 min. 70 RSD for the first hour (more thereafter). Daily ticket 1,100 RSD → 9184. Mon–Fri 07:00–21:00, Sat 07:00–14:00, Sun free.',
  },
  {
    name: 'Green Zone', color: '#2FB36B', sms_shortcode: '9182', sort_order: 3,
    price: '55 RSD/h',
    rules: 'Max 180 min. Daily ticket 1,100 RSD → 9185. Mon–Fri 07:00–21:00, Sat 07:00–14:00, Sun free.',
  },
]

const paymentMethods = [
  { label: '📱 Parking Servis Niš app', sort_order: 1 },
  { label: '💬 SMS shortcode (per zone)', sort_order: 2 },
  { label: '🎟 Daily ticket — 1,100 RSD (≈24h)', sort_order: 3 },
]

const tips = [
  { icon: '⏱', text: 'Extra zone is a strict 60-minute zone in the very centre. Red is 120 min, Green 180 min.', sort_order: 1 },
  { icon: '🎟', text: 'Staying a while? A 1,100 RSD daily ticket (Red → 9184, Green → 9185) beats hourly once you pass a few hours.', sort_order: 2 },
  { icon: '🚗', text: 'Niš runs a tow truck ("зелени паук"/green pauk). If you do not pay, a daily ticket is charged automatically.', sort_order: 3 },
  { icon: '🗓', text: 'Charging is Mon–Fri 07:00–21:00 and Sat 07:00–14:00. Sundays are free.', sort_order: 4 },
  { icon: '🔤', text: 'For SMS, send your plate in capitals with correct Serbian characters (Č, Š, Ž, Đ, Ć) — wrong characters can block the payment.', sort_order: 5 },
]

const tags = [
  { label: 'Extra zone' },
  { label: 'Red zone' },
  { label: 'Green zone' },
  { label: 'SMS pay' },
  { label: 'App pay' },
]

async function seed() {
  console.log('Seeding Niš...')
  const { error: cityErr } = await supabase.from('cities').upsert(city, { onConflict: 'id' })
  if (cityErr) throw new Error(`City upsert failed: ${cityErr.message}`)
  console.log('✓ City upserted')

  for (const table of ['zones', 'payment_methods', 'tips', 'tags']) {
    const { error } = await supabase.from(table).delete().eq('city_id', CITY_ID)
    if (error) throw new Error(`Clear ${table} failed: ${error.message}`)
  }
  console.log('✓ Old related records cleared')

  for (const [table, rows] of [['zones', zones], ['payment_methods', paymentMethods], ['tips', tips], ['tags', tags]]) {
    const { error } = await supabase.from(table).insert(rows.map(r => ({ ...r, city_id: CITY_ID })))
    if (error) throw new Error(`${table} insert failed: ${error.message}`)
    console.log(`✓ ${rows.length} ${table} inserted`)
  }
  console.log('\nDone! Verify against https://www.nisparking.rs and set verified=true when confirmed.')
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1) })

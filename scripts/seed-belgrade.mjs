import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
  console.error('Missing SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}
const supabase = createClient(env.SUPABASE_URL, serviceKey)

// ── CITY ─────────────────────────────────────────────────────────────────────

const CITY_ID = 'belgrade'

const city = {
  id: CITY_ID,
  name: 'Belgrade',
  country: 'Serbia',
  flag: '🇷🇸',
  verified: false,
  verified_by: null,
  last_updated: 'May 2026',
  overview: 'Belgrade has one of the most complex street parking systems in Serbia — 6 color-coded zones managed by JKP Parking Servis. The tightest zones are in the city center (30-min purple, 60-min red), with progressively more relaxed rules further out. If you do not pay, an electronic Daily Parking Ticket (eDPT) of 3,000 RSD is issued automatically. Vehicle clamping is also active alongside towing.',
  fine: '3,000 RSD eDPT + 8,830 RSD towing',
  official_url: 'https://www.parking-servis.co.rs',
  sms_instructions: 'Send your license plate to the shortcode for your zone. Zone A Purple → 9114 (30 min), Zone 1 Red → 9111 (1h), Zone B White → 9116 (1h), Zone 2 Yellow → 9112 (1h), Zone 3 Green → 9113 (1h), Blue zone → 9119 (1h) or 9118 (daily). You will receive a confirmation SMS with ticket details. Save it.',
}

// ── ZONES ─────────────────────────────────────────────────────────────────────

const zones = [
  {
    name: 'Zone A — Purple',
    color: '#7C3AED',
    rules: 'Max 30 min. Strictest zone — city centre. After expiry you cannot park in the same zone for 30 min. Mon–Sat 7:00–22:00, Sun 7:00–14:00.',
    price: '120 RSD / 30 min',
    sort_order: 1,
  },
  {
    name: 'Zone 1 — Red',
    color: '#DC2626',
    rules: 'Max 60 min + 30 min extension available. After full time expires, cannot re-park in same zone for 30 min. Mon–Sat 7:00–22:00, Sun 7:00–14:00.',
    price: '80 RSD/h',
    sort_order: 2,
  },
  {
    name: 'Zone B — White',
    color: '#6B7280',
    rules: 'Max 120 min + 60 min extension available. After full time expires, cannot re-park in same zone for 30 min. Mon–Sat 7:00–22:00, Sun 7:00–14:00.',
    price: '65 RSD/h',
    sort_order: 3,
  },
  {
    name: 'Zone 2 — Yellow',
    color: '#D97706',
    rules: 'Max 120 min + 60 min extension available. After full time expires, cannot re-park in same zone for 30 min. Mon–Fri 7:00–21:00, Sat 7:00–14:00.',
    price: '65 RSD/h',
    sort_order: 4,
  },
  {
    name: 'Zone 3 — Green',
    color: '#16A34A',
    rules: 'Max 180 min + 60 min extension available. After full time expires, cannot re-park in same zone for 30 min. Mon–Fri 7:00–21:00, Sat 7:00–14:00.',
    price: '55 RSD/h',
    sort_order: 5,
  },
  {
    name: 'Blue Zone — Unlimited',
    color: '#2563EB',
    rules: 'No time limit. Pay for as long as you need. Mon–Fri 8:00–21:00, Sat 8:00–14:00. Free outside these hours.',
    price: 'Pay per hour via app/SMS',
    sort_order: 6,
  },
]

// ── PAYMENT METHODS ───────────────────────────────────────────────────────────

const paymentMethods = [
  { label: '📱 Parking Servis app (iOS & Android)', sort_order: 1 },
  { label: '💬 SMS shortcode (per zone)', sort_order: 2 },
  { label: '🎟 e-Parking ticket (at shops or from controllers)', sort_order: 3 },
]

// ── TIPS ──────────────────────────────────────────────────────────────────────

const tips = [
  { icon: '⚠️', text: 'If you do not pay, a 3,000 RSD electronic Daily Parking Ticket (eDPT) is issued automatically — you cannot avoid it. Pay upfront.', sort_order: 1 },
  { icon: '🚗', text: 'Both towing ("pauk") and vehicle clamping ("blokada") are active in Belgrade. Towing costs 8,830 RSD for a standard car, clamping 8,000 RSD.', sort_order: 2 },
  { icon: '🌍', text: 'Foreign license plates are a priority target. If you have a foreign plate and one unpaid eDPT on record, the order for clamping is issued immediately.', sort_order: 3 },
  { icon: '⏱', text: 'After parking time expires in any zone, you cannot re-park in the same zone for 30 minutes — even if you move to a different spot on the same street.', sort_order: 4 },
  { icon: '📱', text: 'The Parking Servis app uses GPS to auto-detect your zone and suggests which SMS shortcode or payment method to use. Most reliable way to pay.', sort_order: 5 },
  { icon: '🟣', text: 'Zone A (purple) is the tightest — 30 minutes max, in and around the very centre. Do not overstay even by a few minutes.', sort_order: 6 },
  { icon: '🕙', text: 'Purple, Red, and White zones are enforced until 22:00 Mon–Sat — much later than most Serbian cities. Sunday enforcement ends at 14:00.', sort_order: 7 },
  { icon: '🏥', text: 'Green zone spots around the Clinical Centre of Serbia are free after 17:00 Mon–Fri (Pasterova, Dr Subotića, Deligradska streets).', sort_order: 8 },
]

// ── TAGS ─────────────────────────────────────────────────────────────────────

const tags = [
  { label: 'Purple zone' },
  { label: 'Red zone' },
  { label: 'Yellow zone' },
  { label: 'Green zone' },
  { label: 'Blue zone' },
  { label: 'SMS pay' },
  { label: 'App pay' },
  { label: 'Vehicle clamping' },
]

// ── SEED ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding Belgrade...')

  const { error: cityErr } = await supabase
    .from('cities')
    .upsert(city, { onConflict: 'id' })
  if (cityErr) throw new Error(`City upsert failed: ${cityErr.message}`)
  console.log('✓ City upserted')

  for (const table of ['zones', 'payment_methods', 'tips', 'tags']) {
    const { error } = await supabase.from(table).delete().eq('city_id', CITY_ID)
    if (error) throw new Error(`Clear ${table} failed: ${error.message}`)
  }
  console.log('✓ Old related records cleared')

  const { error: zonesErr } = await supabase
    .from('zones')
    .insert(zones.map(z => ({ ...z, city_id: CITY_ID })))
  if (zonesErr) throw new Error(`Zones insert failed: ${zonesErr.message}`)
  console.log(`✓ ${zones.length} zones inserted`)

  const { error: pmErr } = await supabase
    .from('payment_methods')
    .insert(paymentMethods.map(p => ({ ...p, city_id: CITY_ID })))
  if (pmErr) throw new Error(`Payment methods insert failed: ${pmErr.message}`)
  console.log(`✓ ${paymentMethods.length} payment methods inserted`)

  const { error: tipsErr } = await supabase
    .from('tips')
    .insert(tips.map(t => ({ ...t, city_id: CITY_ID })))
  if (tipsErr) throw new Error(`Tips insert failed: ${tipsErr.message}`)
  console.log(`✓ ${tips.length} tips inserted`)

  const { error: tagsErr } = await supabase
    .from('tags')
    .insert(tags.map(t => ({ ...t, city_id: CITY_ID })))
  if (tagsErr) throw new Error(`Tags insert failed: ${tagsErr.message}`)
  console.log(`✓ ${tags.length} tags inserted`)

  console.log('\nDone! Review at https://www.parking-servis.co.rs and set verified=true when confirmed.')
}

seed().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})

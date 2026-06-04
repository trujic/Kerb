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

// ── NORMALIZATION ─────────────────────────────────────────────────────────────
// Produces a consistent lookup key: lowercase Latin, no diacritics, no section numbers.
// Used to match Nominatim reverse-geocode output against stored street names.

function normalizeStreet(name) {
  const cyr = {
    'А':'a','Б':'b','В':'v','Г':'g','Д':'d','Ђ':'dj','Е':'e','Ж':'z',
    'З':'z','И':'i','Ј':'j','К':'k','Л':'l','Љ':'lj','М':'m','Н':'n',
    'Њ':'nj','О':'o','П':'p','Р':'r','С':'s','Т':'t','Ћ':'c','У':'u',
    'Ф':'f','Х':'h','Ц':'c','Ч':'c','Џ':'dz','Ш':'s',
    'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z',
    'з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n',
    'њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u',
    'ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s',
  }
  const latin = name.split('').map(c => cyr[c] ?? c).join('')
  return latin
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    // Strip trailing Roman numeral section numbers (e.g. "Bulevar oslobođenja III" → "bulevar oslobodjenja")
    .replace(/\s+(i{1,3}|iv|vi{0,3}|ix|xl|l|xc|c{1,3})$/i, '')
    .trim()
}

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
    sms_shortcode: '8210',
  },
  {
    name: 'Red Zone',
    color: '#EF4444',
    rules: 'Max 120 min. After expiry you must leave the zone for at least 30 min before paying again. Mon–Sat 8:00–21:00, Sun 7:30–13:30.',
    price: '60 RSD/h',
    sort_order: 2,
    sms_shortcode: '8211',
  },
  {
    name: 'Blue Zone',
    color: '#3B82F6',
    rules: 'No time limit. Daily card available for 95 RSD. Weekdays 7:00–21:00, Saturday 7:00–14:00.',
    price: '50 RSD/h',
    sort_order: 3,
    sms_shortcode: '8212',
  },
  {
    name: 'White Zone',
    color: '#9CA3AF',
    rules: 'No time limit. Daily card available for 95 RSD. Weekdays 7:00–21:00, Saturday 7:00–14:00.',
    price: '30 RSD/h',
    sort_order: 4,
    sms_shortcode: '8218',
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

// ── STREET → ZONE MAPPING ─────────────────────────────────────────────────────
// Source: https://parkingns.rs/parkiralista/
// Street names stored in Serbian Latin. The normalized form is used for GPS lookup.

const streetZones = [
  // Extra Zone (8210) — city centre core, 60-min limit
  { street: 'Bulevar Mihajla Pupina', zone: 'Extra Zone' },
  { street: 'Ignjata Pavlasa', zone: 'Extra Zone' },
  { street: 'Ilije Ognjanovića', zone: 'Extra Zone' },
  { street: 'Narodnih heroja', zone: 'Extra Zone' },
  { street: 'Trg Republike', zone: 'Extra Zone' },

  // Red Zone (8211) — city centre, 120-min limit
  { street: 'Bulevar kralja Petra Prvog', zone: 'Red Zone' },
  { street: 'Bulevar oslobođenja', zone: 'Red Zone' },
  { street: 'Vojvode Putnika', zone: 'Red Zone' },
  { street: 'Grčkoškolska', zone: 'Red Zone' },
  { street: 'Daničićeva', zone: 'Red Zone' },
  { street: 'Dr Laze Stanojević', zone: 'Red Zone' },
  { street: 'Dunavska', zone: 'Red Zone' },
  { street: 'Đure Jakšića', zone: 'Red Zone' },
  { street: 'Železnička', zone: 'Red Zone' },
  { street: 'Žitni trg', zone: 'Red Zone' },
  { street: 'Ive Lole Ribara', zone: 'Red Zone' },
  { street: 'Jevrejska', zone: 'Red Zone' },
  { street: 'Maksima Gorkog', zone: 'Red Zone' },
  { street: 'Natošević', zone: 'Red Zone' },
  { street: 'Nikolajevska', zone: 'Red Zone' },
  { street: 'Nikole Pašića', zone: 'Red Zone' },
  { street: 'Njegoševa', zone: 'Red Zone' },
  { street: 'Pionirska', zone: 'Red Zone' },
  { street: 'Svetozara Miletića', zone: 'Red Zone' },
  { street: 'Sutjeska', zone: 'Red Zone' },
  { street: 'Trg galerija', zone: 'Red Zone' },
  { street: 'Trg Marije Trandafil', zone: 'Red Zone' },
  { street: 'Trg mladenaca', zone: 'Red Zone' },
  { street: 'Trifkovićev trg', zone: 'Red Zone' },
  { street: 'Hilandarska', zone: 'Red Zone' },

  // Blue Zone (8212) — wider city area, no time limit
  { street: 'Alberta Toma', zone: 'Blue Zone' },
  { street: 'Aleksandra Tišme', zone: 'Blue Zone' },
  { street: 'Alekse Šantića', zone: 'Blue Zone' },
  { street: 'Almaška', zone: 'Blue Zone' },
  { street: 'Antona Čehova', zone: 'Blue Zone' },
  { street: 'Arse Teodorovića', zone: 'Blue Zone' },
  { street: 'Arhimandrita Rajića', zone: 'Blue Zone' },
  { street: 'Augusta Cesarca', zone: 'Blue Zone' },
  { street: 'Baranjska', zone: 'Blue Zone' },
  { street: 'Bačka', zone: 'Blue Zone' },
  { street: 'Beogradski kej', zone: 'Blue Zone' },
  { street: 'Berislava Berića', zone: 'Blue Zone' },
  { street: 'Bogdana Garabantina', zone: 'Blue Zone' },
  { street: 'Bore Prodanovića', zone: 'Blue Zone' },
  { street: 'Branimira Ćosića', zone: 'Blue Zone' },
  { street: 'Branislava Nušića', zone: 'Blue Zone' },
  { street: 'Braće Jovandić', zone: 'Blue Zone' },
  { street: 'Braće Ribnikar', zone: 'Blue Zone' },
  { street: 'Bulevar Jaše Tomića', zone: 'Blue Zone' },
  { street: 'Bulevar cara Lazara', zone: 'Blue Zone' },
  { street: 'Valentina Vodnika', zone: 'Blue Zone' },
  { street: 'Vase Pelagića', zone: 'Blue Zone' },
  { street: 'Vase Stajića', zone: 'Blue Zone' },
  { street: 'Vere Pavlović', zone: 'Blue Zone' },
  { street: 'Vladike Platona', zone: 'Blue Zone' },
  { street: 'Vladimira Nikolića', zone: 'Blue Zone' },
  { street: 'Vojvode Bojovića', zone: 'Blue Zone' },
  { street: 'Vojvode Mišića', zone: 'Blue Zone' },
  { street: 'Vojvode Šupljikca', zone: 'Blue Zone' },
  { street: 'Vojvođanska', zone: 'Blue Zone' },
  { street: 'Vojvođanskih brigada', zone: 'Blue Zone' },
  { street: 'Vuka Karadžića', zone: 'Blue Zone' },
  { street: 'Gagarinova', zone: 'Blue Zone' },
  { street: 'Gajeva', zone: 'Blue Zone' },
  { street: 'Gogoljeva', zone: 'Blue Zone' },
  { street: 'Gundulićeva', zone: 'Blue Zone' },
  { street: 'Danila Kiša', zone: 'Blue Zone' },
  { street: 'Devet Jugović', zone: 'Blue Zone' },
  { street: 'Dimitrija Avramovića', zone: 'Blue Zone' },
  { street: 'Dimitrija Tucovića', zone: 'Blue Zone' },
  { street: 'Doža Đerđa', zone: 'Blue Zone' },
  { street: 'Dostojevskog', zone: 'Blue Zone' },
  { street: 'Dr Đorđa Jovanovića', zone: 'Blue Zone' },
  { street: 'Dušana Vasiljeva', zone: 'Blue Zone' },
  { street: 'Đorđa Markovića Kodera', zone: 'Blue Zone' },
  { street: 'Đorđa Rajkovića', zone: 'Blue Zone' },
  { street: 'Episkopa Visariona', zone: 'Blue Zone' },
  { street: 'Žarka Vasiljevića', zone: 'Blue Zone' },
  { street: 'Žarka Zrenjanina', zone: 'Blue Zone' },
  { street: 'Žike Popovića', zone: 'Blue Zone' },
  { street: 'Zaharija Orfelina', zone: 'Blue Zone' },
  { street: 'Zemljane ćuprije', zone: 'Blue Zone' },
  { street: 'Zmaj Ognjeva Vuka', zone: 'Blue Zone' },
  { street: 'Zorana Petrovića', zone: 'Blue Zone' },
  { street: 'Ilije Vučetića', zone: 'Blue Zone' },
  { street: 'Jaše Ignjatovića', zone: 'Blue Zone' },
  { street: 'Jovana Boškovića', zone: 'Blue Zone' },
  { street: 'Jovana Đorđevića', zone: 'Blue Zone' },
  { street: 'Jovana Hranilovića', zone: 'Blue Zone' },
  { street: 'Kej žrtava racije', zone: 'Blue Zone' },
  { street: 'Kisačka', zone: 'Blue Zone' },
  { street: 'Kozačinskog', zone: 'Blue Zone' },
  { street: 'Kosančić Ivana', zone: 'Blue Zone' },
  { street: 'Kosovska', zone: 'Blue Zone' },
  { street: 'Koste Hadži Mlađeg', zone: 'Blue Zone' },
  { street: 'Koče Kolarova', zone: 'Blue Zone' },
  { street: 'Kraljevića Marka', zone: 'Blue Zone' },
  { street: 'Laze Kostića', zone: 'Blue Zone' },
  { street: 'Lasla Gala', zone: 'Blue Zone' },
  { street: 'Lilike Bem', zone: 'Blue Zone' },
  { street: 'Lovćenska', zone: 'Blue Zone' },
  { street: 'Lončarska', zone: 'Blue Zone' },
  { street: 'Lukijana Mušickog', zone: 'Blue Zone' },
  { street: 'Majevička', zone: 'Blue Zone' },
  { street: 'Marka Maljanova', zone: 'Blue Zone' },
  { street: 'Marka Nešića', zone: 'Blue Zone' },
  { street: 'Masarikova', zone: 'Blue Zone' },
  { street: 'Matice srpske', zone: 'Blue Zone' },
  { street: 'Milana Rakića', zone: 'Blue Zone' },
  { street: 'Milete Jakšića', zone: 'Blue Zone' },
  { street: 'Mileševska', zone: 'Blue Zone' },
  { street: 'Milovana Glišića', zone: 'Blue Zone' },
  { street: 'Miloša Bajića', zone: 'Blue Zone' },
  { street: 'Miroslava Antića', zone: 'Blue Zone' },
  { street: 'Mičurinova', zone: 'Blue Zone' },
  { street: 'Miše Dimitrijevića', zone: 'Blue Zone' },
  { street: 'Nikole Tesle', zone: 'Blue Zone' },
  { street: 'Novosadskog sajma', zone: 'Blue Zone' },
  { street: 'Ognjene Price', zone: 'Blue Zone' },
  { street: 'Omladinskog pokreta', zone: 'Blue Zone' },
  { street: 'Pavla Papa', zone: 'Blue Zone' },
  { street: 'Pavla Simića', zone: 'Blue Zone' },
  { street: 'Pavla Stamatovića', zone: 'Blue Zone' },
  { street: 'Paje Markovića Adamova', zone: 'Blue Zone' },
  { street: 'Pariške komune', zone: 'Blue Zone' },
  { street: 'Pasterova', zone: 'Blue Zone' },
  { street: 'Petra Drapšina', zone: 'Blue Zone' },
  { street: 'Petra Kočića', zone: 'Blue Zone' },
  { street: 'Pećka', zone: 'Blue Zone' },
  { street: 'Podunskog odreda', zone: 'Blue Zone' },
  { street: 'Puškinova', zone: 'Blue Zone' },
  { street: 'Radnička', zone: 'Blue Zone' },
  { street: 'Rumenačka', zone: 'Blue Zone' },
  { street: 'Save Vuković', zone: 'Blue Zone' },
  { street: 'Save Kovačevića', zone: 'Blue Zone' },
  { street: 'Save Ljubojeva', zone: 'Blue Zone' },
  { street: 'Sestara Ninković', zone: 'Blue Zone' },
  { street: 'Slobodana Bajića', zone: 'Blue Zone' },
  { street: 'Slovačka', zone: 'Blue Zone' },
  { street: 'Sonje Marinković', zone: 'Blue Zone' },
  { street: 'Stevana Branovačkog', zone: 'Blue Zone' },
  { street: 'Stevana Milovanova', zone: 'Blue Zone' },
  { street: 'Stevana Mokranjca', zone: 'Blue Zone' },
  { street: 'Stevana Musića', zone: 'Blue Zone' },
  { street: 'Stevana Sremca', zone: 'Blue Zone' },
  { street: 'Sterijina', zone: 'Blue Zone' },
  { street: 'Stefana Stefanovića', zone: 'Blue Zone' },
  { street: 'Stjepana Mitra Ljubiše', zone: 'Blue Zone' },
  { street: 'Stražilovska', zone: 'Blue Zone' },
  { street: 'Takovska', zone: 'Blue Zone' },
  { street: 'Tekelijina', zone: 'Blue Zone' },
  { street: 'Temerinska', zone: 'Blue Zone' },
  { street: 'Tolstojeva', zone: 'Blue Zone' },
  { street: 'Toplice Milana', zone: 'Blue Zone' },
  { street: 'Trg 1. maja', zone: 'Blue Zone' },
  { street: 'Trg neznanog junaka', zone: 'Blue Zone' },
  { street: 'Trg Ferenca Fehéra', zone: 'Blue Zone' },
  { street: 'Trg carice Milice', zone: 'Blue Zone' },
  { street: 'Turgenjevа', zone: 'Blue Zone' },
  { street: 'Čirpanova', zone: 'Blue Zone' },
  { street: 'Uroša Predića', zone: 'Blue Zone' },
  { street: 'Feješa Tivadara', zone: 'Blue Zone' },
  { street: 'Franje Štefanovića', zone: 'Blue Zone' },
  { street: 'Fruškogorskog odreda', zone: 'Blue Zone' },
  { street: 'Šafarikova', zone: 'Blue Zone' },
  { street: 'Šumadijska', zone: 'Blue Zone' },

  // White Zone (8218) — outskirts / railway station
  { street: 'Železnička stanica', zone: 'White Zone' },
  { street: 'Hajduk Veljkova', zone: 'White Zone' },
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

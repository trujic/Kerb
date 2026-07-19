// Pay-path language layer — Serbian (latinica) first, English fallback.
// Deliberately tiny: a dictionary + {param} interpolation, no i18n framework.
// Scope is the curb-critical path (dashboard, pay card, sheets); marketing
// pages stay English until the copy settles.

export type Lang = 'sr' | 'en'

const LANG_KEY = 'kerb_lang'

const dict = {
  // Detected line
  detected: { sr: 'lokacija', en: 'detected' },
  fullGuide: { sr: 'Ceo vodič →', en: 'Full guide →' },

  // Free-now surface
  freeNow: { sr: 'Besplatno sada', en: 'Free now' },
  freeTitle: { sr: 'Ne moraš da platiš sada', en: 'No need to pay right now' },
  freeSub: { sr: 'Parkiranje je besplatno u {city}.', en: 'Parking is free in {city}.' },
  chargingResumes: { sr: 'Naplata ponovo počinje', en: 'Charging resumes' },
  prepayBtn: { sr: 'Plati unapred {start}–{end} →', en: 'Pre-pay {start}–{end} →' },
  tipLabel: { sr: 'Savet', en: 'Tip' },
  prepayWhy: {
    sr: 'Ujutru se parking najlakše zaboravi — naplata krene u {start} pre nego što se većina seti. Tada najčešće stižu kazne. Platiš li sad, pokriven si čim počne.',
    en: "Morning is when parking slips the mind — charging starts at {start} before most people think of it. That's when fines usually land. Pay now and you're covered the moment it starts.",
  },
  browseZones: { sr: 'Pregledaj zone', en: 'Browse zones' },
  today: { sr: 'danas', en: 'today' },
  tomorrow: { sr: 'sutra', en: 'tomorrow' },

  // Pay surface: zone card → covered-until → slide
  coveredUntil: { sr: 'Pokriveno do {time}', en: 'Covered until {time}' },
  managePlates: { sr: 'Upravljaj tablicama →', en: 'Manage plates →' },
  heroCheckSign: {
    sr: 'Proveri da se poklapa sa tablom pored auta — samo ona važi.',
    en: "Check it matches the sign next to your car — that's the one that counts.",
  },
  wrongZone: { sr: 'Pogrešna zona? Pogledaj sve zone', en: 'Wrong zone? See all zones' },
  askAiShort: { sr: 'Pitaj AI', en: 'Ask AI' },
  approxWarn: {
    sr: 'Granice zona u {city} su približne (nema zvanične mape) — ovde suzi izbor, a veruj tabli.',
    en: "{city}'s zone areas are approximate (no official map) — use this to narrow it down, then trust the sign.",
  },
  likelyYours: { sr: 'verovatno tvoja', en: 'likely yours' },
  noLimit: { sr: 'Bez limita', en: 'No limit' },
  boundaryCaution: {
    sr: 'GPS te stavlja blizu granice — plati ovu zonu samo ako na tabli piše',
    en: 'GPS puts you near a boundary — only pay this zone if the sign says',
  },
  noParkingTitle: { sr: 'Nema naplate tu gde stojiš', en: "No paid zone where you're standing" },
  noParkingSub: { sr: 'Parkiranje ovde je verovatno besplatno. Najbliža naplata je', en: 'Parking here is likely free. Nearest paid parking is' },
  awayOn: { sr: 'odavde —', en: 'away —' },
  scanContribute: { sr: 'Vidiš tablu? Skeniraj je', en: 'See a sign? Scan it' },

  // Pay card
  plateHint: { sr: 'Sačuvano na uređaju · ide u SMS', en: 'Saved on this device · prefilled into the SMS' },
  plateSync: { sr: 'Napravi nalog za sinhronizaciju.', en: 'Create an account to sync it.' },
  sendSms: { sr: 'Prevuci da pošalješ SMS → {code}', en: 'Slide to send SMS → {code}' },
  openingSms: { sr: 'Otvaram SMS…', en: 'Opening SMS…' },
  slideConfirms: { sr: 'Prevlačenjem potvrđuješ da si proverio tablu.', en: "Sliding confirms you've checked the sign." },
  payZone: { sr: 'Plati {zone}', en: 'Pay {zone}' },
  addPlate: { sr: 'Dodaj tablice za SMS jednim dodirom', en: 'Add a plate for one-tap SMS' },
  smsToOperator: { sr: 'Tvoj telefon šalje SMS operateru parkinga.', en: 'Your phone sends the SMS to the parking operator.' },
  ruleDetails: { sr: 'Detalji pravila', en: 'Rule details' },
  coveredNext: { sr: 'Pokriveno {day} {start}–{end}', en: 'Covered {day} {start}–{end}' },

  // SMS handoff sheet
  sentTitle: { sr: 'Da li je SMS poslat?', en: 'Did your SMS send?' },
  sentBody1: { sr: 'Telefon je trebalo da otvori poruku ka', en: 'Your phone should have opened a message to' },
  sentBody2: { sr: 'Odgovor operatera je tvoj zvanični račun — sačuvaj ga.', en: "The operator's reply SMS is your official receipt — keep it." },
  sentNo: { sr: 'Još nije', en: 'Not yet' },
  sentYes: { sr: 'Da, poslat je', en: 'Yes, sent it' },

  // Sign tools (below the pay wizard)
  findLabel: { sr: 'Proveri tačnu zonu', en: 'Pin the exact zone' },
  scanTitle: { sr: 'Skeniraj tablu', en: 'Scan the sign' },
  scanSub: { sr: 'Pročitaj zonu sa table, potvrdi na mapi, pa plati', en: 'Read the zone off the sign, confirm it on the map, then pay' },
  aiTitle: { sr: 'Prvi put ovde? Kako radi parkiranje', en: 'New here? How parking works' },
  aiSub: { sr: 'Kada se plaća, koje su zone i kako — jednostavnim rečima', en: 'When you pay, the zones, and how — in plain language' },
  nearestSign: { sr: 'Najbliža potvrđena tabla · {dist}', en: 'Nearest confirmed sign · {dist}' },
  confirmedAgo: { sr: 'potvrđena {time}', en: 'confirmed {time}' },
  leadMe: { sr: 'Vodi me →', en: 'Lead me →' },

  // Info panel
  guestPre: { sr: 'Plaćaš kao gost.', en: "You're paying as a guest." },
  guestPost: {
    sr: 'da pratiš sesiju, dobiješ podsetnik pred istek i nadzor kazni za tablice.',
    en: 'to track your session, get an expiry reminder, and watch your plate for fines.',
  },
  createAccount: { sr: 'Napravi besplatan nalog', en: 'Create a free account' },
  fineIfUnpaid: { sr: 'Kazna ako ne platiš', en: 'Fine if unpaid' },
  recentSessions: { sr: 'Skorašnje sesije', en: 'Recent sessions' },

  // Armed / session card
  armedTitle: { sr: 'Plaćeno unapred za jutro · {zone}', en: 'Pre-paid for the morning · {zone}' },
  armedSub: {
    sr: 'Plaćeno unapred {start}–{end}. Još ne šaljemo podsetnike — navij alarm da opet proveriš tablu.',
    en: "Pre-paid {start}–{end}. We can't ping you yet — set an alarm to re-check the sign.",
  },
  cancel: { sr: 'Otkaži', en: 'Cancel' },
  activeParking: { sr: 'Aktivan parking', en: 'Active parking' },
  expired: { sr: 'Isteklo', en: 'Expired' },
  agoRisk: { sr: 'pre {time} · rizik od kazne', en: '{time} ago · risk of fine' },
  left: { sr: 'preostalo', en: 'left' },
  limitWarn: {
    sr: 'Dostignut je limit ove zone — moraš pomeriti auto (ovde ne može ponovo da se plati).',
    en: "You've reached this zone's limit — you must move the car (no re-pay here).",
  },
  extend1h: { sr: '+ Produži 1h', en: '+ Extend 1h' },
  findMyCar: { sr: 'Nađi moj auto', en: 'Find my car' },
  end: { sr: 'Završi', en: 'End' },

  // Plate input
  plateOcrHint: { sr: 'Č, Š, Ž, Đ, Ć se čitaju ispravno — bez grešaka, bez odbijenih plaćanja.', en: 'Č, Š, Ž, Đ, Ć read correctly — no typos, no blocked payments.' },
  plateConf: { sr: 'pročitano {pct}% — proveri svaki znak', en: 'read {pct}% — check every character' },
  plateNoRead: {
    sr: 'Tablica nije pročitana. Popuni kadar tablicom, ravno i u nivou, pa slikaj opet — ili je samo ukucaj.',
    en: "Couldn't read a plate. Fill the frame with it, straight on and level, then retake — or just type it in.",
  },
  plateFail: { sr: 'Čitanje nije uspelo. Ukucaj tablicu.', en: 'Plate read failed. Type it in instead.' },
  plateScanAria: { sr: 'Skeniraj tablicu kamerom', en: 'Scan plate with camera' },
  plateReadingAria: { sr: 'Čitam tablicu…', en: 'Reading plate…' },

  // Map bits
  exploreZones: { sr: 'Istraži zone', en: 'Explore zones' },
  parkingZones: { sr: 'zone parkiranja', en: 'parking zones' },

  // Landing hero (the Serbia-first front door)
  heroLabel: { sr: 'Ulično parkiranje · Srbija', en: 'Street parking · Serbia' },
  heroTitle1: { sr: 'Ulično parkiranje u Srbiji,', en: 'Street parking in Serbia,' },
  heroTitle2: { sr: 'konačno jasno.', en: 'finally clear.' },
  heroSub: {
    sr: 'Zone, cene i kako se plaća u Novom Sadu i Nišu: iz zvaničnih izvora, provereno prema tabli na ulici. Više gradova čim ih potvrdimo.',
    en: 'Zones, prices, and how to pay in Novi Sad and Niš: pulled from official sources and checked against the sign at the curb. More cities as we verify them.',
  },
  searchPlaceholder: { sr: 'Pretraži grad: Novi Sad, Beograd, Niš…', en: 'Search city: Novi Sad, Belgrade, Niš…' },
  findBtn: { sr: 'Nađi →', en: 'Find →' },
  detecting: { sr: 'Otkrivam tvoju lokaciju…', en: 'Detecting your location…' },
  resolvingSpot: { sr: 'Proveravam zonu na tvom mestu…', en: 'Checking the zone where you are…' },

  // Hours (rendered by useParkingHours)
  hoursTitle: { sr: 'Radno vreme naplate', en: 'Parking hours' },
  freeNowPill: { sr: 'Besplatno sada', en: 'Free now' },
  paidNowPill: { sr: 'Naplata u toku', en: 'Paid now' },
  chargingFrom: { sr: 'Naplata od {time}', en: 'Charging from {time}' },
  chargingResumesDay: { sr: 'Naplata ponovo {day} {time}', en: 'Charging resumes {day} {time}' },
  freeToday: { sr: 'Besplatno danas', en: 'Free today' },
  freeAt: { sr: 'Besplatno od {time}', en: 'Free at {time}' },
  free: { sr: 'Besplatno', en: 'Free' },

  // Ask AI panel
  aiPanelTitle: { sr: 'Parkiranje u {city}, jednostavno', en: 'Parking in {city}, simply' },
  aiPaidNow: { sr: 'Sada se plaća', en: 'You pay right now' },
  aiFreeNow: { sr: 'Sada je besplatno', en: 'It’s free right now' },
  aiFreeAgain: { sr: 'Besplatno ponovo od {time}.', en: 'Free again at {time}.' },
  aiNeedTicket: { sr: 'Sada ti treba karta.', en: 'You need a ticket right now.' },
  aiNoTicket: { sr: 'Ne treba ti ništa. Samo parkiraj.', en: 'No ticket needed. Just park.' },
  pay3Steps: { sr: 'Plati u 3 koraka', en: 'Pay in 3 steps' },
  step1: { sr: 'Pogledaj obojenu tablu pored auta.', en: 'Look at the coloured sign next to your car.' },
  step2: { sr: 'Pošalji tablice SMS-om na broj te boje.', en: 'Send your plate in a text to that colour’s number.' },
  step3: { sr: 'Gotovo. Sačuvaj poruku, to ti je karta.', en: 'Done. Keep the text, that’s your ticket.' },
  tapColour: { sr: 'Dodirni svoju boju i mi ćemo upisati tablice za tebe.', en: 'Tap your colour and we’ll fill in your plate for you.' },
  nothingToDo: { sr: 'Ništa ne moraš. Samo parkiraj.', en: 'Nothing to do. Just park.' },
  whenPayingStarts: { sr: 'Kad naplata ponovo počne, vrati se i pokazaćemo ti kako.', en: 'When paying starts again, come back here and we’ll show you how.' },
  scanByCar: { sr: 'Skeniraj tablu pored auta', en: 'Scan the sign by your car' },
  whenPay: { sr: 'Kada se plaća?', en: 'When do you have to pay?' },
  whatColours: { sr: 'Šta znače boje?', en: 'What are the colours?' },
  whereAmI: { sr: 'Gde se nalazim?', en: 'Where am I standing?' },
  otherTimeFree: { sr: 'U svako drugo vreme parkiranje je besplatno.', en: 'Any other time, parking is free.' },
  coloursNote: { sr: 'Svaka boja je zona. Bliže centru obično košta više. Tabla pored auta pokazuje tvoju boju.', en: 'Each colour is a zone. Nearer the centre usually costs more. The sign by your car shows your colour.' },
  whereNote: { sr: 'Nisi siguran? Tabla pored auta je uvek u pravu.', en: 'Not sure? The sign next to your car is always right.' },
  whereAssert: { sr: 'Najverovatnije si u zoni {zone}.', en: 'You’re most likely in the {zone} zone.' },
  whereBetween: { sr: 'Između dve zone si. Neka tabla odluči.', en: 'You’re between two zones. Let the sign decide.' },
  whereBorder: { sr: 'Granica zone prolazi baš ovuda. Pročitaj tablu pored auta.', en: 'A zone border runs through here. Read the sign by your car.' },
  whereNone: { sr: 'Nema zone naplate baš tu gde stojiš.', en: 'No paid zone right where you’re standing.' },
  straightFrom: { sr: 'Direktno iz {source}', en: 'Straight from {source}' },
  checkedOn: { sr: 'provereno {date}', en: 'checked {date}' },

  // Fine check
  finesLabel: { sr: 'Kazne za parkiranje', en: 'Parking fines' },
  fineCheckTitle: { sr: 'Proveri da li imaš kaznu', en: 'Check your plate for a fine' },
  fineCheckSub: {
    sr: 'Novi Sad te ne obaveštava: nema SMS-a, nema papira na šoferci. Proveri tablice u zvaničnoj evidenciji.',
    en: "Novi Sad doesn't notify you: no SMS, no ticket on the windscreen. Check your plate against the official records.",
  },
  checking: { sr: 'Proveravam…', en: 'Checking…' },
  checkBtn: { sr: 'Proveri', en: 'Check' },
  noFines: { sr: 'Nema kazni za {plate}', en: 'No outstanding fines for {plate}' },
  noFinesSub: {
    sr: 'Provereno {time}. Kazna može da se pojavi tek posle nekoliko dana. Ako si skoro parkirao, proveri opet kasnije.',
    en: 'Checked {time}. Fines can take days to appear, so check again later if you parked recently.',
  },
  unpaid: { sr: 'neplaćeno', en: 'unpaid' },
  orderNo: { sr: 'Nalog #{no}', en: 'Order #{no}' },
  fineSrc: { sr: 'Iz zvanične evidencije JKP Parking servis · provereno {time}', en: 'From official JKP Parking servis records · checked {time}' },
  fineIdle: { sr: 'Zvanični podaci JKP Parking servis. Kerb ih samo prenosi.', en: 'Official data from JKP Parking servis. Kerb only relays it.' },
  enterValidPlate: { sr: 'Unesi ispravne tablice', en: 'Enter a valid plate' },
  fineCheckFail: { sr: 'Provera trenutno nije moguća. Pokušaj ponovo.', en: 'Could not check fines right now. Try again.' },
} as const

export type LangKey = keyof typeof dict

export const useLang = () => {
  const lang = useState<Lang>('kerb-lang', () => 'en')

  if (import.meta.client) {
    const stored = localStorage.getItem(LANG_KEY) as Lang | null
    if (stored === 'sr' || stored === 'en') {
      lang.value = stored
    } else if (navigator.language?.toLowerCase().startsWith('sr')) {
      lang.value = 'sr'
    }
  }

  const setLang = (l: Lang) => {
    lang.value = l
    if (import.meta.client) localStorage.setItem(LANG_KEY, l)
  }
  const toggle = () => setLang(lang.value === 'sr' ? 'en' : 'sr')

  const t = (key: LangKey, params?: Record<string, string | number>): string => {
    let out: string = dict[key][lang.value]
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v))
    }
    return out
  }

  return { lang, setLang, toggle, t }
}

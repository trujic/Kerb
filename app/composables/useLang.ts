// Language layer — Serbian (latinica) first, English fallback.
// Deliberately tiny: a dictionary + {param} interpolation, no i18n framework.
// Every public surface goes through it: a Serbian driver who meets an English
// sentence halfway through the pay flow has been told the app is not for them.

export type Lang = 'sr' | 'en'

const LANG_KEY = 'kerb_lang'

const dict = {
  // Detected line
  detected: { sr: 'lokacija', en: 'detected' },
  fullGuide: { sr: 'Ceo vodič →', en: 'Full guide →' },

  // Free-now surface
  freeNow: { sr: 'Besplatno sada', en: 'Free now' },
  freeTitle: { sr: 'Ne moraš da platiš sada', en: 'No need to pay right now' },
  // The city is named in the line above; Serbian would need it in the locative.
  freeSub: { sr: 'Parkiranje je sada besplatno.', en: 'Parking is free in {city} right now.' },
  chargingResumes: { sr: 'Naplata ponovo počinje', en: 'Charging resumes' },
  prepayBtn: { sr: 'Plati unapred {start}–{end} →', en: 'Pre-pay {start}–{end} →' },
  tipLabel: { sr: 'Savet', en: 'Tip' },
  prepayWhy: {
    sr: 'Naplata počinje u {start}. Ako platiš sada, pokriven si od tog trenutka.',
    en: "Charging starts at {start}. Pay now and you're covered from that moment.",
  },
  browseZones: { sr: 'Pregledaj zone', en: 'Browse zones' },
  today: { sr: 'danas', en: 'today' },
  tomorrow: { sr: 'sutra', en: 'tomorrow' },

  // Pay surface: zone card → covered-until → slide
  coveredUntil: { sr: 'Pokriveno do {time}', en: 'Covered until {time}' },
  managePlates: { sr: 'Upravljaj tablicama →', en: 'Manage plates →' },
  // The SMS is nothing but the plate, so without one there is no payment to make.
  // "Add" rather than "type": a guest types it into the field, a signed-in driver
  // with no plate yet gets an Add-plate link. Both sit directly above this line.
  // In the slide itself when there is no plate yet: the reason has to be where
  // the thumb refuses to move, not in a line the tab bar can cover.
  needPlateSlide: { sr: 'Prvo upiši tablicu ↑', en: 'Type your plate first ↑' },
  // The one rule that saves a fine, in the field itself now that the "how to
  // type it" disclosure is gone: exactly as on the plate, special letters too.
  platePlaceholder: { sr: 'Tablica tačno kao na autu', en: 'Plate exactly as on the car' },
  fullGuideCity: { sr: 'Ceo vodič za {city}', en: 'Full guide to {city}' },
  // First visit: the location prompt is earned by a button, not fired on load.
  findMyZone: { sr: 'Nađi moju zonu', en: 'Find my zone' },
  firstHelpShort: { sr: 'Prvi put ovde? →', en: 'First time here? →' },
  // The zone claim lines (app/utils/zoneClaim.js). The hedge is its own sentence.
  claimNoData: { sr: 'Ovde nemam podatke o zoni.', en: 'I have no zone data here.' },
  claimSignOnly: { sr: 'Tabla pored auta je jedini odgovor.', en: 'The sign by the car is the only answer.' },
  claimPlace: { sr: 'Ovaj deo je {zone}.', en: 'This stretch is {zone}.' },
  claimSources: { sr: 'Potvrđeno iz {n} izvora: {list}.', en: 'Confirmed by {n} sources: {list}.' },
  claimSourceRegistry: { sr: 'Izvor: registar operatera.', en: "Source: the operator's registry." },
  claimBitRegistry: { sr: 'registar', en: 'registry' },
  claimBitScan1: { sr: '1 skenirana tabla', en: '1 scanned sign' },
  claimBitScans: { sr: '{n} skenirane table', en: '{n} scanned signs' },
  claimBitPays: { sr: 'uplate', en: 'payments' },
  claimOtherZone: { sr: 'Druga zona', en: 'Another zone' },
  claimLoud: {
    sr: '⚠ {zone} je {dist} odavde, a GPS greši ±{acc} — ne mogu da ti kažem sa koje si strane linije. Pogledaj tablu.',
    en: '⚠ {zone} is {dist} away and GPS is off by ±{acc}, so I cannot tell which side of the line you are on. Check the sign.',
  },
  claimNormal: {
    sr: '{zone} počinje {dist} odavde. Ako su kola u njoj, važi ona.',
    en: '{zone} starts {dist} away. If the car is in it, that zone applies.',
  },
  claimQuiet: {
    sr: 'Najbliža druga zona je {dist} odavde — tu zabune nema.',
    en: 'The nearest other zone is {dist} away, so there is no confusion here.',
  },
  claimSpotOutside: {
    sr: 'Izgleda da nisi na parking mestu — najbliže je {dist} odavde.',
    en: 'You do not seem to be on a parking bay; the nearest is {dist} away.',
  },
  claimSpotEdge: {
    sr: 'Na ivici si parking površine, pa ne mogu da potvrdim da je mesto naplatno.',
    en: 'You are at the edge of the parking area, so I cannot confirm the spot is paid.',
  },
  // Desktop: the place is where the car is, not where the reader is.
  claimSpotOutsideCar: {
    sr: 'To mesto nije na parking površini — najbliža je {dist} odatle.',
    en: 'That spot is not on a parking bay; the nearest is {dist} from it.',
  },
  claimSpotEdgeCar: {
    sr: 'Kola su na ivici parking površine, pa ne mogu da potvrdim da je mesto naplatno.',
    en: 'The car is at the edge of the parking area, so I cannot confirm the spot is paid.',
  },
  claimEvidenceScan1: { sr: '1 tabla skenirana', en: '1 sign scanned' },
  claimEvidenceScans: { sr: '{n} table skenirane', en: '{n} signs scanned' },
  claimEvidencePays: { sr: 'uplate potvrđuju', en: 'payments agree' },
  findMyZoneWhy: {
    sr: 'Lokacija služi samo da nađemo zonu u kojoj si.',
    en: 'Your location is only used to find the zone you are in.',
  },
  needPlate: {
    sr: 'Dodaj tablicu iznad — SMS se šalje sa njom.',
    en: 'Add your plate above — the SMS is sent with it.',
  },
  heroCheckSign: {
    sr: 'Proveri znak — znak je zvaničan.',
    en: 'Check the sign — the sign is official.',
  },
  // On a boundary the app stops recommending — and stops adding, too. An earlier
  // version said "whichever it is, do not stay longer than 120 minutes", taking
  // the strictest limit among the candidates as the safe one. It is not safe, it
  // is invented: a driver who turns out to be in the unlimited zone has no such
  // limit, and inventing one costs them a moved car or an hour they need not buy.
  // The app says what it knows — you are near a boundary — and nothing else.
  boundaryHere: { sr: 'Blizu si granice zona', en: 'You are near zone boundaries' },
  // NB: `boundarySub` below is a different message (standing off the mapped kerb).
  // Two keys with one name would silently resolve to whichever came last.
  boundaryCheckSign: {
    sr: 'Proveri tablu i plati po njoj.',
    en: 'Check the sign and pay accordingly.',
  },
  // The daily ticket: an equal second way to pay wherever the zone sells it, and
  // worth offering loudly, because it is the one place the app saves a driver
  // money rather than just saving them from a fine. Off the lots our map lists,
  // the extra sign decides, and the option says so.
  payChoiceLabel: { sr: 'Način plaćanja', en: 'How to pay' },
  payHourly: { sr: 'Po satu', en: 'By the hour' },
  payDailyOpt: { sr: 'Dnevna karta', en: 'Daily ticket' },
  dailyFromShort: { sr: 'Isplati se od {hours} h', en: 'Cheaper from {hours} h' },
  dailyOnePay: { sr: 'Jedna uplata', en: 'One payment' },
  dailyFrom: { sr: 'Može od: {when}', en: 'Available from {when}' },
  dailyOnlyIfSign: {
    sr: 'Za ovo mesto nemamo podatak da važi dnevna karta. Plati je samo ako na dodatnoj tabli piše da važi.',
    en: 'We have no record of the daily ticket at this spot. Pay it only if an extra sign says it is valid here.',
  },
  payDailyBtn: { sr: 'Plati dnevnu kartu', en: 'Pay the daily ticket' },
  dailySend: { sr: 'Prevuci za dnevnu — {amount} → {code}', en: 'Slide for the daily — {amount} → {code}' },
  wrongZone: { sr: 'Pogrešna zona? Pogledaj sve zone', en: 'Wrong zone? See all zones' },
  askAiShort: { sr: 'Pitaj AI', en: 'Ask AI' },
  approxWarn: {
    sr: 'Granice zona u {city} su približne (nema zvanične mape) — ovde suzi izbor, a veruj tabli.',
    en: "{city}'s zone areas are approximate (no official map) — use this to narrow it down, then trust the sign.",
  },
  likelyYours: { sr: 'verovatno tvoja', en: 'likely yours' },
  noLimit: { sr: 'Bez ograničenja', en: 'No limit' },
  // Inside the zone, near its line. The polygons are drawn a little wider than
  // the bays they cover, so being just inside one is not proof of anything.
  edgeTitle: {
    sr: 'Na granici zone si',
    en: "You're on the zone boundary",
  },
  edgeSub: {
    sr: 'Granica je nacrtana šire nego što je na ulici. Plati ovu zonu samo ako na tabli piše',
    en: 'The line is drawn wider than the kerb. Only pay this zone if the sign says',
  },
  // More than a car length outside the line: probably not in this zone at all.
  boundaryTitle: {
    sr: 'Verovatno nisi u zoni — {dist} do najbliže',
    en: "You're probably not in a zone — {dist} to the nearest",
  },
  boundarySub: {
    sr: 'Potraži znak. Plati ovu zonu samo ako na tabli piše',
    en: 'Look for a sign. Only pay this zone if it says',
  },
  alreadyRunning: {
    sr: 'Parking u ovoj zoni ti već teče',
    en: 'Parking is already running in this zone',
  },
  alreadyRunningSub: {
    sr: 'Produži ga u kartici iznad.',
    en: 'Extend it in the card above.',
  },
  resendSms: {
    sr: 'SMS nije prošao? Pošalji ponovo',
    en: "SMS didn't go through? Send it again",
  },
  noParkingTitle: { sr: 'Nema naplate tu gde stojiš', en: "No paid zone where you're standing" },
  noParkingSub: { sr: 'Parkiranje ovde je verovatno besplatno. Najbliža naplata je', en: 'Parking here is likely free. Nearest paid parking is' },
  awayOn: { sr: 'odavde —', en: 'away —' },
  // Desktop — the laptop is not where the car is, so the panel asks.
  carWhereTitle: { sr: 'Gde su ti kola?', en: 'Where is your car?' },
  carWhereSub: {
    sr: 'Laptop ne zna gde su ti kola, zato upiši ulicu.',
    en: 'A laptop cannot tell where your car is, so type the street.',
  },
  carWhereMap: { sr: 'Klikni na mapi zonu u kojoj su kola', en: 'Click the zone your car is in on the map' },
  carMapChip: { sr: 'Klikni zonu u kojoj su ti kola', en: 'Click the zone your car is in' },
  carHereBtn: { sr: 'Kola su ovde →', en: 'My car is here →' },
  or: { sr: 'ili', en: 'or' },
  carIsAt: { sr: 'Tvoja kola', en: 'Your car' },
  carChange: { sr: 'Promeni', en: 'Change' },
  carOnMap: { sr: 'Mesto izabrano na mapi', en: 'Spot picked on the map' },
  carNoParkingTitle: { sr: 'Tamo nema naplate', en: 'No paid zone there' },
  carNoParkingSub: { sr: 'Parkiranje na tom mestu je verovatno besplatno. Najbliža naplata je', en: 'Parking there is likely free. Nearest paid parking is' },
  carAwayOn: { sr: 'dalje —', en: 'away —' },
  scanContribute: { sr: 'Vidiš tablu? Skeniraj je', en: 'See a sign? Scan it' },

  // Address search — "which zone parks at this address", for a place you are
  // not standing at yet.
  addressTitle: { sr: 'Proveri adresu', en: 'Check an address' },
  addressSub: {
    sr: 'Koja zona je na nekoj adresi — pre nego što kreneš.',
    en: 'Which zone parks at an address — before you set off.',
  },
  addressPlaceholder: { sr: 'npr. Koste Stojanovića 15', en: 'e.g. Koste Stojanovića 15' },
  addressScope: { sr: 'Pretraga samo za: {city}', en: 'Searching only in: {city}' },
  searching: { sr: 'Tražim…', en: 'Searching…' },
  noAddressHit: { sr: 'Nema pogotka — probaj samo ime ulice.', en: 'No match — try just the street name.' },
  addressSearchFailed: { sr: 'Pretraga nije uspela. Proveri vezu.', en: 'Search failed. Check your connection.' },
  unknownArea: { sr: 'nepoznat deo grada', en: 'unknown area' },
  searchAgain: { sr: 'Traži ponovo', en: 'Search again' },
  clear: { sr: 'Obriši', en: 'Clear' },
  showOnMap: { sr: 'Prikaži na mapi', en: 'Show on map' },
  addressCheckSign: {
    sr: 'Ovo je sa naše mape — tabla na licu mesta je zvanična.',
    en: 'This is from our map — the sign at the spot is official.',
  },
  houseNumberCaveat: {
    sr: 'U Beogradu se zona ume menjati po kućnom broju. Broj je našao mesto, ali ne i cenu — proveri tablu.',
    en: 'In Belgrade the zone can change by house number. The number found the place, not the price — check the sign.',
  },
  addressNoZoneNear: {
    sr: 'Na toj adresi nema naplate. Najbliža je ~{dist} odatle.',
    en: 'No paid parking at that address. The nearest is ~{dist} away.',
  },
  addressNoZone: { sr: 'Na toj adresi nema naplate parkinga.', en: 'No paid parking at that address.' },
  notCovered: { sr: 'nemamo mapu', en: 'not covered' },

  // Offline / stale data. The age is not decoration — zones get corrected, and a
  // driver looking at an old map has to know that is what they are looking at.
  staleTitleOffline: { sr: 'Nema veze sa internetom', en: "You're offline" },
  staleTitleOnline: { sr: 'Prikazana je sačuvana kopija', en: 'Showing a saved copy' },
  staleAge: { sr: 'Podaci su preuzeti {age}.', en: 'This data was taken {age}.' },
  staleAgeUnknown: { sr: 'Ne znamo kad su podaci preuzeti.', en: "We don't know when this data was taken." },
  staleCheckSign: {
    sr: 'Zone su se u međuvremenu mogle promeniti — tabla pored auta je zvanična.',
    en: 'Zones may have changed since — the sign next to your car is official.',
  },
  addressCityNotCovered: {
    sr: 'Taj grad još nemamo mapiran — ne znamo koja je zona, ne znači da je besplatno.',
    en: "We haven't mapped that city yet — we don't know the zone, which is not the same as free.",
  },

  // Pay card
  // Two states, never one: "saved · ready" under an empty field told the driver
  // the one thing that was not true.
  plateHint: { sr: 'Sačuvano na uređaju', en: 'Saved on this device' },
  plateHintEmpty: {
    sr: 'Upiši tablicu tačno kao na autu, sa Č, Ć, Ž, Š, Đ — SMS se šalje sa njom.',
    en: 'Type the plate exactly as it is on the car, special letters included — the SMS carries it.',
  },
  plateSync: { sr: 'Napravi nalog za sinhronizaciju.', en: 'Create an account to sync it.' },
  sendSms: { sr: 'Prevuci da pošalješ SMS → {code}', en: 'Slide to send SMS → {code}' },
  openingSms: { sr: 'Otvaram SMS…', en: 'Opening SMS…' },
  slideConfirms: { sr: 'Prevuci tek kad proveriš tablu.', en: 'Slide once you have checked the sign.' },
  payZone: { sr: 'Plati {zone}', en: 'Pay {zone}' },
  addPlate: { sr: 'Dodaj tablice za SMS jednim dodirom', en: 'Add a plate for one-tap SMS' },
  smsToOperator: { sr: 'Tvoj telefon šalje SMS operateru, a SMS potvrda koju dobiješ je tvoja karta.', en: 'Your phone sends the SMS to the operator; the confirmation SMS you get back is your ticket.' },
  // Cities outside the SMS world: an app hand-off, or no in-app payment at all.
  openApp: { sr: 'Prevuci da otvoriš {app}', en: 'Slide to open {app}' },
  openingApp: { sr: 'Otvaram aplikaciju…', en: 'Opening the app…' },
  theApp: { sr: 'aplikaciju', en: 'the app' },
  appToOperator: { sr: 'Plaćanje se završava u aplikaciji operatera.', en: 'Payment finishes in the operator\'s app.' },
  payKioskTitle: { sr: 'Ovde se plaća na automatu', en: 'This zone pays at a machine' },
  payKioskSub: {
    sr: 'Nema plaćanja iz aplikacije — potraži automat na parkingu i sačuvaj kartu.',
    en: 'There is no in-app payment here — find the machine on the lot and keep the ticket.',
  },
  payUnknownTitle: { sr: 'Ne znamo kako se ovde plaća', en: "We don't know how to pay here yet" },
  payUnknownSub: {
    sr: 'Zonu prepoznajemo, ali način plaćanja još nemamo. Proveri tablu pored auta.',
    en: 'We can name the zone but not how to pay it. Check the sign next to your car.',
  },
  ruleDetails: { sr: 'Detalji pravila', en: 'Rule details' },

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

  // A visitor whose phone cannot send the payment at all. Worded so a local
  // reads the first three words and knows it is not for them.
  payForMeTitle: { sr: 'Nemaš srpski broj?', en: 'No Serbian SIM?' },
  payForMeSub: {
    sr: 'Neko sa domaćim brojem pošalje uplatu za tvoju tablicu',
    en: 'Someone with a local number sends the payment for your plate',
  },
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
  fineIfUnpaid: { sr: 'Ako ne platiš', en: 'If you do not pay' },
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
  dismissSession: { sr: 'Ukloni istekli parking', en: 'Dismiss expired parking' },

  // Expiry reminders. The notification text is baked in when the alarm is
  // written, because the service worker that may deliver it has no dictionary.
  remExpiryTitle: { sr: '⏳ Parking uskoro ističe', en: '⏳ Parking running out' },
  remExpiryBody: {
    sr: 'Još {mins} min — {zone}{where}. Dodirni da produžiš.',
    en: '{mins} min left — {zone}{where}. Tap to extend.',
  },
  remLimitTitle: { sr: '🚗 Vreme je da pomeriš auto', en: '🚗 Time to move your car' },
  remLimitBody: {
    sr: 'Limit zone {zone} ({min} min) je pri kraju{where}. Moraš da pomeriš auto — ovde se ne može ponovo platiti.',
    en: "{zone}'s {min}-min limit is almost up{where}. You must move the car — no re-pay here.",
  },
  remindTitle: { sr: 'Podsetnik pred istek', en: 'Reminder before it runs out' },
  remindOff: {
    sr: 'Javimo ti 10 minuta ranije. Radi i bez interneta.',
    en: 'We ping you 10 minutes early. Works with no signal too.',
  },
  // The honest version of the promise: no web app can wake a phone that has
  // closed it, so this says "while Kerbo is running" rather than guaranteeing.
  remindOn: {
    sr: 'Uključeno — javimo se 10 min pre isteka, dok je Kerb pokrenut.',
    en: 'On — we ping you 10 min before expiry, while Kerb is running.',
  },
  remindEnable: { sr: 'Uključi', en: 'Turn on' },
  remindOnShort: { sr: 'Uključeno', en: 'On' },
  remindBlocked: {
    sr: 'Obaveštenja su blokirana za ovaj sajt — uključi ih u podešavanjima pregledača.',
    en: 'Notifications are blocked for this site — enable them in your browser settings.',
  },
  remindNeedsInstall: {
    sr: 'Na iPhone-u obaveštenja stižu tek kad je Kerb dodat na početni ekran.',
    en: 'On iPhone, notifications only arrive once Kerb is on the home screen.',
  },

  // Plate input
  plateHow: { sr: 'Kako se upisuje?', en: 'How do I type it?' },
  plateOcrHint: {
    sr: 'Pogledaj tablicu na autu. Prekucaj svako slovo i broj tačno kako tamo piše, sa Č, Ć, Ž, Š i Đ. SMS se šalje baš sa tom tablicom.',
    en: 'Look at the plate on your car. Type every letter and number exactly as written there, special letters included. The SMS is sent with exactly that plate.',
  },
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
    sr: 'Zone, cene i kako se plaća u Novom Sadu: iz zvaničnih izvora, sa datumom provere. Tabla pored auta uvek ima poslednju reč. Drugi gradovi dolaze kad ih proverimo.',
    en: 'Zones, prices, and how to pay in Novi Sad: from official sources, with the date we checked. The sign by your car always has the last word. More cities once we have verified them.',
  },
  searchPlaceholder: { sr: 'Pretraži grad: Novi Sad…', en: 'Search city: Novi Sad…' },
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

  // Zone popup on the map — what a tapped polygon says about itself
  zoneNoRate: { sr: 'Cena nije objavljena', en: 'No published rate' },
  zoneMaxStay: { sr: 'Najduže {n} min', en: 'Max stay {n} min' },
  zoneDaily: { sr: 'Dnevna karta {amount}', en: 'Day ticket {amount}' },
  // A scanned sign's pin on the map.
  signConfirmedTitle: { sr: 'Potvrđena tabla', en: 'Confirmed sign' },
  signConfirmedAge: { sr: 'Potvrđeno {age}', en: 'Confirmed {age}' },
  ageToday: { sr: 'danas', en: 'today' },
  ageYesterday: { sr: 'juče', en: 'yesterday' },
  ageDays: { sr: 'pre {n} dana', en: '{n} days ago' },
  ageWeeks: { sr: 'pre {n} ned.', en: '{n} wk ago' },
  ageMonths: { sr: 'pre {n} mes.', en: '{n} mo ago' },
  zoneNoData: { sr: 'Nema podataka o ovoj zoni', en: 'Nothing known about this zone' },
  zonePayBtn: { sr: 'Plati ovu zonu →', en: 'Pay this zone →' },
  zoneResidents: { sr: 'Mesto za stanare — plaćanje ovde ništa ne kupuje', en: 'Residents\u2019 bay — paying here buys nothing' },

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
  // ── MVP additions ─────────────────────────────────────────────────────────
  // The answer card's last line: what not paying costs, and where that is written.
  ifUnpaidLine: { sr: 'Ako ne platiš: {what}', en: 'If you do not pay: {what}' },
  sourceLine: { sr: 'Izvor: {source} · provereno {date}', en: 'Source: {source} · checked {date}' },
  // Scan leads the escape hatch now: the sign is the one answer that beats ours.
  scanShort: { sr: 'Skeniraj tablu', en: 'Scan the sign' },
  otherZones: { sr: 'Druga zona?', en: 'Other zone?' },

  // Nav + tab bar
  navHome: { sr: 'Početna', en: 'Home' },
  navCities: { sr: 'Gradovi', en: 'Cities' },
  navPlan: { sr: 'Plan', en: 'Roadmap' },
  navContribute: { sr: 'Doprinesi', en: 'Contribute' },
  navSignIn: { sr: 'Prijava', en: 'Sign in' },
  navProfile: { sr: 'Profil', en: 'Profile' },

  // Footer + legal
  footPrivacy: { sr: 'Privatnost', en: 'Privacy' },
  footTerms: { sr: 'Uslovi korišćenja', en: 'Terms of use' },
  footNote: {
    sr: 'Kerb je informativni vodič, nije operater parkinga. Tabla pored auta je zvanična.',
    en: 'Kerb is an information guide, not a parking operator. The sign next to your car is official.',
  },

  // A city Kerb knows exists but has not verified: say so, and hand over the
  // operator's own site instead of a dead end or a guess.
  uncoveredTitle: { sr: 'Kerb još ne pokriva {city}', en: 'Kerb does not cover {city} yet' },
  uncoveredSub: {
    sr: 'Nemamo proverene zone i cene za ovaj grad, pa ih ne prikazujemo. Tabla pored auta kaže zonu i broj za SMS.',
    en: 'We have no verified zones or prices here, so we show none. The sign next to your car names the zone and the SMS number.',
  },
  uncoveredOfficial: { sr: 'Zvanični sajt parkinga ↗', en: 'Official parking site ↗' },
  uncoveredElsewhere: {
    sr: 'Izgleda da si van Novog Sada. Kerb za sada pokriva samo Novi Sad.',
    en: 'You seem to be outside Novi Sad. For now Kerb covers Novi Sad only.',
  },

  // Location errors, shown in the landing hero
  gpsNoSupport: { sr: 'Ovaj pregledač ne daje lokaciju.', en: 'This browser does not provide location.' },
  gpsDenied: {
    sr: 'Lokacija je isključena za ovaj sajt. Uključi je u podešavanjima pregledača, ili potraži grad ispod.',
    en: 'Location is blocked for this site. Allow it in your browser settings, or search for a city below.',
  },
  gpsTimeout: { sr: 'Lokacija nije stigla na vreme. Pokušaj ponovo.', en: 'Location took too long. Try again.' },
  gpsFail: { sr: 'Ne mogu da odredim lokaciju.', en: 'Could not find your location.' },
  gpsNoCity: { sr: 'Ne mogu da odredim grad u kom si.', en: 'Could not tell which city you are in.' },

  // City page
  backCities: { sr: '← Svi gradovi', en: '← All cities' },
  cityNotFound: { sr: 'Nema tog grada', en: 'City not found' },
  cityNotFoundSub: { sr: 'Za ovaj grad još nemamo podatke.', en: 'We have no data for this city yet.' },
  cityGuide: { sr: 'Vodič za ulično parkiranje', en: 'Street parking guide' },
  cityVerified: { sr: '✓ Provereno', en: '✓ Verified' },
  cityCommunity: { sr: '⚠ Podaci zajednice', en: '⚠ Community data' },
  cityChecked: { sr: 'Provereno {date}', en: 'Checked {date}' },
  cityUpdated: { sr: 'Ažurirano {date}', en: 'Updated {date}' },
  cityDisclaimer: {
    sr: 'Pravila smo poslednji put proverili {date}. Menjaju se — pre parkiranja pogledaj tablu ili',
    en: 'We last checked these rules on {date}. They change — before you park, look at the sign or',
  },
  cityOfficialSource: { sr: 'zvanični izvor ↗', en: 'the official source ↗' },
  cityZones: { sr: 'Zone', en: 'Parking zones' },
  cityHowPay: { sr: 'Kako se plaća', en: 'How to pay' },
  cityStepSms: { sr: 'Korak po korak — SMS', en: 'Step by step — SMS' },
  cityStepOther: { sr: 'Korak po korak', en: 'Step by step' },
  cityDailyCode: { sr: 'Dnevna karta', en: 'Daily ticket' },
  cityTips: { sr: 'Dobro je znati', en: 'Good to know' },
  cityVerifyTitle: { sr: 'Proveri pre parkiranja', en: 'Verify before you park' },
  cityVerifySub: {
    sr: 'Kerb je vodič, ne garancija. Važeća pravila su na tabli i na sajtu operatera.',
    en: 'Kerb is a guide, not a guarantee. The rules in force are on the sign and on the operator’s site.',
  },
  cityOfficialBtn: { sr: 'Zvanični sajt ↗', en: 'Official source ↗' },
  cityContribTitle: { sr: 'Nešto nije tačno?', en: 'Know something we got wrong?' },
  cityContribSub: {
    sr: 'Pravila se menjaju. Javi nam, da sledeći vozač ne plati pogrešnu zonu.',
    en: 'Rules change. Tell us, so the next driver does not pay the wrong zone.',
  },
  cityContribBtn: { sr: 'Javi ispravku', en: 'Suggest a correction' },
  cityTowNote: {
    sr: 'Pauk je takođe aktivan — iznose proveri na tabli i kod operatera.',
    en: 'Towing is also active — check local signage for current amounts.',
  },

  // Scan-the-sign dialog (ScanSign)
  scTitle: { sr: 'Skeniraj tablu', en: 'Scan the sign' },
  scAria: { sr: 'Skeniranje table za parking', en: 'Scan the parking sign' },
  scClose: { sr: 'Zatvori', en: 'Close' },
  scMeterTitle: { sr: 'Iskoristio si {n} besplatna skeniranja', en: 'That’s your {n} free scans' },
  scMeterSub: {
    sr: 'Svako skeniranje popravlja zajedničku mapu tabli — hvala. Napravi besplatan nalog da nastaviš.',
    en: 'Every scan improves the shared sign map — thank you. Create a free account to keep scanning.',
  },
  scMeterCta: { sr: 'Napravi besplatan nalog →', en: 'Create a free account →' },
  scLater: { sr: 'Možda kasnije', en: 'Maybe later' },
  scPoint: { sr: 'Uperi u obojenu tablu zone', en: 'Point at the coloured zone sign' },
  scCapture: { sr: 'Slikaj tablu', en: 'Capture the sign' },
  scSlidePay: { sr: 'Prevuci da platiš: {zone}', en: 'Slide to pay {zone}' },
  scOpening: { sr: 'Otvaram {code}…', en: 'Opening {code}…' },
  scHintLive: {
    sr: 'Slikaj da pročitamo i ucrtamo tablu — ili samo prevuci da platiš prepoznatu zonu.',
    en: 'Tap the shutter to read and pin the sign — or just slide to pay the detected zone.',
  },
  scHintNoZone: { sr: 'Slikaj tablu da pročitamo zonu, pa plati.', en: 'Tap the shutter to read the zone off the sign, then pay.' },
  scHeroTitle: { sr: 'Slikaj tablu za parking', en: 'Photograph the parking sign' },
  scHeroSub: {
    sr: 'Tabla je zvanična. Slikaj obojenu tablu zone pored auta — pročitamo zonu i cenu, ti potvrdiš, i tabla ide na mapu za sve. Onda pripremimo pravo plaćanje.',
    en: 'The sign is the source of truth. Snap the coloured zone sign next to your car — we read the zone and price off it, you confirm, and it goes on the map for everyone. Then we prefill the right payment.',
  },
  scOpenCam: { sr: 'Otvori kameru', en: 'Open camera' },
  scLastFree: { sr: 'Poslednje besplatno skeniranje — napravi nalog da nastaviš.', en: 'Last free scan — create an account to keep going.' },
  scNoGps: {
    sr: 'Lokacija još nije stigla — treba nam da ucrtamo tablu. Dozvoli lokaciju i pokušaj ponovo.',
    en: 'Location not available yet — we need your GPS to pin the sign. Allow location and try again.',
  },
  scPhotoAlt: { sr: 'Slika table', en: 'Captured sign' },
  scReading: { sr: 'Čitam tablu…', en: 'Reading the sign…' },
  scWhatRead: { sr: 'Šta smo pročitali sa table', en: 'What we read off the sign' },
  scFieldZone: { sr: 'Zona', en: 'Zone' },
  scFieldPrice: { sr: 'Cena', en: 'Price' },
  scFieldLimit: { sr: 'Najduže', en: 'Limit' },
  scFieldCode: { sr: 'SMS broj', en: 'SMS code' },
  scFieldHours: { sr: 'Vreme naplate', en: 'Hours' },
  scCantRead: { sr: 'ne čita se', en: "can't read" },
  scCheck: { sr: '~ proveri', en: '~ check' },
  scNotSign: {
    sr: 'Ovo ne liči na tablu za parking — nema cene, vremena ni SMS broja. Uperi u obojenu tablu zone pored auta (onu sa cenom i SMS brojem) i slikaj ponovo.',
    en: 'That doesn’t look like a parking sign — we found no price, hours or SMS number on it. Point at the coloured zone sign next to your car (the one with the price and the SMS code) and retake.',
  },
  scAgree: { sr: '✓ I boja i tekst kažu: {zone}.', en: '✓ Colour and text both read {zone}.' },
  scConflict: {
    sr: 'Boja liči na {color}, a tekst kaže {zone} — pogledaj ponovo i izaberi ono što piše na tabli.',
    en: 'The colour looks like {color} but the text reads {zone} — look again and pick what the sign actually says.',
  },
  scColorOnly: { sr: 'Boja ukazuje na {color} (tekst nije jasan) — potvrdi ispod.', en: 'Colour suggests {color} (text was unclear) — confirm below.' },
  scUnsafe: {
    sr: 'Ne popunjavamo ništa — zona nije pročitana dovoljno sigurno da bi se na nju platilo. Izaberi zonu koja piše na tabli.',
    en: 'No pre-fill — the zone read wasn’t safe enough to trust with your money. Pick the zone printed on the sign.',
  },
  scTapIfWrong: { sr: 'Dodirni drugu zonu ispod ako ovo nije tačno.', en: "Tap a zone below if that's wrong." },
  scMatch: { sr: '✓ Slaže se sa registrom za ovo mesto.', en: '✓ Matches the registry for this spot.' },
  scMismatch: {
    sr: 'Razlikuje se od registra ovde — veruj tabli ispred sebe i proveri da si slikao onu pored svog auta.',
    en: 'Differs from the registry here — trust the sign in front of you, and make sure you scanned the one next to your car.',
  },
  scRetake: { sr: 'Slikaj ponovo', en: 'Retake' },
  scSaving: { sr: 'Čuvam…', en: 'Saving…' },
  scConfirm: { sr: 'Potvrdi i ucrtaj tablu', en: 'Confirm & pin this sign' },
  scPinned: { sr: 'Ucrtano · {zone}', en: 'Pinned · {zone}' },
  scAdded: { sr: '+1 tabla na mapi ulica.', en: '+1 sign added to the street map.' },
  scThanks: { sr: 'Hvala — ta potvrđena tabla sada pomaže svima ovde.', en: 'Thanks — that confirmed sign now helps everyone here.' },
  scPay: { sr: 'Plati {zone}', en: 'Pay {zone}' },
  scAnother: { sr: 'Skeniraj još jednu', en: 'Scan another' },
  scDone: { sr: 'Gotovo', en: 'Done' },
  scErrNoGps: {
    sr: 'Nema lokacije — dozvoli lokaciju pa slikaj ponovo, da bismo ucrtali tablu.',
    en: 'No GPS fix — allow location, then retake so we can pin the sign.',
  },
  scErrSave: {
    sr: 'Skeniranje nije sačuvano. Proveri vezu i pokušaj ponovo.',
    en: 'Could not save the scan. Check your connection and try again.',
  },

  // City page map (CityZoneMap)
  czmTitle: { sr: 'Gde su zone', en: 'Where the zones are' },
  czmMapped: { sr: 'Mapirano', en: 'Mapped' },
  czmApprox: { sr: 'Približno', en: 'Approximate' },
  czmRegistry: { sr: 'Registar', en: 'Registry' },
  czmSignOnly: { sr: 'Samo tabla', en: 'Sign-only' },
  czmLoading: { sr: 'Učitavam mapu zona…', en: 'Loading zone map…' },
  czmLoadFail: {
    sr: 'Mapa zona se nije učitala. Spisak zona ispod i dalje važi.',
    en: 'The zone map did not load. The zone list below still applies.',
  },
  czmApproxWarn: {
    sr: 'Za {city} ne postoji zvanična mapa zona — ove površine su približne. Proveri tablu pre plaćanja.',
    en: '{city} publishes no official zone map — these areas are approximate. Check the sign before you pay.',
  },
  czmProv: {
    sr: 'Mapa je prenesena iz zvaničnog izvora{prov}. Pomaže da suziš izbor — tabla uvek ima poslednju reč.',
    en: 'Map taken from the official source{prov}. It narrows things down — the sign always has the last word.',
  },
  czmProvApprox: {
    sr: 'Približna mapa izvedena iz zvaničnog izvora{prov}, nije katastar. Pomaže da suziš izbor — tabla uvek ima poslednju reč.',
    en: 'Approximate map derived from the official source{prov}, not a cadastre. It narrows things down — the sign always has the last word.',
  },
  czmUpdated: { sr: 'ažurirano {date}', en: 'updated {date}' },
  czmRegistrySub: {
    sr: 'Pretraži zvanični registar ulica — upiši ulicu da vidiš njenu zonu.',
    en: 'Search the official street registry — type your street to see its zone.',
  },
  czmStreetPh: { sr: 'Ime ulice…', en: 'Street name…' },
  czmNotInRegistry: { sr: 'Nije u našem registru —', en: 'Not in our registry yet —' },
  czmScanThere: { sr: 'skeniraj tablu na licu mesta', en: 'scan the sign there' },
  czmRegistryProv: { sr: 'Iz zvaničnog registra ulica{prov}. Tabla uvek ima poslednju reč.', en: 'From the official street registry{prov}. The sign always has the last word.' },
  czmScanConfirm: { sr: 'Skeniraj tablu da potvrdiš i ucrtaš →', en: 'Scan the sign to confirm and map it →' },
  czmNoneTitle: { sr: 'Još nema mape iza koje možemo da stanemo.', en: 'No map we can stand behind — yet.' },
  czmNoneSub: {
    sr: 'Kerb ne crta mape bez izvora. Ovde su tabla i tvoja skeniranja mapa.',
    en: 'Kerb does not draw maps it cannot back with a source. Here the sign, and your scans, are the map.',
  },
  czmScanStart: { sr: 'Skeniraj tablu i započni mapu →', en: 'Scan a sign to start the map →' },

  // Landing, below the hero
  citiesLabel: { sr: 'Gradovi', en: 'Cities' },
  citiesTitle: { sr: 'Gde Kerb radi', en: 'Where Kerb works' },
  citiesAll: { sr: 'Svi gradovi →', en: 'All cities →' },
  citiesFail: { sr: 'Gradovi se nisu učitali. Osveži stranicu.', en: 'Cities did not load. Refresh the page.' },
  howLabel: { sr: 'Kako radi', en: 'How it works' },
  howTitle: { sr: 'Otvoriš, pogledaš, platiš.', en: 'Open it, check it, pay.' },
  howSub: {
    sr: 'Bez naloga i bez instalacije. Kerb nađe zonu po lokaciji, a ti je potvrdiš tablom.',
    en: 'No account, nothing to install. Kerb finds the zone from your location, and you confirm it with the sign.',
  },
  how1Title: { sr: 'Otvori Kerb pored auta', en: 'Open Kerb by the car' },
  how1Body: {
    sr: 'Vidiš zonu, cenu, do kad si pokriven i šta te čeka ako ne platiš.',
    en: 'You see the zone, the price, how long you are covered, and what not paying costs.',
  },
  how2Title: { sr: 'Uporedi sa tablom', en: 'Check it against the sign' },
  how2Body: {
    sr: 'Na granici zona Kerb ne pogađa — pokaže obe. Tablu možeš i da skeniraš.',
    en: 'At a zone boundary Kerb does not guess — it shows both. You can scan the sign too.',
  },
  how3Title: { sr: 'Prevuci i pošalji SMS', en: 'Slide and send the SMS' },
  how3Body: {
    sr: 'Poruka sa tvojom tablicom je spremna. Odgovor operatera je tvoja karta.',
    en: 'The message with your plate is ready. The operator’s reply is your ticket.',
  },
  ctaLabel: { sr: 'Za one koji još ne znaju', en: 'For anyone new to it' },
  ctaTitle: { sr: 'Znaj pre nego što platiš.', en: 'Know before you pay.' },
  ctaSub: {
    sr: 'Prvi put voziš u Novom Sadu, ili tek voziš? Kerb ti kaže pravila jednostavnim rečima i kaže odakle ih zna.',
    en: 'New to Novi Sad, or new to driving? Kerb tells you the rules in plain words, and where it got them.',
  },
  ctaSearch: { sr: 'Pronađi grad →', en: 'Find a city →' },
  ctaContribute: { sr: 'Javi grešku', en: 'Report a mistake' },
  statVerified: { sr: 'provereno {date}', en: 'checked {date}' },
} as const

export type LangKey = keyof typeof dict

const isLang = (v: unknown): v is Lang => v === 'sr' || v === 'en'

// Serbian and its mutually intelligible neighbours read the Latin UI fine.
const SR_FAMILY = /^(sr|hr|bs|sh|cnr|me)\b/i

/** What this browser would pick with nobody asking: the stored choice first
 *  (the cookie, then the older localStorage key), then the device language. */
export const preferredLang = (): Lang | null => {
  if (!import.meta.client) return null
  const cookie = document.cookie.match(/(?:^|;\s*)kerb_lang=(sr|en)/)?.[1]
  if (isLang(cookie)) return cookie
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (isLang(stored)) return stored
  } catch { /* storage blocked — fall through to the device */ }
  return SR_FAMILY.test(navigator.language ?? '') ? 'sr' : 'en'
}

export const useLang = () => {
  // The language is decided where the HTML is made. It used to start as 'en' on
  // the server and flip during hydration on the client, so every page rendered
  // one language, hydrated another, and logged a mismatch. Now the server reads
  // the cookie (or Accept-Language), and a prerendered page is Serbian — the
  // plugin in plugins/lang.client.ts switches after hydration if the visitor
  // wants otherwise, which is a re-render rather than a mismatch.
  const cookie = useCookie<Lang | null>(LANG_KEY, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    default: () => null,
  })
  const lang = useState<Lang>('kerb-lang', () => {
    if (isLang(cookie.value)) return cookie.value
    if (import.meta.server) {
      const header = useRequestHeaders(['accept-language'])['accept-language'] ?? ''
      // No header at all is the prerender: Serbia first.
      if (!header.trim()) return 'sr'
      return SR_FAMILY.test(header.trim()) ? 'sr' : 'en'
    }
    return preferredLang() ?? 'sr'
  })

  const setLang = (l: Lang) => {
    lang.value = l
    cookie.value = l
    if (import.meta.client) {
      try { localStorage.setItem(LANG_KEY, l) } catch { /* private mode */ }
    }
  }
  const toggle = () => setLang(lang.value === 'sr' ? 'en' : 'sr')

  // Zone names as the sign prints them. The registry keys zones by their English
  // names ("Blue Zone") and every lookup, polygon and scan match depends on that
  // key, so it stays; only what a person reads changes. A driver comparing the
  // screen to a sign that says PLAVA ZONA should find the same words on both.
  const zoneLabel = (name?: string | null): string => {
    if (!name) return ''
    if (lang.value !== 'sr') return name
    const m = /^(\w+)\s+Zone$/i.exec(name.trim())
    const word = m ? ZONE_WORDS_SR[m[1]!.toLowerCase()] : null
    return word ? `${word} zona` : name
  }

  const t = (key: LangKey, params?: Record<string, string | number>): string => {
    let out: string = dict[key][lang.value]
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v))
    }
    return out
  }

  // City and country names as a Serbian reader writes them. The registry keeps
  // English names ("Belgrade"), which read wrong inside a Serbian sentence.
  const cityName = (id?: string | null, name?: string | null): string =>
    (lang.value === 'sr' && id && CITY_NAMES_SR[id]) || name || id || ''
  const countryName = (name?: string | null): string =>
    (lang.value === 'sr' && name && COUNTRY_NAMES_SR[name]) || name || ''

  return { lang, setLang, toggle, t, zoneLabel, cityName, countryName }
}

const CITY_NAMES_SR: Record<string, string> = {
  belgrade: 'Beograd',
  thessaloniki: 'Solun',
  'new-york-city': 'Njujork',
  sofia: 'Sofija',
}
const COUNTRY_NAMES_SR: Record<string, string> = {
  Serbia: 'Srbija',
  Greece: 'Grčka',
  Bulgaria: 'Bugarska',
  'United States': 'SAD',
  Montenegro: 'Crna Gora',
}

const ZONE_WORDS_SR: Record<string, string> = {
  extra: 'Ekstra',
  red: 'Crvena',
  blue: 'Plava',
  white: 'Bela',
  green: 'Zelena',
  yellow: 'Žuta',
  orange: 'Narandžasta',
  purple: 'Ljubičasta',
}

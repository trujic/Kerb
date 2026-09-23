// ── CITY COPY, CHECKED AND IN BOTH LANGUAGES ─────────────────────────────────
// The city rows in the database carry prose written in English before the app
// spoke Serbian, and some of it was wrong: Novi Sad's "fine" was the towing fee,
// which is not what an unpaid parking costs. This file is the text a driver reads
// for a published city, in both languages, each claim checked against the
// operator's own pages on `checkedOn`.
//
// Numbers the zone rows already hold (price, SMS code, daily ticket) are NOT
// repeated here — they are interpolated as {daily_amount} / {daily_target}, so a
// price correction in the registry cannot leave this text disagreeing with it.
// What does live here is what the rows cannot express: waiting periods after a
// limit, where a zone is, what not paying leads to.
//
// A city without an entry falls back to its database text.

import type { Lang } from '~/composables/useLang'

type Bi = Record<Lang, string>

export interface CityCopy {
  source: { name: string; url: string }
  checkedOn: string // ISO date the claims below were last checked at the source
  overview: Bi
  ifUnpaid: Bi // short: the last line of the answer card
  ifUnpaidMore: Bi // the longer version, where there is room
  zoneNotes: Record<string, Bi> // keyed by the registry zone name
  smsHowTo: Bi
  payMethods: Bi[]
  tips: { icon: string; text: Bi }[]
  mapNote?: Bi // where the drawn zones come from, when that differs from the rules' source
}

const COPY: Record<string, CityCopy> = {
  // Checked 2026-09-23 against parkingns.rs: the four zone pages, the SMS page,
  // the 2026 price list (cenovnik usluga) and the towing price list (pauk).
  'novi-sad': {
    source: { name: 'parkingns.rs', url: 'https://parkingns.rs' },
    checkedOn: '2026-09-23',
    overview: {
      sr: 'Novi Sad ima četiri zone naplate: Ekstra, Crvenu, Plavu i Belu. Naplata traje radnim danima od 7 do 21 i subotom od 7 do 14 časova, a nedeljom je parkiranje besplatno. Plaća se SMS-om, aplikacijom nSpark ili elektronskom parking karticom (ePK). Parkingom upravlja JKP „Parking servis” Novi Sad.',
      en: 'Novi Sad has four paid zones: Extra, Red, Blue and White. Charging runs on weekdays from 7:00 to 21:00 and on Saturdays from 7:00 to 14:00; Sundays are free. You pay by SMS, with the nSpark app, or with an electronic parking card (ePK). Parking is run by JKP Parking servis Novi Sad.',
    },
    ifUnpaid: {
      sr: 'doplatna parking karta',
      en: 'a surcharge parking ticket',
    },
    ifUnpaidMore: {
      sr: 'Kontrola izdaje doplatnu parking kartu; iznos i rok za plaćanje su na parkingns.rs. Nepropisno parkirano vozilo može da odnese pauk: uklanjanje putničkog vozila košta od 5.000 do 13.500 din, zavisno od mase, plus 184 din za svaki dan čuvanja.',
      en: 'Inspectors issue a surcharge parking ticket; the amount and the deadline are on parkingns.rs. An illegally parked car can be towed: removing a passenger car costs 5,000 to 13,500 RSD depending on its weight, plus 184 RSD for each day in storage.',
    },
    zoneNotes: {
      'Extra Zone': {
        sr: 'Najduže 60 minuta. Kad plaćeno vreme istekne, narednih 60 minuta ne možeš da platiš parking u Ekstra zoni i moraš da napustiš zonu.',
        en: 'Up to 60 minutes. When the paid time runs out you cannot pay for the Extra zone for the next 60 minutes, and you must leave the zone.',
      },
      'Red Zone': {
        sr: 'Najduže 120 minuta. Kad plaćeno vreme istekne, narednih 30 minuta ne možeš da platiš parking u Crvenoj zoni i moraš da napustiš zonu.',
        en: 'Up to 120 minutes. When the paid time runs out you cannot pay for the Red zone for the next 30 minutes, and you must leave the zone.',
      },
      'Blue Zone': {
        sr: 'Vreme nije ograničeno. Na pojedinim parkiralištima u Plavoj zoni važi i dnevna karta ({daily_amount} din, SMS na {daily_target}) — to tada piše na dodatnoj tabli.',
        en: 'No time limit. Some car parks in the Blue zone also sell a daily ticket ({daily_amount} RSD, SMS to {daily_target}); an extra sign says so where it applies.',
      },
      'White Zone': {
        sr: 'Vreme nije ograničeno. Dnevna karta važi u celoj Beloj zoni: {daily_amount} din, SMS na {daily_target}. Bela zona je plato železničke stanice i Hajduk Veljkova, od Futoške do Sajma.',
        en: 'No time limit. The daily ticket is valid across the White zone: {daily_amount} RSD, SMS to {daily_target}. The White zone is the railway station forecourt and Hajduk Veljkova, from Futoška to the fairground.',
      },
    },
    // The polygons were traced from the operator's cadastre sheet, not from the
    // rules pages checked above — so the map carries its own source and date.
    mapNote: {
      sr: 'Zone su precrtane sa zvaničnog katastarskog lista operatera (parkingns.rs, 26. 6. 2026.). Mapa pomaže da suziš izbor — tabla uvek ima poslednju reč.',
      en: 'Zones traced from the operator’s official cadastre sheet (parkingns.rs, 26 Jun 2026). The map narrows things down — the sign always has the last word.',
    },
    payMethods: [
      { sr: 'SMS na broj zone', en: 'SMS to the zone’s number' },
      { sr: 'Aplikacija nSpark', en: 'The nSpark app' },
      { sr: 'Elektronska parking kartica (ePK)', en: 'Electronic parking card (ePK)' },
    ],
    smsHowTo: {
      sr: 'Pošalji tablicu VELIKIM SLOVIMA, bez razmaka, tačno kako piše na tablici — sa Č, Ć, Ž, Š i Đ (NS123ŠČ, ne NS123SC). Posle uplate stiže SMS potvrda, a nekoliko minuta pre isteka sata stiže podsetnik.',
      en: 'Send the plate in CAPITALS, with no spaces, exactly as it is on the plate — including Č, Ć, Ž, Š and Đ (NS123ŠČ, not NS123SC). A confirmation SMS arrives after you pay, and a reminder a few minutes before the hour runs out.',
    },
    tips: [
      {
        icon: 'alert',
        text: {
          sr: 'Ekstra zona: najduže 60 minuta, pa 60 minuta ne možeš ponovo da platiš u toj zoni. Crvena: najduže 120 minuta, pa 30 minuta pauze.',
          en: 'Extra zone: 60 minutes at most, then 60 minutes before you can pay there again. Red: 120 minutes at most, then a 30-minute break.',
        },
      },
      {
        icon: 'clock',
        text: {
          sr: 'Besplatno je radnim danima posle 21 čas, subotom posle 14 i cele nedelje.',
          en: 'Free on weekdays after 21:00, on Saturdays after 14:00, and all day Sunday.',
        },
      },
      {
        icon: 'check',
        text: {
          sr: 'Sačuvaj SMS potvrdu operatera — to je tvoja karta i dokaz da si platio.',
          en: 'Keep the operator’s confirmation SMS — it is your ticket and your proof of payment.',
        },
      },
      {
        icon: 'sign',
        text: {
          sr: 'Dnevna karta važi u celoj Beloj zoni i na parkiralištima u Plavoj zoni gde to piše na dodatnoj tabli. Isplati se ako ostaješ duže.',
          en: 'The daily ticket is valid across the White zone, and at Blue-zone car parks where an extra sign says so. It pays off if you stay a while.',
        },
      },
      {
        icon: 'car',
        text: {
          sr: 'Pauk je aktivan: uklanjanje putničkog vozila je od 5.000 do 13.500 din, zavisno od mase.',
          en: 'Towing is active: removing a passenger car costs 5,000 to 13,500 RSD depending on its weight.',
        },
      },
    ],
  },
}

export const cityCopy = (id?: string | null): CityCopy | null => (id ? COPY[id] ?? null : null)

/** Fill {field} from a zone row, so the copy never restates a number the row owns. */
export const fillFromZone = (text: string, zone: Record<string, any> | null | undefined): string =>
  text.replace(/\{(\w+)\}/g, (m, k) => (zone && zone[k] != null ? String(zone[k]) : m))

/** "23. 9. 2026." in Serbian, "23 Sep 2026" in English. */
export const fmtCheckedOn = (iso: string, lang: Lang): string => {
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d.getTime())) return iso
  return lang === 'sr'
    ? `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── PARKING HOURS ─────────────────────────────────────────────────────────────
// Charging schedule + a live "free now / paid now" status.
//
// This used to assume the hours were the same across a whole city. Belgrade says
// otherwise: purple, red and white charge Mon–Sat 07–22 AND on Sunday 07–14,
// while yellow and green stop at 21:00 and are free all Sunday. Getting that
// wrong is not cosmetic — it tells someone parked in the purple zone on a Sunday
// morning that parking is free, and it is not.
//
// So a city carries a default schedule plus optional per-zone overrides, and
// every caller passes the zone it is asking about.
//
// Day index: 0 = Sunday … 6 = Saturday. A null day means parking is free all day.

export interface DayWindow { start: string; end: string } // 'HH:MM'
export interface CitySchedule {
  timezone: string
  days: Record<number, DayWindow | null>
  /** Zones whose hours differ from the city default, keyed by exact zone name. */
  zones?: Record<string, Record<number, DayWindow | null>>
}

const SCHEDULES: Record<string, CitySchedule> = {
  'novi-sad': {
    timezone: 'Europe/Belgrade',
    days: {
      1: { start: '07:00', end: '21:00' }, // Mon
      2: { start: '07:00', end: '21:00' }, // Tue
      3: { start: '07:00', end: '21:00' }, // Wed
      4: { start: '07:00', end: '21:00' }, // Thu
      5: { start: '07:00', end: '21:00' }, // Fri
      6: { start: '07:00', end: '14:00' }, // Sat
      0: null,                             // Sun — free
    },
  },
  // Thessaloniki — Mon–Fri 08:00–21:00, Sat 09:00–16:00, Sun and public holidays
  // free (thesi.gr). Note this is the first city here whose clock is not Belgrade's;
  // paidExpiry has always read the city's timezone rather than the device's, which
  // is exactly what a visitor arriving from Serbia needs.
  // Not modelled: Greek public holidays, which are free and a weekly schedule
  // cannot express — those days will read as paid when they are free.
  'thessaloniki': {
    timezone: 'Europe/Athens',
    days: {
      1: { start: '08:00', end: '21:00' },
      2: { start: '08:00', end: '21:00' },
      3: { start: '08:00', end: '21:00' },
      4: { start: '08:00', end: '21:00' },
      5: { start: '08:00', end: '21:00' },
      6: { start: '09:00', end: '16:00' },
      0: null,
    },
  },
  // Belgrade — two schedules in one city (parking-servis.co.rs). The default is
  // the yellow/green one; purple, red and white run later and charge on Sunday
  // mornings. Not modelled: streets around Klinički centar Srbije are free after
  // 17:00, which is a street-level exception a weekly schedule cannot express —
  // it will read as paid when it is free, which is the safe direction to be wrong.
  'belgrade': {
    timezone: 'Europe/Belgrade',
    days: {
      1: { start: '07:00', end: '21:00' },
      2: { start: '07:00', end: '21:00' },
      3: { start: '07:00', end: '21:00' },
      4: { start: '07:00', end: '21:00' },
      5: { start: '07:00', end: '21:00' },
      6: { start: '07:00', end: '14:00' },
      0: null,
    },
    zones: {
      'Zone A — Purple': {
        1: { start: '07:00', end: '22:00' }, 2: { start: '07:00', end: '22:00' },
        3: { start: '07:00', end: '22:00' }, 4: { start: '07:00', end: '22:00' },
        5: { start: '07:00', end: '22:00' }, 6: { start: '07:00', end: '22:00' },
        0: { start: '07:00', end: '14:00' },
      },
      'Zone 1 — Red': {
        1: { start: '07:00', end: '22:00' }, 2: { start: '07:00', end: '22:00' },
        3: { start: '07:00', end: '22:00' }, 4: { start: '07:00', end: '22:00' },
        5: { start: '07:00', end: '22:00' }, 6: { start: '07:00', end: '22:00' },
        0: { start: '07:00', end: '14:00' },
      },
      'Zone B — White': {
        1: { start: '07:00', end: '22:00' }, 2: { start: '07:00', end: '22:00' },
        3: { start: '07:00', end: '22:00' }, 4: { start: '07:00', end: '22:00' },
        5: { start: '07:00', end: '22:00' }, 6: { start: '07:00', end: '22:00' },
        0: { start: '07:00', end: '14:00' },
      },
    },
  },
  // Zrenjanin — Mon–Fri 07–21, Sat 07–15, Sun free (pijaceiparkinzizr.rs).
  // Saturday runs an hour later here than in Novi Sad or Niš. City events extend
  // street parking to 23:00, which a weekly schedule cannot express — those days
  // will read as free from 21:00 when they are not, so the sign still decides.
  // The two barrier lots (Žitni trg, Prevlaka) charge 24/7 and are not in these
  // SMS zones at all.
  'zrenjanin': {
    timezone: 'Europe/Belgrade',
    days: {
      1: { start: '07:00', end: '21:00' },
      2: { start: '07:00', end: '21:00' },
      3: { start: '07:00', end: '21:00' },
      4: { start: '07:00', end: '21:00' },
      5: { start: '07:00', end: '21:00' },
      6: { start: '07:00', end: '15:00' },
      0: null,
    },
  },
  // Niš — Mon–Fri 07–21, Sat 07–14, Sun free (nisparking.rs).
  'nis': {
    timezone: 'Europe/Belgrade',
    days: {
      1: { start: '07:00', end: '21:00' },
      2: { start: '07:00', end: '21:00' },
      3: { start: '07:00', end: '21:00' },
      4: { start: '07:00', end: '21:00' },
      5: { start: '07:00', end: '21:00' },
      6: { start: '07:00', end: '14:00' },
      0: null,
    },
  },
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ABBR_SR = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub']
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// ── CHARGEABLE-TIME MATH ──────────────────────────────────────────────────────
// An SMS buys 60 minutes OF CHARGING, not 60 minutes of wall clock. Pay at 20:47
// and only 13 minutes are spent before charging stops at 21:00 — the other 47 sit
// banked until it resumes at 07:00, so the ticket really runs to 07:47 next day.
// Everything below walks the schedule spending chargeable minutes only.
//
// All of it is timezone-correct against the city's clock, not the device's: a
// visitor whose phone is on another timezone must still get the city's answer.

/** Wall-clock parts of an instant, read in the city's timezone. */
const cityPartsAt = (ms: number, tz: string) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms))
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '0'
  return {
    day: WEEKDAY_TO_INDEX[p.find(x => x.type === 'weekday')?.value ?? 'Mon'] ?? 1,
    year: Number(get('year')),
    month: Number(get('month')),
    date: Number(get('day')),
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  }
}

/** The city's UTC offset (ms) at a given instant — reads DST off the calendar. */
const tzOffset = (ms: number, tz: string) => {
  const p = cityPartsAt(ms, tz)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.date, Math.floor(p.minutes / 60), p.minutes % 60)
  return asIfUtc - Math.floor(ms / 60_000) * 60_000
}

/** Epoch ms for a city-local wall-clock date + minutes-since-midnight. */
const epochAt = (year: number, month: number, date: number, minutes: number, tz: string) => {
  const wall = Date.UTC(year, month - 1, date, Math.floor(minutes / 60), minutes % 60)
  // Correct once with the offset near the guess, then again at the corrected
  // instant — the two differ only across a DST boundary, which is exactly the
  // case (Sat evening → Mon morning) this has to survive.
  const first = wall - tzOffset(wall, tz)
  return wall - tzOffset(first, tz)
}

const nextChargingDayFrom = (fromDay: number, s: CitySchedule) => {
  for (let i = 1; i <= 7; i++) {
    const d = (fromDay + i) % 7
    const w = s.days[d]
    if (w) return { day: d, window: w }
  }
  return null
}

/**
 * The first instant at or after `ms` when charging is actually running.
 * Already inside a window → `ms` itself; otherwise the next window's opening.
 */
export const firstChargeableAt = (ms: number, s: CitySchedule | null): number => {
  if (!s) return ms
  const tz = s.timezone
  let cursor = ms
  for (let hop = 0; hop < 16; hop++) {
    const p = cityPartsAt(cursor, tz)
    const win = s.days[p.day]
    if (win) {
      const open = toMinutes(win.start)
      const close = toMinutes(win.end)
      if (p.minutes < open) return epochAt(p.year, p.month, p.date, open, tz)
      if (p.minutes < close) return cursor
    }
    const nxt = nextChargingDayFrom(p.day, s)
    if (!nxt) return cursor
    const daysAhead = ((nxt.day - p.day + 7) % 7) || 7
    // Step from noon, not midnight: a DST shift of ±1h then can't roll the date.
    const ahead = epochAt(p.year, p.month, p.date, 12 * 60, tz) + daysAhead * 86_400_000
    const np = cityPartsAt(ahead, tz)
    cursor = epochAt(np.year, np.month, np.date, toMinutes(nxt.window.start), tz)
  }
  return cursor
}

/**
 * When a ticket bought at `startMs` for `paidMinutes` of charging really expires,
 * skipping over every free stretch (nights, Sundays) without spending it.
 */
export const paidExpiry = (startMs: number, paidMinutes: number, s: CitySchedule | null): number => {
  if (paidMinutes <= 0) return startMs
  // A city we have not charted the hours for yet must still sell an hour that
  // lasts an hour. Returning the start instant made the session expire the
  // moment it was written — the worst possible answer, since the driver is told
  // their paid parking is already over.
  if (!s) return startMs + paidMinutes * 60_000
  const tz = s.timezone
  // Milliseconds, not minutes: paying at 11:40:57 must expire at 12:40:57, and
  // rounding the walk to whole minutes silently shaved off the seconds — up to a
  // minute gone the instant the session opened.
  let remaining = paidMinutes * 60_000
  let cursor = firstChargeableAt(startMs, s)

  for (let hop = 0; hop < 16 && remaining > 0; hop++) {
    const p = cityPartsAt(cursor, tz)
    const win = s.days[p.day]
    if (!win) break // firstChargeableAt guarantees a window; belt and braces
    const closeAt = epochAt(p.year, p.month, p.date, toMinutes(win.end), tz)
    const available = closeAt - cursor
    if (available >= remaining) return cursor + remaining
    remaining -= available
    // Land exactly on closing time, then hop to the next window that opens.
    cursor = firstChargeableAt(closeAt, s)
  }
  return cursor
}

/**
 * The schedule that applies to a zone. Falls back to the city default when the
 * zone has no override — and when the zone is unknown, which keeps every existing
 * single-schedule city working unchanged.
 */
export const getSchedule = (
  cityId: string | null | undefined,
  zoneName?: string | null,
): CitySchedule | null => {
  const city = SCHEDULES[cityId ?? '']
  if (!city) return null
  const override = zoneName ? city.zones?.[zoneName] : null
  return override ? { timezone: city.timezone, days: override } : city
}

/**
 * A zone's hard cap in chargeable minutes, read off its rules text
 * ("Max 60 min" → 60). Null means no cap — keep extending.
 */
export const parseLimitMin = (rules?: string | null): number | null => {
  const m = rules?.match(/max\s+(\d+)\s*min/i)
  return m ? Number(m[1]) : null
}

export interface ParkingStatus {
  paid: boolean
  label: string   // short pill text, localized ("Free now" / "Besplatno sada")
  detail: string  // localized ("Free at 21:00" / "Besplatno od 21:00")
  // Structured fields so consumers never parse the localized strings:
  kind: 'paid' | 'before-window' | 'after-window' | 'free-today'
  at: string | null // the pivotal HH:MM (free-at time when paid, charge-start when free)
}

export interface ScheduleRow { label: string; value: string; free: boolean }

/** Weekday abbreviation in the reader's language. 0 = Sunday. */
export const dayAbbrFor = (d: number, lang: string) =>
  (lang === 'sr' ? DAY_ABBR_SR[d] : DAY_ABBR[d])

/** Charging state, stripped of language. See `describeStatus` for the words. */
export interface ZoneStatus {
  paid: boolean
  kind: 'paid' | 'before-window' | 'after-window' | 'free-today'
  at: string | null      // pivotal HH:MM — free-at when paid, charge-start when free
  nextDay: number | null // weekday `at` belongs to, when it is not today
}

/**
 * Is this schedule charging at `ms`, and what is the next thing to happen?
 *
 * Pulled out of the composable so it can answer for many zones at once. The map
 * popup asks about whichever polygon was tapped, which may be any zone in the
 * city and not the one the driver is standing in — a composable, being one call
 * per setup, cannot do that.
 */
export const statusAt = (ms: number, s: CitySchedule | null): ZoneStatus | null => {
  if (!s) return null
  const c = cityPartsAt(ms, s.timezone)
  const today = s.days[c.day]

  if (!today) {
    const nxt = nextChargingDayFrom(c.day, s)
    return { paid: false, kind: 'free-today', at: nxt?.window.start ?? null, nextDay: nxt?.day ?? null }
  }
  if (c.minutes < toMinutes(today.start))
    return { paid: false, kind: 'before-window', at: today.start, nextDay: null }
  if (c.minutes >= toMinutes(today.end)) {
    const nxt = nextChargingDayFrom(c.day, s)
    return { paid: false, kind: 'after-window', at: nxt?.window.start ?? null, nextDay: nxt?.day ?? null }
  }
  return { paid: true, kind: 'paid', at: today.end, nextDay: null }
}

/** The localized pill + line for a `ZoneStatus`. */
export const describeStatus = (
  z: ZoneStatus,
  t: (k: any, p?: Record<string, string | number>) => string,
  dayAbbr: (d: number) => string,
): { label: string; detail: string } => {
  const label = z.paid ? t('paidNowPill') : t('freeNowPill')
  if (z.kind === 'paid') return { label, detail: t('freeAt', { time: z.at! }) }
  if (z.kind === 'before-window') return { label, detail: t('chargingFrom', { time: z.at! }) }
  if (z.nextDay != null && z.at)
    return { label, detail: t('chargingResumesDay', { day: dayAbbr(z.nextDay), time: z.at }) }
  return { label, detail: z.kind === 'free-today' ? t('freeToday') : t('freeNowPill') }
}

export const useParkingHours = (
  cityId: MaybeRefOrGetter<string | null | undefined>,
  zoneName?: MaybeRefOrGetter<string | null | undefined>,
) => {
  const { lang, t } = useLang()
  const dayAbbr = (d: number) => (lang.value === 'sr' ? DAY_ABBR_SR[d] : DAY_ABBR[d])

  // Zone-aware: in Belgrade "free now" is a different answer in the purple zone
  // than in the green one, and on Sunday the two disagree completely.
  const schedule = computed<CitySchedule | null>(
    () => getSchedule(toValue(cityId), toValue(zoneName)),
  )

  // Live clock — only ticks on the client; SSR renders a single snapshot.
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    now.value = new Date()
    timer = setInterval(() => { now.value = new Date() }, 30_000)
  })
  onUnmounted(() => { if (timer) clearInterval(timer) })

  // Current weekday index + minutes-since-midnight in the city's timezone.
  const cityNow = computed(() => {
    const s = schedule.value
    if (!s) return null
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: s.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now.value)
    const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
    return { day: WEEKDAY_TO_INDEX[wd] ?? 1, minutes: hour * 60 + minute }
  })

  // Next day (and its window) on which charging starts, searching forward.
  const nextChargingDay = (fromDay: number): { day: number; window: DayWindow } | null => {
    const s = schedule.value
    if (!s) return null
    for (let i = 1; i <= 7; i++) {
      const d = (fromDay + i) % 7
      const w = s.days[d]
      if (w) return { day: d, window: w }
    }
    return null
  }

  const status = computed<ParkingStatus | null>(() => {
    const z = statusAt(now.value.getTime(), schedule.value)
    if (!z) return null
    const { label, detail } = describeStatus(z, t, dayAbbr)
    return { paid: z.paid, label, detail, kind: z.kind, at: z.at }
  })

  const paidNow = computed<boolean | null>(() => status.value?.paid ?? null)

  // When parking is free now: the next window charging opens — for night pre-pay.
  // `dayLabel` is "today" / "tomorrow" / weekday; `end` is start + 1h (one SMS hour).
  const nextWindow = computed<{ dayLabel: string; start: string; end: string } | null>(() => {
    const s = schedule.value
    const c = cityNow.value
    if (!s || !c || status.value?.paid) return null

    const today = s.days[c.day]
    let day = c.day
    let win: DayWindow | null = null
    if (today && c.minutes < toMinutes(today.start)) {
      win = today // free early morning before charging starts today
    } else {
      const nxt = nextChargingDay(c.day)
      if (nxt) { day = nxt.day; win = nxt.window }
    }
    if (!win) return null

    const dayLabel =
      day === c.day ? 'today' : day === (c.day + 1) % 7 ? 'tomorrow' : DAY_ABBR[day]
    const end = ((m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)(
      toMinutes(win.start) + 60,
    )
    return { dayLabel, start: win.start, end }
  })

  // Compact weekly summary, grouping consecutive identical days (Mon–Fri etc.).
  const summary = computed<ScheduleRow[]>(() => {
    const s = schedule.value
    if (!s) return []
    const order = [1, 2, 3, 4, 5, 6, 0] // Mon … Sun
    const valueOf = (d: number) => {
      const w = s.days[d]
      return w ? `${w.start}–${w.end}` : null // null = free all day
    }
    const rows: ScheduleRow[] = []
    let i = 0
    while (i < order.length) {
      const v = valueOf(order[i])
      let j = i
      while (j + 1 < order.length && valueOf(order[j + 1]) === v) j++
      const label =
        i === j ? dayAbbr(order[i]) : `${dayAbbr(order[i])}–${dayAbbr(order[j])}`
      rows.push({ label, value: v ?? t('free'), free: v === null })
      i = j + 1
    }
    return rows
  })

  return { schedule, status, summary, paidNow, nextWindow }
}

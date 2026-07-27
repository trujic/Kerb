// ── PARKING HOURS ─────────────────────────────────────────────────────────────
// City-wide charging schedule + a live "free now / paid now" status.
// Hours are the same across all zones in a city, so they live here rather than
// being duplicated into each zone's rules text. (Could move to a DB column once
// more cities need their own schedules.)
//
// Day index: 0 = Sunday … 6 = Saturday. A null day means parking is free all day.

export interface DayWindow { start: string; end: string } // 'HH:MM'
export interface CitySchedule {
  timezone: string
  days: Record<number, DayWindow | null>
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
  if (!s || paidMinutes <= 0) return startMs
  const tz = s.timezone
  let remaining = paidMinutes
  let cursor = firstChargeableAt(startMs, s)

  for (let hop = 0; hop < 16 && remaining > 0; hop++) {
    const p = cityPartsAt(cursor, tz)
    const win = s.days[p.day]
    if (!win) break // firstChargeableAt guarantees a window; belt and braces
    const close = toMinutes(win.end)
    const available = close - p.minutes
    if (available >= remaining) {
      return epochAt(p.year, p.month, p.date, p.minutes + remaining, tz)
    }
    remaining -= available
    // Land exactly on closing time, then hop to the next window that opens.
    cursor = firstChargeableAt(epochAt(p.year, p.month, p.date, close, tz), s)
  }
  return cursor
}

/** The schedule for a city, for callers outside the composable (session math). */
export const getSchedule = (cityId: string | null | undefined): CitySchedule | null =>
  SCHEDULES[cityId ?? ''] ?? null

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

export const useParkingHours = (cityId: MaybeRefOrGetter<string | null | undefined>) => {
  const { lang, t } = useLang()
  const dayAbbr = (d: number) => (lang.value === 'sr' ? DAY_ABBR_SR[d] : DAY_ABBR[d])

  const schedule = computed<CitySchedule | null>(
    () => SCHEDULES[toValue(cityId) ?? ''] ?? null,
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
    const s = schedule.value
    const c = cityNow.value
    if (!s || !c) return null

    const today = s.days[c.day]

    // Free all day today (e.g. Sunday)
    if (!today) {
      const nxt = nextChargingDay(c.day)
      return {
        paid: false,
        label: t('freeNowPill'),
        detail: nxt
          ? t('chargingResumesDay', { day: dayAbbr(nxt.day), time: nxt.window.start })
          : t('freeToday'),
        kind: 'free-today',
        at: nxt?.window.start ?? null,
      }
    }

    const start = toMinutes(today.start)
    const end = toMinutes(today.end)

    if (c.minutes < start) {
      return {
        paid: false,
        label: t('freeNowPill'),
        detail: t('chargingFrom', { time: today.start }),
        kind: 'before-window',
        at: today.start,
      }
    }
    if (c.minutes >= end) {
      const nxt = nextChargingDay(c.day)
      return {
        paid: false,
        label: t('freeNowPill'),
        detail: nxt
          ? t('chargingResumesDay', { day: dayAbbr(nxt.day), time: nxt.window.start })
          : t('freeNowPill'),
        kind: 'after-window',
        at: nxt?.window.start ?? null,
      }
    }
    return {
      paid: true,
      label: t('paidNowPill'),
      detail: t('freeAt', { time: today.end }),
      kind: 'paid',
      at: today.end,
    }
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

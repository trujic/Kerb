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
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export interface ParkingStatus {
  paid: boolean
  label: string   // short pill text, e.g. "Free now" / "Paid now"
  detail: string  // e.g. "Free at 21:00" / "Charging from 07:00"
}

export interface ScheduleRow { label: string; value: string }

export const useParkingHours = (cityId: MaybeRefOrGetter<string | null | undefined>) => {
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
        label: 'Free now',
        detail: nxt ? `Charging resumes ${DAY_ABBR[nxt.day]} ${nxt.window.start}` : 'Free today',
      }
    }

    const start = toMinutes(today.start)
    const end = toMinutes(today.end)

    if (c.minutes < start) {
      return { paid: false, label: 'Free now', detail: `Charging from ${today.start}` }
    }
    if (c.minutes >= end) {
      const nxt = nextChargingDay(c.day)
      return {
        paid: false,
        label: 'Free now',
        detail: nxt ? `Charging resumes ${DAY_ABBR[nxt.day]} ${nxt.window.start}` : 'Free now',
      }
    }
    return { paid: true, label: 'Paid now', detail: `Free at ${today.end}` }
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
      return w ? `${w.start}–${w.end}` : 'Free'
    }
    const rows: ScheduleRow[] = []
    let i = 0
    while (i < order.length) {
      const v = valueOf(order[i])
      let j = i
      while (j + 1 < order.length && valueOf(order[j + 1]) === v) j++
      const label =
        i === j ? DAY_ABBR[order[i]] : `${DAY_ABBR[order[i]]}–${DAY_ABBR[order[j]]}`
      rows.push({ label, value: v })
      i = j + 1
    }
    return rows
  })

  return { schedule, status, summary, paidNow, nextWindow }
}

// ── ALTERNATE SIDE PARKING · TODAY ────────────────────────────────────────────
// "Do I have to move the car, and are the meters running?" — the question a New
// Yorker answers every single morning, and the one a visitor never thinks to ask
// until the ticket is under the wiper.
//
// Two separate suspensions, and confusing them is the whole trap:
//
//   * street cleaning (ASP) is suspended on ~40 days a year
//   * the METERS are suspended on only six of them, the major legal holidays
//
// On the other thirty-something days the city writes, in the calendar entry
// itself, "Parking meters will be in effect". So a driver who hears "parking is
// suspended today" and leaves the car unpaid at a meter gets a ticket on a day
// the city did indeed suspend something — just not that.
//
// Built by scripts/build-nyc-asp.mjs from the city's own .ics. Six days of 2026
// are marked `disputed`, because the calendar table on nyc.gov lists them and the
// machine-readable file does not. On those days this composable refuses to claim
// the meters are off; see the build script for what that costs and why.

export interface AspDay {
  date: string
  holiday: string | null
  /** true = meters off too · false = meters running · null = sources disagree */
  meters_suspended: boolean | null
  source: 'ics' | 'html-table-only'
  disputed?: boolean
  note?: string | null
}

/** Cities with a suspension calendar in public/calendars. */
const WITH_CALENDAR = new Set(['new-york-city'])

export const useAspCalendar = (cityId: MaybeRefOrGetter<string | null | undefined>) => {
  const days = ref<AspDay[]>([])
  const timezone = ref('America/New_York')
  const loaded = ref(false)

  /** The date in the CITY's timezone — a driver in Belgrade asking about New York
   *  must get New York's today, and around midnight the two disagree. */
  const cityToday = computed(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone.value,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return fmt.format(new Date()) // en-CA gives YYYY-MM-DD
  })

  const load = async () => {
    const id = toValue(cityId)
    loaded.value = false
    days.value = []
    // Only ask for a calendar that exists. Probing every city produced a 404 in
    // the console on each Serbian city page — harmless, but noise in a log is
    // how a real error gets missed.
    if (!id || !import.meta.client || !WITH_CALENDAR.has(id)) return
    try {
      const res = await fetch(`/calendars/${id}-asp-2026.json`)
      if (!res.ok) return // no calendar for this city — the card simply never shows
      const data = await res.json()
      days.value = data.days ?? []
      if (data.timezone) timezone.value = data.timezone
      loaded.value = true
    } catch {
      /* offline and not cached — silence beats a wrong answer about today */
    }
  }

  watch(() => toValue(cityId), load, { immediate: true })

  const today = computed<AspDay | null>(
    () => days.value.find((d) => d.date === cityToday.value) ?? null,
  )

  /** The next suspension strictly after today, for the "what's coming" line. */
  const next = computed<AspDay | null>(
    () => days.value.find((d) => d.date > cityToday.value) ?? null,
  )

  /** Street cleaning: suspended today, or not. */
  const cleaningSuspended = computed(() => !!today.value)

  /**
   * Meters. `null` on a disputed day and on any day we have no entry for — the
   * calendar only knows about suspensions, so "no entry" means the ordinary rules
   * apply, which is `false`, while "disputed" genuinely means we do not know.
   */
  const metersSuspended = computed<boolean | null>(() => {
    if (!loaded.value) return null
    if (!today.value) return false
    return today.value.meters_suspended
  })

  const disputed = computed(() => !!today.value?.disputed)

  return {
    loaded, days, today, next,
    cleaningSuspended, metersSuspended, disputed,
    cityToday, timezone,
  }
}

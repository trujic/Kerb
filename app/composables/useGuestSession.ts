// ── GUEST SESSION ─────────────────────────────────────────────────────────────
// Device-local parking sessions for users with no account. Created only AFTER the
// user confirms they sent the SMS (the web can't verify it — confirmation_level
// stays 'self_reported'). Mirrors the logged-in ParkingSession shape so the same
// SessionCard renders it. Persisted in localStorage so it survives a reload.
//
// type 'armed' = a night pre-pay: charging is free now, the SMS applies to the next
// paid window's first hour, so the session is scheduled to start then.

export type ConfirmationLevel =
  | 'self_reported'   // web: user says they sent the SMS
  | 'composer_sent'   // native composer callback (future)
  | 'network_sent'    // direct send (future)
  | 'payment_receipt' // operator/contract receipt (future)

export interface GuestSession {
  id: string
  plate: string | null
  city_id: string | null
  zone_name: string
  zone_color: string | null
  price: string | null
  street_name: string | null
  lat: number | null
  lng: number | null
  type: 'live' | 'armed'
  confirmation_level: ConfirmationLevel
  started_at: string
  expires_at: string | null
  max_limit_min: number | null
  ended_at: string | null
}

export interface GuestPayload {
  cityId: string
  zone: { name: string; color?: string; price?: string; rules?: string }
  street?: string | null
  lat?: number | null
  lng?: number | null
  plate?: string | null
  armed?: boolean
  startsAt?: number   // ms epoch for an armed (pre-pay) session's start
}

const KEY = 'kerbo_guest_sessions'
const HOUR_MS = 3_600_000

const parseLimitMin = (rules?: string | null): number | null => {
  const m = rules?.match(/max\s+(\d+)\s*min/i)
  return m ? Number(m[1]) : null
}

export const useGuestSession = () => {
  const all = ref<GuestSession[]>([])

  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    load()
    now.value = Date.now()
    timer = setInterval(() => { now.value = Date.now() }, 1_000)
  })
  onUnmounted(() => { if (timer) clearInterval(timer) })

  const persist = () => {
    if (import.meta.client) localStorage.setItem(KEY, JSON.stringify(all.value.slice(0, 30)))
  }
  const load = () => {
    if (!import.meta.client) return
    try { all.value = JSON.parse(localStorage.getItem(KEY) || '[]') } catch { all.value = [] }
  }

  // Active = newest not-ended session whose paid window hasn't fully elapsed.
  const active = computed<GuestSession | null>(() => {
    const live = all.value
      .filter((s) => !s.ended_at)
      .filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now.value - 5 * 60_000)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    return live[0] ?? null
  })

  const history = computed(() => all.value)

  const create = (p: GuestPayload, confirmation: ConfirmationLevel = 'self_reported'): GuestSession => {
    const limit = parseLimitMin(p.zone.rules)
    const startedAt = p.armed && p.startsAt ? p.startsAt : Date.now()
    let expires = startedAt + HOUR_MS
    if (limit) expires = Math.min(expires, startedAt + limit * 60_000)

    // End any previous active session before opening a new one.
    for (const s of all.value) if (!s.ended_at) s.ended_at = new Date().toISOString()

    const session: GuestSession = {
      id: (import.meta.client && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now()),
      plate: p.plate ?? null,
      city_id: p.cityId,
      zone_name: p.zone.name,
      zone_color: p.zone.color ?? null,
      price: p.zone.price ?? null,
      street_name: p.street ?? null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      type: p.armed ? 'armed' : 'live',
      confirmation_level: confirmation,
      started_at: new Date(startedAt).toISOString(),
      expires_at: new Date(expires).toISOString(),
      max_limit_min: limit,
    }
    all.value = [session, ...all.value]
    persist()
    return session
  }

  const end = (id: string) => {
    const s = all.value.find((x) => x.id === id)
    if (s && !s.ended_at) { s.ended_at = new Date().toISOString(); all.value = [...all.value]; persist() }
  }

  const remainingMs = computed(() => {
    const a = active.value
    if (!a?.expires_at) return null
    return new Date(a.expires_at).getTime() - now.value
  })

  const atZoneLimit = computed(() => {
    const a = active.value
    if (!a?.max_limit_min || !a.expires_at) return false
    const cap = new Date(a.started_at).getTime() + a.max_limit_min * 60_000
    return new Date(a.expires_at).getTime() >= cap - 1_000
  })
  const canExtend = computed(() => !!active.value && !atZoneLimit.value && active.value!.type === 'live')

  return { all, active, history, now, load, create, end, remainingMs, atZoneLimit, canExtend }
}

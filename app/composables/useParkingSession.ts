// ── PARKING SESSION ───────────────────────────────────────────────────────────
// Logs a session each time the user pays, geotagged with street + GPS. Drives the
// active-session tracker (live countdown, zone-limit warning, find-my-car) and is
// the geotagged dataset the community layer will build on.
//
// Expiry model (per the SMS reality): 1 payment = +1 hour, capped by the zone's
// hard limit (Extra 60 min, Red 120 min; Blue/White unlimited → keep extending).

export interface ParkingSession {
  id: string
  city_id: string | null
  zone_name: string
  zone_color: string | null
  price: string | null
  street_name: string | null
  lat: number | null
  lng: number | null
  plate: string | null
  started_at: string
  expires_at: string | null
  max_limit_min: number | null
  ended_at: string | null
}

export interface PayPayload {
  cityId: string
  zone: { name: string; color?: string; price?: string; rules?: string }
  street?: string | null
  lat?: number | null
  lng?: number | null
  plate?: string | null
}

const HOUR_MS = 3_600_000

// Pull the hard time limit out of a zone's rules text ("Max 60 min" → 60).
const parseLimitMin = (rules?: string | null): number | null => {
  const m = rules?.match(/max\s+(\d+)\s*min/i)
  return m ? Number(m[1]) : null
}

export const useParkingSession = () => {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const userId = computed(() => (user.value as any)?.id ?? (user.value as any)?.sub ?? null)

  const active = ref<ParkingSession | null>(null)
  const history = ref<ParkingSession[]>([])

  // Live clock for the countdown
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => { now.value = Date.now() }, 1_000)
  })
  onUnmounted(() => { if (timer) clearInterval(timer) })

  const loadActive = async () => {
    if (!userId.value) { active.value = null; return }
    try {
      const { data } = await supabase
        .from('parking_sessions')
        .select('*')
        .eq('user_id', userId.value)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      active.value = (data as ParkingSession) ?? null
    } catch (e) {
      console.warn('[Kerb] loadActive failed (run migration-parking-sessions.sql?):', e)
    }
  }

  const loadHistory = async () => {
    if (!userId.value) { history.value = []; return }
    try {
      const { data } = await supabase
        .from('parking_sessions')
        .select('*')
        .eq('user_id', userId.value)
        .order('started_at', { ascending: false })
        .limit(20)
      history.value = (data as ParkingSession[]) ?? []
    } catch (e) {
      console.warn('[Kerb] loadHistory failed:', e)
    }
  }

  const endSession = async (id: string) => {
    try {
      await supabase
        .from('parking_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', id)
    } catch (e) {
      console.warn('[Kerb] endSession failed:', e)
    }
    if (active.value?.id === id) active.value = null
    await Promise.all([loadActive(), loadHistory()])
  }

  // Called on every pay. Extends the current session if it's the same zone,
  // otherwise starts a fresh one (ending any previous active session).
  const startOrExtend = async (p: PayPayload) => {
    if (!userId.value) return
    const limit = parseLimitMin(p.zone.rules)
    const a = active.value

    try {
      if (a && a.zone_name === p.zone.name && !a.ended_at) {
        // Extend: +1h, clamped to the zone's hard cap from the original start
        const base = a.expires_at ? new Date(a.expires_at).getTime() : now.value
        let next = base + HOUR_MS
        if (a.max_limit_min) {
          const cap = new Date(a.started_at).getTime() + a.max_limit_min * 60_000
          next = Math.min(next, cap)
        }
        await supabase
          .from('parking_sessions')
          .update({ expires_at: new Date(next).toISOString() })
          .eq('id', a.id)
      } else {
        if (a && !a.ended_at) await endSession(a.id)
        const startedAt = Date.now()
        let expires = startedAt + HOUR_MS
        if (limit) expires = Math.min(expires, startedAt + limit * 60_000)
        await supabase.from('parking_sessions').insert({
          user_id: userId.value,
          city_id: p.cityId,
          zone_name: p.zone.name,
          zone_color: p.zone.color ?? null,
          price: p.zone.price ?? null,
          street_name: p.street ?? null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          plate: p.plate ?? null,
          started_at: new Date(startedAt).toISOString(),
          expires_at: new Date(expires).toISOString(),
          max_limit_min: limit,
        })
      }
    } catch (e) {
      console.warn('[Kerb] startOrExtend failed (run migration-parking-sessions.sql?):', e)
    }
    await Promise.all([loadActive(), loadHistory()])
  }

  // ── Derived state for the UI ────────────────────────────────────────────────
  const remainingMs = computed(() => {
    const a = active.value
    if (!a?.expires_at) return null
    return new Date(a.expires_at).getTime() - now.value
  })
  const isExpired = computed(() => remainingMs.value !== null && remainingMs.value <= 0)

  // True once the session has been paid up to the zone's hard limit.
  const atZoneLimit = computed(() => {
    const a = active.value
    if (!a?.max_limit_min || !a.expires_at) return false
    const cap = new Date(a.started_at).getTime() + a.max_limit_min * 60_000
    return new Date(a.expires_at).getTime() >= cap - 1_000
  })

  const canExtend = computed(() => !!active.value && !atZoneLimit.value)

  return {
    active, history, now,
    loadActive, loadHistory, startOrExtend, endSession,
    remainingMs, isExpired, atZoneLimit, canExtend,
  }
}

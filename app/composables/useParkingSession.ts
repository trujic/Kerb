// ── PARKING SESSION ───────────────────────────────────────────────────────────
// Logs a session each time the user pays, geotagged with street + GPS. Drives the
// active-session tracker (live countdown, zone-limit warning, find-my-car) and is
// the geotagged dataset the community layer will build on.
//
// Expiry model (per the SMS reality): 1 payment = +60 minutes OF CHARGING, capped
// by the zone's hard limit in the same currency (Extra 60 min, Red 120 min;
// Blue/White unlimited → keep extending). Free stretches — nights, Sundays — are
// skipped rather than spent, so a ticket bought at 20:47 runs to 07:47 next day.
// See paidExpiry() in useParkingHours.

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
    const sched = getSchedule(p.cityId, p.zone.name)
    const a = active.value

    try {
      if (a && a.zone_name === p.zone.name && !a.ended_at) {
        // Extend: +60 chargeable minutes, clamped to the zone's hard cap — which
        // is also chargeable minutes, counted from the original start.
        const base = a.expires_at ? new Date(a.expires_at).getTime() : now.value
        let next = paidExpiry(base, 60, sched)
        if (a.max_limit_min) {
          const cap = paidExpiry(new Date(a.started_at).getTime(), a.max_limit_min, sched)
          next = Math.min(next, cap)
        }
        await supabase
          .from('parking_sessions')
          // clear reminder_sent_at so a fresh expiry reminder fires for the new time
          .update({ expires_at: new Date(next).toISOString(), reminder_sent_at: null })
          .eq('id', a.id)
      } else {
        if (a && !a.ended_at) await endSession(a.id)
        const minutes = limit ? Math.min(60, limit) : 60
        const paidAt = Date.now()
        const startedAt = firstChargeableAt(paidAt, sched)
        const expires = paidExpiry(paidAt, minutes, sched)
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

  // True once the session has been paid up to the zone's hard limit. The limit is
  // chargeable minutes, so a ticket that runs overnight has not spent them all.
  const atZoneLimit = computed(() => {
    const a = active.value
    if (!a?.max_limit_min || !a.expires_at) return false
    const cap = paidExpiry(new Date(a.started_at).getTime(), a.max_limit_min, getSchedule(a.city_id, a.zone_name))
    return new Date(a.expires_at).getTime() >= cap - 1_000
  })

  const canExtend = computed(() => !!active.value && !atZoneLimit.value)

  return {
    active, history, now,
    loadActive, loadHistory, startOrExtend, endSession,
    remainingMs, isExpired, atZoneLimit, canExtend,
  }
}

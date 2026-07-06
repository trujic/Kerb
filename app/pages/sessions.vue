<template>
  <div class="sessions-page">
    <div class="container">
      <div class="page-header">
        <div>
          <p class="section-label">Parking</p>
          <h1>Your sessions</h1>
        </div>
        <NuxtLink to="/" class="btn-ghost">← Dashboard</NuxtLink>
      </div>

      <!-- Reminders + connected devices -->
      <section v-if="pushSupported || pushError" class="reminders-wrap">
        <div class="reminders">
          <div class="rem-text">
            <p class="rem-title"><Icon name="bell" :size="14" /> Expiry reminders</p>
            <p class="rem-sub">{{ reminderSub }}</p>
          </div>
          <button
            class="rem-btn"
            :class="{ 'is-on': pushEnabled }"
            :disabled="pushBusy"
            @click="toggleReminders"
          >
            {{ pushBusy ? '…' : pushEnabled ? 'On' : 'Enable' }}
          </button>
        </div>

        <!-- Every device the reminder reaches — the sender fans out to all of them -->
        <div v-if="devices.length" class="devices">
          <p class="devices-head">Reaches {{ devices.length }} device{{ devices.length > 1 ? 's' : '' }}</p>
          <div v-for="d in devices" :key="d.endpoint" class="device">
            <span class="device-icon">{{ deviceLabel(d.user_agent).icon }}</span>
            <span class="device-name">
              {{ deviceLabel(d.user_agent).name }}
              <span v-if="d.endpoint === currentEndpoint" class="device-here">this device</span>
            </span>
            <button
              class="device-x"
              type="button"
              :aria-label="`Remove ${deviceLabel(d.user_agent).name}`"
              @click="removeDevice(d.endpoint)"
            >✕</button>
          </div>
          <p class="devices-watch">
            ⌚ Apple Watch &amp; Wear OS mirror your phone — reminders reach your wrist automatically.
          </p>
        </div>

        <!-- Cover the other form factor too -->
        <p v-if="nudge" class="devices-nudge">{{ nudge }}</p>
      </section>
      <p v-else class="rem-ios-note">
        💡 On iPhone, add Kerb to your Home Screen (Share → Add to Home Screen) to get parking reminders.
      </p>

      <!-- Active session -->
      <section v-if="active" class="active-wrap">
        <SessionCard
          :session="active"
          :remaining-ms="remainingMs"
          :at-zone-limit="atZoneLimit"
          :can-extend="canExtend"
          @extend="onExtend"
          @end="onEndSession"
          @locate="onLocateCar"
        />
      </section>

      <!-- History -->
      <section class="history">
        <p class="section-label">History</p>

        <div v-if="grouped.length" class="hist-groups">
          <div v-for="g in grouped" :key="g.label" class="hist-group">
            <p class="hist-date">{{ g.label }}</p>
            <div
              v-for="s in g.items"
              :key="s.id"
              class="hist-card"
            >
              <span class="hist-stripe" :style="{ background: s.zone_color || 'var(--text2)' }" />
              <div class="hist-body">
                <div class="hist-line">
                  <span class="hist-zone">{{ s.zone_name }}</span>
                  <span class="hist-time">{{ clock(s.started_at) }}</span>
                </div>
                <p class="hist-meta">
                  <span v-if="s.street_name">{{ s.street_name }}</span>
                  <span v-if="s.street_name && durationText(s)"> · </span>
                  <span v-if="durationText(s)">{{ durationText(s) }}</span>
                  <span v-if="s.plate"> · {{ s.plate }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="hist-empty">
          <p>No sessions yet.</p>
          <p class="hist-empty-sub">When you pay for parking from the dashboard, it shows up here.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ParkingSession } from '~/composables/useParkingSession'

const { user } = useAuth()
const { getCity } = useCity()
if (!user.value) await navigateTo('/login')

const {
  active, history,
  remainingMs, atZoneLimit, canExtend,
  loadActive, loadHistory, startOrExtend, endSession,
} = useParkingSession()

onMounted(() => { loadActive(); loadHistory() })

// ── Push reminders ──────────────────────────────────────────────────────────
const {
  supported: pushSupported, enabled: pushEnabled, busy: pushBusy, error: pushError,
  enable: enablePush, disable: disablePush,
  devices, currentEndpoint, removeDevice, deviceLabel,
} = usePushNotifications()

const toggleReminders = () => (pushEnabled.value ? disablePush() : enablePush())

const reminderSub = computed(() => {
  if (pushError.value) return pushError.value
  if (pushEnabled.value) return 'On — we’ll ping you ~10 min before your parking runs out.'
  return 'Get a heads-up ~10 min before expiry (and before the zone limit).'
})

// Nudge the user to cover the form factor they're missing, so a reminder lands
// whether they're at a laptop or out with just their phone (and watch).
const isMobile = ref(false)
onMounted(() => { isMobile.value = /android|iphone|ipad|ipod/i.test(navigator.userAgent) })
const isMobileUa = (ua?: string | null) => /iphone|ipad|android/i.test(ua || '')
const nudge = computed(() => {
  if (!pushEnabled.value) return ''
  const hasMobile = devices.value.some((d) => isMobileUa(d.user_agent))
  const hasDesktop = devices.value.some((d) => !isMobileUa(d.user_agent))
  if (isMobile.value && !hasDesktop)
    return '💻 Often at a laptop? Open Kerb there and enable reminders — it’ll buzz even while you work.'
  if (!isMobile.value && !hasMobile)
    return '📱 Add Kerb to your phone’s Home Screen and enable reminders so they reach you (and your watch) on the go.'
  return ''
})

// ── Active-session actions ──────────────────────────────────────────────────
// Extend needs the zone's shortcode + rules, which aren't on the session row —
// fetch the city once and look the zone up.
const onExtend = async () => {
  if (!active.value) return
  const city = await getCity(active.value.city_id as string)
  const zone = city?.zones?.find((z: any) => z.name === active.value!.zone_name)
  if (!zone) return
  await startOrExtend({
    cityId: active.value.city_id as string,
    zone: { name: zone.name, color: zone.color, price: zone.price, rules: zone.rules },
    street: active.value.street_name,
    lat: active.value.lat,
    lng: active.value.lng,
    plate: active.value.plate,
  })
  if (import.meta.client && zone.sms_shortcode) {
    const body = active.value.plate ? `?body=${encodeURIComponent(active.value.plate)}` : ''
    window.location.href = `sms:${zone.sms_shortcode}${body}`
  }
}

const onEndSession = () => { if (active.value) endSession(active.value.id) }

// No in-app map here — open the saved spot in the user's maps app to navigate back.
const onLocateCar = () => {
  if (!active.value?.lat || !active.value?.lng || !import.meta.client) return
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${active.value.lat},${active.value.lng}`,
    '_blank',
    'noopener',
  )
}

// ── History grouping ────────────────────────────────────────────────────────
const past = computed(() =>
  history.value.filter((s) => s.id !== active.value?.id),
)

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(); y.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

const grouped = computed(() => {
  const map = new Map<string, ParkingSession[]>()
  for (const s of past.value) {
    const k = dayLabel(s.started_at)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(s)
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
})

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

const durationText = (s: ParkingSession) => {
  const start = new Date(s.started_at).getTime()
  const end = s.ended_at
    ? new Date(s.ended_at).getTime()
    : s.expires_at ? new Date(s.expires_at).getTime() : null
  if (!end) return ''
  const min = Math.max(1, Math.round((end - start) / 60000))
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`
}

useSeoMeta({ title: 'Your parking sessions — Kerb' })
</script>

<style scoped>
.sessions-page { padding: 90px 0 80px; min-height: 70vh; }
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}
h1 { font-size: clamp(28px, 5vw, 44px); font-weight: 700; letter-spacing: -0.5px; line-height: 1.1; }
.reminders-wrap {
  margin-bottom: 24px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.reminders {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
}

/* Connected devices */
.devices {
  border-top: 1px solid var(--border);
  padding: 12px 16px 14px;
}
.devices-head {
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--muted2);
  margin-bottom: 8px;
}
.device {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.device:last-of-type { border-bottom: none; }
.device-icon { font-size: 17px; line-height: 1; flex-shrink: 0; }
.device-name { flex: 1; min-width: 0; font-size: 13px; color: var(--text2); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.device-here {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--green);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  padding: 1px 6px;
  border-radius: 20px;
}
.device-x {
  flex-shrink: 0;
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--muted2);
  background: none; border: 1px solid var(--border); border-radius: 50%;
  cursor: pointer; transition: color 150ms, border-color 150ms;
}
.device-x:hover { color: var(--red); border-color: var(--red-border); }
.devices-watch { font-size: 12px; color: var(--muted); line-height: 1.45; margin-top: 10px; }
.devices-nudge {
  padding: 11px 16px;
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
  background: var(--blue-bg);
}
.rem-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
.rem-sub { font-size: 13px; color: var(--muted); line-height: 1.45; }
.rem-btn {
  flex-shrink: 0;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--blue);
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 150ms, opacity 150ms;
}
.rem-btn.is-on { background: var(--green); }
.rem-btn:disabled { opacity: 0.6; cursor: default; }
.rem-ios-note {
  font-size: 13px;
  color: var(--muted);
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 12px 14px;
  margin-bottom: 24px;
  line-height: 1.5;
}

.active-wrap { margin-bottom: 32px; }

.history { max-width: 620px; }
.hist-group { margin-bottom: 22px; }
.hist-date {
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--muted2);
  margin-bottom: 8px;
}
.hist-card {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg);
  margin-bottom: 8px;
}
.hist-stripe { width: 4px; flex-shrink: 0; }
.hist-body { flex: 1; padding: 12px 14px; min-width: 0; }
.hist-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.hist-zone { font-size: 14px; font-weight: 600; color: var(--text); }
.hist-time { font-size: 13px; font-family: var(--font-mono); color: var(--muted); flex-shrink: 0; }
.hist-meta { font-size: 13px; color: var(--muted); margin-top: 3px; line-height: 1.4; }

.hist-empty {
  padding: 32px;
  text-align: center;
  border: 1px dashed var(--border2);
  border-radius: var(--r-lg);
  color: var(--text2);
}
.hist-empty-sub { font-size: 13px; color: var(--muted); margin-top: 6px; }
</style>

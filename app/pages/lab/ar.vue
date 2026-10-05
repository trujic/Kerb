<template>
  <div class="ar">
    <!-- The street, through the phone. Falls back to a dark ground when there is
         no camera (desktop, denied, or plain http on a phone). -->
    <video ref="videoEl" class="ar-cam" autoplay playsinline muted />
    <div v-if="camError" class="ar-nocam" />

    <!-- The zone, painted on the ground around you. Only the zone you are standing
         in: nothing is drawn where the boundaries run, so the phone's heading is
         never needed and never trusted. -->
    <div class="ar-floor" :class="`ar-floor--${state.kind}`" :style="floorStyle" aria-hidden="true">
      <div class="ar-plane" />
    </div>

    <header class="ar-top">
      <span class="ar-pill">Lab · AR-lite</span>
      <label class="ar-sim">
        <span class="sr-only">Lokacija</span>
        <select id="ar-where" v-model="where">
          <option value="real">Prava lokacija</option>
          <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </label>
      <span class="ar-pill ar-acc">{{ accText }}</span>
    </header>

    <p v-if="camError" class="ar-note">
      Kamera nije dostupna: {{ camError }}. Na telefonu otvori stranicu preko HTTPS-a.
    </p>

    <!-- The four answers, over the picture -->
    <section class="ar-card" aria-live="polite">
      <template v-if="state.kind === 'loading'">
        <p class="ar-title">Tražim gde si…</p>
      </template>

      <template v-else-if="state.kind === 'none'">
        <p class="ar-title">Ovde se ne plaća</p>
        <p class="ar-line">
          Najbliža naplata je oko {{ fmt(state.nearestM) }} odavde ({{ zoneLabel(state.nearestZone) }}).
        </p>
        <p class="ar-check">Tabla pored auta uvek ima poslednju reč.</p>
      </template>

      <template v-else-if="state.kind === 'boundary'">
        <p class="ar-title">Ovde se dodiruju dve zone</p>
        <p class="ar-line">Proveri tablu pored auta i plati po njoj:</p>
        <ul class="ar-both">
          <li v-for="a in state.answers" :key="a.name">
            <span class="ar-dot" :style="{ background: a.color }" />
            <b>{{ zoneLabel(a.name) }}</b>
            <span>{{ a.price }} · {{ a.limit }}</span>
            <span class="mono">SMS {{ a.sms }}</span>
          </li>
        </ul>
      </template>

      <template v-else>
        <p class="ar-status" :class="{ paid: state.answer.paid }">
          <span class="ar-status-dot" />{{ state.answer.status }}
        </p>
        <dl class="ar-four">
          <dt>Koliko</dt><dd>{{ state.answer.price }}</dd>
          <dt>Koliko dugo</dt><dd>{{ state.answer.limit }}</dd>
          <dt>Kako</dt><dd>SMS sa tablicom na <b class="mono">{{ state.answer.sms }}</b></dd>
          <dt>Ako ne platiš</dt><dd>{{ unpaid }}</dd>
        </dl>
        <p class="ar-check">
          <span class="ar-dot" :style="{ background: state.answer.color }" />
          Tabla pored auta: <b>{{ zoneLabel(state.answer.name) }}</b>
          <template v-if="state.kind === 'edge'"> · ti si na ivici zone, tabla odlučuje</template>
        </p>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
// Dev-only lab page: AR-lite. The camera shows the street; the ground around the
// driver is tinted with the zone they are standing in; the four answers sit over
// the picture. Same confidence rules as the dashboard card: a sure zone is
// painted solid, an edge is painted with a caveat, a boundary is painted in both
// colours and asks for the sign, and no paid parking paints nothing.
if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

useHead({ title: 'AR-lite · Kerb lab', meta: [{ name: 'robots', content: 'noindex' }] })

const { t, lang, zoneLabel } = useLang()
const { getCity } = useCity()
const CITY = 'novi-sad'

// Points from the Novi Sad geometry, so the page can be tried away from the street.
const PRESETS = [
  { id: 'blue', label: 'Sim: duboko u Plavoj', lat: 45.242885, lng: 19.841911 },
  { id: 'red', label: 'Sim: Crvena zona', lat: 45.259734, lng: 19.843937 },
  { id: 'extra', label: 'Sim: Ekstra zona', lat: 45.255317, lng: 19.849317 },
  { id: 'border', label: 'Sim: granica Plava/Crvena', lat: 45.254951, lng: 19.854044 },
  { id: 'none', label: 'Sim: Trg slobode (bez naplate)', lat: 45.2551, lng: 19.8452 },
]
const where = ref<string>('real')

// ── camera ──
const videoEl = ref<HTMLVideoElement | null>(null)
const camError = ref<string | null>(null)
let stream: MediaStream | null = null
onMounted(async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('browser ne daje kameru')
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    if (videoEl.value) videoEl.value.srcObject = stream
  } catch (e: any) {
    camError.value = e?.name === 'NotAllowedError' ? 'dozvola nije data' : e?.message ?? 'nepoznato'
  }
})
onUnmounted(() => stream?.getTracks().forEach((tr) => tr.stop()))

// ── position ──
const real = ref<{ lat: number; lng: number; accuracy: number } | null>(null)
let watchId: number | null = null
onMounted(() => {
  if (!navigator.geolocation) return
  watchId = navigator.geolocation.watchPosition(
    (p) => (real.value = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    () => {},
    { enableHighAccuracy: true, maximumAge: 2000 },
  )
})
onUnmounted(() => watchId !== null && navigator.geolocation.clearWatch(watchId))
const coords = computed(() => {
  if (where.value === 'real') return real.value
  const p = PRESETS.find((x) => x.id === where.value)
  return p ? { lat: p.lat, lng: p.lng, accuracy: 12 } : null
})
const accText = computed(() => (coords.value ? `GPS ±${Math.round(coords.value.accuracy)} m` : 'čekam GPS…'))

// ── zones ──
const geojson = ref<any>(null)
const zones = ref<any[]>([])
onMounted(async () => {
  const [geo, city] = await Promise.all([
    fetch(`/zones/${CITY}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getCity(CITY).catch(() => null),
  ])
  geojson.value = geo
  zones.value = city?.zones ?? []
})
const { nearest, zoneDistances } = useNearestParking(coords, geojson)

const copy = cityCopy(CITY)
const unpaid = computed(() => copy?.ifUnpaid[lang.value] ?? '')
const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(5, Math.round(m / 5) * 5)} m`)

const answerFor = (name: string) => {
  const z = zones.value.find((r: any) => r.name === name)
  const st = statusAt(Date.now(), getSchedule(CITY, name))
  const desc = st ? describeStatus(st, t, (d: number) => dayAbbrFor(d, lang.value)) : null
  const max = z ? maxStayFor(z) : null
  return {
    name,
    color: z?.color ?? '#8A93A1',
    paid: !!st?.paid,
    status: desc ? `${st?.paid ? 'Sada se plaća' : 'Sada je besplatno'} · ${desc.detail}` : '',
    price: z?.price ?? '?',
    limit: max ? `Najviše ${max} min` : 'Bez ograničenja',
    sms: z?.sms_shortcode ?? '—',
  }
}

// Same thresholds as the dashboard (app/pages/index.vue): inside with more than
// 5 m to the line is sure; a second zone within the GPS error, or level with the
// first, is a boundary; nothing within 75 m is "not paid here".
const INSIDE_MARGIN_M = 5
const BOUNDARY_FLOOR_M = 10
type State =
  | { kind: 'loading' }
  | { kind: 'none'; nearestM: number; nearestZone: string }
  | { kind: 'boundary'; answers: ReturnType<typeof answerFor>[] }
  | { kind: 'sure' | 'edge'; answer: ReturnType<typeof answerFor> }
const state = computed<State>(() => {
  const c = coords.value
  const ds = zoneDistances.value
  if (!c || !geojson.value || !zones.value.length || !ds.length || !nearest.value) return { kind: 'loading' }
  const n = ds[0]!
  if (n.distanceM > 75) return { kind: 'none', nearestM: n.distanceM, nearestZone: n.zoneName }
  const margin = Math.max(c.accuracy ?? 0, BOUNDARY_FLOOR_M)
  const tied = ds.filter((d) => d.distanceM <= margin || d.distanceM - n.distanceM <= BOUNDARY_FLOOR_M)
  if (tied.length >= 2) return { kind: 'boundary', answers: tied.slice(0, 3).map((d) => answerFor(d.zoneName)) }
  const sure = n.inside && n.edgeM > INSIDE_MARGIN_M
  return { kind: sure ? 'sure' : 'edge', answer: answerFor(n.zoneName) }
})

const floorStyle = computed(() => {
  const s = state.value
  if (s.kind === 'sure' || s.kind === 'edge') return { '--c1': s.answer.color, '--c2': s.answer.color }
  if (s.kind === 'boundary') return { '--c1': s.answers[0]!.color, '--c2': s.answers[1]!.color }
  return {}
})
</script>

<style scoped>
.ar {
  /* Over the site nav and tab bar: this page is the camera, edge to edge. */
  position: fixed;
  inset: 0;
  z-index: 3000;
  overflow: hidden;
  background: #0E1013;
  color: var(--text);
  font-family: var(--font-body);
}
.ar-cam,
.ar-nocam {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ar-nocam {
  background: linear-gradient(180deg, #2A2F37 0%, #4A505B 55%, #6B7280 100%);
}

/* The painted ground: a plane tipped back toward the horizon, fading out before
   it reaches it, so it reads as the road around the driver, not a coloured box. */
.ar-floor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 62%;
  perspective: 420px;
  perspective-origin: 50% 0%;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to top, #000 45%, transparent 100%);
  mask-image: linear-gradient(to top, #000 45%, transparent 100%);
}
.ar-plane {
  position: absolute;
  left: -40%;
  right: -40%;
  top: 0;
  bottom: -30%;
  transform: rotateX(58deg);
  transform-origin: 50% 0%;
  opacity: 0;
  transition: opacity 250ms var(--ease-out);
}
.ar-floor--sure .ar-plane {
  opacity: 0.55;
  background:
    repeating-linear-gradient(90deg, transparent 0 46px, rgba(255, 255, 255, 0.28) 46px 50px),
    var(--c1);
}
/* At an edge: the zone, but thinner and dashed — present, not certain. */
.ar-floor--edge .ar-plane {
  opacity: 0.4;
  background:
    repeating-linear-gradient(0deg, transparent 0 22px, rgba(255, 255, 255, 0.35) 22px 26px),
    var(--c1);
}
/* Two zones meet: both colours, in stripes, so neither reads as the answer. */
.ar-floor--boundary .ar-plane {
  opacity: 0.55;
  background: repeating-linear-gradient(45deg, var(--c1) 0 34px, var(--c2) 34px 68px);
}

.ar-top {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 12px;
  right: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ar-pill,
.ar-sim select {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
}
.ar-sim select {
  font-family: inherit;
}
.ar-acc {
  margin-left: auto;
  font-family: var(--font-mono);
}
.ar-note {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 56px);
  left: 12px;
  right: 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: var(--r-md);
}

.ar-card {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  display: grid;
  gap: 10px;
}
.ar-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}
.ar-line {
  font-size: 15px;
  color: var(--text2);
}
.ar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  color: var(--green);
}
.ar-status.paid {
  color: var(--amber);
}
.ar-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
}
.ar-four {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  font-size: 15px;
}
.ar-four dt {
  color: var(--muted);
}
.ar-four dd {
  font-weight: 600;
}
.ar-check {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 8px;
  font-size: 14px;
  color: var(--text2);
  border-top: 1px solid var(--border);
}
.ar-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ar-both {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 8px;
}
.ar-both li {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
@media (prefers-reduced-motion: reduce) {
  .ar-plane { transition: none; }
}
</style>

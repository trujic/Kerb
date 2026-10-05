<template>
  <div class="ar">
    <!-- The street, through the phone. Falls back to a dark ground when there is
         no camera (desktop, denied, or plain http on a phone). -->
    <video ref="videoEl" class="ar-cam" autoplay playsinline muted />
    <div v-if="camError" class="ar-nocam" />

    <!-- The zone, painted on the ground around you. Only the zone you are standing
         in: nothing is drawn where the boundaries run, so the phone's heading is
         never needed and never trusted. Flat SVG, not a 3D transform: Safari drops
         a 3D plane that reaches behind the camera, and this one would. -->
    <svg
      class="ar-floor"
      :class="`ar-floor--${state.kind}`"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ar-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.3" stop-color="#fff" stop-opacity="0.85" />
          <stop offset="1" stop-color="#fff" stop-opacity="1" />
        </linearGradient>
        <mask id="ar-mask" maskUnits="userSpaceOnUse" x="-50" y="0" width="200" height="100">
          <rect x="-50" width="200" height="100" fill="url(#ar-fade)" />
        </mask>
        <pattern id="ar-stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="5" height="10" :fill="paint.c1" />
          <rect x="5" width="5" height="10" :fill="paint.c2" />
        </pattern>
      </defs>
      <g v-if="paint.on" mask="url(#ar-mask)">
        <polygon class="ar-ground" points="28,0 72,0 140,100 -40,100" :fill="paint.fill" />
        <!-- Bays across the ground, closer together toward the horizon: it reads
             as the road you stand on, not a coloured box over the picture. -->
        <g class="ar-bays">
          <line v-for="y in [6, 14, 25, 40, 61, 90]" :key="y" x1="-50" :y1="y" x2="150" :y2="y" />
        </g>
        <g class="ar-rims">
          <line x1="28" y1="0" x2="-40" y2="100" />
          <line x1="72" y1="0" x2="140" y2="100" />
        </g>
      </g>
    </svg>

    <p class="ar-tag" :class="`ar-tag--${state.kind}`">
      <span v-if="paint.on" class="ar-dot" :style="{ background: paint.c1 }" />
      <span v-if="state.kind === 'boundary'" class="ar-dot" :style="{ background: paint.c2 }" />
      {{ tagText }}
    </p>

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
      Kamera nije dostupna: {{ camError }}. Dozvoli kameru za ovu stranicu u podešavanjima browsera.
    </p>

    <!-- The four answers, over the picture, short enough to leave the ground visible -->
    <section class="ar-card" aria-live="polite">
      <template v-if="state.kind === 'nogeo'">
        <p class="ar-title">Lokacija nije dozvoljena</p>
        <p class="ar-line">Dozvoli lokaciju za ovu stranicu u podešavanjima browsera, ili izaberi simulaciju gore.</p>
      </template>

      <template v-else-if="state.kind === 'loading'">
        <p class="ar-title">Tražim gde si…</p>
        <p class="ar-line">Prvi GPS signal ume da potraje i pola minuta; napolju stiže brže.</p>
      </template>

      <template v-else-if="state.kind === 'away'">
        <p class="ar-title">Nisi u Novom Sadu</p>
        <p class="ar-line">
          AR za sada zna samo zone Novog Sada (najbliža je {{ fmt(state.nearestM) }} odavde). Izaberi
          simulaciju gore da vidiš kako izgleda u zoni.
        </p>
      </template>

      <template v-else-if="state.kind === 'none'">
        <p class="ar-title">Ovde se ne plaća</p>
        <p class="ar-line">
          Nisi u zoni naplate, zato put nije obojen. Najbliža naplata je oko {{ fmt(state.nearestM) }}
          odavde ({{ zoneLabel(state.nearestZone) }}).
        </p>
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
        <ul class="ar-facts">
          <li class="ar-price">{{ state.answer.price }}</li>
          <li>{{ state.answer.limit }}</li>
          <li>SMS tablica → <b class="mono">{{ state.answer.sms }}</b></li>
        </ul>
        <p class="ar-foot">Ako ne platiš: {{ unpaid }}</p>
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
// Lab page, behind runtimeConfig.public.labPages: AR-lite. The camera shows the
// street; the ground around the driver is tinted with the zone they are standing
// in; the four answers sit over the picture. Same confidence rules as the
// dashboard card: a sure zone is painted solid, an edge is painted with a caveat,
// a boundary is painted in both colours and asks for the sign, and no paid
// parking paints nothing (and says why).
if (!useRuntimeConfig().public.labPages) throw createError({ statusCode: 404, statusMessage: 'Not found' })

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
    const v = videoEl.value
    if (v) {
      v.srcObject = stream
      // iOS does not always honour autoplay on a stream set after render.
      await v.play().catch(() => {})
    }
  } catch (e: any) {
    camError.value = e?.name === 'NotAllowedError' ? 'dozvola nije data' : e?.message ?? 'nepoznato'
  }
})
onUnmounted(() => stream?.getTracks().forEach((tr) => tr.stop()))

// ── position ──
const real = ref<{ lat: number; lng: number; accuracy: number } | null>(null)
const geoDenied = ref(false)
let watchId: number | null = null
onMounted(() => {
  if (!navigator.geolocation) return void (geoDenied.value = true)
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      geoDenied.value = false
      real.value = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
    },
    (e) => {
      if (e.code === e.PERMISSION_DENIED) geoDenied.value = true
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
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
// first, is a boundary; nothing within 75 m is "not paid here". Past 20 km the
// driver is simply in another city.
const INSIDE_MARGIN_M = 5
const BOUNDARY_FLOOR_M = 10
const AWAY_M = 20_000
type State =
  | { kind: 'nogeo' | 'loading' }
  | { kind: 'away' | 'none'; nearestM: number; nearestZone: string }
  | { kind: 'boundary'; answers: ReturnType<typeof answerFor>[] }
  | { kind: 'sure' | 'edge'; answer: ReturnType<typeof answerFor> }
const state = computed<State>(() => {
  const c = coords.value
  if (!c && where.value === 'real' && geoDenied.value) return { kind: 'nogeo' }
  const ds = zoneDistances.value
  if (!c || !geojson.value || !zones.value.length || !ds.length || !nearest.value) return { kind: 'loading' }
  const n = ds[0]!
  if (n.distanceM > AWAY_M) return { kind: 'away', nearestM: n.distanceM, nearestZone: n.zoneName }
  if (n.distanceM > 75) return { kind: 'none', nearestM: n.distanceM, nearestZone: n.zoneName }
  const margin = Math.max(c.accuracy ?? 0, BOUNDARY_FLOOR_M)
  const tied = ds.filter((d) => d.distanceM <= margin || d.distanceM - n.distanceM <= BOUNDARY_FLOOR_M)
  if (tied.length >= 2) return { kind: 'boundary', answers: tied.slice(0, 3).map((d) => answerFor(d.zoneName)) }
  const sure = n.inside && n.edgeM > INSIDE_MARGIN_M
  return { kind: sure ? 'sure' : 'edge', answer: answerFor(n.zoneName) }
})

const paint = computed(() => {
  const s = state.value
  if (s.kind === 'sure' || s.kind === 'edge')
    return { on: true, c1: s.answer.color, c2: s.answer.color, fill: s.answer.color }
  if (s.kind === 'boundary')
    return { on: true, c1: s.answers[0]!.color, c2: s.answers[1]!.color, fill: 'url(#ar-stripes)' }
  return { on: false, c1: 'transparent', c2: 'transparent', fill: 'none' }
})

// The words on the ground itself, so the state reads even when the paint is faint
// against a busy street.
const tagText = computed(() => {
  const s = state.value
  switch (s.kind) {
    case 'sure': return `${zoneLabel(s.answer.name)} oko tebe`
    case 'edge': return `${zoneLabel(s.answer.name)} · na ivici`
    case 'boundary': return `Granica: ${s.answers.map((a) => zoneLabel(a.name)).join(' / ')}`
    case 'none': return 'Ovde nema zone naplate'
    case 'away': return 'Van Novog Sada'
    case 'nogeo': return 'Nema lokacije'
    default: return 'Tražim gde si…'
  }
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

/* The painted ground: from a horizon a little above the middle down to the
   bottom edge. The card covers the nearest part, so the colour has to be strong
   enough in the band between the horizon and the card. */
.ar-floor {
  position: absolute;
  left: 0;
  top: 40%;
  width: 100%;
  height: 60%;
  pointer-events: none;
  overflow: visible;
}
.ar-ground {
  transition: fill-opacity 250ms var(--ease-out);
}
.ar-floor--sure .ar-ground,
.ar-floor--boundary .ar-ground {
  fill-opacity: 0.68;
}
/* At an edge: the zone, but lighter and with dashed rims, present, not certain. */
.ar-floor--edge .ar-ground {
  fill-opacity: 0.45;
}
.ar-bays line,
.ar-rims line {
  stroke: #fff;
  vector-effect: non-scaling-stroke;
}
.ar-bays line {
  stroke-width: 2;
  stroke-opacity: 0.35;
}
.ar-floor--boundary .ar-bays {
  display: none;
}
.ar-rims line {
  stroke-width: 4;
  stroke-opacity: 0.9;
}
.ar-floor--edge .ar-rims line {
  stroke-dasharray: 14 10;
}

/* The words on the ground */
.ar-tag {
  position: absolute;
  top: 46%;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 32px);
  padding: 8px 16px;
  font-size: 17px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--text);
  background: rgba(255, 255, 255, 0.94);
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
}
.ar-tag--none,
.ar-tag--away,
.ar-tag--nogeo,
.ar-tag--loading {
  font-weight: 600;
  color: var(--text2);
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
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  display: grid;
  gap: 8px;
}
.ar-title {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.25;
}
.ar-line {
  font-size: 15px;
  line-height: 1.4;
  color: var(--text2);
}
.ar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
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
.ar-facts {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  font-size: 15px;
  font-weight: 600;
}
.ar-price {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ar-foot {
  font-size: 13px;
  color: var(--text2);
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
  .ar-ground { transition: none; }
}
</style>

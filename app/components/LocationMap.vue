<template>
  <div class="location-map-root" :style="rootStyle">
    <div ref="mapEl" class="location-map" @click="onMapTap" />
    <button
      v-if="interactive && !follow"
      class="lm-recenter"
      type="button"
      aria-label="Recenter on my location"
      @click="recenter"
    >◎</button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  lat: number
  lng: number
  accuracy?: number
  heading?: number | null
  height?: number
  zones?: any // GeoJSON FeatureCollection
  interactive?: boolean // enable pan/zoom (fullscreen mode)
  fill?: boolean        // fill parent height instead of fixed px
  highlight?: { lat: number; lng: number } | null // nearest-parking point to point at
  signs?: { lat: number; lng: number; zone_color?: string | null; zone_name?: string }[] // confirmed sign scans
}>()

const emit = defineEmits<{ compassTap: [] }>()

// When interactive, the map follows the user until they drag; then a
// recenter button re-arms follow. Non-interactive maps always follow.
const follow = ref(true)

const rootStyle = computed(() => ({
  height: props.fill ? '100%' : `${props.height ?? 200}px`,
}))

const mapEl      = ref<HTMLElement | null>(null)
const mapRef     = shallowRef<any>(null)
const markerRef  = shallowRef<any>(null)
const circleRef  = shallowRef<any>(null)
const LRef       = shallowRef<any>(null)
const zoneLayers = shallowRef<any[]>([])

const CONE_SVG = `
  <svg class="lm-heading" width="60" height="60" viewBox="0 0 60 60"
    style="opacity:0;transition:opacity 0.3s,transform 0.15s linear;transform-origin:30px 30px;position:absolute;top:0;left:0;pointer-events:none">
    <path d="M 30 30 L 21 6 A 26 26 0 0 1 39 6 Z" fill="rgba(37,99,235,0.38)" />
  </svg>
`

// Tap recenters the compass only on the locked preview; in interactive
// mode taps are drags, so don't hijack them.
const onMapTap = () => { if (!props.interactive) emit('compassTap') }

const recenter = () => {
  if (!mapRef.value || !markerRef.value) return
  follow.value = true
  mapRef.value.setView(markerRef.value.getLatLng(), mapRef.value.getZoom(), { animate: true })
}

// ── Live position ─────────────────────────────────────────────────────────────
watchEffect(() => {
  const lat = props.lat
  const lng = props.lng
  const acc = props.accuracy
  if (!markerRef.value || !mapRef.value) return
  const ll: [number, number] = [lat, lng]
  markerRef.value.setLatLng(ll)
  if (follow.value) mapRef.value.panTo(ll, { animate: true, duration: 0.5 })
  if (circleRef.value) {
    circleRef.value.setLatLng(ll)
    if (acc) circleRef.value.setRadius(acc)
  }
})

// ── Compass heading ───────────────────────────────────────────────────────────
watchEffect(() => {
  const h = props.heading
  const svg = mapEl.value?.querySelector('.lm-heading') as SVGElement | null
  if (!svg) return
  if (h !== null && h !== undefined) {
    svg.style.opacity = '1'
    svg.style.transform = `rotate(${h}deg)`
  } else {
    svg.style.opacity = '0'
  }
})

// ── Zone overlays — watchEffect re-runs whenever zones, map, or L change ──────
// Renders both filled area Polygons and colored street LineStrings. The Novi Sad
// data is per-street lines (each parking street drawn in its zone color).
const toLatLngs = (coords: [number, number][]) =>
  coords.map(([lng, lat]) => [lat, lng] as [number, number])

watchEffect((onCleanup) => {
  const zones = props.zones
  const map   = mapRef.value
  const L     = LRef.value
  if (!L || !map || !zones?.features?.length) return

  const layers: any[] = []
  for (const feature of zones.features) {
    const g = feature.geometry
    if (!g) continue
    const color = (feature.properties?.color ?? '#3B82F6').trim()
    const name  = feature.properties?.name ?? ''

    let layer: any = null
    if (g.type === 'Polygon') {
      if (g.coordinates[0].length < 3) continue
      layer = L.polygon(toLatLngs(g.coordinates[0]), {
        color, fillColor: color, fillOpacity: 0.13, weight: 2, opacity: 0.55,
      })
    } else if (g.type === 'LineString') {
      layer = L.polyline(toLatLngs(g.coordinates), {
        color, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round',
      })
    } else if (g.type === 'MultiLineString') {
      layer = L.polyline(g.coordinates.map(toLatLngs), {
        color, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round',
      })
    }
    if (!layer) continue

    layer.addTo(map)
    if (name) layer.bindTooltip(name, { sticky: true, className: 'zone-tooltip' })
    layers.push(layer)
  }

  onCleanup(() => {
    for (const layer of layers) { try { map.removeLayer(layer) } catch {} }
  })
})

// ── Nearest-parking pointer — dashed connector from the user to the target ────
watchEffect((onCleanup) => {
  const h   = props.highlight
  const map = mapRef.value
  const L   = LRef.value
  if (!L || !map || !h) return

  const line = L.polyline(
    [[props.lat, props.lng], [h.lat, h.lng]],
    { color: '#111827', weight: 2, opacity: 0.55, dashArray: '3 6', interactive: false },
  ).addTo(map)
  const dot = L.circleMarker([h.lat, h.lng], {
    radius: 6, color: '#111827', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false,
  }).addTo(map)

  onCleanup(() => {
    try { map.removeLayer(line); map.removeLayer(dot) } catch {}
  })
})

// ── Confirmed sign scans — verified community pins (✓ in the zone colour) ──────
watchEffect((onCleanup) => {
  const signs = props.signs
  const map   = mapRef.value
  const L     = LRef.value
  if (!L || !map || !signs?.length) return

  const markers: any[] = []
  for (const s of signs) {
    if (s.lat == null || s.lng == null) continue
    const color = (s.zone_color ?? '#2563EB').trim()
    const icon = L.divIcon({
      className: '',
      html: `<div class="lm-sign" style="--sign:${color}">🪧</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    })
    const m = L.marker([s.lat, s.lng], { icon, interactive: true }).addTo(map)
    if (s.zone_name) m.bindTooltip(`✓ ${s.zone_name}`, { direction: 'top', className: 'zone-tooltip' })
    markers.push(m)
  }

  onCleanup(() => {
    for (const m of markers) { try { map.removeLayer(m) } catch {} }
  })
})

onMounted(async () => {
  if (!mapEl.value) return

  await import('leaflet/dist/leaflet.css')
  const L = (await import('leaflet')).default
  LRef.value = L

  const i = props.interactive ?? false
  const map = L.map(mapEl.value, {
    center: [props.lat, props.lng],
    zoom: 17,
    zoomControl: i,
    attributionControl: i,
    dragging: i,
    scrollWheelZoom: i,
    doubleClickZoom: i,
    touchZoom: i,
    keyboard: i,
  })

  // Once the user pans/zooms an interactive map, stop auto-following GPS
  // so we don't yank them back on the next position update.
  if (i) {
    map.on('dragstart', () => { follow.value = false })
    // Container is freshly shown (e.g. fullscreen overlay) — ensure Leaflet
    // measures the real size after layout.
    requestAnimationFrame(() => map.invalidateSize())
  }

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(map)

  if (props.accuracy && props.accuracy < 500) {
    circleRef.value = L.circle([props.lat, props.lng], {
      radius: props.accuracy,
      color: '#2563EB',
      fillColor: '#2563EB',
      fillOpacity: 0.08,
      weight: 1,
      opacity: 0.3,
    }).addTo(map)
  }

  const icon = L.divIcon({
    className: '',
    html: `<div class="lm-dot">${CONE_SVG}<div class="lm-pulse"></div><div class="lm-inner"></div></div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  })

  markerRef.value = L.marker([props.lat, props.lng], { icon }).addTo(map)
  mapRef.value    = map  // triggers zone watcher if zones already loaded

  onUnmounted(() => {
    map.remove()
    mapRef.value    = null
    markerRef.value = null
    circleRef.value = null
    LRef.value      = null
    zoneLayers.value = []
  })
})
</script>

<style>
.zone-tooltip {
  background: rgba(255,255,255,0.92);
  border: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #374151;
  padding: 4px 8px;
  border-radius: 6px;
}
.zone-tooltip::before { display: none; }
.lm-sign {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  background: #fff;
  border: 2px solid var(--sign, #2563EB);
  border-radius: 50%;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
}
.lm-dot {
  position: relative;
  width: 60px;
  height: 60px;
}
.lm-inner {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 16px; height: 16px;
  background: #2563EB;
  border: 2.5px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(37,99,235,0.55);
  z-index: 2;
}
.lm-pulse {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) scale(0.4);
  width: 40px; height: 40px;
  background: rgba(37, 99, 235, 0.2);
  border-radius: 50%;
  animation: lm-pulse 2s ease-out infinite;
  z-index: 1;
}
@keyframes lm-pulse {
  0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
}
</style>

<style scoped>
.location-map-root {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.location-map {
  width: 100%;
  height: 100%;
}
.lm-recenter {
  position: absolute;
  bottom: 14px;
  right: 14px;
  z-index: 1000;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  background: rgba(255, 255, 255, 0.95);
  color: #2563EB;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(6px);
  cursor: pointer;
}
.lm-recenter:active { transform: scale(0.94); }
</style>

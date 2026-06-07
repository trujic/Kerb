<template>
  <div ref="mapEl" class="location-map" @click="onMapTap" />
</template>

<script setup lang="ts">
const props = defineProps<{
  lat: number
  lng: number
  accuracy?: number
  heading?: number | null
  height?: number
  zones?: any // GeoJSON FeatureCollection
}>()

const emit = defineEmits<{ compassTap: [] }>()

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

const onMapTap = () => emit('compassTap')

// ── Live position ─────────────────────────────────────────────────────────────
watchEffect(() => {
  const lat = props.lat
  const lng = props.lng
  const acc = props.accuracy
  if (!markerRef.value || !mapRef.value) return
  const ll: [number, number] = [lat, lng]
  markerRef.value.setLatLng(ll)
  mapRef.value.panTo(ll, { animate: true, duration: 0.5 })
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
watchEffect((onCleanup) => {
  const zones = props.zones
  const map   = mapRef.value
  const L     = LRef.value
  if (!L || !map || !zones?.features?.length) return

  const layers: any[] = []
  for (const feature of zones.features) {
    if (feature.geometry?.type !== 'Polygon') continue
    if (feature.geometry.coordinates[0].length < 3) continue
    const color = (feature.properties?.color ?? '#3B82F6').trim()
    const name  = feature.properties?.name ?? ''
    const latlngs = feature.geometry.coordinates[0]
      .map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
    const layer = L.polygon(latlngs, {
      color,
      fillColor: color,
      fillOpacity: 0.13,
      weight: 2,
      opacity: 0.55,
    }).addTo(map)
    if (name) layer.bindTooltip(name, { sticky: true, className: 'zone-tooltip' })
    layers.push(layer)
  }

  onCleanup(() => {
    for (const layer of layers) { try { map.removeLayer(layer) } catch {} }
  })
})

onMounted(async () => {
  if (!mapEl.value) return

  await import('leaflet/dist/leaflet.css')
  const L = (await import('leaflet')).default
  LRef.value = L

  const map = L.map(mapEl.value, {
    center: [props.lat, props.lng],
    zoom: 17,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
  })

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
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
.location-map {
  width: 100%;
  height: v-bind('`${props.height ?? 200}px`');
  overflow: hidden;
}
</style>

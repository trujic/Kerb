<template>
  <div class="location-map-root" :style="rootStyle">
    <div ref="mapEl" class="location-map" @click="onMapTap" />
    <button
      v-if="compassPrompt"
      class="lm-compass"
      type="button"
      @click.stop="$emit('enableCompass')"
    ><Icon name="compass" :size="14" /> Enable compass</button>
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
  signs?: {
    lat: number; lng: number
    zone_color?: string | null; zone_name?: string; price?: string | null
    heading?: number | null; created_at?: string; photo_url?: string | null
  }[] // confirmed sign scans
  compassPrompt?: boolean // show a one-tap "Enable compass" chip (iOS first-time)
  hideUser?: boolean      // static city-overview map: no user marker, fit to zones
  labels?: boolean        // show permanent street/zone labels (e.g. on the locked preview)
}>()

const emit = defineEmits<{ compassTap: []; enableCompass: [] }>()

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

// Bounding box [[minLat,minLng],[maxLat,maxLng]] over all zone geometry, for fit.
const zoneBounds = (zones: any): [[number, number], [number, number]] | null => {
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180, seen = false
  const visit = (c: [number, number]) => {
    seen = true
    minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0])
    minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1])
  }
  for (const f of zones?.features ?? []) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') g.coordinates[0]?.forEach(visit)
    else if (g.type === 'LineString') g.coordinates.forEach(visit)
    else if (g.type === 'MultiLineString') g.coordinates.forEach((l: any) => l.forEach(visit))
  }
  return seen ? [[minLat, minLng], [maxLat, maxLng]] : null
}

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
    if (name) {
      // Permanent street/zone labels on explore maps (revealed when zoomed in, see
      // lm-labels) and on the labelled preview. Plain previews keep the hover tooltip.
      layer.bindTooltip(name, (props.interactive || props.labels)
        ? { permanent: true, direction: 'center', className: 'zone-label' }
        : { sticky: true, className: 'zone-tooltip' })
    }
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

// Relative "last confirmed" age, e.g. "today", "yesterday", "5 days ago".
const relAge = (iso?: string): string => {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} wk ago`
  return `${Math.floor(days / 30)} mo ago`
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// ── Confirmed sign scans — verified community pins (✓ in the zone colour) ──────
// Each pin carries a heading arrow (the way the sign faced when scanned) and a
// popup with zone, price, the photo, and how recently it was confirmed.
watchEffect((onCleanup) => {
  const signs = props.signs
  const map   = mapRef.value
  const L     = LRef.value
  if (!L || !map || !signs?.length) return

  const markers: any[] = []
  for (const s of signs) {
    if (s.lat == null || s.lng == null) continue
    const color = (s.zone_color ?? '#2563EB').trim()
    const arrow = s.heading != null
      ? `<span class="lm-sign-arrow" style="transform:rotate(${s.heading}deg) translateY(-15px)"></span>`
      : ''
    const icon = L.divIcon({
      className: '',
      html: `<div class="lm-sign-wrap" style="--sign:${color}">${arrow}<span class="lm-sign"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 13v8M8 21h8"/><path d="M5 6h12.5L20 9.5 17.5 13H5z"/></svg></span></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    })
    const m = L.marker([s.lat, s.lng], { icon, interactive: true }).addTo(map)

    const name = s.zone_name ? esc(s.zone_name) : 'Confirmed sign'
    const photo = s.photo_url ? `<img class="lm-pop-img" src="${esc(s.photo_url)}" alt="${name}" />` : ''
    const price = s.price ? `<span class="lm-pop-price">${esc(s.price)}</span>` : ''
    const age = relAge(s.created_at)
    m.bindPopup(
      `<div class="lm-pop">${photo}` +
      `<div class="lm-pop-head"><span class="lm-pop-zone" style="color:${color}">✓ ${name}</span>${price}</div>` +
      (age ? `<div class="lm-pop-age">Confirmed ${age}</div>` : '') +
      `</div>`,
      { className: 'lm-pop-wrap', closeButton: true },
    )
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

    // Reveal the permanent street/zone labels only once zoomed in, to avoid clutter.
    const updateLabels = () => mapEl.value?.classList.toggle('lm-labels', map.getZoom() >= 17)
    map.on('zoomend', updateLabels)
    updateLabels()
  } else if (props.labels) {
    // Locked preview: it opens at street zoom, so show the labels right away.
    mapEl.value?.classList.add('lm-labels')
  }

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(map)

  // Static city-overview map: no user, just the zone geometry fitted to view.
  if (props.hideUser) {
    follow.value = false
    const b = zoneBounds(props.zones)
    if (b) map.fitBounds(b as any, { padding: [26, 26] })
  } else {
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
  }

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
/* Permanent street/zone labels — hidden until the map is zoomed in (lm-labels). */
.leaflet-tooltip.zone-label {
  background: rgba(22, 24, 28, 0.78);
  color: #F4F4F0;
  border: none;
  box-shadow: none;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
  padding: 1px 6px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
}
.leaflet-tooltip.zone-label::before { display: none; }
.location-map:not(.lm-labels) .leaflet-tooltip.zone-label { display: none !important; }

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
.lm-sign-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lm-sign {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  color: var(--sign, #2563EB);
  background: #fff;
  border: 2px solid var(--sign, #2563EB);
  border-radius: 50%;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
}
.lm-sign-arrow {
  position: absolute;
  top: 50%; left: 50%;
  margin: -5px 0 0 -6px;
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 9px solid var(--sign, #2563EB);
  transform-origin: center;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
}
/* Sign popup */
.lm-pop-wrap .leaflet-popup-content-wrapper { border-radius: 12px; padding: 0; overflow: hidden; }
.lm-pop-wrap .leaflet-popup-content { margin: 0; width: 180px !important; }
.lm-pop-img { display: block; width: 100%; height: 110px; object-fit: cover; }
.lm-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 11px 2px; }
.lm-pop-zone { font-size: 13px; font-weight: 700; font-family: var(--font-mono, monospace); }
.lm-pop-price { font-size: 13px; font-weight: 700; color: #374151; font-family: var(--font-mono, monospace); }
.lm-pop-age { padding: 0 11px 10px; font-size: 11px; color: #6b7280; }
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
.lm-compass {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: #2563EB;
  border: none;
  border-radius: 999px;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.4);
  cursor: pointer;
  white-space: nowrap;
  transition: transform 120ms var(--ease-out, ease), filter 120ms ease;
}
.lm-compass:active { transform: translateX(-50%) scale(0.96); }
.lm-compass:hover { filter: brightness(0.95); }
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
  background: rgba(31, 34, 40, 0.92);
  color: var(--blue);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(6px);
  cursor: pointer;
}
.lm-recenter:active { transform: scale(0.94); }
</style>

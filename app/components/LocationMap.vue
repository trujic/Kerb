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
  // A searched place. Unlike `highlight` this is somewhere the driver is NOT —
  // possibly another city — so the map travels to it and no connector is drawn
  // back to the blue dot.
  pin?: { lat: number; lng: number; label?: string } | null
  signs?: {
    lat: number; lng: number
    zone_color?: string | null; zone_name?: string; price?: string | null
    heading?: number | null; created_at?: string; photo_url?: string | null
  }[] // confirmed sign scans
  compassPrompt?: boolean // show a one-tap "Enable compass" chip (iOS first-time)
  hideUser?: boolean      // static city-overview map: no user marker, fit to zones
  labels?: boolean        // show permanent street/zone labels (e.g. on the locked preview)
  // The city's zone records (name, colour, price, rules, daily ticket…), so a
  // tapped polygon can say what it costs rather than only what it is called.
  zoneMeta?: any[]
  cityId?: string | null  // which city's charging schedule the popup should read
  // Whether the zone popup offers a pay button. Off by default: the button only
  // makes sense where the parent runs the pay flow (the dashboard), not on the
  // city guide's reference map, where it would lead nowhere.
  payable?: boolean
}>()

const emit = defineEmits<{ compassTap: []; enableCompass: []; payZone: [zone: string] }>()

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
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly: any) => poly[0]?.forEach(visit))
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

  // One permanent label per street name: with per-part strip geometry a street
  // spans many features, and labelling each part drowns the map in repeats.
  // The longest part carries the label; the rest keep only the hover tooltip.
  const lenOf = (f: any) => {
    const g = f.geometry
    const pts: number[][] =
      g?.type === 'Polygon' ? g.coordinates[0]
      : g?.type === 'MultiPolygon' ? g.coordinates.flatMap((p: any) => p[0])
      : g?.type === 'LineString' ? g.coordinates
      : g?.type === 'MultiLineString' ? g.coordinates.flat() : []
    let len = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    }
    return len
  }
  const bestLen = new Map<string, number>()
  const labelCarrier = new Map<string, any>()
  for (const f of zones.features) {
    const n = f.properties?.name
    if (!n) continue
    const l = lenOf(f)
    if (l > (bestLen.get(n) ?? -1)) { bestLen.set(n, l); labelCarrier.set(n, f) }
  }

  const layers: any[] = []
  for (const feature of zones.features) {
    const g = feature.geometry
    if (!g) continue
    const color = (feature.properties?.color ?? '#3B82F6').trim()
    const name  = feature.properties?.name ?? ''   // the street, where a city has one
    const zoneName = (feature.properties?.zone ?? '').trim() // the tariff identity
    // Lots that sell the zone's daily ticket get a dashed outline. Not a colour
    // of their own — they are still that zone, at that hourly rate; the dashes
    // say there is a second way to pay here, and the pay card says what it costs.
    const daily = feature.properties?.daily === true
    const dash  = daily ? { dashArray: '6 4', weight: 3 } : {}
    // Residents' bays — a permit, not a tariff. Filled yellow so they read as a
    // different thing entirely, while the outline keeps the zone's colour at a
    // thin 2px so you can still see which zone they sit in. Paying here buys
    // nothing: the space is reserved whatever you send.
    const residents = feature.properties?.residents === true
    const stanari = residents
      ? { fillColor: '#F5C400', fillOpacity: 0.55, weight: 2, opacity: 0.9, dashArray: undefined }
      : {}

    let layer: any = null
    if (g.type === 'Polygon') {
      if (g.coordinates[0].length < 3) continue
      // all rings — holes (city blocks inside street networks) must stay unfilled
      layer = L.polygon(g.coordinates.map((ring: number[][]) => toLatLngs(ring)), {
        color, fillColor: color, fillOpacity: 0.13, weight: 2, opacity: 0.55, ...dash, ...stanari,
      })
    } else if (g.type === 'MultiPolygon') {
      // Leaflet takes the nested array directly; each part keeps its own holes.
      const parts = (g.coordinates ?? [])
        .filter((poly: number[][][]) => poly[0]?.length >= 3)
        .map((poly: number[][][]) => poly.map((ring: number[][]) => toLatLngs(ring)))
      if (!parts.length) continue
      layer = L.polygon(parts, {
        color, fillColor: color, fillOpacity: 0.13, weight: 2, opacity: 0.55, ...dash, ...stanari,
      })
    } else if (g.type === 'LineString') {
      layer = L.polyline(toLatLngs(g.coordinates), {
        color, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round', ...dash,
      })
    } else if (g.type === 'MultiLineString') {
      layer = L.polyline(g.coordinates.map(toLatLngs), {
        color, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round', ...dash,
      })
    }
    if (!layer) continue

    layer.addTo(map)
    if (name) {
      // Permanent street/zone labels on explore maps (revealed when zoomed in, see
      // lm-labels) and on the labelled preview. Plain previews keep the hover tooltip.
      const wantsPermanent = props.interactive || props.labels
      layer.bindTooltip(name, wantsPermanent && labelCarrier.get(name) === feature
        ? { permanent: true, direction: 'center', className: 'zone-label' }
        : { sticky: true, className: 'zone-tooltip' })

      // Only where a tap can mean "tell me about this". On the locked preview a
      // tap is the compass gesture, and a popup would eat it.
    }

    // The popup keys off `zone`, not `name`. They are different things: `name` is
    // the street a polygon sits on and Novi Sad's 267 polygons all carry "" for it,
    // while `zone` ("Blue Zone") is the identity that joins to the tariff. Binding
    // this inside the `if (name)` above meant every Novi Sad and Niš polygon was
    // silently unclickable.
    if (props.interactive && zoneName)
      layer.bindPopup(zonePopup(zoneName, name, color, residents), { className: 'lm-pop-wrap', closeButton: true })
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

// ── Searched place — a red pin, and the map goes there ───────────────────────
watchEffect((onCleanup) => {
  const pin = props.pin
  const map = mapRef.value
  const L = LRef.value
  if (!L || !map || !pin) return

  // divIcon rather than L.marker's default: no image assets to ship, and the
  // shape stays crisp at any density. Anchored at the tip, not the centre.
  const icon = L.divIcon({
    className: 'lm-pin',
    html:
      '<svg width="26" height="34" viewBox="0 0 26 34" fill="none">' +
      '<path d="M13 33C13 33 24 21.5 24 13A11 11 0 1 0 2 13c0 8.5 11 20 11 20Z" ' +
      'fill="#C4382A" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="13" cy="12.5" r="4" fill="#fff"/></svg>',
    iconSize: [26, 34],
    iconAnchor: [13, 33],
  })
  const marker = L.marker([pin.lat, pin.lng], { icon, interactive: !!pin.label }).addTo(map)
  if (pin.label) marker.bindTooltip(pin.label, { direction: 'top', offset: [0, -30] })

  // Follow-GPS would otherwise drag the view straight back off the pin.
  follow.value = false
  const far = Math.abs(pin.lat - props.lat) > 0.05 || Math.abs(pin.lng - props.lng) > 0.05
  // Another city is a jump, not a journey — animating 80 km is just a long blur.
  if (far) map.setView([pin.lat, pin.lng], 17)
  else map.flyTo([pin.lat, pin.lng], 17, { duration: 0.7 })

  onCleanup(() => { try { map.removeLayer(marker) } catch {} })
})

// Relative "last confirmed" age, e.g. "today", "yesterday", "5 days ago".
const { lang, t } = useLang()

/**
 * What a zone polygon says when you tap it.
 *
 * The label on the map is the zone's name and nothing more, which is the one
 * thing a driver standing on it can already read off the sign. Everything they
 * actually want — the rate, whether it is charging right now, how long they may
 * stay — the app already knows and was not showing. Returned as a function so
 * Leaflet re-renders it at open time; "free at 21:00" must not be answered from
 * whenever the layer happened to be built.
 */
const zonePopup = (zoneName: string, street: string, color: string, residents: boolean) => () => {
  const z = props.zoneMeta?.find((m: any) => m?.name === zoneName)
  const rate = z ? rateLabel(readTariff(z)) : null
  const max  = z ? maxStayFor(z) : null
  const st   = statusAt(Date.now(), getSchedule(props.cityId ?? undefined, zoneName))
  const desc = st ? describeStatus(st, t, (d: number) => dayAbbrFor(d, lang.value)) : null

  const rows: string[] = []
  if (street) rows.push(`<div class="lm-pop-row lm-pop-street">${esc(street)}</div>`)
  if (desc) rows.push(
    `<div class="lm-pop-row"><span class="lm-pop-dot" style="background:${st!.paid ? '#EF4444' : '#16A34A'}"></span>` +
    `<span><strong>${esc(desc.label)}</strong> · ${esc(desc.detail)}</span></div>`)
  if (max) rows.push(`<div class="lm-pop-row">${esc(t('zoneMaxStay', { n: max }))}</div>`)
  if (z?.daily_amount) rows.push(`<div class="lm-pop-row">${esc(t('zoneDaily', {
    amount: formatMoney(Number(z.daily_amount), z.price_currency ?? null),
  }))}</div>`)
  if (residents) rows.push(`<div class="lm-pop-rules">${esc(t('zoneResidents'))}</div>`)
  else if (z?.rules) rows.push(`<div class="lm-pop-rules">${esc(String(z.rules))}</div>`)
  if (!rows.length) rows.push(`<div class="lm-pop-row">${esc(t('zoneNoData'))}</div>`)

  const el = document.createElement('div')
  el.className = 'lm-pop'
  el.innerHTML =
    `<div class="lm-pop-head"><span class="lm-pop-zone" style="color:${color}">${esc(zoneName)}</span>` +
    `<span class="lm-pop-price">${esc(rate ?? t('zoneNoRate'))}</span></div>` +
    `<div class="lm-pop-body">${rows.join('')}</div>`

  // The button hands the zone to the pay flow — it does not pay. Tapping a polygon
  // is a guess about geometry, not the sign, and the wizard is where the plate and
  // the slide still stand between that guess and a billed SMS. Withheld where
  // paying buys nothing: a residents' bay, or a zone with no way to pay at all.
  if (props.payable && z && !residents && payActionFor(z).kind !== 'none') {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'lm-pop-pay'
    btn.textContent = t('zonePayBtn')
    btn.addEventListener('click', () => emit('payZone', zoneName))
    el.appendChild(btn)
  }
  return el
}

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
// Each pin opens a popup with zone, price, the photo, and how recently it was
// confirmed. The scan's compass heading is stored but not drawn: phone headings
// at capture time were too unreliable to point anywhere useful.
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
      html: `<div class="lm-sign-wrap" style="--sign:${color}"><span class="lm-sign"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 13v8M8 21h8"/><path d="M5 6h12.5L20 9.5 17.5 13H5z"/></svg></span></div>`,
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
  // Canvas, not SVG. Thessaloniki's map is 1,957 individual parking spaces, and
  // as SVG that is 1,957 DOM paths — enough to starve the main thread so the base
  // tiles never finish loading and the map sits there grey. Canvas draws the same
  // shapes in one element and does not care how many there are.
  const map = L.map(mapEl.value, {
    preferCanvas: true,
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

  // Base tiles. CARTO's keyless Positron ended: basemaps.cartocdn.com now answers
  // every anonymous request with a PNG that reads "API KEY REQUIRED", so the map
  // rendered as a grid of watermarks rather than failing outright.
  //
  // OSM Srbija (tiles.openstreetmap.rs) replaces it inside Serbia. It is the local
  // community's server, explicitly free to embed, refreshed daily, and — the reason
  // it is worth the switch — it carries the imported address register, so house
  // numbers are legible at z18. That is what zone boundaries are actually written
  // in: "Žarka Vasiljevića 2–10".
  //
  // It only renders the region, though, and Kerb also ships Thessaloniki and NYC.
  // So tiles fully inside Serbia come from Novi Sad; everything else falls back to
  // global OSM. Whole-tile containment, not centre, so no tile is half-rendered.
  const RS = { south: 41.7, west: 18.7, north: 46.3, east: 23.2 }

  const KerbTiles = L.TileLayer.extend({
    getTileUrl(coords: any) {
      const b = (this as any)._tileCoordsToBounds(coords)
      const inRS = b.getSouth() >= RS.south && b.getNorth() <= RS.north
                && b.getWest()  >= RS.west  && b.getEast()  <= RS.east
      return inRS
        ? `https://tiles.openstreetmap.rs/lat/${coords.z}/${coords.x}/${coords.y}.png`
        : `https://tile.openstreetmap.org/${coords.z}/${coords.x}/${coords.y}.png`
    },
  })

  new (KerbTiles as any)('', {
    // OSM Srbija stops at z18. maxNativeZoom lets Leaflet upscale that last level
    // instead of requesting a z19 tile that would 404 into a hole in the map.
    maxNativeZoom: 18,
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.rs">OpenStreetMap Srbija</a>, &copy; OpenStreetMap contributors',
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
/* The base map is standard OSM cartography, which is much louder than the CARTO
   Positron it replaced. Desaturating the tile pane pushes it back down into a
   background — everything Kerb draws sits in the overlay panes above and keeps
   its real colour. */
.location-map .leaflet-tile-pane {
  filter: grayscale(0.75) saturate(0.8) brightness(1.1) contrast(0.88);
}

/* Permanent street/zone labels — hidden until the map is zoomed in (lm-labels). */
.leaflet-tooltip.zone-label {
  background: rgba(255, 255, 255, 0.82);
  color: #40454F;
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
/* Sign popup */
.lm-pop-wrap .leaflet-popup-content-wrapper { border-radius: 12px; padding: 0; overflow: hidden; }
.lm-pop-wrap .leaflet-popup-content { margin: 0; width: 208px !important; }
.lm-pop-img { display: block; width: 100%; height: 110px; object-fit: cover; }
/* Right padding clears Leaflet's × , which is absolutely positioned in the same
   corner and was sitting on top of the rate. */
.lm-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 26px 2px 11px; }
.lm-pop-zone { font-size: 13px; font-weight: 700; font-family: var(--font-mono, monospace); }
.lm-pop-price { font-size: 13px; font-weight: 700; color: #374151; font-family: var(--font-mono, monospace); }
.lm-pop-age { padding: 0 11px 10px; font-size: 11px; color: #6b7280; }

/* Zone popup body — the rate sits in the head next to the name; these are the
   lines under it. Kept to one fact per row: a driver reads this at the kerb. */
.lm-pop-body { padding: 4px 11px 10px; display: flex; flex-direction: column; gap: 4px; }
.lm-pop-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #374151; line-height: 1.35; }
.lm-pop-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.lm-pop-street { font-weight: 600; color: #1f2937; }
.lm-pop-pay {
  display: block; width: calc(100% - 22px); margin: 0 11px 11px;
  padding: 8px 10px; border: none; border-radius: 9px; cursor: pointer;
  background: #F5C400; color: #16181D;
  font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 700;
}
.lm-pop-pay:active { transform: scale(0.98); }
.lm-pop-rules { margin-top: 2px; font-size: 10.5px; color: #6b7280; line-height: 1.4; }
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
/* Leaflet's divIcon wrapper carries a default background; the pin is the SVG */
:deep(.lm-pin) { background: none; border: none; }

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
  background: rgba(255, 255, 255, 0.92);
  color: var(--blue);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(6px);
  cursor: pointer;
}
.lm-recenter:active { transform: scale(0.94); }
</style>

<template>
  <div>
    <!-- ── GPS DASHBOARD (logged-in + city detected) ── -->
    <section v-if="gpsMode" class="hero-gps">
      <div class="container">
        <!-- Map -->
        <ClientOnly>
          <div class="gps-map-wrap">
            <LocationMap
              :lat="coords!.lat"
              :lng="coords!.lng"
              :accuracy="coords!.accuracy"
              :heading="heading"
              :height="260"
              :zones="zoneBoundaries"
              :highlight="highlightPoint"
              :signs="signReports"
              :compass-prompt="compassPrompt"
              @compass-tap="onMapTap"
              @enable-compass="onMapTap"
            />
            <button
              class="map-expand-btn"
              type="button"
              aria-label="Expand map"
              @click="mapExpanded = true"
            >
              <span>⤢</span> Explore zones
            </button>
          </div>
        </ClientOnly>

        <!-- Fullscreen interactive map -->
        <ClientOnly>
          <Teleport to="body">
            <div v-if="mapExpanded" class="map-fs" role="dialog" aria-label="Zone map">
              <div class="map-fs-bar">
                <span class="map-fs-title">
                  {{ detectedCity!.flag }} {{ detectedCity!.name }} · parking zones
                </span>
                <button
                  class="map-fs-close"
                  type="button"
                  aria-label="Close map"
                  @click="mapExpanded = false"
                >✕</button>
              </div>
              <div class="map-fs-body">
                <LocationMap
                  :lat="coords!.lat"
                  :lng="coords!.lng"
                  :accuracy="coords!.accuracy"
                  :heading="heading"
                  :zones="zoneBoundaries"
                  :highlight="highlightPoint"
                  :signs="signReports"
                  :compass-prompt="compassPrompt"
                  fill
                  interactive
                  @enable-compass="onMapTap"
                />
              </div>
            </div>
          </Teleport>
        </ClientOnly>

        <!-- City badge -->
        <div class="gps-city-bar">
          <div class="gps-city-info">
            <span class="gps-city-flag">{{ detectedCity!.flag }}</span>
            <div>
              <div class="gps-city-name">{{ detectedCity!.name }}</div>
              <div class="gps-city-country">{{ detectedCity!.country }}</div>
            </div>
            <span v-if="cityDetail.verified" class="gps-verified">✓ Verified</span>
          </div>
          <NuxtLink :to="`/${detectedCity!.id}`" class="gps-full-link">Full guide →</NuxtLink>
        </div>

        <!-- Active parking session -->
        <SessionCard
          v-if="activeSession"
          :session="activeSession"
          :remaining-ms="remainingMs"
          :at-zone-limit="atZoneLimit"
          :can-extend="canExtend"
          @extend="onExtend"
          @end="onEndSession"
          @locate="onLocateCar"
        />

        <!-- Hours (live free/paid status) -->
        <ParkingHours :city-id="detectedCity!.id" compact class="gps-hours" />

        <!-- No paid parking at the user's spot -->
        <div v-if="parkingState === 'none' && nearest" class="gps-noparking">
          <div class="np-icon">🅿️</div>
          <div class="np-text">
            <p class="np-title">No paid zone where you're standing</p>
            <p class="np-sub">
              Parking here is likely free. Nearest paid parking is
              <strong>~{{ formatDist(nearest.distanceM) }}</strong> away —
              <span :style="{ color: zoneColor(nearest.zoneName) }">{{ nearest.zoneName }}</span>
              on {{ nearest.streetName }}.
            </p>
          </div>
        </div>

        <!-- Zone cards -->
        <div class="gps-zones">
          <!-- ── Honest framing: GPS narrows it down, the sign decides ── -->
          <div class="zone-pick-head">
            <p class="zone-pick-title">
              <template v-if="parkingState === 'on'">You're in a paid parking area</template>
              <template v-else-if="parkingState === 'near' && nearest">
                Paid parking ~{{ formatDist(nearest.distanceM) }} away
              </template>
              <template v-else>Parking zones in {{ detectedCity!.name }}</template>
            </p>
            <p class="zone-pick-hint">
              🪧 Tap the zone printed on the sign next to your car — that's the one that counts.
            </p>
          </div>

          <!-- Scan the sign — the sign is ground truth: read it, confirm, pin it, pay -->
          <button type="button" class="scan-cta" @click="showScan = true">
            <span class="scan-cta-icon">📸</span>
            <span class="scan-cta-text">
              <span class="scan-cta-title">Scan the sign</span>
              <span class="scan-cta-sub">Read the zone off the sign, confirm it on the map, then pay</span>
            </span>
            <span class="scan-cta-arrow">→</span>
          </button>

          <!-- Nearest confirmed sign — lead the user to verified ground truth -->
          <button
            v-if="nearestSign"
            type="button"
            class="nsign"
            :style="{ borderColor: (nearestSign.report.zone_color || 'var(--blue)') + '66' }"
            @click="onLeadToSign"
          >
            <span
              class="nsign-arrow"
              :style="{ transform: `rotate(${nearestSignArrow - 90}deg)`, color: nearestSign.report.zone_color || 'var(--blue)' }"
            >➤</span>
            <span class="nsign-text">
              <span class="nsign-title">
                Nearest confirmed sign · {{ formatDist(nearestSign.distanceM) }}
              </span>
              <span class="nsign-sub">
                <span :style="{ color: nearestSign.report.zone_color || 'var(--text2)' }">{{ nearestSign.report.zone_name }}</span>
                · confirmed {{ relTime(nearestSign.report.created_at) }}
              </span>
            </span>
            <span class="nsign-go">Lead me →</span>
          </button>

          <!-- Selectable zones — likely one floats up, but it's never auto-committed -->
          <div class="zone-pick-list">
            <button
              v-for="zone in orderedZones"
              :key="zone.id"
              type="button"
              class="zone-pick"
              :class="{ 'zone-pick--active': zone.name === selectedZoneName }"
              :style="zone.name === selectedZoneName
                ? { borderColor: zone.color, background: zone.color + '0d' }
                : null"
              @click="selectedZoneName = zone.name"
            >
              <span class="zone-pick-stripe" :style="{ background: zone.color }" />
              <span class="zone-pick-info">
                <span class="zone-pick-name">{{ zone.name }}</span>
                <span v-if="zone.name === likelyZoneName" class="zone-pick-tag">📍 likely yours</span>
              </span>
              <span class="zone-pick-price" :style="{ color: zone.color }">{{ zone.price }}</span>
              <span class="zone-pick-radio" :class="{ on: zone.name === selectedZoneName }">
                <span v-if="zone.name === selectedZoneName">✓</span>
              </span>
            </button>
          </div>

          <!-- Selected zone — rules + honest pay action -->
          <div
            v-if="selectedZone"
            class="zone-act"
            :style="{ borderColor: selectedZone.color }"
          >
            <p class="zone-act-rules">{{ selectedZone.rules }}</p>
            <p v-if="parkingState === 'near'" class="zone-act-caution">
              ⚠️ GPS puts you near a boundary — only pay this zone if the sign says
              <strong>{{ selectedZone.name }}</strong>.
            </p>
            <div v-if="!user" class="zone-plate">
              <input
                v-model="guestPlate"
                class="zone-plate-input"
                type="text"
                autocapitalize="characters"
                autocomplete="off"
                placeholder="Your plate — NS123AB"
                @input="guestPlate = guestPlate.toUpperCase()"
              />
              <span class="zone-plate-hint">
                Saved on this device · prefilled into the SMS.
                <NuxtLink to="/login">Create an account</NuxtLink> to sync it.
              </span>
            </div>
            <template v-if="selectedZone.sms_shortcode">
              <!-- Default: the slide IS the sign-confirmation — it can't fire by accident -->
              <SlideToConfirm
                v-if="!skipConfirm"
                :key="selectedZone.name"
                :label="`I checked the sign — slide to pay ${selectedZone.name}`"
                done-label="Opening SMS…"
                :color="selectedZone.color"
                @confirm="pay(selectedZone)"
              />
              <!-- Responsibility mode: fast tap, no per-pay confirm -->
              <button
                v-else
                type="button"
                class="zone-act-btn"
                :style="{ background: selectedZone.color }"
                @click="pay(selectedZone)"
              >
                <span v-if="defaultPlate">Pay {{ selectedZone.name }} · {{ defaultPlate }}</span>
                <span v-else>Pay {{ selectedZone.name }}</span>
                <span class="zone-act-arrow">→ {{ selectedZone.sms_shortcode }}</span>
              </button>

              <!-- Persisted opt-out: take responsibility, skip the per-pay slide -->
              <label class="zone-resp" :class="{ 'zone-resp--on': skipConfirm }">
                <input v-model="skipConfirm" type="checkbox" class="zone-resp-box" />
                <span v-if="!skipConfirm">Don't ask each time — I'll check the sign myself and take responsibility</span>
                <span v-else>Sign-check off — you choose the zone and are responsible. Tap to turn confirmation back on.</span>
              </label>
            </template>

            <p class="zone-act-foot">
              <NuxtLink
                v-if="user && selectedZone.sms_shortcode && !defaultPlate"
                to="/profile"
                class="zone-act-link"
              >Add a plate for one-tap SMS</NuxtLink>
              <span class="zone-act-src">
                Your phone sends the SMS to the parking operator.
              </span>
            </p>
          </div>
        </div>

        <!-- Guest → account nudge (memory + reminders + fine alerts) -->
        <div v-if="!user" class="guest-upsell">
          <span class="guest-upsell-icon">🔔</span>
          <p class="guest-upsell-text">
            You're paying as a guest. <NuxtLink to="/login">Create a free account</NuxtLink>
            to track your session, get an expiry reminder, and watch your plate for fines.
          </p>
        </div>

        <!-- Personal fine check (manual) — works for guests too -->
        <FineCheck :initial-plate="defaultPlate" class="gps-finecheck" />

        <!-- Fine warning -->
        <div v-if="cityDetail.fine" class="gps-fine">
          <span class="gps-fine-label">Fine if unpaid</span>
          <span class="gps-fine-amount">{{ cityDetail.fine }}</span>
        </div>

        <!-- Recent sessions -->
        <div v-if="pastSessions.length" class="gps-history">
          <p class="section-label">Recent sessions</p>
          <div
            v-for="s in pastSessions"
            :key="s.id"
            class="hist-row"
          >
            <span class="hist-dot" :style="{ background: s.zone_color || 'var(--text2)' }" />
            <span class="hist-main">
              <span class="hist-zone">{{ s.zone_name }}</span>
              <span v-if="s.street_name" class="hist-street"> · {{ s.street_name }}</span>
            </span>
            <span class="hist-when">{{ relTime(s.started_at) }}</span>
          </div>
        </div>
      </div>

      <!-- Scan the sign — capture → read → confirm → pin + prefill pay -->
      <ClientOnly>
        <ScanSign
          v-if="showScan"
          :city-id="detectedCity!.id"
          :zones="allZones"
          :coords="coords"
          :heading="heading"
          :street="nearest?.streetName ?? null"
          :likely-zone-name="likelyZoneName"
          @close="showScan = false"
          @submitted="onSignSubmitted"
          @pay="onScanPay"
        />
      </ClientOnly>
    </section>

    <!-- ── HERO (default, non-GPS) ── -->
    <section v-else class="hero">
      <div class="container">
        <p class="section-label fade-up">Street parking · Europe</p>
        <h1 class="fade-up-2">
          Parking rules for<br />any city, organized.
        </h1>
        <p class="hero-sub fade-up-3">
          Zones, prices, and how to pay — pulled from official sources
          and organized so you don't have to figure it out alone.
          Always confirm with local signage before you park.
        </p>

        <!-- GPS detecting state -->
        <div v-if="detecting" class="gps-detecting fade-up-3">
          <span class="gps-icon">📍</span>
          <span>Detecting your location…</span>
        </div>
        <div v-else-if="gpsError" class="gps-error fade-up-3">{{ gpsError }}</div>

        <!-- Search -->
        <div class="search-outer fade-up-3">
          <div class="search-wrap" :class="{ focused: searchFocused }">
            <span class="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              v-model="searchQuery"
              class="search-input"
              type="text"
              placeholder="Search city — Novi Sad, Prague, Vienna..."
              autocomplete="off"
              @focus="searchFocused = true"
              @blur="setTimeout(() => (searchFocused = false), 150)"
              @input="handleSearch"
              @keydown.enter="goToFirstResult"
              @keydown.escape="searchResults = []"
            />
            <button class="search-btn" @click="goToFirstResult">Find →</button>
          </div>
          <Transition name="dropdown">
          <div v-if="searchResults.length" class="search-dropdown">
            <NuxtLink
              v-for="c in searchResults"
              :key="c.id"
              :to="`/${c.id}`"
              class="search-result"
              @click="searchResults = []"
            >
              <span class="sri-flag">{{ c.flag }}</span>
              <div>
                <div class="sri-name">{{ c.name }}</div>
                <div class="sri-country">{{ c.country }}</div>
              </div>
              <span class="sri-arrow">→</span>
            </NuxtLink>
          </div>
          </Transition>
        </div>

        <!-- Meta stats -->
        <div class="hero-meta fade-up-3">
          <span v-for="(s, i) in stats" :key="s.label">
            <span v-if="i > 0" class="meta-sep">·</span>
            <strong>{{ s.val }}</strong> {{ s.label }}
          </span>
        </div>
      </div>
    </section>

    <!-- ── CITY STRIP ── -->
    <div class="city-strip">
      <div class="city-strip-track">
        <span
          v-for="(item, i) in stripItems.concat(stripItems)"
          :key="i"
          class="city-strip-item"
        >
          <strong>{{ item.city }}</strong>
          <span class="city-strip-sep"> · </span>
          {{ item.detail }}
          <span class="city-strip-sep" style="padding: 0 8px">—</span>
        </span>
      </div>
    </div>

    <!-- ── CITIES GRID ── -->
    <section id="cities" class="section-cities">
      <div class="container">
        <div class="section-header reveal">
          <div>
            <p class="section-label">Featured cities</p>
            <h2>Find your city</h2>
          </div>
          <NuxtLink to="/cities" class="view-all">View all cities →</NuxtLink>
        </div>

        <div v-if="pending" class="cities-grid">
          <div v-for="i in 6" :key="i" class="skeleton" />
        </div>
        <div v-else-if="error" class="error-msg">
          Failed to load cities. Please refresh.
        </div>
        <div v-else class="cities-grid">
          <CityCard
            v-for="city in cities"
            :key="city.id"
            :city="city"
            class="reveal"
          />
        </div>
      </div>
    </section>

    <!-- ── HOW IT WORKS + CTA (hidden in GPS mode) ── -->
    <template v-if="!gpsMode">
    <!-- ── HOW IT WORKS ── -->
    <section id="how" class="section-how">
      <div class="container">
        <div class="reveal">
          <p class="section-label">How it works</p>
          <h2>Three steps, no guessing.</h2>
          <p class="section-sub">
            No account needed. No app to install. Just the rules for
            your city, when you need them.
          </p>
        </div>
        <div class="steps reveal">
          <div v-for="step in steps" :key="step.num" class="step">
            <div class="step-num">{{ step.num }}</div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CTA ── -->
    <section class="section-cta">
      <div class="container">
        <div class="cta-inner reveal">
          <div>
            <p class="section-label">Open guide</p>
            <h2>Know before you park.</h2>
            <p class="cta-sub">
              No more Reddit threads. No more guessing from a sign you
              can't fully read. No more fines from the wrong zone.
            </p>
          </div>
          <div class="cta-actions">
            <button class="btn-primary" @click="scrollToTop">Search your city →</button>
            <NuxtLink to="/contribute" class="btn-ghost">Contribute info</NuxtLink>
          </div>
        </div>
      </div>
    </section>
    </template>
  </div>
</template>

<script setup lang="ts">
const { getCities, searchCities, getCity } = useCity()
const { user, getProfile } = useAuth()
const { detectCity, detectedCity, coords, detecting, gpsError, suggestedZoneName, startTracking, stopTracking } = useGPS()
const {
  heading, attached: compassAttached, previouslyEnabled: compassWasEnabled,
  needsPermission: compassNeedsPerm, start: startOrientation, stop: stopOrientation, onMapTap,
} = useDeviceOrientation()

// First-time iOS only: offer a one-tap compass enable. Hidden once it's running,
// and never shown again to anyone who already opted in (persisted in localStorage).
const compassPrompt = computed(() =>
  import.meta.client &&
  compassNeedsPerm.value &&
  !compassAttached.value &&
  heading.value == null &&
  !compassWasEnabled.value,
)

const cityDetail = ref<any>(null)
const loadingCityDetail = ref(false)
const userProfile = ref<any>(null)
const zoneBoundaries = ref<any>(null)
const mapExpanded = ref(false)
const showScan = ref(false)              // scan-the-sign modal
const signReports = ref<any[]>([])       // confirmed sign scans → map pins
const { loadForCity: loadSignReports } = useSignScan()
const locateCar = ref(false) // "find my car" — point the map at the saved session

// Parking session tracking (logs each pay, geotagged)
const {
  active: activeSession, history: sessionHistory,
  remainingMs, atZoneLimit, canExtend,
  loadActive, loadHistory, startOrExtend, endSession,
} = useParkingSession()

watch(user, (u) => {
  if (u) { loadActive(); loadHistory() }
}, { immediate: true })

// Lock body scroll + close on Escape while the fullscreen map is open
watch(mapExpanded, (open) => {
  if (import.meta.server) return
  document.body.style.overflow = open ? 'hidden' : ''
  if (!open) {
    locateCar.value = false      // reset find-my-car when the map closes
    leadSignPoint.value = null   // and the lead-to-sign pointer
  }
})
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') mapExpanded.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

// Guest plate — saved on the device so anonymous users get one-tap SMS too,
// with no account. Synced into a real profile plate if they sign up later.
const GUEST_PLATE_KEY = 'kerb_guest_plate'
const guestPlate = ref('')
watch(guestPlate, (v) => {
  if (!import.meta.client) return
  const clean = v.trim().toUpperCase()
  if (clean) localStorage.setItem(GUEST_PLATE_KEY, clean)
  else localStorage.removeItem(GUEST_PLATE_KEY)
})

// Persisted "I self-check the sign" opt-out — swaps the per-pay slide for a fast tap.
const SKIP_CONFIRM_KEY = 'kerb_skip_sign_confirm'
const skipConfirm = ref(false)
watch(skipConfirm, (v) => {
  if (import.meta.client) localStorage.setItem(SKIP_CONFIRM_KEY, v ? '1' : '0')
})

const defaultPlate = computed(() => {
  const plates = userProfile.value?.plates ?? []
  const saved = (plates.find((p: any) => p.is_default) ?? plates[0])?.plate
  return saved ?? (guestPlate.value.trim() ? guestPlate.value.trim().toUpperCase() : null)
})

// Geometry-based detection: distance to the nearest paid-parking segment.
const { nearest } = useNearestParking(coords, zoneBoundaries)

// on  = standing on a paid street · near = just off one · none = no paid parking
const parkingState = computed<'on' | 'near' | 'none' | null>(() => {
  const n = nearest.value
  if (!n) return null
  const acc = coords.value?.accuracy ?? 0
  const onT = Math.min(Math.max(25, acc), 60)   // widen when GPS is imprecise
  const nearT = Math.max(75, onT + 50)
  if (n.distanceM <= onT) return 'on'
  if (n.distanceM <= nearT) return 'near'
  return 'none'
})

const formatDist = (m: number) => {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.max(5, Math.round(m / 5) * 5)} m`
}

const zoneColor = (name: string) =>
  cityDetail.value?.zones?.find((z: any) => z.name === name)?.color ?? 'var(--text2)'

// Which zone to surface as the hero. Prefer geometry; fall back to the street-
// name match only when boundary geometry isn't loaded.
const activeSuggestedName = computed<string | null>(() => {
  if (nearest.value) {
    return parkingState.value === 'on' || parkingState.value === 'near'
      ? nearest.value.zoneName
      : null
  }
  return suggestedZoneName.value
})

// GPS gives a best guess — never a verdict. The user taps the zone on the sign.
const likelyZoneName = computed(() => activeSuggestedName.value)
const allZones = computed<any[]>(() => cityDetail.value?.zones ?? [])

// Likely zone floats to the top; the rest keep their original order.
const orderedZones = computed(() => {
  const likely = likelyZoneName.value
  if (!likely) return allZones.value
  return [...allZones.value].sort(
    (a, b) => (a.name === likely ? -1 : b.name === likely ? 1 : 0),
  )
})

// What the user is about to pay for. Seeded from the likely zone, but theirs to change.
const selectedZoneName = ref<string | null>(null)
const selectedZone = computed(
  () => allZones.value.find((z: any) => z.name === selectedZoneName.value) ?? null,
)

// Seed/repair the selection without ever overriding an explicit, still-valid choice.
watch([likelyZoneName, allZones], () => {
  const valid = allZones.value.some((z: any) => z.name === selectedZoneName.value)
  if (!valid) selectedZoneName.value = likelyZoneName.value ?? allZones.value[0]?.name ?? null
}, { immediate: true })

// ── Nearest confirmed sign — lead the user to verified ground truth ────────────
const toRad = (d: number) => (d * Math.PI) / 180
const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
const bearingDeg = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Closest confirmed sign to the user right now (within 1 km), with distance + bearing.
const nearestSign = computed(() => {
  const c = coords.value
  if (!c || !signReports.value.length) return null
  let best: any = null
  let bestD = Infinity
  for (const s of signReports.value) {
    if (s.lat == null || s.lng == null) continue
    const d = haversineM(c, { lat: s.lat, lng: s.lng })
    if (d < bestD) { bestD = d; best = s }
  }
  if (!best || bestD > 1000) return null
  return { report: best, distanceM: bestD, bearing: bearingDeg(c, { lat: best.lat, lng: best.lng }) }
})

// Arrow rotation for the nearest-sign card: relative to where the user faces when
// the compass is available, otherwise an absolute (north-up) bearing.
const nearestSignArrow = computed(() => {
  const n = nearestSign.value
  if (!n) return null
  return heading.value != null ? n.bearing - heading.value : n.bearing
})

// "Find my car" point, a tapped lead-to-sign point, else the nearest paid segment.
const leadSignPoint = ref<{ lat: number; lng: number } | null>(null)
const highlightPoint = computed(() => {
  if (locateCar.value && activeSession.value?.lat != null && activeSession.value?.lng != null) {
    return { lat: activeSession.value.lat, lng: activeSession.value.lng }
  }
  if (leadSignPoint.value) return leadSignPoint.value
  return parkingState.value === 'near' || parkingState.value === 'none'
    ? nearest.value?.point ?? null
    : null
})

// Tap the nearest-sign card → draw a line to it and open the map.
const onLeadToSign = () => {
  const n = nearestSign.value
  if (!n) return
  leadSignPoint.value = { lat: n.report.lat, lng: n.report.lng }
  mapExpanded.value = true
}

// ── Session actions ───────────────────────────────────────────────────────────
const sessionPayload = (zone: any) => ({
  cityId: detectedCity.value!.id,
  zone: { name: zone.name, color: zone.color, price: zone.price, rules: zone.rules },
  street: nearest.value?.streetName ?? null,
  lat: coords.value?.lat ?? null,
  lng: coords.value?.lng ?? null,
  plate: defaultPlate.value,
})

// Tapping a pay button opens the SMS composer (the <a href>) AND logs the session
const onPay = (zone: any) => { startOrExtend(sessionPayload(zone)) }

// Confirmed (slide or fast tap) → log the geotagged session, then hand off to the
// phone's SMS composer. The confirmation is the user's; Kerb only relays the SMS.
const pay = (zone: any) => {
  onPay(zone)
  if (import.meta.client && zone.sms_shortcode) window.location.href = smsLink(zone)
}

const onExtend = () => {
  const z = cityDetail.value?.zones?.find((x: any) => x.name === activeSession.value?.zone_name)
  if (!z) return
  startOrExtend(sessionPayload(z))
  if (import.meta.client && z.sms_shortcode) window.location.href = smsLink(z) // pay again
}

const onEndSession = () => { if (activeSession.value) endSession(activeSession.value.id) }
const onLocateCar = () => { locateCar.value = true; mapExpanded.value = true }

const pastSessions = computed(() =>
  sessionHistory.value.filter((s: any) => s.id !== activeSession.value?.id).slice(0, 5),
)

const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

const smsLink = (zone: any) => {
  const body = defaultPlate.value
    ? `?body=${encodeURIComponent(defaultPlate.value)}`
    : ''
  return `sms:${zone.sms_shortcode}${body}`
}

watch(detectedCity, async (city) => {
  if (!city) return
  loadingCityDetail.value = true
  try { cityDetail.value = await getCity(city.id) }
  finally { loadingCityDetail.value = false }

  // Load zone boundary GeoJSON if available for this city
  try {
    const res = await fetch(`/zones/${city.id}.json`)
    if (res.ok) {
      const data = await res.json()
      zoneBoundaries.value = data
    }
  } catch { /* no boundaries file, that's fine */ }

  // Load community sign scans for this city (verified pins on the map)
  signReports.value = await loadSignReports(city.id)
})

// A new confirmed scan: pin it immediately and make it the selected pay zone.
const onSignSubmitted = (report: any) => {
  signReports.value = [report, ...signReports.value]
  if (allZones.value.some((z: any) => z.name === report.zone_name)) {
    selectedZoneName.value = report.zone_name
  }
}

// Pay straight from the scan result — reuse the normal pay path (logs + SMS).
const onScanPay = (zone: any) => {
  showScan.value = false
  pay(zone)
}

watch(
  () => !!user.value && !!cityDetail.value,
  async (active) => {
    if (active && !userProfile.value) {
      userProfile.value = await getProfile()
    }
  }
)


// Guest-first: the live dashboard is available to anyone once a city is detected.
// Login only adds memory (session tracking, reminders, fine alerts).
const gpsMode = computed(() => !!(detectedCity.value && cityDetail.value))

// Start live GPS tracking + compass when GPS mode activates
watch(gpsMode, (active) => {
  if (active) {
    startTracking()
    startOrientation()
  } else {
    stopTracking()
    stopOrientation()
  }
}, { immediate: true })

const { data: cities, pending, error } = await useAsyncData('cities', getCities, { lazy: true })

const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searchFocused = ref(false)

let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  if (searchQuery.value.length < 2) { searchResults.value = []; return }
  searchTimeout = setTimeout(async () => {
    searchResults.value = await searchCities(searchQuery.value)
  }, 250)
}

const goToFirstResult = async () => {
  if (searchResults.value.length) {
    await navigateTo(`/${searchResults.value[0].id}`)
    searchResults.value = []
  }
}

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

const stats = [
  { val: '47', label: 'cities covered' },
  { val: '18', label: 'countries' },
  { val: '1.2K', label: 'verifications' },
]

const stripItems = [
  { city: '🇷🇸 Novi Sad', detail: '4 zones · 80–30 RSD/h · nSpark app' },
  { city: '🇸🇮 Ljubljana', detail: '3 zones · pay by app' },
  { city: '🇭🇷 Zagreb', detail: '4 zones · SMS payment' },
  { city: '🇨🇿 Prague', detail: 'Resident zones · ParkSync' },
  { city: '🇦🇹 Vienna', detail: 'Kurzparkzone · 2h max' },
  { city: '🇩🇪 Berlin', detail: 'Parkraum · pay by meter' },
  { city: '🇳🇱 Amsterdam', detail: 'Paid 24/7 · 4.10 €/h' },
]

const steps = [
  {
    num: '01',
    title: 'Search your city',
    body: 'Type any city. Instantly see how parking works — zones, prices, hours, and payment methods.',
  },
  {
    num: '02',
    title: 'Read the rules',
    body: 'Clear, structured information. No legal jargon. Exactly what you need to park without stress.',
  },
  {
    num: '03',
    title: 'Pay the right way',
    body: 'Each city guide tells you exactly how to pay — SMS, app, meter, or card. Confirm with local signage.',
  },
]

onMounted(() => {
  // Guest-first: detect the city for everyone, logged in or not.
  if (import.meta.client) {
    guestPlate.value = localStorage.getItem(GUEST_PLATE_KEY) ?? ''
    skipConfirm.value = localStorage.getItem(SKIP_CONFIRM_KEY) === '1'
  }
  detectCity()

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) }
      })
    },
    { threshold: 0.08 }
  )
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
})

useSeoMeta({
  title: 'Kerb — Street Parking Guide',
  description: 'Parking rules for any city in Europe. Zones, prices, payment methods and local tips.',
})
</script>

<style scoped>
/* Hero */
.hero {
  padding: 120px 24px 72px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: clamp(36px, 5vw, 56px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.5px;
  color: var(--text);
  margin-bottom: 18px;
}
.hero-sub {
  font-size: 16px;
  color: var(--muted);
  max-width: 520px;
  line-height: 1.7;
  margin-bottom: 32px;
}

/* GPS */
.gps-result {
  font-size: 14px;
  color: var(--text2);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  max-width: 560px;
  margin-bottom: 14px;
  overflow: hidden;
}
.gps-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  flex-wrap: wrap;
}
.gps-icon { font-size: 16px; flex-shrink: 0; }
.gps-link {
  margin-left: auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--green);
  white-space: nowrap;
}
.gps-link:hover { text-decoration: underline; }
.gps-error {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
  max-width: 560px;
}

/* Search */
.search-outer {
  position: relative;
  max-width: 560px;
  margin-bottom: 24px;
}
.search-wrap {
  display: flex;
  align-items: center;
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-shadow: var(--shadow-sm);
}
.search-wrap.focused {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--blue-bg);
}
.search-icon {
  padding: 0 14px;
  display: flex;
  align-items: center;
  color: var(--muted2);
}
.search-input {
  flex: 1;
  background: none;
  border: none;
  padding: 14px 0;
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--text);
  outline: none;
}
.search-input::placeholder { color: var(--muted2); }
.search-btn {
  background: var(--blue);
  border: none;
  padding: 13px 20px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  cursor: pointer;
  transition: background 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.search-btn:hover { background: var(--blue-hover); }
.search-btn:active { transform: scale(0.97); }
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  z-index: 50;
  box-shadow: var(--shadow-lg);
  transform-origin: top center;
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
}
.search-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.12s;
  cursor: pointer;
}
.search-result:last-child { border: none; }
.search-result:hover { background: var(--bg2); }
.sri-flag { font-size: 20px; }
.sri-name { font-size: 14px; font-weight: 500; }
.sri-country { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }
.sri-arrow { margin-left: auto; color: var(--muted2); font-size: 13px; }

/* Hero meta */
.hero-meta {
  font-size: 13px;
  color: var(--muted);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.hero-meta strong { color: var(--text2); font-weight: 600; }
.meta-sep { color: var(--border2); margin: 0 2px; }

/* Cities */
.section-cities {
  padding: 80px 0;
  border-bottom: 1px solid var(--border);
}
.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 36px;
}
h2 {
  font-size: clamp(26px, 4vw, 38px);
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.15;
  color: var(--text);
}
.view-all {
  font-size: 13px;
  color: var(--blue);
  font-weight: 500;
  transition: color 0.15s;
}
.view-all:hover { color: var(--blue-hover); }
.cities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.cities-grid .reveal:nth-child(2) { transition-delay: 50ms; }
.cities-grid .reveal:nth-child(3) { transition-delay: 100ms; }
.cities-grid .reveal:nth-child(4) { transition-delay: 150ms; }
.cities-grid .reveal:nth-child(5) { transition-delay: 200ms; }
.cities-grid .reveal:nth-child(6) { transition-delay: 250ms; }
.skeleton {
  height: 200px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
.error-msg { text-align: center; padding: 60px; color: var(--muted); }

/* How it works */
.section-how {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 80px 0;
}
.section-sub {
  font-size: 15px;
  color: var(--muted);
  max-width: 480px;
  line-height: 1.7;
  margin-top: 8px;
}
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-top: 48px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.step {
  background: var(--bg);
  padding: 28px 24px;
  border-right: 1px solid var(--border);
  transition: background 0.15s;
}
.step:last-child { border-right: none; }
.step:hover { background: var(--blue-bg); }
.step-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
  font-family: var(--font-mono);
  margin-bottom: 12px;
}
.step h3 {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
  margin-bottom: 8px;
}
.step p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

/* CTA */
.section-cta { padding: 80px 0; border-bottom: 1px solid var(--border); }
.cta-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  background: var(--blue-bg);
  border: 1px solid var(--blue-border);
  border-radius: var(--r-xl);
  padding: 48px;
}
.cta-sub {
  font-size: 15px;
  color: var(--muted);
  max-width: 440px;
  line-height: 1.7;
  margin-top: 8px;
}
.cta-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  align-items: stretch;
  min-width: 200px;
}

@media (max-width: 900px) {
  .cities-grid { grid-template-columns: 1fr 1fr; }
  .steps { grid-template-columns: 1fr; }
  .step { border-right: none; border-bottom: 1px solid var(--border); }
  .step:last-child { border-bottom: none; }
  .section-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .cta-inner { flex-direction: column; padding: 32px 24px; }
}
@media (max-width: 600px) {
  .cities-grid { grid-template-columns: 1fr; }
  .hero { padding: 100px 24px 48px; }
}

/* ── GPS DASHBOARD ── */
.gps-map-wrap {
  position: relative;
  border-radius: var(--r-lg);
  overflow: hidden;
  margin-bottom: 0;
}
.map-expand-btn {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 13px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text2);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: background 150ms;
}
.map-expand-btn span { font-size: 15px; line-height: 1; }
.map-expand-btn:hover { background: #fff; }

/* ── Fullscreen interactive map ── */
.map-fs {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.map-fs-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  padding-top: max(14px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
}
.map-fs-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
}
.map-fs-close {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--text2);
  background: var(--bg2, #f3f4f6);
  border: 1px solid var(--border);
  border-radius: 50%;
  cursor: pointer;
}
.map-fs-close:hover { color: var(--text); }
.map-fs-body {
  flex: 1 1 auto;
  min-height: 0;
}
.compass-btn {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(255,255,255,0.92);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
  backdrop-filter: blur(8px);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background 150ms;
}
.compass-btn:hover { background: #fff; }

.hero-gps {
  padding: 80px 0 40px;
  border-bottom: 1px solid var(--border);
}
.gps-hero-map {
  width: 100%;
  height: 260px;
  border-radius: var(--r-lg);
  overflow: hidden;
  margin-bottom: 0;
}
/* City bar below map */
.gps-city-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0 20px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}
.gps-city-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gps-city-flag { font-size: 28px; line-height: 1; }
.gps-city-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
}
.gps-city-country {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.gps-verified {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--green);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  padding: 3px 8px;
  border-radius: 20px;
}
.gps-full-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--blue);
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 150ms var(--ease-out);
}
.gps-full-link:hover { color: var(--blue-hover); }

/* Zone pay cards */
.gps-hours { margin-bottom: 20px; }
.gps-zones { margin-bottom: 20px; }

/* Recent sessions */
.gps-history { margin-top: 24px; }
.hist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.hist-row:last-child { border-bottom: none; }
.hist-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.hist-main { flex: 1; min-width: 0; font-size: 13px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist-zone { font-weight: 600; }
.hist-street { color: var(--muted); }
.hist-when { font-size: 12px; color: var(--muted2); font-family: var(--font-mono); flex-shrink: 0; }

/* No paid parking at the user's spot */
.gps-noparking {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--green);
  border-radius: var(--r-md);
}
.np-icon {
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
  filter: grayscale(0.3);
}
.np-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.np-sub { font-size: 13px; color: var(--muted); line-height: 1.5; }
.np-sub strong { color: var(--text); font-weight: 600; }

/* ── Zone picker (GPS narrows, the sign decides) ── */
.zone-pick-head { margin-bottom: 12px; }
.zone-pick-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
  margin-bottom: 4px;
}
.zone-pick-hint {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
/* Scan-the-sign CTA */
.scan-cta {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
  padding: 13px 14px;
  background: var(--blue-bg);
  border: 1.5px solid var(--blue-border);
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.scan-cta:hover { border-color: var(--blue); }
.scan-cta:active { transform: scale(0.99); }
.scan-cta-icon { font-size: 22px; line-height: 1; flex-shrink: 0; }
.scan-cta-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.scan-cta-title { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
.scan-cta-sub { font-size: 12px; color: var(--muted); line-height: 1.4; }
.scan-cta-arrow { font-size: 16px; color: var(--blue); flex-shrink: 0; }

/* Nearest confirmed sign — lead-me card */
.nsign {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
  padding: 11px 14px;
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.nsign:active { transform: scale(0.99); }
.nsign-arrow {
  flex-shrink: 0;
  font-size: 20px;
  line-height: 1;
  transition: transform 200ms var(--ease-out);
}
.nsign-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nsign-title { font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.1px; }
.nsign-sub { font-size: 12px; color: var(--muted); }
.nsign-go { font-size: 12px; font-weight: 600; color: var(--blue); flex-shrink: 0; white-space: nowrap; }

.zone-pick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.zone-pick {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 0;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out);
}
.zone-pick:hover { border-color: var(--border2); }
.zone-pick--active { box-shadow: var(--shadow-sm); }
.zone-pick-stripe { width: 5px; align-self: stretch; flex-shrink: 0; }
.zone-pick-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 13px 0;
}
.zone-pick-name { font-size: 14px; font-weight: 600; color: var(--text); }
.zone-pick-tag {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text2);
  background: var(--bg3);
  border: 1px solid var(--border);
  padding: 2px 7px;
  border-radius: 20px;
}
.zone-pick-price {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
  flex-shrink: 0;
}
.zone-pick-radio {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-right: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--border2);
  border-radius: 50%;
  font-size: 12px;
  color: #fff;
  transition: background 150ms, border-color 150ms;
}
.zone-pick-radio.on { background: var(--text); border-color: var(--text); }

/* Selected zone — rules + honest pay */
.zone-act {
  margin-top: 12px;
  padding: 16px;
  border: 1.5px solid;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
}
.zone-act-rules {
  font-size: 13px;
  color: var(--text2);
  line-height: 1.55;
  margin-bottom: 14px;
}
.zone-act-caution {
  font-size: 12px;
  color: var(--amber);
  line-height: 1.45;
  margin: -6px 0 14px;
}
.zone-act-caution strong { font-weight: 700; }
.zone-act-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 16px;
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  transition: filter 150ms var(--ease-out);
}
.zone-act-btn:hover { filter: brightness(0.9); }
.zone-act-arrow { margin-left: auto; opacity: 0.85; }
.zone-act-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}
.zone-act-link { font-size: 12px; color: var(--blue); font-weight: 500; }
.zone-act-link:hover { text-decoration: underline; }
.zone-act-src { font-size: 11px; color: var(--muted2); line-height: 1.45; }

/* Guest plate entry (no account) */
.zone-plate { margin: 0 0 12px; }
.zone-plate-input {
  width: 100%;
  padding: 11px 14px;
  font-family: var(--font-mono);
  font-size: 15px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text);
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color 150ms var(--ease-out), box-shadow 150ms var(--ease-out);
}
.zone-plate-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
.zone-plate-input::placeholder {
  font-family: var(--font-body);
  letter-spacing: 0;
  text-transform: none;
  color: var(--muted2);
}
.zone-plate-hint { display: block; margin-top: 6px; font-size: 11px; color: var(--muted2); line-height: 1.45; }
.zone-plate-hint a { color: var(--blue); }
.zone-plate-hint a:hover { text-decoration: underline; }

/* Guest → account nudge */
.guest-upsell {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px 14px;
  background: var(--blue-bg);
  border: 1px solid var(--blue-border);
  border-radius: var(--r-md);
}
.guest-upsell-icon { font-size: 16px; line-height: 1.4; flex-shrink: 0; }
.guest-upsell-text { font-size: 13px; color: var(--text2); line-height: 1.5; }
.guest-upsell-text a { color: var(--blue); font-weight: 500; }
.guest-upsell-text a:hover { text-decoration: underline; }

/* Responsibility opt-out under the pay control */
.zone-resp {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
  cursor: pointer;
}
.zone-resp-box { margin-top: 1px; flex-shrink: 0; cursor: pointer; }
.zone-resp--on { color: var(--amber); }

.gps-finecheck { margin-bottom: 20px; }

/* Fine warning */
.gps-fine {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  border-radius: var(--r-md);
  padding: 10px 14px;
}
.gps-fine-label {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.gps-fine-amount {
  font-size: 18px;
  font-weight: 700;
  color: var(--red);
  font-family: var(--font-mono);
}

/* Detecting state */
.gps-detecting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 14px;
}
</style>

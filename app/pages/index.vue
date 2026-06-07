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
              @compass-tap="onMapTap"
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
                  fill
                  interactive
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

        <!-- Hours (live free/paid status) -->
        <ParkingHours :city-id="detectedCity!.id" compact class="gps-hours" />

        <!-- Zone cards -->
        <div class="gps-zones">

          <!-- ── Suggested zone (hero card) ── -->
          <template v-if="suggestedZone">
            <p class="section-label">📍 Likely your zone</p>
            <div
              class="zone-hero-card"
              :style="{ borderColor: suggestedZone.color, background: suggestedZone.color + '0d' }"
            >
              <div class="zhc-stripe" :style="{ background: suggestedZone.color }" />
              <div class="zhc-body">
                <div class="zhc-top">
                  <span class="zhc-name">{{ suggestedZone.name }}</span>
                  <span class="zhc-price" :style="{ color: suggestedZone.color }">{{ suggestedZone.price }}</span>
                </div>
                <p class="zhc-rules">{{ suggestedZone.rules }}</p>
                <a
                  v-if="suggestedZone.sms_shortcode"
                  :href="smsLink(suggestedZone)"
                  class="zhc-sms-btn"
                  :style="{ background: suggestedZone.color }"
                >
                  <span>💬</span>
                  <span v-if="defaultPlate">Send {{ defaultPlate }} · {{ suggestedZone.sms_shortcode }}</span>
                  <span v-else>Pay via SMS · {{ suggestedZone.sms_shortcode }}</span>
                  <span class="zhc-sms-arrow">→</span>
                </a>
                <p v-if="suggestedZone.sms_shortcode && !defaultPlate" class="zpc-sms-hint">
                  <NuxtLink to="/profile">Add a plate</NuxtLink> for one-tap SMS
                </p>
              </div>
            </div>
          </template>

          <!-- ── Other zones (compact) ── -->
          <p class="section-label" :style="{ marginTop: suggestedZone ? '24px' : '0' }">
            {{ suggestedZone ? 'Other zones' : 'Parking zones' }}
          </p>
          <div class="zone-pay-list" :class="{ 'zone-pay-list--grid': !!suggestedZone }">
            <div
              v-for="zone in otherZones"
              :key="zone.id"
              class="zone-pay-card"
              :class="{ 'zone-pay-card--compact': !!suggestedZone }"
            >
              <div class="zpc-stripe" :style="{ background: zone.color }" />
              <div class="zpc-body">
                <div class="zpc-top">
                  <span class="zpc-name">{{ zone.name }}</span>
                  <span class="zpc-price">{{ zone.price }}</span>
                </div>
                <p class="zpc-rules">{{ zone.rules }}</p>
                <a
                  v-if="zone.sms_shortcode"
                  :href="smsLink(zone)"
                  class="zpc-sms-btn"
                >
                  <span class="zpc-sms-icon">💬</span>
                  <span>{{ zone.sms_shortcode }}</span>
                  <span class="zpc-sms-arrow">→</span>
                </a>
              </div>
            </div>
          </div>

        </div>

        <!-- Fine warning -->
        <div v-if="cityDetail.fine" class="gps-fine">
          <span class="gps-fine-label">Fine if unpaid</span>
          <span class="gps-fine-amount">{{ cityDetail.fine }}</span>
        </div>
      </div>
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
const { heading, start: startOrientation, stop: stopOrientation, onMapTap } = useDeviceOrientation()

const cityDetail = ref<any>(null)
const loadingCityDetail = ref(false)
const userProfile = ref<any>(null)
const zoneBoundaries = ref<any>(null)
const mapExpanded = ref(false)

// Lock body scroll + close on Escape while the fullscreen map is open
watch(mapExpanded, (open) => {
  if (import.meta.server) return
  document.body.style.overflow = open ? 'hidden' : ''
})
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') mapExpanded.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

const defaultPlate = computed(() => {
  const plates = userProfile.value?.plates ?? []
  return (plates.find((p: any) => p.is_default) ?? plates[0])?.plate ?? null
})

const isSuggested = (zone: any) =>
  !!suggestedZoneName.value && zone.name === suggestedZoneName.value

const suggestedZone = computed(() =>
  cityDetail.value?.zones?.find((z: any) => isSuggested(z)) ?? null
)

const otherZones = computed(() =>
  cityDetail.value?.zones?.filter((z: any) => !isSuggested(z)) ?? cityDetail.value?.zones ?? []
)

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
})

watch(
  () => !!user.value && !!cityDetail.value,
  async (active) => {
    if (active && !userProfile.value) {
      userProfile.value = await getProfile()
    }
  }
)


const gpsMode = computed(() => !!(user.value && detectedCity.value && cityDetail.value))

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
  // user is set async by the Supabase plugin — watch so we catch both immediate and delayed init
  if (user.value) {
    detectCity()
  } else {
    const stopWatch = watch(user, (u) => { if (u) { detectCity(); stopWatch() } })
  }

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
.zone-pay-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.zone-pay-card {
  display: flex;
  align-items: stretch;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  transition: box-shadow 200ms var(--ease-out), border-color 200ms var(--ease-out);
}
.zone-pay-card:hover { box-shadow: var(--shadow-sm); border-color: var(--border2); }
.zpc-stripe { width: 5px; flex-shrink: 0; }
.zpc-body { flex: 1; padding: 14px 16px; }
.zpc-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}
.zpc-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.zpc-price {
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--blue);
  letter-spacing: -0.5px;
}
.zpc-rules {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  margin-bottom: 10px;
}
.zpc-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

/* ── Hero zone card (suggested) ── */
.zone-hero-card {
  display: flex;
  align-items: stretch;
  border: 2px solid;
  border-radius: var(--r-lg);
  overflow: hidden;
  margin-top: 12px;
  box-shadow: var(--shadow-md);
}
.zhc-stripe {
  width: 8px;
  flex-shrink: 0;
}
.zhc-body {
  flex: 1;
  padding: 18px 20px;
}
.zhc-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.zhc-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text);
}
.zhc-price {
  font-size: 28px;
  font-weight: 800;
  font-family: var(--font-mono);
  letter-spacing: -1px;
  flex-shrink: 0;
}
.zhc-rules {
  font-size: 13px;
  color: var(--text2);
  line-height: 1.55;
  margin-bottom: 14px;
}
.zhc-sms-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  transition: filter 150ms var(--ease-out);
}
.zhc-sms-btn:hover { filter: brightness(0.88); }
.zhc-sms-arrow { margin-left: auto; opacity: 0.8; }

/* ── Compact other-zone cards ── */
.zone-pay-list--grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.zone-pay-card--compact {
  opacity: 0.72;
  transition: opacity 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
}
.zone-pay-card--compact:hover {
  opacity: 1;
  box-shadow: var(--shadow-sm);
  border-color: var(--border2);
}
.zone-pay-card--compact .zpc-body { padding: 10px 12px; }
.zone-pay-card--compact .zpc-name { font-size: 12px; }
.zone-pay-card--compact .zpc-price { font-size: 14px; }
.zone-pay-card--compact .zpc-rules { font-size: 11px; margin-bottom: 8px; }

/* SMS button (compact cards) */
.zpc-sms-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
  text-decoration: none;
  transition: background 150ms var(--ease-out);
}
.zpc-sms-btn:hover { background: var(--bg3); }
.zpc-sms-icon { font-size: 12px; flex-shrink: 0; }
.zpc-sms-arrow { margin-left: auto; opacity: 0.5; }
.zpc-sms-hint {
  font-size: 11px;
  color: var(--muted2);
  margin-top: 6px;
}
.zpc-sms-hint a { color: var(--blue); }
.zpc-sms-hint a:hover { text-decoration: underline; }

@media (max-width: 600px) {
  .zone-pay-list--grid { grid-template-columns: 1fr 1fr; }
}

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

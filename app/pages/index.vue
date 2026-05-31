<template>
  <div>
    <!-- ── HERO ── -->
    <section class="hero">
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

        <!-- GPS detected city -->
        <div v-if="detectedCity" class="gps-result fade-up-3">
          <span class="gps-icon">📍</span>
          <span>You appear to be in <strong>{{ detectedCity.flag }} {{ detectedCity.name }}</strong></span>
          <NuxtLink :to="`/${detectedCity.id}`" class="gps-link">View parking rules →</NuxtLink>
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
  </div>
</template>

<script setup lang="ts">
const { getCities, searchCities } = useCity()
const { user } = useAuth()
const { detectCity, detectedCity, detecting, gpsError } = useGPS()

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
  // Auto-detect city for logged-in users
  if (user.value) detectCity()

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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text2);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  padding: 10px 14px;
  max-width: 560px;
  margin-bottom: 14px;
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
  transition: background 0.15s;
}
.search-btn:hover { background: var(--blue-hover); }
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
</style>

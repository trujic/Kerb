<template>
  <div>
    <div class="back-bar">
      <div class="container">
        <NuxtLink to="/" class="back-link">← All cities</NuxtLink>
      </div>
    </div>

    <div v-if="pending" class="loading-wrap">
      <div class="loading-spinner" />
    </div>

    <div v-else-if="error || !city" class="error-wrap container">
      <h2>City not found</h2>
      <p>We don't have data for this city yet.</p>
      <NuxtLink to="/contribute" class="btn-primary" style="display:inline-block;margin-top:16px">
        Add this city →
      </NuxtLink>
    </div>

    <template v-else>
      <!-- Hero -->
      <section class="city-hero">
        <div class="container">
          <div class="hero-top">
            <div>
              <div class="city-flag fade-up">{{ city.flag }}</div>
              <h1 class="city-title fade-up-2">{{ city.name }}</h1>
              <p class="city-country fade-up-2">{{ city.country }} · Street parking guide</p>
            </div>
            <div class="hero-badges fade-up-3">
              <div class="status-badge" :class="city.verified ? 'verified' : 'unverified'">
                {{ city.verified ? '✓ Verified' : '⚠ Community data' }}
                <span v-if="city.verified_by"> · {{ city.verified_by }}</span>
              </div>
              <div class="date-badge">Updated {{ city.last_updated }}</div>
            </div>
          </div>

          <p class="city-overview fade-up-3">{{ city.overview }}</p>

          <div class="tag-row fade-up-3">
            <span v-for="tag in city.tags" :key="tag.id" class="tag">{{ tag.label }}</span>
          </div>
        </div>
      </section>

      <!-- Disclaimer -->
      <div class="disclaimer-bar">
        <div class="container">
          <svg class="disc-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>
            Last confirmed <strong>{{ city.last_updated }}</strong>.
            Parking rules change — always double-check with
            <a v-if="city.official_url" :href="city.official_url" target="_blank" rel="noopener" class="disc-link">the official source ↗</a><span v-else>official local signage</span>
            before you park.
          </span>
        </div>
      </div>

      <!-- Body -->
      <section class="city-body">
        <div class="container city-grid">
          <!-- LEFT -->
          <div class="left-col">
            <!-- Zones -->
            <div class="info-block">
              <p class="section-label">Parking zones</p>
              <div class="zone-list">
                <div v-for="zone in city.zones" :key="zone.id" class="zone-card">
                  <div class="zone-stripe" :style="{ background: zone.color }" />
                  <div class="zone-body">
                    <div class="zone-top">
                      <span class="zone-name">{{ zone.name }}</span>
                      <span class="zone-price">{{ zone.price }}</span>
                    </div>
                    <p class="zone-rules">{{ zone.rules }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Payment -->
            <div class="info-block">
              <p class="section-label">How to pay</p>
              <div class="payment-chips">
                <div v-for="pm in city.payment_methods" :key="pm.id" class="payment-chip">
                  {{ pm.label }}
                </div>
              </div>
              <div v-if="city.sms_instructions" class="sms-box">
                <p class="sms-label">Step by step — SMS</p>
                <p>{{ city.sms_instructions }}</p>
              </div>
            </div>

            <!-- Tips -->
            <div class="info-block">
              <p class="section-label">Local tips</p>
              <div class="tips-list">
                <div v-for="tip in city.tips" :key="tip.id" class="tip-row">
                  <span class="tip-icon">{{ tip.icon }}</span>
                  <span class="tip-text">{{ tip.text }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT (sidebar) -->
          <div class="right-col">
            <!-- Fine -->
            <div class="sidebar-card">
              <p class="section-label">Fine if unpaid</p>
              <div class="fine-amount">{{ city.fine }}</div>
              <p class="fine-note">Towing is also active — check local signage for current fine amounts.</p>
            </div>

            <!-- Official source -->
            <div v-if="city.official_url" class="sidebar-card official-card">
              <p class="section-label">Verify before you park</p>
              <p class="official-desc">
                This guide is a reference, not a guarantee. Confirm current rules on the official city parking website.
              </p>
              <a :href="city.official_url" target="_blank" rel="noopener" class="btn-primary official-btn">
                Official source ↗
              </a>
            </div>

            <!-- Contribute -->
            <div class="sidebar-card contrib-card">
              <p class="contrib-title">Know something we got wrong?</p>
              <p class="contrib-sub">Rules change. Help keep this guide accurate for the next traveler.</p>
              <NuxtLink to="/contribute" class="btn-ghost" style="display:block;text-align:center;width:100%">
                Suggest a correction
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { getCity } = useCity()

const { data: city, pending, error } = await useAsyncData(
  `city-${route.params.id}`,
  () => getCity(route.params.id as string),
  { lazy: true }
)

useSeoMeta({
  title: city.value ? `${city.value.name} Parking Guide — Kerb` : 'City not found',
  description: city.value?.overview ?? 'Street parking guide',
})
</script>

<style scoped>
.back-bar {
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  padding: 13px 0;
  margin-top: 53px;
}
.back-link {
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
  transition: color 0.15s;
}
.back-link:hover { color: var(--text); }

/* Loading */
.loading-wrap { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
.loading-spinner {
  width: 28px; height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-wrap { padding: 80px 0; }

/* Hero */
.city-hero {
  padding: 52px 0 36px;
  border-bottom: 1px solid var(--border);
}
.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.city-flag { font-size: 40px; margin-bottom: 10px; line-height: 1; }
.city-title {
  font-size: clamp(36px, 6vw, 64px);
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.05;
  margin-bottom: 4px;
}
.city-country {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.hero-badges {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  flex-shrink: 0;
}
.status-badge {
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 4px 10px;
  border-radius: 20px;
}
.status-badge.verified {
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  color: var(--green);
}
.status-badge.unverified {
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  color: var(--amber);
}
.date-badge {
  font-size: 11px;
  color: var(--muted2);
  font-family: var(--font-mono);
}
.city-overview {
  font-size: 15px;
  color: var(--muted);
  line-height: 1.7;
  max-width: 640px;
  margin-bottom: 16px;
}
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }

/* Disclaimer */
.disclaimer-bar {
  background: var(--blue-bg);
  border-bottom: 1px solid var(--blue-border);
  padding: 11px 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
.disclaimer-bar .container { display: flex; gap: 9px; align-items: flex-start; }
.disc-icon { color: var(--blue); flex-shrink: 0; margin-top: 2px; }
.disclaimer-bar strong { color: var(--text2); font-weight: 600; }
.disc-link { color: var(--blue); text-decoration: underline; text-underline-offset: 2px; }
.disc-link:hover { color: var(--blue-hover); }

/* Body */
.city-body { padding: 40px 0 80px; }
.city-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 40px;
  align-items: start;
}
.info-block { margin-bottom: 40px; }

/* Zones */
.zone-list { display: flex; flex-direction: column; gap: 8px; }
.zone-card {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg);
  transition: box-shadow 0.15s;
}
.zone-card:hover { box-shadow: var(--shadow-sm); }
.zone-stripe { width: 5px; flex-shrink: 0; }
.zone-body { flex: 1; padding: 14px 16px; }
.zone-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}
.zone-name { font-size: 14px; font-weight: 600; }
.zone-price {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--blue);
}
.zone-rules { font-size: 13px; color: var(--muted); line-height: 1.5; }

/* Payment */
.payment-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.payment-chip {
  padding: 7px 13px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: 13px;
  color: var(--text2);
}
.sms-box {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--blue);
  border-radius: var(--r-md);
  padding: 14px 16px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}
.sms-label {
  font-size: 10px;
  font-family: var(--font-mono);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--blue);
  margin-bottom: 6px;
}

/* Tips */
.tips-list { display: flex; flex-direction: column; }
.tip-row {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  align-items: flex-start;
}
.tip-row:last-child { border-bottom: none; }
.tip-icon { font-size: 15px; flex-shrink: 0; padding-top: 2px; }
.tip-text { font-size: 13px; color: var(--muted); line-height: 1.55; }

/* Sidebar */
.sidebar-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px;
  margin-bottom: 10px;
}
.fine-amount {
  font-size: 24px;
  font-weight: 700;
  color: var(--red);
  letter-spacing: -0.3px;
  margin-bottom: 4px;
}
.fine-note { font-size: 11px; color: var(--muted2); line-height: 1.5; }
.official-card {
  background: var(--blue-bg);
  border-color: var(--blue-border);
}
.official-desc { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 14px; }
.official-btn { display: block; text-align: center; width: 100%; }
.contrib-card { background: var(--bg2); }
.contrib-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.contrib-sub { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 12px; }

@media (max-width: 900px) {
  .city-grid { grid-template-columns: 1fr; }
  .right-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .hero-badges { align-items: flex-start; }
}
@media (max-width: 600px) {
  .right-col { grid-template-columns: 1fr; }
  .hero-top { flex-direction: column; }
}
</style>

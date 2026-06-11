<template>
  <div>
    <section class="page-hero">
      <div class="container">
        <p class="section-label">Community</p>
        <h1>CONTRIBUTE</h1>
        <p class="page-sub">
          Help keep Kerb accurate for every traveler. Submit a correction,
          add a missing city, or update outdated information.
        </p>
      </div>
    </section>

    <section class="page-body">
      <div class="container">
        <!-- On-location? The fastest, most accurate contribution is a sign scan. -->
        <NuxtLink to="/" class="scan-promo">
          <span class="scan-promo-icon">📸</span>
          <span class="scan-promo-text">
            <span class="scan-promo-title">Standing next to a parking sign? Scan it.</span>
            <span class="scan-promo-sub">
              The sign is ground truth. On the home screen, tap <strong>Scan the sign</strong> —
              we read the zone and price off your photo, pin it on the map, and prefill the payment.
            </span>
          </span>
          <span class="scan-promo-arrow">→</span>
        </NuxtLink>

        <p class="contrib-or">or submit details manually</p>

        <form class="contrib-form" @submit.prevent="handleSubmit">
          <div v-if="success" class="success-msg">
            Thanks! Your contribution has been received.
          </div>
          <template v-else>
            <div class="form-group">
              <label class="form-label">City name *</label>
              <input
                v-model="form.city_name"
                class="form-input"
                type="text"
                placeholder="e.g. Novi Sad"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Country *</label>
              <input
                v-model="form.country"
                class="form-input"
                type="text"
                placeholder="e.g. Serbia"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Type of update *</label>
              <select v-model="form.update_type" class="form-input" required>
                <option value="">Select...</option>
                <option value="new_city">Add a new city</option>
                <option value="zone_info">Zone information</option>
                <option value="pricing">Pricing update</option>
                <option value="payment">Payment methods</option>
                <option value="other">Other correction</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Details *</label>
              <textarea
                v-model="form.content"
                class="form-input"
                placeholder="Describe the update as precisely as possible..."
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Source URL (optional)</label>
              <input
                v-model="form.source_url"
                class="form-input"
                type="url"
                placeholder="https://..."
              />
            </div>
            <div v-if="submitError" class="error-msg">
              {{ submitError }}
            </div>
            <button type="submit" class="btn-primary" :disabled="submitting">
              {{ submitting ? 'Submitting...' : 'Submit contribution →' }}
            </button>
          </template>
        </form>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { submitContribution } = useCity()

const form = reactive({
  city_name: '',
  country: '',
  update_type: '',
  content: '',
  source_url: '',
})
const submitting = ref(false)
const success = ref(false)
const submitError = ref('')

const handleSubmit = async () => {
  submitting.value = true
  submitError.value = ''
  try {
    await submitContribution(form)
    success.value = true
  } catch {
    submitError.value = 'Failed to submit. Please try again.'
  } finally {
    submitting.value = false
  }
}

useSeoMeta({
  title: 'Contribute — Kerb',
  description: 'Help keep Kerb accurate. Submit parking rule updates for any city.',
})
</script>

<style scoped>
.page-hero {
  padding: 100px 0 40px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.1;
  margin-bottom: 14px;
}
.page-sub { font-size: 15px; color: var(--muted); max-width: 500px; line-height: 1.7; }
.page-body { padding: 48px 0 80px; }
.scan-promo {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 540px;
  margin-bottom: 24px;
  padding: 16px 18px;
  background: var(--blue-bg);
  border: 1.5px solid var(--blue-border);
  border-radius: var(--r-lg);
  transition: border-color 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.scan-promo:hover { border-color: var(--blue); }
.scan-promo:active { transform: scale(0.995); }
.scan-promo-icon { font-size: 26px; line-height: 1; flex-shrink: 0; }
.scan-promo-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.scan-promo-title { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
.scan-promo-sub { font-size: 13px; color: var(--muted); line-height: 1.5; }
.scan-promo-sub strong { color: var(--text2); font-weight: 600; }
.scan-promo-arrow { font-size: 18px; color: var(--blue); flex-shrink: 0; }
.contrib-or {
  max-width: 540px;
  margin-bottom: 18px;
  font-size: 12px;
  color: var(--muted2);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.contrib-form { max-width: 540px; display: flex; flex-direction: column; gap: 18px; }
.form-group { display: flex; flex-direction: column; }
.success-msg {
  padding: 18px;
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  color: var(--green);
  font-size: 14px;
}
.error-msg { color: var(--red); font-size: 13px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

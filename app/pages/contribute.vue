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

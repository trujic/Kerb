<template>
  <div class="fine-check">
    <div class="fc-head">
      <p class="section-label">{{ t('finesLabel') }}</p>
      <h3 class="fc-title">{{ t('fineCheckTitle') }}</h3>
      <p class="fc-sub">{{ t('fineCheckSub') }}</p>
    </div>

    <form class="fc-form" @submit.prevent="run">
      <input
        v-model="plate"
        class="fc-input"
        type="text"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        placeholder="NS123AB"
        @input="plate = plate.toUpperCase()"
      />
      <button class="fc-btn" type="submit" :disabled="pending || plate.trim().length < 4">
        {{ pending ? t('checking') : t('checkBtn') }}
      </button>
    </form>

    <p v-if="error" class="fc-error">{{ error }}</p>

    <!-- No fines -->
    <div v-else-if="result && !result.hasFines" class="fc-clear">
      <span class="fc-clear-icon">✓</span>
      <div>
        <p class="fc-clear-title">{{ t('noFines', { plate: result.plate }) }}</p>
        <p class="fc-clear-sub">{{ t('noFinesSub', { time: checkedTime }) }}</p>
      </div>
    </div>

    <!-- Fines found -->
    <div v-else-if="result && result.hasFines" class="fc-results">
      <div class="fc-total">
        <span class="fc-total-label">{{ totalLabel }}</span>
        <span class="fc-total-amount">{{ fmt(result.totalDue) }} {{ result.currency }}</span>
      </div>

      <div v-for="(f, i) in result.fines" :key="f.ticketNo ?? i" class="fc-fine">
        <div class="fc-fine-top">
          <span class="fc-fine-amount">{{ fmt(f.amount) }} {{ result.currency }}</span>
          <span class="fc-fine-flag">{{ t('unpaid') }}</span>
        </div>
        <p v-if="f.status" class="fc-fine-status">{{ f.status }}</p>
        <p class="fc-fine-meta">
          <span v-if="f.ticketNo">{{ t('orderNo', { no: f.ticketNo }) }}</span>
          <span v-if="f.recipient"> · {{ f.recipient }}</span>
        </p>
      </div>

      <p class="fc-src">{{ t('fineSrc', { time: checkedTime }) }}</p>
    </div>

    <!-- Idle -->
    <p v-else class="fc-src fc-src--idle">{{ t('fineIdle') }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ initialPlate?: string | null }>()

const { result, pending, error, check } = useFineCheck()
const { t, lang } = useLang()
const plate = ref(props.initialPlate ?? '')

// Serbian counts decline: 1 kazna, 2–4 kazne, 5+ kazni.
const totalLabel = computed(() => {
  const r = result.value
  if (!r) return ''
  if (lang.value === 'sr') {
    const w = r.count === 1 ? 'kazna' : r.count < 5 ? 'kazne' : 'kazni'
    return `${r.count} ${w} za naplatu · ${r.plate}`
  }
  return `${r.count} outstanding ${r.count === 1 ? 'fine' : 'fines'} · ${r.plate}`
})

// Follow the dashboard's plate — including chip switches — without clobbering
// manual input: only replace the field while it still holds what the dashboard
// last put there (or is empty). A hand-typed plate stays until cleared.
watch(() => props.initialPlate, (p, prev) => {
  if (p && (!plate.value || plate.value === prev)) plate.value = p
})

const run = () => check(plate.value)

const fmt = (n: number) => n.toLocaleString('sr-RS')

const checkedTime = computed(() =>
  result.value
    ? new Date(result.value.checkedAt).toLocaleString('en-GB', {
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
      })
    : '',
)
</script>

<style scoped>
.fine-check {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px;
  background: var(--bg);
}
.fc-head { margin-bottom: 14px; }
.fc-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
  margin: 4px 0 6px;
}
.fc-sub { font-size: 13px; color: var(--muted); line-height: 1.55; }

.fc-form { display: flex; gap: 8px; }
.fc-input {
  flex: 1;
  min-width: 0;
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
.fc-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
.fc-input::placeholder { letter-spacing: 0; color: var(--muted2); }
.fc-btn {
  flex-shrink: 0;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--blue);
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 150ms var(--ease-out), opacity 150ms var(--ease-out);
}
.fc-btn:hover:not(:disabled) { background: var(--blue-hover); }
.fc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.fc-error { margin-top: 12px; font-size: 13px; color: var(--red); }

/* No fines */
.fc-clear {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
}
.fc-clear-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--green);
  border-radius: 50%;
}
.fc-clear-title { font-size: 14px; font-weight: 700; color: var(--text); }
.fc-clear-sub { font-size: 12px; color: var(--muted); line-height: 1.5; margin-top: 3px; }

/* Fines found */
.fc-results { margin-top: 14px; }
.fc-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.fc-total-label { font-size: 13px; font-weight: 600; color: var(--text2); }
.fc-total-amount {
  font-size: 20px;
  font-weight: 800;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
  color: var(--red);
  flex-shrink: 0;
}
.fc-fine {
  padding: 12px 14px;
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  border-radius: var(--r-md);
}
.fc-fine + .fc-fine { margin-top: 8px; }
.fc-fine-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fc-fine-amount {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text);
}
.fc-fine-flag {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--red);
  background: var(--bg);
  border: 1px solid var(--red-border);
  padding: 2px 7px;
  border-radius: 20px;
}
.fc-fine-status { font-size: 12px; color: var(--text2); margin-top: 6px; line-height: 1.4; }
.fc-fine-meta { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }

.fc-src { font-size: 11px; color: var(--muted2); line-height: 1.45; margin-top: 12px; }
.fc-src--idle { margin-top: 12px; }
</style>

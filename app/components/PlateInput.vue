<template>
  <div class="plate-field">
    <!-- Styled like a real Serbian plate: blue SRB euro-band + black mono chars -->
    <div class="plate" :class="{ 'plate--busy': busy }">
      <span class="plate-band">
        <span class="plate-stars">★</span>
        <span class="plate-srb">SRB</span>
      </span>
      <input
        class="plate-input"
        :value="modelValue"
        type="text"
        inputmode="text"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="10"
        :placeholder="placeholder"
        @input="onInput"
      />
      <button
        type="button"
        class="plate-cam"
        :aria-label="busy ? t('plateReadingAria') : t('plateScanAria')"
        :disabled="busy"
        @click="pick"
      >
        <span v-if="busy" class="plate-spin" />
        <Icon v-else name="camera" :size="18" />
      </button>
      <input
        ref="fileEl"
        type="file"
        accept="image/*"
        capture="environment"
        class="plate-file"
        @change="onFile"
      />
    </div>

    <p class="plate-hint">
      <span v-if="confidence !== null" class="plate-conf">
        {{ t('plateConf', { pct: Math.round(confidence * 100) }) }}
      </span>
      {{ t('plateOcrHint') }}
    </p>
    <p v-if="scanError" class="plate-err">{{ scanError }}</p>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), { placeholder: 'NS123AB' })

const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const { readPlate } = usePlateScan('ocr')
const { t } = useLang()

const fileEl = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const confidence = ref<number | null>(null)
const scanError = ref('')

// Uppercase, letters + digits only — but ANY letters: foreign plates (Ü, Ö, …)
// are typed exactly as they appear on the vehicle, never silently stripped.
const clean = (v: string) => v.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')

const onInput = (e: Event) => {
  confidence.value = null // a manual edit supersedes the read
  emit('update:modelValue', clean((e.target as HTMLInputElement).value))
}

const pick = () => fileEl.value?.click()

const onFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  scanError.value = ''
  busy.value = true
  try {
    const res = await readPlate(file)
    if (res.plate) {
      emit('update:modelValue', res.plate)
      confidence.value = res.confidence
    } else {
      scanError.value = t('plateNoRead')
    }
  } catch {
    scanError.value = t('plateFail')
  } finally {
    busy.value = false
    if (fileEl.value) fileEl.value.value = ''
  }
}
</script>

<style scoped>
.plate {
  display: flex;
  align-items: stretch;
  height: 50px;
  background: #F4F4F0;            /* real plates are white — kept light on purpose */
  border: 2px solid #11131A;
  border-radius: 7px;
  overflow: hidden;
  box-shadow: var(--shadow-sm), inset 0 0 0 1px rgba(0,0,0,0.06);
}
.plate--busy { opacity: 0.85; }
.plate-band {
  flex-shrink: 0;
  width: 34px;
  background: #1E40AF;           /* EU/SRB blue band */
  color: #FFD23F;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-family: var(--font-mono);
}
.plate-stars { font-size: 9px; line-height: 1; }
.plate-srb { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #fff; }
.plate-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  padding: 0 12px;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #11131A;
  outline: none;
}
.plate-input::placeholder { color: #9AA1AD; letter-spacing: 2px; font-weight: 500; }
.plate-cam {
  flex-shrink: 0;
  width: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #11131A;
  background: #E6E7E2;
  border: none;
  border-left: 1px solid rgba(0,0,0,0.12);
  cursor: pointer;
  transition: background 150ms;
}
.plate-cam:hover:not(:disabled) { background: #DADBD5; }
.plate-cam:disabled { cursor: default; }
.plate-file { display: none; }
.plate-spin {
  width: 16px; height: 16px;
  border: 2px solid rgba(0,0,0,0.25);
  border-top-color: #11131A;
  border-radius: 50%;
  animation: plate-spin 0.7s linear infinite;
}
@keyframes plate-spin { to { transform: rotate(360deg); } }
.plate-hint { margin-top: 7px; font-size: 12px; color: var(--muted); line-height: 1.45; }
.plate-conf {
  display: inline-block;
  margin-right: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--amber);
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  padding: 1px 6px;
  border-radius: 20px;
}
.plate-err { margin-top: 6px; font-size: 12px; color: var(--red); line-height: 1.45; }
</style>

<template>
  <Teleport to="body">
    <div class="scan" role="dialog" aria-label="Scan the parking sign">
      <!-- Bar -->
      <div class="scan-bar">
        <span class="scan-title">🪧 Scan the sign</span>
        <button class="scan-close" type="button" aria-label="Close" @click="$emit('close')">✕</button>
      </div>

      <div class="scan-body">
        <!-- ── 1 · Capture ── -->
        <template v-if="step === 'capture'">
          <!-- Guest meter: free scans used up -->
          <div v-if="metered" class="scan-hero">
            <div class="scan-hero-icon">🔒</div>
            <p class="scan-hero-title">That's your {{ FREE_SCANS }} free scans</p>
            <p class="scan-hero-sub">
              Every scan you add improves the shared sign map — thank you. Create a free
              account to keep scanning. (Kerbo+ will be unlimited.)
            </p>
            <NuxtLink to="/login" class="scan-btn scan-meter-cta">Create a free account →</NuxtLink>
            <button class="scan-btn-ghost wide" type="button" @click="$emit('close')">Maybe later</button>
          </div>

          <template v-else>
            <div class="scan-hero">
              <div class="scan-hero-icon">📸</div>
              <p class="scan-hero-title">Photograph the parking sign</p>
              <p class="scan-hero-sub">
                The sign is the source of truth. Snap the colored zone sign next to your car —
                we read the zone and price off it, you confirm, and it goes on the map for
                everyone. Then we prefill the right payment.
              </p>
            </div>

            <label class="scan-shutter">
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                capture="environment"
                class="scan-file"
                @change="onFile"
              />
              <span class="scan-shutter-ring"><span class="scan-shutter-dot" /></span>
              <span class="scan-shutter-label">Open camera</span>
            </label>

            <p v-if="!user && used === FREE_SCANS - 1" class="scan-meter-note">
              Last free scan — create an account to keep going.
            </p>
            <p v-if="!coords" class="scan-warn">
              ⚠️ Location not available yet — we need your GPS to pin the sign. Allow location and try again.
            </p>
          </template>
        </template>

        <!-- ── 2 · Reading ── -->
        <template v-else-if="step === 'reading'">
          <div class="scan-preview-wrap">
            <img v-if="photoUrl" :src="photoUrl" class="scan-preview" alt="Captured sign" />
          </div>
          <div class="scan-status">
            <span class="scan-spinner" />
            <span>Reading the sign…</span>
          </div>
        </template>

        <!-- ── 3 · Confirm / correct ── -->
        <template v-else-if="step === 'confirm'">
          <div class="scan-preview-wrap">
            <img v-if="photoUrl" :src="photoUrl" class="scan-preview" alt="Captured sign" />
          </div>

          <!-- Per-field read: green ✓ / amber double-check / red can't-read -->
          <div class="scan-fields">
            <p class="scan-fields-head">What we read off the sign</p>
            <div v-for="f in fieldRows" :key="f.label" class="scan-field">
              <span class="scan-field-label">{{ f.label }}</span>
              <span class="scan-field-val" :class="'st-' + f.state">
                {{ f.display }}
                <span class="scan-field-tag">{{ f.state === 'read' ? '✓' : f.state === 'low' ? '~ check' : '✕' }}</span>
              </span>
            </div>
          </div>

          <!-- Colour vs text corroboration -->
          <p v-if="read?.corroboration === 'agree'" class="scan-corr ok">
            ✓ Colour and text both read <strong>{{ read.zone?.name }}</strong>.
          </p>
          <p v-else-if="read?.corroboration === 'conflict'" class="scan-corr warn">
            ⚠ The colour looks like <strong>{{ read.color?.zone?.name }}</strong> but the text read
            <strong>{{ read.zone?.name }}</strong> — look again and pick what the sign actually says.
          </p>
          <p v-else-if="read?.corroboration === 'color-only'" class="scan-corr">
            Colour suggests <strong>{{ read.color?.zone?.name }}</strong> (text was unclear) — confirm below.
          </p>

          <!-- Unsafe read → no pre-fill, the user must pick deliberately -->
          <p v-if="zoneUnsafe" class="scan-unsafe">
            No pre-fill — the zone read wasn't safe enough to trust with your money. Pick the zone printed on the sign.
          </p>
          <p v-else class="scan-read-hint scan-read-hint--block">Tap a zone below if that's wrong.</p>

          <div class="scan-zones">
            <button
              v-for="z in zones"
              :key="z.name"
              type="button"
              class="scan-zone"
              :class="{ 'scan-zone--on': z.name === selectedName }"
              :style="z.name === selectedName ? { borderColor: z.color, background: z.color + '0f' } : null"
              @click="selectedName = z.name"
            >
              <span class="scan-zone-stripe" :style="{ background: z.color }" />
              <span class="scan-zone-name">{{ z.name }}</span>
              <span class="scan-zone-price" :style="{ color: z.color }">{{ z.price }}</span>
              <span class="scan-zone-radio" :class="{ on: z.name === selectedName }">
                <span v-if="z.name === selectedName">✓</span>
              </span>
            </button>
          </div>

          <!-- GPS cross-check: read vs registry -->
          <div v-if="crossCheck" class="scan-xcheck" :class="crossCheck">
            <template v-if="crossCheck === 'match'">✓ Matches the registry for this spot.</template>
            <template v-else>⚠️ Differs from the registry here — trust the sign in front of you, and make sure you scanned the one next to your car.</template>
          </div>

          <p v-if="submitError" class="scan-warn">{{ submitError }}</p>

          <div class="scan-actions">
            <button class="scan-btn-ghost" type="button" @click="reset">Retake</button>
            <button
              class="scan-btn"
              type="button"
              :disabled="!selectedZone || submitting"
              :style="selectedZone ? { background: selectedZone.color } : null"
              @click="confirm"
            >
              {{ submitting ? 'Saving…' : 'Confirm & pin this sign' }}
            </button>
          </div>
        </template>

        <!-- ── 4 · Done ── -->
        <template v-else-if="step === 'done' && selectedZone">
          <div class="scan-done">
            <div class="scan-done-badge" :style="{ background: selectedZone.color + '1a', borderColor: selectedZone.color }">
              <span class="scan-done-check" :style="{ color: selectedZone.color }">✓</span>
            </div>
            <p class="scan-done-title">Pinned · {{ selectedZone.name }}</p>
            <p class="scan-done-sub">
              <strong>+1 sign added to the street map.</strong>
              Thanks — that confirmed sign now helps everyone here (and powers “Ask AI”).
            </p>

            <button
              v-if="selectedZone.sms_shortcode"
              class="scan-btn"
              type="button"
              :style="{ background: selectedZone.color }"
              @click="payNow"
            >
              Pay {{ selectedZone.name }} <span class="scan-btn-arrow">→ {{ selectedZone.sms_shortcode }}</span>
            </button>

            <button class="scan-btn-ghost wide" type="button" @click="reset">Scan another</button>
            <button class="scan-textlink" type="button" @click="$emit('close')">Done</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ZoneDef, SignReport } from '~/composables/useSignScan'

const props = defineProps<{
  cityId: string
  zones: ZoneDef[]
  coords: { lat: number; lng: number; accuracy?: number } | null
  heading?: number | null
  street?: string | null
  likelyZoneName?: string | null
}>()

const emit = defineEmits<{
  close: []
  submitted: [report: SignReport]
  pay: [zone: ZoneDef]
}>()

const { readSign, submit, compressImage, FREE_SCANS, scansUsed, incScan } = useSignScan('ocr')
const user = useSupabaseUser()

// Guest scan meter (best-effort, on-device). Logged-in users aren't metered yet.
const used = ref(0)
onMounted(() => { used.value = scansUsed() })
const metered = computed(() => !user.value && used.value >= FREE_SCANS)

type Step = 'capture' | 'reading' | 'confirm' | 'submitting' | 'done'
const step = ref<Step>('capture')

const fileInput = ref<HTMLInputElement | null>(null)
const photoBlob = ref<Blob | null>(null)
const photoUrl = ref<string | null>(null)
const read = ref<Awaited<ReturnType<typeof readSign>> | null>(null)
const selectedName = ref<string | null>(null)
const submitting = ref(false)
const submitError = ref('')

// GPS + heading are snapshotted at the moment of capture, not at submit.
const shotCoords = ref<{ lat: number; lng: number; accuracy?: number } | null>(null)
const shotHeading = ref<number | null>(null)

const selectedZone = computed<ZoneDef | null>(
  () => props.zones.find((z) => z.name === selectedName.value) ?? null,
)

// Per-field read panel (amber for low, red "can't read" for unreadable).
const fieldRows = computed(() => {
  const f = read.value?.fields
  if (!f) return []
  const row = (label: string, fld: { value: string | null; state: string }) => ({
    label,
    state: fld.state,
    display: fld.state === 'unreadable' ? "can't read" : (fld.value ?? '—'),
  })
  return [row('Zone', f.zone), row('Price', f.price), row('Limit', f.limit), row('SMS code', f.code)]
})

// The zone read wasn't safe enough to seed payment from — force a manual pick.
const zoneUnsafe = computed(() => read.value?.fields.zone.state === 'unreadable')

// GPS cross-check: does the picked zone match what the registry expects here?
const crossCheck = computed<'match' | 'mismatch' | null>(() => {
  if (!selectedName.value || !props.likelyZoneName) return null
  return selectedName.value === props.likelyZoneName ? 'match' : 'mismatch'
})

const setPhoto = (blob: Blob) => {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoBlob.value = blob
  photoUrl.value = URL.createObjectURL(blob)
}

const onFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  submitError.value = ''
  // Snapshot location at the instant the photo is taken.
  shotCoords.value = props.coords ? { ...props.coords } : null
  shotHeading.value = props.heading ?? null

  step.value = 'reading'
  try {
    const compressed = await compressImage(file)
    setPhoto(compressed)
    read.value = await readSign(compressed, props.zones)
    // Block pre-fill from an unsafe read: only auto-select when the zone read well.
    // Colour can stand in for the text when the OCR couldn't.
    selectedName.value = read.value.fields.zone.state === 'unreadable'
      ? null
      : (read.value.zone?.name ?? read.value.color?.zone?.name ?? props.likelyZoneName ?? null)
  } catch (err) {
    console.warn('[Kerb] sign read failed:', err)
    read.value = {
      rawText: '', zone: null, confidence: 0,
      color: null, corroboration: 'none',
      fields: {
        zone: { value: null, state: 'unreadable' },
        price: { value: null, state: 'unreadable' },
        limit: { value: null, state: 'unreadable' },
        code: { value: null, state: 'unreadable' },
      },
    }
    selectedName.value = props.likelyZoneName ?? null
  }
  step.value = 'confirm'
}

const confirm = async () => {
  if (!selectedZone.value || !photoBlob.value) return
  const loc = shotCoords.value ?? props.coords
  if (!loc) {
    submitError.value = 'No GPS fix — allow location, then retake so we can pin the sign.'
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    const report = await submit({
      cityId: props.cityId,
      zone: selectedZone.value,
      street: props.street ?? null,
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy ?? null,
      heading: shotHeading.value,
      rawText: read.value?.rawText ?? null,
      confidence: read.value?.confidence ?? null,
      photo: photoBlob.value,
    })
    emit('submitted', report)
    incScan()
    used.value += 1
    step.value = 'done'
  } catch (err: any) {
    console.warn('[Kerb] sign submit failed:', err)
    submitError.value = 'Could not save the scan. Check your connection and try again.'
  } finally {
    submitting.value = false
  }
}

const payNow = () => { if (selectedZone.value) emit('pay', selectedZone.value) }

const reset = () => {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoBlob.value = null
  photoUrl.value = null
  read.value = null
  selectedName.value = null
  submitError.value = ''
  step.value = 'capture'
  if (fileInput.value) fileInput.value.value = ''
}

onUnmounted(() => { if (photoUrl.value) URL.revokeObjectURL(photoUrl.value) })
</script>

<style scoped>
.scan {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: var(--bg, #fff);
}
.scan-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  padding-top: max(14px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
}
.scan-title { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; color: var(--text); }
.scan-close {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--text2);
  background: var(--bg2, #f3f4f6); border: 1px solid var(--border);
  border-radius: 50%; cursor: pointer;
}
.scan-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px 20px 40px;
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
}

/* Capture */
.scan-hero { text-align: center; padding-top: 12px; }
.scan-hero-icon { font-size: 44px; line-height: 1; margin-bottom: 14px; }
.scan-hero-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; color: var(--text); margin-bottom: 8px; }
.scan-hero-sub { font-size: 14px; color: var(--muted); line-height: 1.6; max-width: 380px; margin: 0 auto; }
.scan-shutter {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  cursor: pointer;
}
.scan-file { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.scan-shutter-ring {
  width: 84px; height: 84px;
  border-radius: 50%;
  border: 3px solid var(--blue);
  display: flex; align-items: center; justify-content: center;
  background: var(--blue-bg);
  transition: transform 150ms var(--ease-out);
}
.scan-shutter:active .scan-shutter-ring { transform: scale(0.94); }
.scan-shutter-dot { width: 58px; height: 58px; border-radius: 50%; background: var(--blue); }
.scan-shutter-label { font-size: 14px; font-weight: 600; color: var(--blue); }
.scan-warn {
  font-size: 13px; color: var(--amber, #b45309); line-height: 1.5;
  background: var(--amber-bg, #fffbeb); border: 1px solid var(--amber-border, #fde68a);
  border-radius: var(--r-md); padding: 10px 12px; text-align: center;
}

/* Preview + reading */
.scan-preview-wrap {
  border-radius: var(--r-lg); overflow: hidden;
  background: var(--bg2); border: 1px solid var(--border);
  max-height: 320px; display: flex; align-items: center; justify-content: center;
}
.scan-preview { width: 100%; height: auto; max-height: 320px; object-fit: contain; display: block; }
.scan-status { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 14px; color: var(--muted); }
.scan-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--border2); border-top-color: var(--blue);
  animation: scan-spin 0.7s linear infinite;
}
@keyframes scan-spin { to { transform: rotate(360deg); } }

/* Confirm */
.scan-read-line { font-size: 14px; color: var(--text2); line-height: 1.6; }
.scan-read-hint { color: var(--muted); }
.scan-read-hint--block { display: block; font-size: 12px; }

/* Per-field read panel */
.scan-fields {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
  overflow: hidden;
}
.scan-fields-head {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--muted2);
  padding: 10px 14px 6px;
}
.scan-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-top: 1px solid var(--border);
}
.scan-field-label { font-size: 13px; color: var(--muted); }
.scan-field-val {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--text);
}
.scan-field-tag { font-size: 11px; font-weight: 700; }
.scan-field-val.st-read .scan-field-tag { color: var(--green); }
.scan-field-val.st-low { color: var(--amber); }
.scan-field-val.st-low .scan-field-tag { color: var(--amber); }
.scan-field-val.st-unreadable { color: var(--red); }
.scan-field-val.st-unreadable .scan-field-tag { color: var(--red); }

.scan-corr {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted);
  padding: 9px 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.scan-corr strong { font-weight: 700; }
.scan-corr.ok { color: var(--green); background: var(--green-bg); border-color: var(--green-border); }
.scan-corr.warn { color: var(--amber); background: var(--amber-bg); border-color: var(--amber-border); }

.scan-unsafe {
  font-size: 13px;
  color: var(--red);
  line-height: 1.5;
  padding: 10px 12px;
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  border-radius: var(--r-md);
}

/* GPS cross-check */
.scan-xcheck {
  font-size: 12.5px;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: var(--r-md);
}
.scan-xcheck.match { color: var(--green); background: var(--green-bg); border: 1px solid var(--green-border); }
.scan-xcheck.mismatch { color: var(--amber); background: var(--amber-bg); border: 1px solid var(--amber-border); }

/* Guest meter */
.scan-meter-cta { display: inline-block; text-align: center; margin-top: 8px; }
.scan-meter-note { font-size: 12px; color: var(--amber); text-align: center; }
.scan-zones { display: flex; flex-direction: column; gap: 6px; }
.scan-zone {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 0; overflow: hidden;
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: var(--r-md); cursor: pointer; font-family: inherit;
  transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out);
}
.scan-zone--on { box-shadow: var(--shadow-sm); }
.scan-zone-stripe { width: 5px; align-self: stretch; flex-shrink: 0; }
.scan-zone-name { flex: 1; text-align: left; padding: 13px 0; font-size: 14px; font-weight: 600; color: var(--text); }
.scan-zone-price { font-size: 15px; font-weight: 700; font-family: var(--font-mono); }
.scan-zone-radio {
  flex-shrink: 0; width: 22px; height: 22px; margin-right: 14px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--border2); border-radius: 50%;
  font-size: 12px; color: #fff; transition: background 150ms, border-color 150ms;
}
.scan-zone-radio.on { background: var(--text); border-color: var(--text); color: var(--bg); }
.scan-actions { display: flex; gap: 10px; }
.scan-btn {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px 16px; border: none; border-radius: var(--r-md);
  font-size: 14px; font-weight: 600; color: #fff; font-family: inherit;
  background: var(--blue); cursor: pointer; transition: filter 150ms var(--ease-out);
}
.scan-btn:hover { filter: brightness(0.93); }
.scan-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.scan-btn-arrow { opacity: 0.85; font-family: var(--font-mono); }
.scan-btn-ghost {
  padding: 14px 18px; border-radius: var(--r-md);
  font-size: 14px; font-weight: 600; color: var(--text2); font-family: inherit;
  background: var(--bg2, #f3f4f6); border: 1px solid var(--border); cursor: pointer;
}
.scan-btn-ghost.wide { width: 100%; }

/* Done */
.scan-done { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: 16px; }
.scan-done-badge {
  width: 72px; height: 72px; border-radius: 50%;
  border: 2px solid; display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
}
.scan-done-check { font-size: 36px; line-height: 1; font-weight: 700; }
.scan-done-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; color: var(--text); }
.scan-done-sub { font-size: 14px; color: var(--muted); line-height: 1.6; max-width: 360px; }
.scan-done .scan-btn { width: 100%; margin-top: 8px; }
.scan-textlink { background: none; border: none; font-size: 13px; color: var(--muted); cursor: pointer; padding: 6px; }
.scan-textlink:hover { color: var(--text2); }
</style>

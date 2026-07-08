<template>
  <div
    ref="track"
    class="s2c"
    :class="{ 's2c--drag': dragging, 's2c--done': done, 's2c--nudge': nudging }"
    :style="{ '--s2c-color': color }"
    @pointerdown="onDown"
  >
    <div class="s2c-fill" :style="{ transform: `scaleX(${fillRatio})` }" />
    <!-- Instruction lives IN the track — the gesture is the label. Fades as you drag. -->
    <span class="s2c-label" :class="{ 's2c-label--shimmer': !done && !dragging }" :style="{ opacity: labelOpacity }">
      {{ done ? doneLabel : label }}
    </span>
    <!-- Round thumb on a visible rail — the pre-learned slide-to-pay pattern -->
    <button
      ref="thumb"
      type="button"
      class="s2c-thumb"
      :style="{ left: thumbLeft + 'px', color: ink }"
      :aria-label="done ? doneLabel : `${label}. Slide right or press Enter to confirm.`"
      @keydown.enter.prevent="onKeyConfirm"
      @keydown.space.prevent="onKeyConfirm"
    >
      <span class="s2c-thumb-chev" aria-hidden="true">{{ done ? '✓' : '››' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  doneLabel?: string
  color?: string
  confirmRatio?: number // fraction of the track you must cross to confirm (rest of the way snaps for you)
}>(), { doneLabel: 'Confirmed', color: 'var(--blue)', confirmRatio: 0.55 })

const emit = defineEmits<{ confirm: [] }>()

const PAD = 4

const track = ref<HTMLElement | null>(null)
const thumb = ref<HTMLElement | null>(null)
const dragging = ref(false)
const done = ref(false)
const nudging = ref(false)
const thumbLeft = ref(PAD)
const maxLeft = ref(PAD)
const thumbW = ref(0)

// Fill is a full-width layer scaled from the left — scaleX animates on the
// compositor; a width transition re-runs layout every frame.
const trackW = ref(0)
const fillRatio = computed(() =>
  trackW.value ? Math.min(1, (thumbLeft.value + thumbW.value) / trackW.value) : 0,
)
// Confirm once you've crossed this point — no need to drag all the way across.
const confirmAt = computed(() => PAD + (maxLeft.value - PAD) * props.confirmRatio)

// The instruction gets out of the way as the thumb covers it.
const labelOpacity = computed(() => {
  if (done.value) return 1
  return Math.max(0, 1 - (thumbLeft.value - PAD) / Math.max(1, (maxLeft.value - PAD)) * 1.8)
})

// Readable ink for the thumb — zone fills are too light for white text.
const ink = computed(() => inkOn(props.color))

const measure = () => {
  trackW.value = track.value?.clientWidth ?? 0
  thumbW.value = thumb.value?.offsetWidth ?? 0
  maxLeft.value = Math.max(PAD, trackW.value - thumbW.value - PAD)
}

let startX = 0
let startLeft = 0
let downAt = 0
let moved = false
let resetTimer: ReturnType<typeof setTimeout> | undefined
let nudgeTimer: ReturnType<typeof setTimeout> | undefined

const onMove = (e: PointerEvent) => {
  if (!dragging.value) return
  const dx = e.clientX - startX
  if (Math.abs(dx) > 6) moved = true
  thumbLeft.value = Math.min(maxLeft.value, Math.max(PAD, startLeft + dx))
}

const onUp = () => {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  // A tap is never a send — it becomes the tutorial: bounce the thumb toward
  // the direction the gesture wants, so the first mis-tap teaches the slide.
  if (!moved && Date.now() - downAt < 350) {
    thumbLeft.value = PAD
    nudging.value = true
    if (nudgeTimer) clearTimeout(nudgeTimer)
    nudgeTimer = setTimeout(() => (nudging.value = false), 500)
    return
  }
  if (thumbLeft.value >= confirmAt.value) {
    thumbLeft.value = maxLeft.value // snap the rest of the way home
    done.value = true
    emit('confirm')
    resetTimer = setTimeout(reset, 2200) // become slidable again (e.g. to extend)
  } else {
    thumbLeft.value = PAD // snap back
  }
}

// Keyboard path: pressing Enter/Space on the focused thumb is as deliberate as
// the drag — switch and screen-reader users get the same confirm.
const onKeyConfirm = () => {
  if (done.value || dragging.value) return
  measure()
  thumbLeft.value = maxLeft.value
  done.value = true
  emit('confirm')
  resetTimer = setTimeout(reset, 2200)
}

// The whole track is grabbable — the thumb is the visual, not the only handle.
const onDown = (e: PointerEvent) => {
  if (done.value) return
  measure()
  dragging.value = true
  moved = false
  downAt = Date.now()
  startX = e.clientX
  startLeft = thumbLeft.value
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const reset = () => { done.value = false; thumbLeft.value = PAD }
defineExpose({ reset })

onMounted(() => { measure(); window.addEventListener('resize', measure) })
onUnmounted(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  if (resetTimer) clearTimeout(resetTimer)
  if (nudgeTimer) clearTimeout(nudgeTimer)
})
</script>

<style scoped>
/* Slide-to-pay: round thumb travels a visible groove; the instruction is the track text. */
.s2c {
  position: relative;
  height: 54px;
  border-radius: 999px;
  background: var(--bg2);
  border: 1px solid var(--border2);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  user-select: none;
  touch-action: pan-y;
  cursor: grab;
}
.s2c--drag { cursor: grabbing; }
.s2c-fill {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--s2c-color) 20%, transparent);
  transform-origin: left center;
  transition: transform 0.18s var(--ease-out);
  pointer-events: none;
}
.s2c--drag .s2c-fill { transition: none; }

/* Centered instruction; a light sweep runs left→right, pointing the way */
.s2c-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px 0 58px; /* clear the resting thumb */
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
  color: var(--text2);
  pointer-events: none;
}
.s2c-label--shimmer {
  background: linear-gradient(90deg, var(--muted) 38%, var(--text) 50%, var(--muted) 62%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: s2c-shimmer 2.4s linear infinite;
}
@keyframes s2c-shimmer {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}
.s2c--done .s2c-label { color: var(--text); }

.s2c-thumb {
  position: absolute;
  top: 4px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--s2c-color);
  cursor: grab;
  box-shadow: var(--shadow-md);
  touch-action: none;
  transition: left 0.18s var(--ease-out);
}
.s2c--drag .s2c-thumb { transition: none; cursor: grabbing; }
.s2c-thumb:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
.s2c--done .s2c-thumb { cursor: default; }
.s2c-thumb-chev { font-size: 17px; font-weight: 700; letter-spacing: -1px; line-height: 1; }

/* Tap without drag → the thumb points the way instead of silently ignoring you */
.s2c--nudge .s2c-thumb { animation: s2c-nudge 450ms var(--ease-out); }
@keyframes s2c-nudge {
  0% { transform: translateX(0); }
  40% { transform: translateX(22px); }
  100% { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .s2c-fill, .s2c-thumb { transition: none; }
  .s2c-label--shimmer {
    animation: none;
    background: none;
    -webkit-background-clip: initial;
    background-clip: initial;
    color: var(--text2);
  }
  .s2c--nudge .s2c-thumb { animation: none; }
}
</style>

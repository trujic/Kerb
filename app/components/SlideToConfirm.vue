<template>
  <div
    ref="track"
    class="s2c"
    :class="{ 's2c--drag': dragging, 's2c--done': done }"
    :style="{ '--s2c-color': color }"
  >
    <div class="s2c-fill" :style="{ width: fillWidth + 'px' }" />
    <span v-if="!done" class="s2c-arrows" aria-hidden="true">›››</span>
    <button
      ref="thumb"
      type="button"
      class="s2c-thumb"
      :style="{ left: thumbLeft + 'px' }"
      :aria-label="label"
      @pointerdown="onDown"
    >
      <span class="s2c-thumb-chev">{{ done ? '✓' : '⠿' }}</span>
      <span class="s2c-thumb-tx">{{ done ? doneLabel : label }}</span>
      <span class="s2c-thumb-go" aria-hidden="true">{{ done ? '' : '›' }}</span>
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
const thumbLeft = ref(PAD)
const maxLeft = ref(PAD)
const thumbW = ref(0)

const fillWidth = computed(() => thumbLeft.value + thumbW.value)
// Confirm once you've crossed this point — no need to drag all the way across.
const confirmAt = computed(() => PAD + (maxLeft.value - PAD) * props.confirmRatio)

// The whole labelled pill is the thumb, so its width varies with the text.
const measure = () => {
  const w = track.value?.clientWidth ?? 0
  thumbW.value = thumb.value?.offsetWidth ?? 0
  maxLeft.value = Math.max(PAD, w - thumbW.value - PAD)
}

let startX = 0
let startLeft = 0
let resetTimer: ReturnType<typeof setTimeout> | undefined

const onMove = (e: PointerEvent) => {
  if (!dragging.value) return
  const dx = e.clientX - startX
  thumbLeft.value = Math.min(maxLeft.value, Math.max(PAD, startLeft + dx))
}

const onUp = () => {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  if (thumbLeft.value >= confirmAt.value) {
    thumbLeft.value = maxLeft.value // snap the rest of the way home
    done.value = true
    emit('confirm')
    resetTimer = setTimeout(reset, 2200) // become slidable again (e.g. to extend)
  } else {
    thumbLeft.value = PAD // snap back
  }
}

const onDown = (e: PointerEvent) => {
  if (done.value) return
  measure()
  dragging.value = true
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
})
</script>

<style scoped>
/* Swipe button: the labelled pill IS the thumb — grab it and drag right. */
.s2c {
  position: relative;
  height: 52px;
  border-radius: 999px;
  background: var(--bg2);
  border: 1px solid var(--border);
  overflow: hidden;
  user-select: none;
  touch-action: pan-y;
}
.s2c-fill {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: color-mix(in srgb, var(--s2c-color) 16%, transparent);
  transition: width 0.18s var(--ease-out);
  pointer-events: none;
}
.s2c--drag .s2c-fill { transition: none; }

/* Faint "keep going →" arrows the thumb slides toward */
.s2c-arrows {
  position: absolute;
  right: 20px; top: 0; bottom: 0;
  display: flex; align-items: center;
  font-size: 18px; font-weight: 700; letter-spacing: 2px;
  color: var(--muted2);
  pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .s2c:not(.s2c--drag) .s2c-arrows { animation: s2c-arrows 1.6s ease-in-out infinite; }
}
@keyframes s2c-arrows { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }

.s2c-thumb {
  position: absolute;
  top: 4px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--s2c-color);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  line-height: 1;
  cursor: grab;
  box-shadow: var(--shadow-sm);
  touch-action: none;
  transition: left 0.18s var(--ease-out);
}
.s2c--drag .s2c-thumb { transition: none; cursor: grabbing; }
.s2c--done .s2c-thumb { cursor: default; }
.s2c-thumb-chev { font-size: 16px; opacity: 0.85; }
.s2c-thumb-tx { letter-spacing: 0.2px; }
.s2c-thumb-go { font-size: 18px; opacity: 0.85; margin-left: 2px; }
</style>

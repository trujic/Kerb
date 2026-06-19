<template>
  <div
    ref="track"
    class="s2c"
    :class="{ 's2c--drag': dragging, 's2c--done': done }"
    :style="{ '--s2c-color': color }"
  >
    <div class="s2c-fill" :style="{ width: fillWidth + 'px' }" />
    <span class="s2c-label">{{ done ? doneLabel : label }}</span>
    <button
      ref="thumb"
      type="button"
      class="s2c-thumb"
      :style="{ left: thumbLeft + 'px' }"
      :aria-label="label"
      @pointerdown="onDown"
    >{{ done ? '✓' : '›' }}</button>
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

const PAD = 3
const THUMB = 40

const track = ref<HTMLElement | null>(null)
const thumb = ref<HTMLElement | null>(null)
const dragging = ref(false)
const done = ref(false)
const thumbLeft = ref(PAD)
const maxLeft = ref(PAD)

const fillWidth = computed(() => thumbLeft.value + THUMB)
// Confirm once you've crossed this point — no need to drag all the way across.
const confirmAt = computed(() => PAD + (maxLeft.value - PAD) * props.confirmRatio)

const measure = () => {
  const w = track.value?.clientWidth ?? 0
  maxLeft.value = Math.max(PAD, w - THUMB - PAD)
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
/* Apple-style slide: a pill track, a round thumb, and a terse shimmering label. */
.s2c {
  position: relative;
  height: 46px;
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
.s2c-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 52px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1px;
  color: var(--muted);
  text-align: center;
  pointer-events: none;
}
/* The classic slide-to-unlock sheen sweeping in the drag direction. */
@media (prefers-reduced-motion: no-preference) {
  .s2c:not(.s2c--drag):not(.s2c--done) .s2c-label {
    background: linear-gradient(
      100deg,
      var(--muted) 36%, var(--text) 50%, var(--muted) 64%
    );
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: s2c-sheen 2.4s linear infinite;
  }
}
@keyframes s2c-sheen { from { background-position: 120% 0; } to { background-position: -120% 0; } }
.s2c--done .s2c-label { color: var(--s2c-color); }
.s2c-thumb {
  position: absolute;
  top: 3px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--s2c-color);
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  cursor: grab;
  box-shadow: var(--shadow-sm);
  touch-action: none;
  transition: left 0.18s var(--ease-out);
}
.s2c--drag .s2c-thumb { transition: none; cursor: grabbing; }
.s2c--done .s2c-thumb { cursor: default; }
</style>

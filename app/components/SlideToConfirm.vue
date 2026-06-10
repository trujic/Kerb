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
}>(), { doneLabel: 'Confirmed', color: 'var(--blue)' })

const emit = defineEmits<{ confirm: [] }>()

const PAD = 4
const THUMB = 48

const track = ref<HTMLElement | null>(null)
const thumb = ref<HTMLElement | null>(null)
const dragging = ref(false)
const done = ref(false)
const thumbLeft = ref(PAD)
const maxLeft = ref(PAD)

const fillWidth = computed(() => thumbLeft.value + THUMB)

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
  if (thumbLeft.value >= maxLeft.value - 4) {
    thumbLeft.value = maxLeft.value
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
.s2c {
  position: relative;
  height: 56px;
  border-radius: var(--r-md);
  background: var(--bg2);
  border: 1.5px solid var(--border);
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
  padding: 0 60px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  text-align: center;
  pointer-events: none;
}
.s2c--done .s2c-label { color: var(--s2c-color); }
.s2c-thumb {
  position: absolute;
  top: 4px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--r-sm);
  background: var(--s2c-color);
  color: #fff;
  font-size: 22px;
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

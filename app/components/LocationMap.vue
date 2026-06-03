<template>
  <div ref="mapEl" class="location-map" />
</template>

<script setup lang="ts">
const props = defineProps<{ lat: number; lng: number; accuracy?: number; height?: number }>()

const mapEl = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (!mapEl.value) return

  await import('leaflet/dist/leaflet.css')
  const L = (await import('leaflet')).default

  const map = L.map(mapEl.value, {
    center: [props.lat, props.lng],
    zoom: 16,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
  })

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map)

  // Accuracy circle
  if (props.accuracy && props.accuracy < 500) {
    L.circle([props.lat, props.lng], {
      radius: props.accuracy,
      color: '#2563EB',
      fillColor: '#2563EB',
      fillOpacity: 0.08,
      weight: 1,
      opacity: 0.3,
    }).addTo(map)
  }

  // Google Maps-style blue dot
  const dot = L.divIcon({
    className: '',
    html: `<div class="lm-dot"><div class="lm-pulse"></div><div class="lm-inner"></div></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
  L.marker([props.lat, props.lng], { icon: dot }).addTo(map)

  onUnmounted(() => map.remove())
})
</script>

<style>
/* Dot styles must be global since they're injected as raw HTML by Leaflet */
.lm-dot {
  position: relative;
  width: 40px;
  height: 40px;
}
.lm-inner {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 16px; height: 16px;
  background: #2563EB;
  border: 2.5px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(37,99,235,0.5);
  z-index: 1;
}
.lm-pulse {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) scale(0.4);
  width: 40px; height: 40px;
  background: rgba(37, 99, 235, 0.25);
  border-radius: 50%;
  animation: lm-pulse 2s ease-out infinite;
}
@keyframes lm-pulse {
  0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
}
</style>

<style scoped>
.location-map {
  width: 100%;
  height: v-bind('`${props.height ?? 200}px`');
  overflow: hidden;
}
</style>

<template>
  <div class="session" :class="{ 'is-expired': expired, 'is-limit': atZoneLimit }">
    <div class="session-top">
      <span class="session-zone">
        <span class="session-dot" :style="{ background: session.zone_color || 'var(--text2)' }" />
        {{ session.zone_name }}
      </span>
      <span class="session-label">Active parking</span>
    </div>

    <p v-if="session.street_name" class="session-street">📍 {{ session.street_name }}</p>

    <div class="session-time">
      <template v-if="expired">
        <span class="session-count expired">Expired</span>
        <span class="session-ago">{{ agoText }} ago · risk of fine</span>
      </template>
      <template v-else>
        <span class="session-count">{{ remainingText }}</span>
        <span class="session-ago">left{{ session.price ? ` · ${session.price}` : '' }}</span>
      </template>
    </div>

    <p v-if="atZoneLimit" class="session-warn">
      ⚠️ You've reached this zone's limit — you must move the car (no re-pay here).
    </p>

    <div class="session-actions">
      <button
        v-if="canExtend"
        type="button"
        class="se-btn se-extend"
        @click="$emit('extend')"
      >+ Extend 1h</button>
      <button
        v-if="session.lat != null && session.lng != null"
        type="button"
        class="se-btn"
        @click="$emit('locate')"
      >🚗 Find my car</button>
      <button type="button" class="se-btn se-end" @click="$emit('end')">End</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ParkingSession } from '~/composables/useParkingSession'

const props = defineProps<{
  session: ParkingSession
  remainingMs: number | null
  atZoneLimit: boolean
  canExtend: boolean
}>()

defineEmits<{ extend: []; end: []; locate: [] }>()

const expired = computed(() => props.remainingMs !== null && props.remainingMs <= 0)

const fmt = (ms: number) => {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}:${pad(s)}`
}

const remainingText = computed(() => (props.remainingMs ? fmt(props.remainingMs) : '—'))
const agoText = computed(() => (props.remainingMs ? fmt(-props.remainingMs) : ''))
</script>

<style scoped>
.session {
  background: var(--bg);
  border: 1px solid var(--border);
  border-left: 4px solid var(--green);
  border-radius: var(--r-lg);
  padding: 16px 18px;
  margin-bottom: 20px;
}
.session.is-limit { border-left-color: var(--amber); }
.session.is-expired { border-left-color: var(--red); background: var(--red-bg); }

.session-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}
.session-zone {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.session-dot { width: 9px; height: 9px; border-radius: 50%; }
.session-label {
  font-size: 10px;
  font-family: var(--font-mono);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--muted2);
}
.session-street { font-size: 13px; color: var(--muted); margin-bottom: 8px; }

.session-time { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.session-count {
  font-size: 30px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
  color: var(--text);
  line-height: 1;
}
.session-count.expired { color: var(--red); }
.session-ago { font-size: 12px; color: var(--muted); }

.session-warn {
  font-size: 12px;
  color: var(--amber);
  line-height: 1.45;
  margin-top: 8px;
}

.session-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.se-btn {
  flex: 1;
  min-width: 90px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 150ms;
}
.se-btn:hover { background: var(--bg); border-color: var(--border2); }
.se-extend { color: #fff; background: var(--green); border-color: var(--green); }
.se-extend:hover { filter: brightness(0.95); background: var(--green); }
.se-end { flex: 0 0 auto; min-width: 0; color: var(--muted); }
</style>

<template>
  <div v-if="schedule" class="hours" :class="{ 'hours--compact': compact, 'hours--status': statusOnly }">
    <div class="hours-head">
      <span class="hours-title">{{ t('hoursTitle') }}</span>
      <span v-if="status" class="hours-pill" :class="status.paid ? 'is-paid' : 'is-free'">
        <span class="hours-dot" />
        {{ status.label }}
      </span>
    </div>

    <p v-if="status" class="hours-detail">{{ status.detail }}</p>

    <dl v-if="!statusOnly" class="hours-rows">
      <div v-for="row in summary" :key="row.label" class="hours-row">
        <dt>{{ row.label }}</dt>
        <dd :class="{ 'is-free-day': row.free }">{{ row.value }}</dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  cityId: string | null | undefined
  compact?: boolean
  statusOnly?: boolean   // live status line only — hide the weekly schedule table
}>()

const { schedule, status, summary } = useParkingHours(() => props.cityId)
const { t } = useLang()
</script>

<style scoped>
.hours {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px;
}
.hours--compact { padding: 14px; border-radius: var(--r-md); }
.hours--status .hours-detail { margin-bottom: 0; }

.hours-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}
.hours-title {
  font-size: 10px;
  font-family: var(--font-mono);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted2);
}

.hours-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.hours-pill.is-free {
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  color: var(--green);
}
.hours-pill.is-paid {
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  color: var(--amber);
}
.hours-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.is-free .hours-dot { animation: hours-pulse 2s ease-out infinite; }
@keyframes hours-pulse {
  0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  70%  { box-shadow: 0 0 0 5px transparent; opacity: 0.85; }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
}

.hours-detail {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 12px;
}

.hours-rows { display: flex; flex-direction: column; gap: 2px; }
.hours-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
}
.hours-row:last-child { border-bottom: none; }
.hours-row dt {
  font-size: 13px;
  color: var(--text2);
  font-weight: 500;
}
.hours-row dd {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text);
}
.hours-row dd.is-free-day { color: var(--green); font-weight: 600; }
</style>

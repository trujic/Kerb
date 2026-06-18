<template>
  <Teleport to="body">
    <div class="ai" role="dialog" aria-label="How parking works here">
      <div class="ai-bar">
        <span class="ai-title">🧠 Parking in {{ cityName }}, simply</span>
        <button class="ai-close" type="button" aria-label="Close" @click="$emit('close')">✕</button>
      </div>

      <div class="ai-body">
        <!-- ── THE BASICS · plain enough for anyone ───────────────────────── -->

        <!-- 1. Do I pay right now? -->
        <div class="g-now" :class="status?.paid ? 'is-paid' : 'is-free'">
          <span class="g-now-dot" />
          <div class="g-now-text">
            <p class="g-now-label">{{ status?.paid ? 'You pay right now' : 'It’s free right now 🎉' }}</p>
            <p class="g-now-detail">{{ nowDetail }}</p>
          </div>
        </div>

        <!-- 2. How to pay — three tiny steps + the numbers -->
        <section v-if="status?.paid && payableZones.length" class="g-sec">
          <p class="g-sec-title">Pay in 3 steps</p>
          <ol class="g-steps">
            <li>Look at the coloured sign next to your car.</li>
            <li>Send your plate in a text to that colour’s number.</li>
            <li>Done. Keep the text — that’s your ticket.</li>
          </ol>
          <div class="g-codes">
            <button
              v-for="z in payableZones"
              :key="z.name"
              type="button"
              class="g-code"
              :style="{ borderColor: (z.color || 'var(--border2)') }"
              @click="$emit('pick', z.name)"
            >
              <span class="g-code-chip" :style="{ background: z.color || 'var(--muted2)' }" />
              <span class="g-code-zone">{{ shortZone(z.name) }}</span>
              <span class="g-code-num">{{ z.sms_shortcode }}</span>
            </button>
          </div>
          <p class="g-note">Tap your colour and we’ll fill in your plate for you.</p>
        </section>

        <!-- When it's free, the basics are: you don't need to do anything -->
        <section v-else class="g-sec">
          <p class="g-free-line">Nothing to do — just park. 🚗</p>
          <p class="g-note">When paying starts again, come back here and we’ll show you how.</p>
        </section>

        <!-- The single sure thing -->
        <button class="ai-btn" type="button" @click="$emit('scan')">📸 Scan the sign by your car</button>

        <!-- ── MORE, IF YOU WANT IT · tucked away ─────────────────────────── -->

        <details class="g-more">
          <summary>🗓️ When do you have to pay?</summary>
          <div class="g-more-body">
            <dl class="g-days">
              <div v-for="r in dayRows" :key="r.label" class="g-day" :class="{ 'is-free': r.free }">
                <dt>{{ r.label }}</dt>
                <dd>{{ r.value }}</dd>
              </div>
            </dl>
            <p class="g-note">Any other time, parking is free — no ticket needed.</p>
          </div>
        </details>

        <details class="g-more">
          <summary>🎨 What are the colours?</summary>
          <div class="g-more-body">
            <div class="g-zones">
              <span
                v-for="z in zones"
                :key="z.name"
                class="g-zone"
                :style="{ borderColor: (z.color || 'var(--border2)') }"
              >
                <span class="g-zone-chip" :style="{ background: z.color || 'var(--muted2)' }" />
                <span class="g-zone-name">{{ shortZone(z.name) }}</span>
                <span v-if="z.price" class="g-zone-price">{{ z.price }}</span>
              </span>
            </div>
            <p class="g-note">Each colour is a zone. Nearer the centre usually costs more. The sign by your car shows your colour.</p>
          </div>
        </details>

        <details v-if="whereLine" class="g-more">
          <summary>📍 Where am I standing?</summary>
          <div class="g-more-body">
            <p class="g-where-text">{{ whereLine }}</p>
            <p class="g-note">Not sure? The sign next to your car is always right.</p>
          </div>
        </details>

        <p v-if="sourceName" class="g-source">Straight from {{ sourceName }}{{ confirmedAt ? ` · checked ${confirmedAt}` : '' }}.</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ZoneVerdict } from '~/composables/useZoneResolver'

interface ZoneLite { name: string; color?: string; price?: string; sms_shortcode?: string }

const props = defineProps<{
  cityId: string
  cityName: string
  zones: ZoneLite[]
  verdict?: ZoneVerdict | null
  sourceName?: string | null
  confirmedAt?: string | null
}>()

defineEmits<{ pick: [zone: string]; scan: []; close: [] }>()

// Hours + live status come straight from our registry — no model, no guessing.
const { summary, status } = useParkingHours(() => props.cityId)

// "Blue Zone" → "Blue", "Extra Zone" → "Extra"; leave anything else intact.
const shortZone = (name: string) => name.replace(/\s*zone\s*/i, ' ').trim() || name

// Friendly weekly rows: "Mon–Fri · 07–21", "Sat · 07–14", "Sun · Free".
const dayRows = computed(() =>
  summary.value.map((r) => ({
    label: r.label,
    free: r.value === 'Free',
    value: r.value === 'Free' ? 'Free' : r.value.replace(/:00/g, ''),
  })),
)

// Only zones you can actually pay by SMS get a number chip.
const payableZones = computed(() => props.zones.filter((z) => z.sms_shortcode))

// One plain line under the headline — friendlier than the raw schedule wording.
const nowDetail = computed(() =>
  status.value?.paid
    ? (status.value.detail ? `Free again at ${status.value.detail.replace(/^Free at\s*/i, '')}.` : 'You need a ticket right now.')
    : 'No ticket needed. Just park.',
)

// One plain line from the GPS verdict — context, never the whole story.
const whereLine = computed<string | null>(() => {
  const v = props.verdict
  if (!v) return null
  switch (v.state) {
    case 'assert':
    case 'triangulated':
      return v.zone ? `You’re most likely in the ${shortZone(v.zone.name)} zone.` : null
    case 'disambiguate':
      return 'You’re between two zones — let the sign decide.'
    case 'route_to_sign':
      return 'A zone border runs through here — read the sign by your car.'
    case 'none':
      return 'No paid zone right where you’re standing.'
    default:
      return null
  }
})
</script>

<style scoped>
.ai {
  position: fixed; inset: 0; z-index: 3200;
  display: flex; flex-direction: column;
  background: var(--bg);
}
.ai-bar {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; padding-top: max(14px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
}
.ai-title { font-size: 15px; font-weight: 700; color: var(--text); }
.ai-close {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--text2); background: var(--bg2); border: 1px solid var(--border);
  border-radius: 50%; cursor: pointer; flex-shrink: 0;
}
.ai-body {
  flex: 1 1 auto; overflow-y: auto;
  padding: 20px 20px 40px; padding-bottom: max(40px, env(safe-area-inset-bottom));
  max-width: 560px; width: 100%; margin: 0 auto;
  display: flex; flex-direction: column; gap: 18px;
}

/* Right-now status — the headline answer */
.g-now {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; border-radius: var(--r-lg); border: 1px solid;
}
.g-now.is-free { background: var(--green-bg); border-color: var(--green-border); }
.g-now.is-paid { background: var(--amber-bg); border-color: var(--amber-border); }
.g-now-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.g-now.is-free .g-now-dot { background: var(--green); animation: g-pulse 2s ease-out infinite; }
.g-now.is-paid .g-now-dot { background: var(--amber); }
@keyframes g-pulse {
  0% { box-shadow: 0 0 0 0 var(--green); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.g-now-text { min-width: 0; }
.g-now-label { font-size: 17px; font-weight: 700; letter-spacing: -0.2px; }
.g-now.is-free .g-now-label { color: var(--green); }
.g-now.is-paid .g-now-label { color: var(--amber); }
.g-now-detail { font-size: 13px; color: var(--text2); margin-top: 2px; }

/* Free state — nothing to do */
.g-free-line { font-size: 18px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
.g-where-text { font-size: 14px; color: var(--text); line-height: 1.5; }

/* Collapsible "more, if you want it" */
.g-more {
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg); overflow: hidden;
}
.g-more > summary {
  list-style: none; cursor: pointer; user-select: none;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; font-size: 14px; font-weight: 600; color: var(--text);
}
.g-more > summary::-webkit-details-marker { display: none; }
.g-more > summary::after {
  content: '⌄'; font-size: 16px; color: var(--muted2);
  transition: transform 180ms var(--ease-out);
}
.g-more[open] > summary::after { transform: rotate(180deg); }
.g-more[open] > summary { border-bottom: 1px solid var(--border); }
.g-more-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }

/* Sections */
.g-sec { display: flex; flex-direction: column; gap: 10px; }
.g-sec-title {
  font-size: 11px; font-family: var(--font-mono); text-transform: uppercase;
  letter-spacing: 1.2px; color: var(--muted2);
}
.g-note { font-size: 12.5px; color: var(--muted); line-height: 1.5; }

/* When you pay */
.g-days { display: flex; flex-direction: column; }
.g-day {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  padding: 9px 0; border-bottom: 1px solid var(--border);
}
.g-day:last-child { border-bottom: none; }
.g-day dt { font-size: 14px; font-weight: 600; color: var(--text); }
.g-day dd { font-size: 15px; font-family: var(--font-mono); color: var(--text2); }
.g-day.is-free dd { color: var(--green); font-weight: 700; }

/* Zones */
.g-zones { display: flex; flex-wrap: wrap; gap: 8px; }
.g-zone {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 12px; border: 1.5px solid; border-radius: 999px; background: var(--bg);
}
.g-zone-chip { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.g-zone-name { font-size: 14px; font-weight: 700; color: var(--text); }
.g-zone-price { font-size: 13px; font-family: var(--font-mono); color: var(--muted); }

/* How to pay */
.g-steps {
  margin: 0; padding-left: 20px;
  display: flex; flex-direction: column; gap: 6px;
  font-size: 14px; color: var(--text2); line-height: 1.5;
}
.g-steps li { padding-left: 4px; }
.g-codes { display: flex; flex-wrap: wrap; gap: 8px; }
.g-code {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 10px 14px; border: 1.5px solid; border-radius: var(--r-md);
  background: var(--bg); cursor: pointer; font-family: inherit;
  transition: filter 150ms var(--ease-out);
}
.g-code:hover { filter: brightness(0.97); }
.g-code-chip { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.g-code-zone { font-size: 13px; font-weight: 700; color: var(--text); }
.g-code-num { font-size: 16px; font-weight: 700; font-family: var(--font-mono); color: var(--text); }

.ai-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 15px; border: none; border-radius: var(--r-md);
  font-size: 15px; font-weight: 700; color: #fff; font-family: inherit;
  background: var(--text); cursor: pointer; transition: filter 150ms var(--ease-out);
  margin-top: 4px;
}
.ai-btn:hover { filter: brightness(1.15); }
.g-source { font-size: 11.5px; color: var(--muted2); text-align: center; line-height: 1.5; }
</style>

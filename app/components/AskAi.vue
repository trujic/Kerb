<template>
  <Teleport to="body">
    <div class="ai" role="dialog" aria-label="Ask AI for help">
      <div class="ai-bar">
        <span class="ai-title">🧠 Ask AI — where am I?</span>
        <button class="ai-close" type="button" aria-label="Close" @click="$emit('close')">✕</button>
      </div>

      <div class="ai-body">
        <div v-if="!verdict || verdict.state === 'none'" class="ai-block">
          <p class="ai-verdict-label" style="color: var(--green)">LIKELY FREE</p>
          <h2 class="ai-headline">No paid zone where you're standing.</h2>
          <p class="ai-sub">
            Nothing chargeable is within your GPS error circle (±{{ Math.round(verdict?.accuracyM ?? 0) }} m).
            Parking here is most likely free — but the sign is the final word.
          </p>
          <button class="ai-btn-ghost" type="button" @click="$emit('scan')">📸 Scan the sign to be sure</button>
        </div>

        <!-- ASSERT / TRIANGULATED -->
        <div v-else-if="verdict.state === 'assert' || verdict.state === 'triangulated'" class="ai-block">
          <p class="ai-verdict-label" :class="verdict.state === 'triangulated' ? 'is-tri' : 'is-high'">
            {{ verdict.state === 'triangulated' ? 'TRIANGULATED ✓' : 'HIGH CONFIDENCE' }}
          </p>
          <h2 class="ai-headline">
            You're in
            <span :style="{ color: verdict.zone!.color }">{{ verdict.zone!.name }}</span>.
          </h2>

          <ul class="ai-evidence">
            <li v-for="(e, i) in evidence" :key="i"><span class="ai-ev-dot" />{{ e }}</li>
          </ul>

          <p class="ai-price-caveat">
            Zone comes from the official registry. Prices change faster than zones — confirm the rate on the sign or app.
          </p>

          <button
            class="ai-btn"
            type="button"
            :style="{ background: verdict.zone!.color }"
            @click="$emit('pick', verdict.zone!.name)"
          >
            Use {{ verdict.zone!.name }} — I'll confirm the sign
          </button>
          <button class="ai-btn-ghost" type="button" @click="$emit('scan')">Scan the sign instead</button>
        </div>

        <!-- DISAMBIGUATE -->
        <div v-else-if="verdict.state === 'disambiguate'" class="ai-block">
          <p class="ai-verdict-label is-amber">WHICH STREET?</p>
          <h2 class="ai-headline">GPS can't split these — which street is your car on?</h2>
          <p class="ai-sub">±{{ Math.round(verdict.accuracyM) }} m puts you between more than one zone.</p>

          <div class="ai-options">
            <button
              v-for="(o, i) in verdict.candidates"
              :key="i"
              class="ai-option"
              type="button"
              :style="{ borderColor: o.color }"
              @click="$emit('pick', o.zone)"
            >
              <span class="ai-opt-stripe" :style="{ background: o.color }" />
              <span class="ai-opt-text">
                <span class="ai-opt-street">{{ o.street || 'This street' }}</span>
                <span class="ai-opt-zone" :style="{ color: o.color }">{{ o.zone }}</span>
                <span v-if="o.segmented" class="ai-opt-seg">⚠ this street changes zone near here — match the sign</span>
              </span>
              <span class="ai-opt-go">→</span>
            </button>
          </div>
          <button class="ai-btn-ghost" type="button" @click="$emit('scan')">Not sure? Scan the sign</button>
        </div>

        <!-- ROUTE TO SIGN -->
        <div v-else class="ai-block">
          <p class="ai-verdict-label is-amber">TOO CLOSE TO CALL</p>
          <h2 class="ai-headline">A zone boundary runs right through here.</h2>
          <p class="ai-sub">
            GPS (±{{ Math.round(verdict.accuracyM) }} m) can't safely pick a side. Don't trust a guess with your money — read the sign.
          </p>

          <div v-if="verdict.sign" class="ai-signhint">
            <span class="ai-sign-arrow">📍</span>
            <span>
              Nearest verified sign <strong>{{ fmtDist(verdict.sign.distM) }} {{ compass(verdict.sign.bearing) }}</strong>
              — <span :style="{ color: verdict.sign.color || 'var(--text2)' }">{{ verdict.sign.zoneName }}</span>,
              confirmed {{ age(verdict.sign.createdAt) }}.
            </span>
          </div>

          <button class="ai-btn" type="button" @click="$emit('scan')">📸 Scan the sign next to your car</button>
          <button
            v-if="verdict.zone"
            class="ai-btn-ghost"
            type="button"
            @click="$emit('pick', verdict.zone.name)"
          >
            Sign says {{ verdict.zone.name }}? Use it (you confirm)
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ZoneVerdict } from '~/composables/useZoneResolver'

const props = defineProps<{
  verdict: ZoneVerdict | null
  cityName: string
  sourceName?: string | null
  confirmedAt?: string | null
}>()

defineEmits<{ pick: [zone: string]; scan: []; close: [] }>()

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(5, Math.round(m / 5) * 5)} m`)

const compass = (deg: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

const age = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return `${Math.floor(days / 30)} mo ago`
}

// Cited evidence for the assert/triangulated verdict — every claim shows its source.
const evidence = computed<string[]>(() => {
  const v = props.verdict
  if (!v) return []
  const lines: string[] = [`GPS fix · ±${Math.round(v.accuracyM)} m in ${props.cityName}`]
  if (props.sourceName) lines.push(`Registry · ${props.sourceName}${props.confirmedAt ? ` · confirmed ${props.confirmedAt}` : ''}`)
  if (v.boundaryDistM != null) lines.push(`Nearest different zone · ${fmtDist(v.boundaryDistM)} away`)
  else lines.push('No other zone within range')
  if (v.sign?.agrees) lines.push(`Verified sign · ${fmtDist(v.sign.distM)} away, confirmed ${age(v.sign.createdAt)}`)
  return lines
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
  border-radius: 50%; cursor: pointer;
}
.ai-body { flex: 1 1 auto; overflow-y: auto; padding: 24px 20px 40px; max-width: 560px; width: 100%; margin: 0 auto; }
.ai-block { display: flex; flex-direction: column; }

.ai-verdict-label {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  letter-spacing: 1.5px; margin-bottom: 10px;
}
.ai-verdict-label.is-high { color: var(--green); }
.ai-verdict-label.is-tri { color: var(--green); }
.ai-verdict-label.is-amber { color: var(--amber); }
.ai-headline {
  font-family: var(--font-display); font-weight: 400;
  font-size: 26px; line-height: 1.15; color: var(--text); margin-bottom: 14px;
}
.ai-sub { font-size: 14px; color: var(--muted); line-height: 1.6; margin-bottom: 18px; }

.ai-evidence { list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 16px; }
.ai-evidence li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--text2); line-height: 1.5; }
.ai-ev-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); margin-top: 7px; flex-shrink: 0; }
.ai-price-caveat {
  font-size: 12px; color: var(--muted); line-height: 1.5;
  padding: 10px 12px; background: var(--bg2); border: 1px solid var(--border);
  border-left: 3px solid var(--amber); border-radius: var(--r-md); margin-bottom: 18px;
}

.ai-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 15px; border: none; border-radius: var(--r-md);
  font-size: 15px; font-weight: 700; color: #fff; font-family: inherit;
  cursor: pointer; margin-bottom: 10px; transition: filter 150ms var(--ease-out);
}
.ai-btn:hover { filter: brightness(0.93); }
.ai-btn-ghost {
  padding: 14px; border-radius: var(--r-md);
  font-size: 14px; font-weight: 600; color: var(--text2);
  background: var(--bg2); border: 1px solid var(--border); cursor: pointer; font-family: inherit;
}
.ai-btn-ghost:hover { color: var(--text); }

.ai-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.ai-option {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 0; overflow: hidden;
  background: var(--bg2); border: 1.5px solid; border-radius: var(--r-md);
  cursor: pointer; font-family: inherit; text-align: left;
}
.ai-opt-stripe { width: 6px; align-self: stretch; flex-shrink: 0; }
.ai-opt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 14px 0; }
.ai-opt-street { font-size: 15px; font-weight: 700; color: var(--text); }
.ai-opt-zone { font-size: 13px; font-weight: 600; }
.ai-opt-seg { font-size: 11px; color: var(--amber); line-height: 1.4; margin-top: 2px; }
.ai-opt-go { font-size: 18px; color: var(--muted2); margin-right: 14px; flex-shrink: 0; }

.ai-signhint {
  display: flex; gap: 10px; align-items: flex-start;
  font-size: 13px; color: var(--text2); line-height: 1.5;
  padding: 12px 14px; background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r-md); margin-bottom: 18px;
}
.ai-sign-arrow { flex-shrink: 0; }
.ai-signhint strong { color: var(--text); }
</style>

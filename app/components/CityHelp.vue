<template>
  <Teleport to="body">
    <div class="ch" role="dialog" aria-label="AI parking help">
      <div class="ch-bar">
        <span class="ch-title">🧠 Parking in {{ city }}</span>
        <button class="ch-close" type="button" aria-label="Close" @click="$emit('close')">✕</button>
      </div>

      <div class="ch-body">
        <!-- Honesty banner — this is never Kerb-verified data -->
        <div class="ch-unverified">
          <span class="ch-unverified-icon">⚠️</span>
          <p>
            Kerb doesn't cover {{ city }} yet, so this is <strong>AI orientation</strong> —
            helpful to get your bearings, but always confirm at the meter or on the sign.
          </p>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="ch-loading">
          <span class="ch-spin" />
          Looking up how parking works in {{ city }}…
        </div>

        <!-- Error -->
        <div v-else-if="error || !data" class="ch-error">
          Couldn't pull anything up right now. Trust the signs and meters around you —
          and <NuxtLink to="/contribute" @click="$emit('close')">help us add {{ city }}</NuxtLink>.
        </div>

        <template v-else>
          <!-- Overview -->
          <p v-if="data.overview" class="ch-overview">{{ data.overview }}</p>

          <!-- Zones -->
          <section v-if="data.zones.length" class="ch-sec">
            <p class="ch-sec-title">Zones here</p>
            <div v-for="z in data.zones" :key="z.name" class="ch-zone">
              <span class="ch-zone-name">{{ z.name }}</span>
              <span class="ch-zone-detail">{{ z.detail }}</span>
            </div>
          </section>

          <!-- How to pay -->
          <section v-if="data.howToPay.length" class="ch-sec">
            <p class="ch-sec-title">How you pay</p>
            <ul class="ch-list">
              <li v-for="(h, i) in data.howToPay" :key="i">{{ h }}</li>
            </ul>
          </section>

          <!-- Apps -->
          <section v-if="data.apps.length" class="ch-sec">
            <p class="ch-sec-title">Apps used here</p>
            <div class="ch-apps">
              <span v-for="a in data.apps" :key="a.name" class="ch-app">
                <strong>{{ a.name }}</strong><template v-if="a.note"> · {{ a.note }}</template>
              </span>
            </div>
          </section>

          <!-- Tips -->
          <section v-if="data.tips.length" class="ch-sec">
            <p class="ch-sec-title">Good to know</p>
            <ul class="ch-list">
              <li v-for="(t, i) in data.tips" :key="i">{{ t }}</li>
            </ul>
          </section>

          <!-- Official links -->
          <section v-if="data.officialLinks.length" class="ch-sec">
            <p class="ch-sec-title">Official sources</p>
            <a
              v-for="l in data.officialLinks"
              :key="l.url"
              :href="l.url"
              target="_blank"
              rel="noopener"
              class="ch-link"
            >{{ l.label }} ↗</a>
          </section>

          <!-- Search citations (when the model grounded its answer) -->
          <section v-if="data.sources.length" class="ch-sec">
            <p class="ch-sec-title">Where this came from</p>
            <a
              v-for="s in data.sources"
              :key="s.url"
              :href="s.url"
              target="_blank"
              rel="noopener"
              class="ch-src"
            >{{ s.label }} ↗</a>
          </section>

          <!-- Confidence + caveats -->
          <div class="ch-foot">
            <span class="ch-conf" :class="`ch-conf--${data.confidence}`">
              AI confidence: {{ data.confidence }}
            </span>
            <p v-for="(c, i) in data.caveats" :key="i" class="ch-caveat">{{ c }}</p>
          </div>

          <!-- Turn the dead-end into a signal -->
          <NuxtLink to="/contribute" class="ch-cta" @click="$emit('close')">
            Want Kerb to cover {{ city }} properly? Help us add it →
          </NuxtLink>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface CityHelp {
  city: string
  overview: string
  zones: { name: string; detail: string }[]
  howToPay: string[]
  apps: { name: string; note?: string }[]
  tips: string[]
  officialLinks: { label: string; url: string }[]
  confidence: 'low' | 'medium' | 'high'
  caveats: string[]
  sources: { label: string; url: string }[]
  stub: boolean
}

const props = defineProps<{ city: string; lat?: number | null; lng?: number | null }>()
defineEmits<{ close: [] }>()

const loading = ref(true)
const error = ref(false)
const data = ref<CityHelp | null>(null)

onMounted(async () => {
  try {
    data.value = await $fetch<CityHelp>('/api/city-help', {
      method: 'POST',
      body: { city: props.city, lat: props.lat ?? undefined, lng: props.lng ?? undefined },
    })
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.ch {
  position: fixed; inset: 0; z-index: 3200;
  display: flex; flex-direction: column;
  background: var(--bg);
}
.ch-bar {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; padding-top: max(14px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
}
.ch-title { font-size: 15px; font-weight: 700; color: var(--text); }
.ch-close {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--text2); background: var(--bg2); border: 1px solid var(--border);
  border-radius: 50%; cursor: pointer; flex-shrink: 0;
}
.ch-body {
  flex: 1 1 auto; overflow-y: auto;
  padding: 18px 20px 40px; padding-bottom: max(40px, env(safe-area-inset-bottom));
  max-width: 560px; width: 100%; margin: 0 auto;
  display: flex; flex-direction: column; gap: 18px;
}

.ch-unverified {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border-radius: var(--r-md);
  background: var(--amber-bg); border: 1px solid var(--amber-border);
}
.ch-unverified-icon { flex-shrink: 0; line-height: 1.4; }
.ch-unverified p { font-size: 13px; color: var(--text2); line-height: 1.5; }
.ch-unverified strong { color: var(--text); font-weight: 700; }

.ch-loading {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: var(--text2); padding: 20px 0;
}
.ch-spin {
  width: 18px; height: 18px; flex-shrink: 0;
  border: 2px solid var(--border2); border-top-color: var(--blue);
  border-radius: 50%; animation: ch-spin 0.8s linear infinite;
}
@keyframes ch-spin { to { transform: rotate(360deg); } }
.ch-error { font-size: 14px; color: var(--text2); line-height: 1.55; }
.ch-error a, .ch-overview a { color: var(--blue); font-weight: 500; }

.ch-overview { font-size: 15px; color: var(--text); line-height: 1.6; }

.ch-sec { display: flex; flex-direction: column; gap: 9px; }
.ch-sec-title {
  font-size: 11px; font-family: var(--font-mono); text-transform: uppercase;
  letter-spacing: 1.2px; color: var(--muted2);
}

.ch-zone {
  display: flex; flex-direction: column; gap: 2px;
  padding: 11px 13px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg2);
}
.ch-zone-name { font-size: 14px; font-weight: 700; color: var(--text); }
.ch-zone-detail { font-size: 13px; color: var(--text2); line-height: 1.5; }

.ch-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.ch-list li { font-size: 14px; color: var(--text2); line-height: 1.5; padding-left: 3px; }

.ch-apps { display: flex; flex-direction: column; gap: 6px; }
.ch-app {
  font-size: 13.5px; color: var(--text2); line-height: 1.5;
  padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--r-md);
}
.ch-app strong { color: var(--text); font-weight: 700; }

.ch-link, .ch-src {
  font-size: 13px; color: var(--blue); font-weight: 500; line-height: 1.5;
  word-break: break-word;
}
.ch-src { color: var(--muted); font-weight: 400; }

.ch-foot {
  display: flex; flex-direction: column; gap: 6px;
  padding-top: 4px; border-top: 1px solid var(--border);
}
.ch-conf {
  align-self: flex-start;
  font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px;
  padding: 3px 9px; border-radius: 20px; border: 1px solid;
}
.ch-conf--low { color: var(--amber); border-color: var(--amber-border); background: var(--amber-bg); }
.ch-conf--medium { color: var(--blue); border-color: var(--blue-border); background: var(--blue-bg); }
.ch-conf--high { color: var(--green); border-color: var(--green-border); background: var(--green-bg); }
.ch-caveat { font-size: 12px; color: var(--muted); line-height: 1.5; }

.ch-cta {
  display: block; text-align: center;
  padding: 13px; border-radius: var(--r-md);
  font-size: 14px; font-weight: 600; color: var(--text);
  background: var(--bg2); border: 1px solid var(--border);
}
.ch-cta:hover { border-color: var(--border2); }
</style>

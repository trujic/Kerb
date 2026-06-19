<template>
  <div class="err">
    <div class="err-card">
      <NuxtLink to="/" class="err-logo" @click="reset">Kerb</NuxtLink>

      <p class="err-code">{{ is404 ? '404' : (error?.statusCode || 'Error') }}</p>
      <h1 class="err-title">
        {{ is404 ? "We don't cover that yet." : 'Something went sideways.' }}
      </h1>
      <p class="err-sub">
        {{ is404
          ? "No parking page for that address. Search a city we do have — or ask us to add yours."
          : "An unexpected error occurred. Try again, or head back to the start." }}
      </p>

      <template v-if="is404">
        <!-- Search existing cities -->
        <div class="err-search">
          <input
            v-model="q"
            class="err-input"
            type="text"
            placeholder="Search a city — Novi Sad, Belgrade…"
            autocomplete="off"
            @input="onSearch"
            @keydown.enter="goFirst"
          />
        </div>
        <div v-if="results.length" class="err-results">
          <button
            v-for="c in results"
            :key="c.id"
            type="button"
            class="err-result"
            @click="go(c.id)"
          >
            <span class="err-flag">{{ c.flag }}</span>
            <span class="err-rname">{{ c.name }}</span>
            <span class="err-rcountry">{{ c.country }}</span>
          </button>
        </div>

        <!-- Request a city -->
        <NuxtLink to="/contribute" class="err-btn" @click="reset">Request this city →</NuxtLink>
      </template>

      <NuxtLink v-else to="/" class="err-btn" @click="reset">Back to start →</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number; message?: string } }>()
const is404 = computed(() => props.error?.statusCode === 404)

const { searchCities } = useCity()
const q = ref('')
const results = ref<any[]>([])
let t: ReturnType<typeof setTimeout>

const onSearch = () => {
  clearTimeout(t)
  if (q.value.trim().length < 2) { results.value = []; return }
  t = setTimeout(async () => { results.value = await searchCities(q.value.trim()) }, 250)
}
const reset = () => clearError()
const go = (id: string) => clearError({ redirect: `/${id}` })
const goFirst = () => { if (results.value.length) go(results.value[0].id) }

useSeoMeta({ title: 'Not found — Kerb' })
</script>

<style scoped>
.err {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: var(--bg2);
}
.err-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: 36px 28px;
  text-align: center;
  box-shadow: var(--shadow-md);
}
.err-logo {
  display: inline-block;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  color: var(--blue);
  margin-bottom: 20px;
  letter-spacing: 0.5px;
}
.err-code {
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--muted2);
  margin-bottom: 6px;
}
.err-title { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 8px; }
.err-sub { font-size: 14px; color: var(--muted); line-height: 1.6; margin-bottom: 22px; }
.err-search { margin-bottom: 10px; }
.err-input {
  width: 100%;
  padding: 12px 14px;
  font-size: 15px;
  font-family: var(--font-body);
  color: var(--text);
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  outline: none;
}
.err-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
.err-results {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  margin-bottom: 16px;
}
.err-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: var(--bg);
  border: none;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.err-result:last-child { border-bottom: none; }
.err-result:hover { background: var(--bg2); }
.err-flag { font-size: 18px; }
.err-rname { font-size: 14px; font-weight: 600; color: var(--text); }
.err-rcountry { font-size: 12px; color: var(--muted); margin-left: auto; font-family: var(--font-mono); }
.err-btn {
  display: inline-block;
  width: 100%;
  padding: 13px;
  background: var(--blue);
  color: var(--on-accent);
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}
.err-btn:hover { background: var(--blue-hover); }
</style>

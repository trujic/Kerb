<template>
  <div>
    <section class="page-hero">
      <div class="container">
        <p class="section-label">Browse</p>
        <h1>ALL CITIES</h1>
      </div>
    </section>

    <section class="page-body">
      <div class="container">
        <div v-if="pending" class="cities-grid">
          <div v-for="i in 9" :key="i" class="city-card skeleton" />
        </div>
        <div v-else-if="error" class="error-msg">
          Failed to load cities. Please refresh.
        </div>
        <div v-else class="cities-grid">
          <CityCard
            v-for="city in cities"
            :key="city.id"
            :city="city"
            class="reveal"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { getCities } = useCity()
const { data: cities, pending, error } = await useAsyncData('all-cities', getCities)

onMounted(() => {
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible')
          obs.unobserve(e.target)
        }
      })
    },
    { threshold: 0.08 }
  )
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
})

useSeoMeta({
  title: 'All Cities — Kerb',
  description: 'Browse street parking rules for every city on Kerb.',
})
</script>

<style scoped>
.page-hero {
  padding: 100px 0 40px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.1;
}
.page-body { padding: 48px 0 80px; }
.cities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.skeleton {
  height: 200px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
.error-msg { text-align: center; padding: 60px; color: var(--muted); }
@media (max-width: 900px) { .cities-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 600px) { .cities-grid { grid-template-columns: 1fr; } }
</style>

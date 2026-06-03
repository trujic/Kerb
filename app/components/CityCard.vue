<template>
  <NuxtLink :to="`/${city.id}`" class="city-card">
    <div class="card-top">
      <span class="city-flag">{{ city.flag }}</span>
      <span class="verified-dot" :class="{ ok: city.verified }" />
    </div>
    <div class="city-name">{{ city.name }}</div>
    <div class="city-country">{{ city.country }}</div>
    <div class="city-tags">
      <span
        v-for="tag in city.tags"
        :key="tag.label"
        class="tag"
        :class="tagClass(tag.label)"
      >{{ tag.label }}</span>
    </div>
    <div class="card-footer">
      <span class="updated">Updated {{ city.last_updated }}</span>
      <span class="arrow">→</span>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { CityListItem } from '~/composables/useCity'

defineProps<{ city: CityListItem }>()

function tagClass(label: string) {
  const l = label.toLowerCase()
  if (l.includes('extra')) return 'zone-extra'
  if (l.includes('red'))   return 'zone-red'
  if (l.includes('blue'))  return 'zone-blue'
  if (l.includes('white')) return 'zone-white'
  return ''
}
</script>

<style scoped>
.city-card {
  display: block;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 22px;
  transition: box-shadow 200ms var(--ease-out), border-color 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.city-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--blue-border);
}
@media (hover: hover) and (pointer: fine) {
  .city-card:hover {
    transform: translateY(-2px);
  }
}
.city-card:active { transform: scale(0.98); }
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.city-flag { font-size: 28px; line-height: 1; }
.verified-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--border2);
}
.verified-dot.ok { background: var(--green); }
.city-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text);
  margin-bottom: 2px;
}
.city-country {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  margin-bottom: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.city-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 16px;
}
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.updated {
  font-size: 11px;
  color: var(--muted2);
  font-family: var(--font-mono);
}
.arrow {
  font-size: 14px;
  color: var(--muted2);
  transition: transform 0.15s, color 0.15s;
}
.city-card:hover .arrow {
  transform: translateX(3px);
  color: var(--blue);
}
</style>

<template>
  <article class="legal container">
    <h1>{{ doc.title }}</h1>
    <p class="legal-date">{{ doc.updated }}</p>
    <p v-if="doc.intro" class="legal-intro">{{ doc.intro }}</p>
    <section v-for="s in doc.sections" :key="s.h" class="legal-sec">
      <h2>{{ s.h }}</h2>
      <p v-for="(p, i) in s.p" :key="i">{{ p }}</p>
      <ul v-if="s.list">
        <li v-for="(li, i) in s.list" :key="i">{{ li }}</li>
      </ul>
    </section>
  </article>
</template>

<script setup lang="ts">
export interface LegalSection { h: string; p: string[]; list?: string[] }
export interface Legal { title: string; updated: string; intro?: string; sections: LegalSection[] }

defineProps<{ doc: Legal }>()
</script>

<style scoped>
.legal {
  max-width: 72ch;
  padding-top: 32px;
  padding-bottom: 16px;
}
.legal h1 {
  font-size: 28px;
  line-height: 1.2;
  margin: 0 0 6px;
  text-wrap: balance;
}
.legal-date {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 20px;
}
.legal-intro {
  font-size: 16px;
  color: var(--text2);
  margin: 0 0 8px;
}
.legal-sec { margin-top: 24px; }
.legal-sec h2 {
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 8px;
}
.legal-sec p,
.legal-sec li {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text2);
  text-wrap: pretty;
}
.legal-sec p { margin: 0 0 10px; }
.legal-sec ul { margin: 0 0 10px; padding-left: 20px; }
.legal-sec li { margin-bottom: 6px; }
</style>

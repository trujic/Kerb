<template>
  <div>
    <TheNav />
    <main style="padding-top: 57px">
      <NuxtPage />
    </main>
    <!-- The one line every page owes the driver: Kerb is a guide, the sign is the
         rule. Plus the two documents a public app must be able to point at. -->
    <footer class="site-foot">
      <div class="container site-foot-inner">
        <p class="site-foot-note">{{ t('footNote') }}</p>
        <nav class="site-foot-links" :aria-label="t('footTerms')">
          <NuxtLink to="/privatnost">{{ t('footPrivacy') }}</NuxtLink>
          <NuxtLink to="/uslovi">{{ t('footTerms') }}</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
</script>

<style>
.site-foot {
  border-top: 1px solid var(--border);
  margin-top: 40px;
  padding: 20px 0 24px;
}
.site-foot-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  align-items: baseline;
  justify-content: space-between;
}
.site-foot-note {
  font-size: 13px;
  color: var(--muted);
  max-width: 60ch;
  margin: 0;
}
.site-foot-links {
  display: flex;
  gap: 16px;
  font-size: 13px;
}
.site-foot-links a {
  color: var(--text2);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.site-foot-links a:hover { color: var(--text); }
</style>

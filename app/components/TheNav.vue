<template>
  <nav class="nav">
    <div class="nav-inner container-wide">
      <NuxtLink to="/" class="nav-logo">Kerb</NuxtLink>
      <ul class="nav-links">
        <li><NuxtLink to="/cities">Cities</NuxtLink></li>
        <li v-if="user"><NuxtLink to="/sessions">Sessions</NuxtLink></li>
        <li><NuxtLink to="/roadmap">Roadmap</NuxtLink></li>
        <li><NuxtLink to="/contribute">Contribute</NuxtLink></li>
      </ul>
      <div class="nav-right">
        <button
          type="button"
          class="nav-lang"
          :aria-label="lang === 'sr' ? 'Switch to English' : 'Prebaci na srpski'"
          @click="toggle"
        >{{ lang === 'sr' ? 'EN' : 'SR' }}</button>
        <template v-if="user">
          <NuxtLink to="/profile" class="nav-avatar" :title="displayName">
            {{ initials }}
          </NuxtLink>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="nav-btn nav-btn-ghost">Sign in</NuxtLink>
          <NuxtLink to="/#cities" class="nav-btn nav-btn-primary">Find parking →</NuxtLink>
        </template>
      </div>
    </div>
  </nav>

  <!-- Mobile bottom tab bar — the top links are hidden under 700px, and the
       curb user is one-handed: primary destinations live in the thumb zone. -->
  <nav class="tabbar" aria-label="Primary">
    <NuxtLink to="/" class="tabbar-item" :class="{ on: route.path === '/' }">
      <Icon name="home" :size="20" />
      <span>Home</span>
    </NuxtLink>
    <NuxtLink to="/cities" class="tabbar-item" :class="{ on: route.path.startsWith('/cities') }">
      <Icon name="city" :size="20" />
      <span>Cities</span>
    </NuxtLink>
    <NuxtLink v-if="user" to="/sessions" class="tabbar-item" :class="{ on: route.path.startsWith('/sessions') }">
      <Icon name="clock" :size="20" />
      <span>Sessions</span>
    </NuxtLink>
    <NuxtLink to="/contribute" class="tabbar-item" :class="{ on: route.path.startsWith('/contribute') }">
      <Icon name="plus" :size="20" />
      <span>Contribute</span>
    </NuxtLink>
    <NuxtLink :to="user ? '/profile' : '/login'" class="tabbar-item" :class="{ on: route.path.startsWith(user ? '/profile' : '/login') }">
      <Icon name="user" :size="20" />
      <span>{{ user ? 'Profile' : 'Sign in' }}</span>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
const { user } = useAuth()
const route = useRoute()
const { lang, toggle } = useLang()

const displayName = computed(() =>
  user.value?.user_metadata?.display_name || user.value?.email?.split('@')[0] || 'Account'
)
const initials = computed(() => {
  const name = displayName.value
  const parts = name.split(' ')
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
})
</script>

<style scoped>
.nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  background: rgba(22, 24, 28, 0.82);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
}
.nav-logo {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: 0.5px;
  color: var(--blue);
}
.nav-links {
  display: flex;
  gap: 28px;
  list-style: none;
}
.nav-links a {
  font-size: 14px;
  color: var(--muted);
  font-weight: 500;
  transition: color 0.15s;
}
.nav-links a:hover { color: var(--text); }
.nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-btn {
  padding: 7px 16px;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 500;
  transition: background 150ms var(--ease-out), border-color 150ms var(--ease-out), color 150ms var(--ease-out), transform 150ms var(--ease-out);
  font-family: var(--font-body);
}
.nav-btn:active { transform: scale(0.97); }
.nav-btn-ghost {
  background: none;
  border: 1px solid var(--border2);
  color: var(--text2);
}
.nav-btn-ghost:hover { background: var(--bg2); border-color: var(--border2); color: var(--text); }
.nav-btn-primary {
  background: var(--blue);
  color: var(--on-accent);
  border: none;
  font-weight: 600;
}
.nav-btn-primary:hover { background: var(--blue-hover); }
.nav-lang {
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--muted);
  background: none;
  border: 1px solid var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: color 150ms var(--ease-out), border-color 150ms var(--ease-out);
}
.nav-lang:hover { color: var(--text); border-color: var(--text); }
.nav-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--blue);
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.nav-avatar:hover { opacity: 0.85; }
/* Bottom tab bar — mobile only */
.tabbar {
  display: none;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 100;
  background: rgba(22, 24, 28, 0.92);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding-bottom: env(safe-area-inset-bottom);
}
.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 4px 8px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--muted);
  transition: color 150ms var(--ease-out);
}
.tabbar-item.on { color: var(--blue); }
.tabbar-item:active { color: var(--text); }

@media (max-width: 700px) {
  .nav-links { display: none; }
  .tabbar { display: flex; }
}
</style>

<style>
/* Clear the fixed tab bar so page content and footers stay reachable. */
@media (max-width: 700px) {
  body { padding-bottom: calc(58px + env(safe-area-inset-bottom)); }
}
</style>

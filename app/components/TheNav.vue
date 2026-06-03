<template>
  <nav class="nav">
    <div class="nav-inner container-wide">
      <NuxtLink to="/" class="nav-logo">Kerb</NuxtLink>
      <ul class="nav-links">
        <li><NuxtLink to="/cities">Cities</NuxtLink></li>
        <li><NuxtLink to="/roadmap">Roadmap</NuxtLink></li>
        <li><NuxtLink to="/contribute">Contribute</NuxtLink></li>
      </ul>
      <div class="nav-right">
        <NuxtLink to="/contribute" class="nav-btn nav-btn-ghost">Add a city</NuxtLink>
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
</template>

<script setup lang="ts">
const { user } = useAuth()

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
  background: rgba(255, 255, 255, 0.92);
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
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
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
  color: #fff;
  border: none;
}
.nav-btn-primary:hover { background: var(--blue-hover); }
.nav-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--blue);
  color: #fff;
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
@media (max-width: 700px) {
  .nav-links { display: none; }
}
</style>

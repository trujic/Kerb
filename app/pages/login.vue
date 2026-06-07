<template>
  <div class="auth-page">
    <div class="auth-card">
      <NuxtLink to="/" class="auth-logo">Kerb</NuxtLink>
      <p class="auth-sub">{{ isRegister ? 'Create your account' : 'Sign in to your account' }}</p>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <div v-if="isRegister" class="form-group">
          <label class="form-label">Display name</label>
          <input v-model="form.displayName" class="form-input" type="text" placeholder="Your name" />
        </div>

        <div class="form-group">
          <label class="form-label">Email *</label>
          <input v-model="form.email" class="form-input" type="email" placeholder="you@example.com" required />
        </div>

        <div class="form-group">
          <label class="form-label">Password *</label>
          <input v-model="form.password" class="form-input" type="password" placeholder="••••••••" required minlength="6" />
        </div>

        <div v-if="authError" class="error-banner">{{ authError }}</div>
        <div v-if="successMsg" class="success-banner">{{ successMsg }}</div>

        <button type="submit" class="btn-primary submit-btn" :disabled="loading">
          {{ loading ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in' }}
        </button>
      </form>

      <div class="auth-toggle">
        {{ isRegister ? 'Already have an account?' : "Don't have an account?" }}
        <button class="toggle-btn" @click="toggleMode">
          {{ isRegister ? 'Sign in' : 'Create one' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { signIn, signUp, user } = useAuth()

// Redirect if already logged in
if (user.value) await navigateTo('/')

const isRegister = ref(false)
const loading = ref(false)
const authError = ref('')
const successMsg = ref('')

const form = reactive({ email: '', password: '', displayName: '' })

const toggleMode = () => {
  isRegister.value = !isRegister.value
  authError.value = ''
  successMsg.value = ''
}

const handleSubmit = async () => {
  loading.value = true
  authError.value = ''
  successMsg.value = ''
  try {
    if (isRegister.value) {
      await signUp(form.email, form.password, form.displayName)
      successMsg.value = 'Account created! Check your email to confirm, then sign in.'
      isRegister.value = false
    } else {
      await signIn(form.email, form.password)
      await navigateTo('/')
    }
  } catch (e: any) {
    authError.value = e?.message ?? 'Something went wrong.'
  } finally {
    loading.value = false
  }
}

useSeoMeta({ title: 'Sign in — Kerb' })
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px 40px;
  background: var(--bg2);
}
.auth-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow-md);
}
.auth-logo {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--blue);
  margin-bottom: 6px;
  letter-spacing: -0.3px;
}
.auth-sub {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 28px;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group { display: flex; flex-direction: column; }
.submit-btn {
  width: 100%;
  text-align: center;
  margin-top: 4px;
  padding: 13px;
}
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error-banner {
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  border-radius: var(--r-md);
  padding: 10px 14px;
  font-size: 13px;
  color: var(--red);
}
.success-banner {
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  padding: 10px 14px;
  font-size: 13px;
  color: var(--green);
}
.auth-toggle {
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  margin-top: 20px;
}
.toggle-btn {
  background: none;
  border: none;
  color: var(--blue);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-left: 4px;
}
.toggle-btn:hover { text-decoration: underline; }
</style>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <NuxtLink to="/" class="auth-logo">Kerb</NuxtLink>
      <p class="auth-sub">{{ isRegister ? t('loginCreateSub') : t('loginSignInSub') }}</p>
      <p class="auth-value">{{ t('loginValue') }}</p>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <div v-if="isRegister" class="form-group">
          <label class="form-label">{{ t('loginName') }}</label>
          <input v-model="form.displayName" class="form-input" type="text" :placeholder="t('loginNamePh')" autocomplete="name" />
        </div>

        <div class="form-group">
          <label class="form-label">{{ t('loginEmail') }}</label>
          <input v-model="form.email" class="form-input" type="email" placeholder="you@example.com" required autocomplete="email" />
        </div>

        <div class="form-group">
          <label class="form-label">{{ t('loginPassword') }}</label>
          <div class="pw-wrap">
            <input
              v-model="form.password"
              class="form-input pw-input"
              :type="showPw ? 'text' : 'password'"
              placeholder="••••••••"
              required
              minlength="6"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
            />
            <button
              type="button"
              class="pw-toggle"
              :aria-label="showPw ? t('loginHideAria') : t('loginShowAria')"
              @click="showPw = !showPw"
            >{{ showPw ? t('loginHide') : t('loginShow') }}</button>
          </div>
        </div>

        <div v-if="authError" class="error-banner">{{ authError }}</div>
        <div v-if="successMsg" class="success-banner">{{ successMsg }}</div>

        <button type="submit" class="btn-primary submit-btn" :disabled="loading">
          {{ loading ? t('loginWait') : isRegister ? t('loginCreateBtn') : t('loginSignInBtn') }}
        </button>
      </form>

      <div class="auth-toggle">
        {{ isRegister ? t('loginHaveAccount') : t('loginNoAccount') }}
        <button class="toggle-btn" @click="toggleMode">
          {{ isRegister ? t('loginSignInBtn') : t('loginCreateOne') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { signIn, signUp, user } = useAuth()
const { t } = useLang()

// Redirect if already logged in
if (user.value) await navigateTo('/')

const isRegister = ref(false)
const loading = ref(false)
const authError = ref('')
const successMsg = ref('')
const showPw = ref(false)

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
      successMsg.value = t('loginCreated')
      isRegister.value = false
    } else {
      await signIn(form.email, form.password)
      await navigateTo('/')
    }
  } catch (e: any) {
    authError.value = e?.message ?? t('loginFailed')
  } finally {
    loading.value = false
  }
}

useSeoMeta({ title: () => `${t('loginTitle')} · Kerb` })
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
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 400;
  color: var(--text);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.auth-sub {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 10px;
}
.auth-value {
  font-size: 13px;
  color: var(--text2);
  line-height: 1.55;
  margin-bottom: 24px;
}
.pw-wrap { position: relative; display: flex; align-items: center; }
.pw-input { width: 100%; padding-right: 64px; }
.pw-toggle {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
  cursor: pointer;
  padding: 6px 8px;
}
.pw-toggle:hover { text-decoration: underline; }
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

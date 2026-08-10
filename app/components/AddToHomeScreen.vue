<!-- Add-to-home-screen nudge. Chrome gets a real install button; iOS gets the
     only thing Safari allows — the steps, since it exposes no install API. -->
<template>
  <div v-if="visible" class="a2hs">
    <span class="a2hs-icon"><Icon name="plus" :size="16" /></span>
    <div class="a2hs-body">
      <p class="a2hs-title">{{ t('a2hsTitle') }}</p>
      <p class="a2hs-sub">{{ t('a2hsSub') }}</p>
      <p v-if="stepsOpen" class="a2hs-steps">{{ t('a2hsIosSteps') }}</p>
      <div class="a2hs-actions">
        <button v-if="canPrompt" class="a2hs-btn" @click="install">
          {{ t('a2hsAdd') }}
        </button>
        <button
          v-else
          class="a2hs-btn"
          :aria-expanded="stepsOpen"
          @click="stepsOpen = !stepsOpen"
        >
          {{ t('a2hsHow') }}
        </button>
        <button class="a2hs-later" @click="dismiss">{{ t('a2hsLater') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { visible, canPrompt, install, dismiss } = useInstallPrompt()

const stepsOpen = ref(false)
</script>

<style scoped>
.a2hs {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px 14px;
  background: var(--blue-bg);
  border: 1px solid var(--blue-border);
  border-radius: var(--r-md);
}
.a2hs-icon {
  line-height: 1.4;
  flex-shrink: 0;
  color: var(--blue);
}
.a2hs-body {
  flex: 1;
  min-width: 0;
}
.a2hs-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
.a2hs-sub {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.5;
}
.a2hs-steps {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--r-sm, 8px);
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
}
.a2hs-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
}
.a2hs-btn {
  padding: 7px 14px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.a2hs-later {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--text2);
  cursor: pointer;
}
</style>

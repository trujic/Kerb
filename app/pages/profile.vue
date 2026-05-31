<template>
  <div class="profile-page">
    <div class="container">
      <div class="page-header">
        <div>
          <p class="section-label">Account</p>
          <h1>Your profile</h1>
        </div>
        <button class="btn-ghost signout-btn" @click="handleSignOut">Sign out</button>
      </div>

      <div v-if="loading" class="loading-wrap">
        <div class="loading-spinner" />
      </div>

      <div v-else class="profile-grid">
        <!-- LEFT: Profile details -->
        <div class="profile-main">

          <!-- Basic info -->
          <section class="profile-section">
            <h2>Account details</h2>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input :value="user?.email" class="form-input" type="email" disabled />
            </div>
            <div class="form-group">
              <label class="form-label">Display name</label>
              <input v-model="profileForm.displayName" class="form-input" type="text" placeholder="Your name" />
            </div>
            <div class="form-group">
              <label class="form-label">Default city (optional — GPS can auto-detect)</label>
              <select v-model="profileForm.defaultCityId" class="form-input">
                <option value="">Auto-detect via GPS</option>
                <option v-for="c in cities" :key="c.id" :value="c.id">
                  {{ c.flag }} {{ c.name }}, {{ c.country }}
                </option>
              </select>
            </div>
            <div v-if="profileError" class="error-msg">{{ profileError }}</div>
            <div v-if="profileSaved" class="success-msg">Saved.</div>
            <button class="btn-primary save-btn" :disabled="savingProfile" @click="saveProfile">
              {{ savingProfile ? 'Saving...' : 'Save changes' }}
            </button>
          </section>

          <!-- License plates -->
          <section class="profile-section">
            <h2>License plates</h2>
            <p class="section-desc">Add up to 3 plates. The default one will be pre-filled when paying.</p>

            <div class="plates-list">
              <div v-for="plate in plates" :key="plate.id" class="plate-item">
                <div class="plate-number">{{ plate.plate }}</div>
                <div class="plate-label">{{ plate.label || 'No label' }}</div>
                <div class="plate-actions">
                  <button
                    v-if="!plate.is_default"
                    class="plate-action"
                    @click="setDefaultPlate(plate.id)"
                  >Set default</button>
                  <span v-else class="plate-default">Default</span>
                  <button class="plate-remove" @click="deletePlate(plate.id)">Remove</button>
                </div>
              </div>

              <div v-if="plates.length === 0" class="plates-empty">
                No plates added yet.
              </div>
            </div>

            <!-- Add plate form -->
            <div v-if="plates.length < 3" class="add-plate-form">
              <div class="add-plate-fields">
                <div class="form-group plate-input-group">
                  <label class="form-label">Plate number *</label>
                  <input
                    v-model="newPlate.plate"
                    class="form-input plate-input"
                    type="text"
                    placeholder="NS123AB"
                    style="text-transform: uppercase"
                    maxlength="12"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Label (optional)</label>
                  <input v-model="newPlate.label" class="form-input" type="text" placeholder="My car" />
                </div>
              </div>
              <label class="checkbox-row">
                <input v-model="newPlate.isDefault" type="checkbox" />
                <span>Set as default plate</span>
              </label>
              <div v-if="plateError" class="error-msg">{{ plateError }}</div>
              <button class="btn-ghost add-btn" :disabled="!newPlate.plate || savingPlate" @click="addNewPlate">
                {{ savingPlate ? 'Adding...' : '+ Add plate' }}
              </button>
            </div>
            <p v-else class="plates-limit">Maximum 3 plates reached.</p>
          </section>
        </div>

        <!-- RIGHT: Quick links -->
        <div class="profile-side">
          <div class="sidebar-card">
            <p class="section-label">Quick access</p>
            <div class="quick-links">
              <NuxtLink
                v-if="profileForm.defaultCityId"
                :to="`/${profileForm.defaultCityId}`"
                class="quick-link"
              >
                View your city →
              </NuxtLink>
              <NuxtLink to="/cities" class="quick-link">Browse all cities →</NuxtLink>
              <NuxtLink to="/contribute" class="quick-link">Contribute info →</NuxtLink>
            </div>
          </div>

          <div class="sidebar-card info-card">
            <p class="section-label">Why add your plate?</p>
            <p class="info-text">When paying for parking, your default plate will be pre-filled automatically. No re-typing every time.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { user, getProfile, updateProfile, addPlate, updatePlate, removePlate, signOut } = useAuth()

if (!user.value) await navigateTo('/login')

const supabase = useSupabaseClient()
const loading = ref(true)
const plates = ref<any[]>([])

const profileForm = reactive({ displayName: '', defaultCityId: '' })
const savingProfile = ref(false)
const profileError = ref('')
const profileSaved = ref(false)

const newPlate = reactive({ plate: '', label: '', isDefault: false })
const savingPlate = ref(false)
const plateError = ref('')

// Load cities for the select
const { data: cities } = await useAsyncData('profile-cities', async () => {
  const { data } = await supabase.from('cities').select('id, name, country, flag').order('name')
  return data ?? []
})

// Load profile
onMounted(async () => {
  const profile = await getProfile()
  if (profile) {
    profileForm.displayName = profile.display_name ?? ''
    profileForm.defaultCityId = profile.default_city_id ?? ''
    plates.value = profile.plates ?? []
  }
  loading.value = false
})

const saveProfile = async () => {
  savingProfile.value = true
  profileError.value = ''
  profileSaved.value = false
  try {
    await updateProfile({
      display_name: profileForm.displayName || null,
      default_city_id: profileForm.defaultCityId || null,
    })
    profileSaved.value = true
    setTimeout(() => (profileSaved.value = false), 2500)
  } catch (e: any) {
    profileError.value = e?.message ?? 'Failed to save.'
  } finally {
    savingProfile.value = false
  }
}

const addNewPlate = async () => {
  if (!newPlate.plate) return
  savingPlate.value = true
  plateError.value = ''
  try {
    await addPlate(newPlate.plate, newPlate.label, newPlate.isDefault)
    const profile = await getProfile()
    plates.value = profile?.plates ?? []
    newPlate.plate = ''
    newPlate.label = ''
    newPlate.isDefault = false
  } catch (e: any) {
    plateError.value = e?.message ?? 'Failed to add plate.'
  } finally {
    savingPlate.value = false
  }
}

const setDefaultPlate = async (plateId: string) => {
  await updatePlate(plateId, { is_default: true })
  const profile = await getProfile()
  plates.value = profile?.plates ?? []
}

const deletePlate = async (plateId: string) => {
  await removePlate(plateId)
  plates.value = plates.value.filter(p => p.id !== plateId)
}

const handleSignOut = async () => {
  await signOut()
  await navigateTo('/')
}

useSeoMeta({ title: 'Profile — Kerb' })
</script>

<style scoped>
.profile-page { padding: 100px 0 80px; min-height: 100vh; background: var(--bg2); }
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 40px;
}
h1 {
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 700;
  letter-spacing: -0.3px;
}
.signout-btn { font-size: 13px; }
.loading-wrap { display: flex; justify-content: center; padding: 80px 0; }
.loading-spinner {
  width: 28px; height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 32px;
  align-items: start;
}
.profile-section {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 28px;
  margin-bottom: 16px;
}
h2 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
}
.section-desc { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
.form-group { display: flex; flex-direction: column; margin-bottom: 14px; }
input:disabled { opacity: 0.5; cursor: not-allowed; }
.save-btn { margin-top: 4px; }
.error-msg { font-size: 13px; color: var(--red); margin-bottom: 8px; }
.success-msg { font-size: 13px; color: var(--green); margin-bottom: 8px; }

/* Plates */
.plates-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.plate-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.plate-number {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 500;
  min-width: 90px;
}
.plate-label { font-size: 13px; color: var(--muted); flex: 1; }
.plate-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.plate-action {
  font-size: 12px;
  color: var(--blue);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: var(--font-body);
}
.plate-action:hover { text-decoration: underline; }
.plate-default {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--green);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  padding: 2px 8px;
  border-radius: 20px;
}
.plate-remove {
  font-size: 12px;
  color: var(--red);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: var(--font-body);
}
.plate-remove:hover { text-decoration: underline; }
.plates-empty { font-size: 13px; color: var(--muted2); padding: 8px 0; }
.plates-limit { font-size: 13px; color: var(--muted2); margin-top: 8px; }

.add-plate-form { border-top: 1px solid var(--border); padding-top: 20px; }
.add-plate-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
.plate-input { font-family: var(--font-mono); letter-spacing: 1px; text-transform: uppercase; }
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text2);
  margin-bottom: 14px;
  cursor: pointer;
}
.add-btn { font-size: 13px; padding: 9px 18px; }
.add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Sidebar */
.sidebar-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 20px;
  margin-bottom: 12px;
}
.quick-links { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.quick-link { font-size: 13px; color: var(--blue); font-weight: 500; }
.quick-link:hover { color: var(--blue-hover); }
.info-card { background: var(--blue-bg); border-color: var(--blue-border); }
.info-text { font-size: 13px; color: var(--muted); line-height: 1.6; margin-top: 8px; }

@media (max-width: 900px) {
  .profile-grid { grid-template-columns: 1fr; }
  .add-plate-fields { grid-template-columns: 1fr; }
}
</style>

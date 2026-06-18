<template>
  <div>
    <!-- ── GPS DASHBOARD (logged-in + city detected) ── -->
    <section v-if="gpsMode" class="hero-gps">
      <div class="container">
        <!-- Map -->
        <ClientOnly>
          <div class="gps-map-wrap">
            <LocationMap
              :lat="coords!.lat"
              :lng="coords!.lng"
              :accuracy="coords!.accuracy"
              :heading="heading"
              :height="190"
              :zones="displayZones"
              :highlight="highlightPoint"
              :signs="signReports"
              :compass-prompt="compassPrompt"
              @compass-tap="onMapTap"
              @enable-compass="onMapTap"
            />
            <button
              class="map-expand-btn"
              type="button"
              aria-label="Expand map"
              @click="mapExpanded = true"
            >
              <span>⤢</span> Explore zones
            </button>
          </div>
        </ClientOnly>

        <!-- Fullscreen interactive map -->
        <ClientOnly>
          <Teleport to="body">
            <div v-if="mapExpanded" class="map-fs" role="dialog" aria-label="Zone map">
              <div class="map-fs-bar">
                <span class="map-fs-title">
                  {{ detectedCity!.flag }} {{ detectedCity!.name }} · parking zones
                </span>
                <button
                  class="map-fs-close"
                  type="button"
                  aria-label="Close map"
                  @click="mapExpanded = false"
                >✕</button>
              </div>
              <div class="map-fs-body">
                <LocationMap
                  :lat="coords!.lat"
                  :lng="coords!.lng"
                  :accuracy="coords!.accuracy"
                  :heading="heading"
                  :zones="displayZones"
                  :highlight="highlightPoint"
                  :signs="signReports"
                  :compass-prompt="compassPrompt"
                  fill
                  interactive
                  @enable-compass="onMapTap"
                />
              </div>
            </div>
          </Teleport>
        </ClientOnly>

        <!-- Detected-location line — minimal: where you are, not a city banner -->
        <div class="gps-detected">
          <span class="gps-detected-where">
            <span class="gps-detected-pin">📍</span>
            <template v-if="detectedStreet"><strong>{{ detectedStreet }}</strong> · </template>{{ detectedCity!.name }}
            <span class="gps-detected-tag">detected</span>
          </span>
          <NuxtLink :to="`/${detectedCity!.id}`" class="gps-detected-guide">Full guide →</NuxtLink>
        </div>

        <!-- Armed night pre-pay — scheduled for the next paid window, not live yet -->
        <div v-if="displaySession && displaySession.type === 'armed'" class="armed-card">
          <div class="armed-main">
            <span class="armed-moon">🌙</span>
            <div>
              <p class="armed-title">Armed for the morning · {{ displaySession.zone_name }}</p>
              <p class="armed-sub">
                Pre-paid {{ clockOf(displaySession.started_at) }}–{{ clockOf(displaySession.expires_at) }}.
                We can't ping you yet — set an alarm to re-check the sign.
              </p>
            </div>
          </div>
          <button type="button" class="armed-cancel" @click="onEndSession">Cancel</button>
        </div>

        <!-- Active parking session -->
        <SessionCard
          v-else-if="displaySession"
          :session="displaySession"
          :remaining-ms="displayRemaining"
          :at-zone-limit="displayAtLimit"
          :can-extend="displayCanExtend"
          @extend="onExtend"
          @end="onEndSession"
          @locate="onLocateCar"
        />

        <!-- ═══ FREE-NOW SURFACE — when no payment is needed, the screen IS the answer ═══ -->
        <div v-if="freeSurface" class="free-surface">
          <span class="free-now-tag"><span class="free-now-dot" />Free now</span>
          <h2 class="free-now-title">No need to pay right now</h2>
          <p class="free-now-sub">
            Parking is free in {{ detectedCity!.name }}.<template v-if="nextWindow">
              Charging resumes <strong>{{ nextWindow.dayLabel }} {{ nextWindow.start }}</strong>.</template><template v-else-if="hoursStatus?.detail"> {{ hoursStatus.detail }}.</template>
          </p>
          <div class="free-now-actions">
            <button
              v-if="statusCanPrepay"
              type="button"
              class="free-prepay-btn"
              @click="statusToPrepay"
            >Pre-pay {{ nextWindow!.start }}–{{ nextWindow!.end }} →</button>
            <button type="button" class="free-browse-btn" @click="browseAnyway">Browse zones</button>
          </div>
        </div>

        <!-- ═══ FULL DASHBOARD — paid now, or browsing while free ═══ -->
        <template v-else>
        <!-- ── TABS — split the stack: do it / figure it out / look it up ── -->
        <div class="gps-tabs" role="tablist">
          <button
            type="button" role="tab" class="gps-tab"
            :class="{ on: activeTab === 'pay' }"
            @click="activeTab = 'pay'"
          >Pay</button>
          <button
            type="button" role="tab" class="gps-tab"
            :class="{ on: activeTab === 'find' }"
            @click="activeTab = 'find'"
          >Find</button>
          <button
            type="button" role="tab" class="gps-tab"
            :class="{ on: activeTab === 'info' }"
            @click="activeTab = 'info'"
          >Info</button>
        </div>

        <!-- ═══ PAY PANEL — the 10-second job: status → zone → pay ═══ -->
        <div v-show="activeTab === 'pay'" class="gps-panel">
        <!-- Live free/paid status only — the full weekly schedule lives in Info -->
        <ParkingHours :city-id="detectedCity!.id" compact status-only class="gps-hours" />

        <!-- No paid parking at the user's spot -->
        <div v-if="parkingState === 'none' && nearest" class="gps-noparking">
          <div class="np-icon">🅿️</div>
          <div class="np-text">
            <p class="np-title">No paid zone where you're standing</p>
            <p class="np-sub">
              Parking here is likely free. Nearest paid parking is
              <strong>~{{ formatDist(nearest.distanceM) }}</strong> away —
              <span :style="{ color: zoneColor(nearest.zoneName) }">{{ nearest.zoneName }}</span>
              on {{ nearest.streetName }}.
            </p>
          </div>
        </div>

        <!-- Zone cards -->
        <div class="gps-zones">
          <!-- ── Honest framing: GPS narrows it down, the sign decides ── -->
          <div class="zone-pick-head">
            <p class="zone-pick-title">
              <span v-if="freeNow" class="free-badge">FREE NOW</span>
              <template v-if="freeNow">Parking is free right now</template>
              <template v-else-if="parkingState === 'on'">You're in a paid parking area</template>
              <template v-else-if="parkingState === 'near' && nearest">
                Paid parking ~{{ formatDist(nearest.distanceM) }} away
              </template>
              <template v-else>Parking zones in {{ detectedCity!.name }}</template>
            </p>
            <p class="zone-pick-hint">
              <template v-if="freeNow && nextWindow">
                🌙 No need to pay until <strong>{{ nextWindow.dayLabel }} {{ nextWindow.start }}</strong>. You can pre-pay the first hour now.
              </template>
              <template v-else>
                🪧 Tap the zone printed on the sign next to your car — that's the one that counts.
              </template>
            </p>
            <p v-if="mapApprox" class="zone-pick-approx">
              ⚠️ {{ detectedCity!.name }}'s zone areas are approximate (no official map) — use this to narrow it down, then trust the sign.
            </p>
          </div>

          <!-- Selectable zones — likely one floats up, but it's never auto-committed -->
          <div class="zone-pick-list" :class="{ 'zone-pick-list--free': freeNow }">
            <button
              v-for="zone in orderedZones"
              :key="zone.id"
              type="button"
              class="zone-pick"
              :class="{ 'zone-pick--active': zone.name === selectedZoneName }"
              :style="zone.name === selectedZoneName
                ? { borderColor: zone.color, background: zone.color + '0d' }
                : null"
              @click="selectedZoneName = zone.name"
            >
              <span class="zone-pick-stripe" :style="{ background: zone.color }" />
              <span class="zone-pick-info">
                <span class="zone-pick-name">{{ zone.name }}</span>
                <span v-if="zone.name === likelyZoneName" class="zone-pick-tag">📍 likely yours</span>
                <span v-if="pickLimit(zone.rules)" class="zone-pick-limit">{{ pickLimit(zone.rules) }}</span>
              </span>
              <span class="zone-pick-price" :style="{ color: zone.color }">{{ zone.price }}</span>
              <span class="zone-pick-radio" :class="{ on: zone.name === selectedZoneName }">
                <span v-if="zone.name === selectedZoneName">✓</span>
              </span>
            </button>
          </div>

          <!-- Selected zone — one card: zone · price · limit · slide-to-pay -->
          <div
            v-if="selectedZone"
            class="zone-act"
            :style="{ borderColor: selectedZone.color }"
          >
            <!-- Pay card header — which zone, what it costs, all in one place -->
            <div class="zone-act-head">
              <span class="zone-act-stripe" :style="{ background: selectedZone.color }" />
              <span class="zone-act-name">{{ selectedZone.name }}</span>
              <span v-if="selectedZone.name === likelyZoneName" class="zone-act-likely">📍 likely yours</span>
              <span class="zone-act-price" :style="{ color: selectedZone.color }">{{ selectedZone.price }}</span>
            </div>

            <!-- The hard limit, made unmissable — it's what gets people fined -->
            <div
              v-if="selectedLimit"
              class="zone-limit"
              :class="selectedLimit.cap ? 'zone-limit--cap' : 'zone-limit--free'"
            >
              <span
                class="zone-limit-badge"
                :style="selectedLimit.cap ? { background: selectedZone.color, borderColor: selectedZone.color } : null"
              >
                <span class="zone-limit-icon">{{ selectedLimit.cap ? '⏱' : '∞' }}</span>
                {{ selectedLimit.label }}
              </span>
              <span v-if="selectedLimit.note" class="zone-limit-note">{{ selectedLimit.note }}</span>
            </div>
            <p v-if="parkingState === 'near'" class="zone-act-caution">
              ⚠️ GPS puts you near a boundary — only pay this zone if the sign says
              <strong>{{ selectedZone.name }}</strong>.
            </p>
            <div v-if="!user" class="zone-plate">
              <PlateInput v-model="guestPlate" />
              <span class="zone-plate-hint">
                Saved on this device · prefilled into the SMS · 📷 scan it instead of typing.
                <NuxtLink to="/login">Create an account</NuxtLink> to sync it.
              </span>
            </div>
            <template v-if="selectedZone.sms_shortcode">
              <!-- ── Night pre-pay: free now, the SMS carries over to the next window ── -->
              <div v-if="nightPrepay" class="prepay">
                <p class="prepay-note">
                  🌙 Free until <strong>{{ nextWindow!.start }}</strong>. Per the official carry-over rule,
                  an SMS you send now applies to <strong>{{ nextWindow!.dayLabel }} {{ nextWindow!.start }}–{{ nextWindow!.end }}</strong> —
                  not the moment you send it.
                </p>
                <SlideToConfirm
                  :key="'pp-' + selectedZone.name"
                  :label="`I checked the sign — slide to pre-pay ${nextWindow!.start}–${nextWindow!.end}`"
                  done-label="Opening SMS…"
                  :color="selectedZone.color"
                  @confirm="pay(selectedZone, { armed: true })"
                />
              </div>

              <!-- ── Paid hours: the slide IS the sign-confirmation ── -->
              <template v-else>
                <SlideToConfirm
                  v-if="!skipConfirm"
                  :key="selectedZone.name"
                  :label="`I checked the sign — slide to pay ${selectedZone.name}`"
                  done-label="Opening SMS…"
                  :color="selectedZone.color"
                  @confirm="pay(selectedZone)"
                />
                <!-- Responsibility mode: fast tap, no per-pay confirm -->
                <button
                  v-else
                  type="button"
                  class="zone-act-btn"
                  :style="{ background: selectedZone.color }"
                  @click="pay(selectedZone)"
                >
                  <span v-if="defaultPlate">Pay {{ selectedZone.name }} · {{ defaultPlate }}</span>
                  <span v-else>Pay {{ selectedZone.name }}</span>
                  <span class="zone-act-arrow">→ {{ selectedZone.sms_shortcode }}</span>
                </button>

                <!-- Persisted opt-out: take responsibility, skip the per-pay slide -->
                <label class="zone-resp" :class="{ 'zone-resp--on': skipConfirm }">
                  <input v-model="skipConfirm" type="checkbox" class="zone-resp-box" />
                  <span v-if="!skipConfirm">Don't ask each time — I'll check the sign myself and take responsibility</span>
                  <span v-else>Sign-check off — you choose the zone and are responsible. Tap to turn confirmation back on.</span>
                </label>
              </template>
            </template>

            <p class="zone-act-foot">
              <NuxtLink
                v-if="user && selectedZone.sms_shortcode && !defaultPlate"
                to="/profile"
                class="zone-act-link"
              >Add a plate for one-tap SMS</NuxtLink>
              <span class="zone-act-src">
                Your phone sends the SMS to the parking operator.
              </span>
            </p>
          </div>

          <!-- Escape hatch to the spatial tools when the likely zone isn't enough -->
          <button type="button" class="zone-unsure" @click="activeTab = 'find'">
            🪧 Not sure which zone? Scan the sign or ask AI →
          </button>
        </div>
        </div><!-- /pay panel -->

        <!-- ═══ FIND ZONE PANEL — "which zone am I actually in?" ═══ -->
        <div v-show="activeTab === 'find'" class="gps-panel">
          <p class="panel-lead">📍 The map up top shows where you are. Use these to pin the exact zone.</p>

          <!-- Scan the sign — the sign is ground truth: read it, confirm, pin it, pay -->
          <button type="button" class="scan-cta" @click="showScan = true">
            <span class="scan-cta-icon">📸</span>
            <span class="scan-cta-text">
              <span class="scan-cta-title">Scan the sign</span>
              <span class="scan-cta-sub">Read the zone off the sign, confirm it on the map, then pay</span>
            </span>
            <span class="scan-cta-arrow">→</span>
          </button>

          <!-- Ask AI — geometry + registry decide, never a remembered guess -->
          <button type="button" class="ai-cta" @click="showAi = true">
            <span class="ai-cta-icon">🧠</span>
            <span class="ai-cta-text">
              <span class="ai-cta-title">New here? How parking works</span>
              <span class="ai-cta-sub">When you pay, the zones, and how — in plain language</span>
            </span>
            <span class="ai-cta-arrow">→</span>
          </button>

          <!-- Nearest confirmed sign — lead the user to verified ground truth -->
          <button
            v-if="nearestSign"
            type="button"
            class="nsign"
            :style="{ borderColor: (nearestSign.report.zone_color || 'var(--blue)') + '66' }"
            @click="onLeadToSign"
          >
            <span
              class="nsign-arrow"
              :style="{ transform: `rotate(${nearestSignArrow - 90}deg)`, color: nearestSign.report.zone_color || 'var(--blue)' }"
            >➤</span>
            <span class="nsign-text">
              <span class="nsign-title">
                Nearest confirmed sign · {{ formatDist(nearestSign.distanceM) }}
              </span>
              <span class="nsign-sub">
                <span :style="{ color: nearestSign.report.zone_color || 'var(--text2)' }">{{ nearestSign.report.zone_name }}</span>
                · confirmed {{ relTime(nearestSign.report.created_at) }}
              </span>
            </span>
            <span class="nsign-go">Lead me →</span>
          </button>
        </div><!-- /find panel -->

        <!-- ═══ INFO PANEL — reference & reassurance, never urgent ═══ -->
        <div v-show="activeTab === 'info'" class="gps-panel">
        <!-- Full weekly charging schedule (reference) -->
        <ParkingHours :city-id="detectedCity!.id" class="gps-hours" />

        <!-- Guest → account nudge (memory + reminders + fine alerts) -->
        <div v-if="!user" class="guest-upsell">
          <span class="guest-upsell-icon">🔔</span>
          <p class="guest-upsell-text">
            You're paying as a guest. <NuxtLink to="/login">Create a free account</NuxtLink>
            to track your session, get an expiry reminder, and watch your plate for fines.
          </p>
        </div>

        <!-- Personal fine check (manual) — works for guests too -->
        <FineCheck :initial-plate="defaultPlate" class="gps-finecheck" />

        <!-- Fine warning -->
        <div v-if="cityDetail.fine" class="gps-fine">
          <span class="gps-fine-label">Fine if unpaid</span>
          <span class="gps-fine-amount">{{ cityDetail.fine }}</span>
        </div>

        <!-- Recent sessions -->
        <div v-if="pastSessions.length" class="gps-history">
          <p class="section-label">Recent sessions</p>
          <div
            v-for="s in pastSessions"
            :key="s.id"
            class="hist-row"
          >
            <span class="hist-dot" :style="{ background: s.zone_color || 'var(--text2)' }" />
            <span class="hist-main">
              <span class="hist-zone">{{ s.zone_name }}</span>
              <span v-if="s.street_name" class="hist-street"> · {{ s.street_name }}</span>
            </span>
            <span class="hist-when">{{ relTime(s.started_at) }}</span>
          </div>
        </div>
        </div><!-- /info panel -->
        </template><!-- /full dashboard -->
      </div>

      <!-- Scan the sign — capture → read → confirm → pin + prefill pay -->
      <ClientOnly>
        <ScanSign
          v-if="showScan"
          :city-id="detectedCity!.id"
          :zones="allZones"
          :coords="coords"
          :heading="heading"
          :street="nearest?.streetName ?? null"
          :likely-zone-name="likelyZoneName"
          @close="showScan = false"
          @submitted="onSignSubmitted"
          @pay="onScanPay"
        />
      </ClientOnly>

      <!-- Ask AI — candidate-set zone resolver with cited evidence -->
      <ClientOnly>
        <AskAi
          v-if="showAi"
          :city-id="detectedCity!.id"
          :city-name="detectedCity!.name"
          :zones="allZones"
          :verdict="aiVerdict"
          :source-name="aiSourceName"
          :confirmed-at="cityDetail?.last_updated"
          @pick="onAiPick"
          @scan="onAiScan"
          @close="showAi = false"
        />
      </ClientOnly>

      <!-- Open-the-app status moment — only when no payment is needed -->
      <ClientOnly>
        <Teleport to="body">
          <Transition name="status-sheet">
            <div v-if="showStatusSheet" class="status-scrim" role="dialog" aria-label="Parking status" @click.self="dismissStatus">
              <div class="status-sheet">
                <p class="status-kicker"><span class="status-free-dot" />Parking status · {{ detectedCity!.name }}</p>
                <p class="status-headline">
                  <template v-if="nextWindow?.dayLabel === 'today'">Free until {{ nextWindow.start }}</template>
                  <template v-else>Free right now — no payment needed</template>
                </p>
                <p class="status-body">
                  You don't need to pay in {{ detectedCity!.name }} right now.<template v-if="statusCanPrepay">
                    The next paid window is <strong>{{ nextWindow!.dayLabel }} {{ nextWindow!.start }}–{{ nextWindow!.end }}</strong> — pre-pay it now to be covered the moment it opens.</template><template v-else-if="hoursStatus?.detail"> {{ hoursStatus.detail }}.</template>
                </p>
                <div class="status-actions">
                  <template v-if="statusCanPrepay">
                    <button type="button" class="status-secondary" @click="dismissStatus">Not now</button>
                    <button type="button" class="status-primary" @click="statusToPrepay">
                      Pre-pay {{ nextWindow!.start }}–{{ nextWindow!.end }}
                    </button>
                  </template>
                  <button v-else type="button" class="status-primary" @click="dismissStatus">Got it</button>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
      </ClientOnly>

      <!-- SMS handoff — the web can't verify the send, so we ask -->
      <ClientOnly>
        <Teleport to="body">
          <div v-if="showSentPrompt" class="sent" role="dialog" aria-label="Confirm SMS sent">
            <div class="sent-sheet">
              <p class="sent-title">Did your SMS send?</p>
              <p class="sent-sub">
                Your phone should have opened a message to <strong>{{ pendingPay?.zone.sms_shortcode }}</strong>.
                The operator's reply SMS is your official receipt — keep it.
              </p>
              <div class="sent-actions">
                <button type="button" class="sent-no" @click="onSentNo">Not yet</button>
                <button type="button" class="sent-yes" @click="onSentYes">Yes, sent it</button>
              </div>
            </div>
          </div>
        </Teleport>
      </ClientOnly>
    </section>

    <!-- ── HERO (default, non-GPS) ── -->
    <section v-else class="hero">
      <div class="container">
        <p class="section-label fade-up">Street parking · Europe</p>
        <h1 class="fade-up-2">
          Parking rules for<br />any city, organized.
        </h1>
        <p class="hero-sub fade-up-3">
          Zones, prices, and how to pay — pulled from official sources
          and organized so you don't have to figure it out alone.
          Always confirm with local signage before you park.
        </p>

        <!-- GPS detecting state -->
        <div v-if="detecting" class="gps-detecting fade-up-3">
          <span class="gps-icon">📍</span>
          <span>Detecting your location…</span>
        </div>
        <div v-else-if="gpsError" class="gps-error fade-up-3">{{ gpsError }}</div>

        <!-- Search -->
        <div class="search-outer fade-up-3">
          <div class="search-wrap" :class="{ focused: searchFocused }">
            <span class="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              v-model="searchQuery"
              class="search-input"
              type="text"
              placeholder="Search city — Novi Sad, Belgrade, Niš..."
              autocomplete="off"
              @focus="searchFocused = true"
              @blur="setTimeout(() => (searchFocused = false), 150)"
              @input="handleSearch"
              @keydown.enter="goToFirstResult"
              @keydown.escape="searchResults = []"
            />
            <button class="search-btn" @click="goToFirstResult">Find →</button>
          </div>
          <Transition name="dropdown">
          <div v-if="searchResults.length" class="search-dropdown">
            <NuxtLink
              v-for="c in searchResults"
              :key="c.id"
              :to="`/${c.id}`"
              class="search-result"
              @click="searchResults = []"
            >
              <span class="sri-flag">{{ c.flag }}</span>
              <div>
                <div class="sri-name">{{ c.name }}</div>
                <div class="sri-country">{{ c.country }}</div>
              </div>
              <span class="sri-arrow">→</span>
            </NuxtLink>
          </div>
          </Transition>
        </div>

        <!-- Meta stats -->
        <div class="hero-meta fade-up-3">
          <span v-for="(s, i) in stats" :key="s.label">
            <span v-if="i > 0" class="meta-sep">·</span>
            <strong>{{ s.val }}</strong> {{ s.label }}
          </span>
        </div>
      </div>
    </section>

    <!-- ── CITY STRIP ── -->
    <div v-if="stripItems.length" class="city-strip">
      <div class="city-strip-track">
        <span
          v-for="(item, i) in stripItems.concat(stripItems)"
          :key="i"
          class="city-strip-item"
        >
          <strong>{{ item.city }}</strong>
          <span class="city-strip-sep"> · </span>
          {{ item.detail }}
          <span class="city-strip-sep" style="padding: 0 8px">—</span>
        </span>
      </div>
    </div>

    <!-- ── CITIES GRID ── -->
    <section id="cities" class="section-cities">
      <div class="container">
        <div class="section-header reveal">
          <div>
            <p class="section-label">Featured cities</p>
            <h2>Find your city</h2>
          </div>
          <NuxtLink to="/cities" class="view-all">View all cities →</NuxtLink>
        </div>

        <div v-if="pending" class="cities-grid">
          <div v-for="i in 6" :key="i" class="skeleton" />
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

    <!-- ── HOW IT WORKS + CTA (hidden in GPS mode) ── -->
    <template v-if="!gpsMode">
    <!-- ── HOW IT WORKS ── -->
    <section id="how" class="section-how">
      <div class="container">
        <div class="reveal">
          <p class="section-label">How it works</p>
          <h2>Three steps, no guessing.</h2>
          <p class="section-sub">
            No account needed. No app to install. Just the rules for
            your city, when you need them.
          </p>
        </div>
        <div class="steps reveal">
          <div v-for="step in steps" :key="step.num" class="step">
            <div class="step-num">{{ step.num }}</div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CTA ── -->
    <section class="section-cta">
      <div class="container">
        <div class="cta-inner reveal">
          <div>
            <p class="section-label">Open guide</p>
            <h2>Know before you park.</h2>
            <p class="cta-sub">
              No more Reddit threads. No more guessing from a sign you
              can't fully read. No more fines from the wrong zone.
            </p>
          </div>
          <div class="cta-actions">
            <button class="btn-primary" @click="scrollToTop">Search your city →</button>
            <NuxtLink to="/contribute" class="btn-ghost">Contribute info</NuxtLink>
          </div>
        </div>
      </div>
    </section>
    </template>
  </div>
</template>

<script setup lang="ts">
const { getCities, searchCities, getCity } = useCity()
const { user, getProfile } = useAuth()
const { detectCity, detectedCity, detectedStreet, coords, detecting, gpsError, suggestedZoneName, startTracking, stopTracking } = useGPS()
const {
  heading, attached: compassAttached, previouslyEnabled: compassWasEnabled,
  needsPermission: compassNeedsPerm, start: startOrientation, stop: stopOrientation, onMapTap,
} = useDeviceOrientation()

// First-time iOS only: offer a one-tap compass enable. Hidden once it's running,
// and never shown again to anyone who already opted in (persisted in localStorage).
const compassPrompt = computed(() =>
  import.meta.client &&
  compassNeedsPerm.value &&
  !compassAttached.value &&
  heading.value == null &&
  !compassWasEnabled.value,
)

const cityDetail = ref<any>(null)
const loadingCityDetail = ref(false)
const userProfile = ref<any>(null)
const zoneBoundaries = ref<any>(null)
const mapExpanded = ref(false)
const activeTab = ref<'pay' | 'find' | 'info'>('pay') // GPS dashboard: split the stack into panels
const showScan = ref(false)              // scan-the-sign modal
const showAi = ref(false)                // ask-AI resolver panel
const signReports = ref<any[]>([])       // confirmed sign scans → map pins
const { loadForCity: loadSignReports } = useSignScan()
const locateCar = ref(false) // "find my car" — point the map at the saved session

// Parking session tracking (logs each pay, geotagged)
const {
  active: activeSession, history: sessionHistory,
  remainingMs, atZoneLimit, canExtend,
  loadActive, loadHistory, startOrExtend, endSession,
} = useParkingSession()

watch(user, (u) => {
  if (u) { loadActive(); loadHistory() }
}, { immediate: true })

// Time-aware hours — drives free-now desaturation + the night pre-pay path.
const { paidNow, nextWindow, status: hoursStatus } = useParkingHours(() => detectedCity.value?.id)
const freeNow = computed(() => paidNow.value === false)
const nightPrepay = computed(() => freeNow.value && !!nextWindow.value)

// ── Open-the-app status moment ──────────────────────────────────────────────
// The first question on every open is "do I even need to pay?". When the answer
// is "no" (Sunday / after hours / before charging), we surface it once as a sheet
// so the user gets the news and can leave. When parking IS paid we stay silent
// and let them go straight to paying — no modal on the critical path.
const STATUS_SEEN_KEY = 'kerb_status_seen'
const showStatusSheet = ref(false)
const todayKey = () => new Date().toISOString().slice(0, 10)
const maybeShowStatus = () => {
  if (!import.meta.client) return
  if (!gpsMode.value || !freeNow.value) return
  if (localStorage.getItem(STATUS_SEEN_KEY) === todayKey()) return
  showStatusSheet.value = true
}
const dismissStatus = () => {
  if (import.meta.client) localStorage.setItem(STATUS_SEEN_KEY, todayKey())
  showStatusSheet.value = false
}
// Offer pre-pay when the next paid window is near (later today / tomorrow morning),
// matching the night pre-pay slider on the Pay tab. Further-off windows just inform.
const statusCanPrepay = computed(() =>
  freeNow.value && ['today', 'tomorrow'].includes(nextWindow.value?.dayLabel ?? ''),
)

// ── Free-now main surface ────────────────────────────────────────────────────
// When no payment is needed, the whole dashboard collapses to one calm answer
// instead of the full Pay/Find/Info stack. The user can still open the dashboard
// (to pre-pay or browse zones) — that flips forceBrowse and reveals the tabs.
const forceBrowse = ref(false)
const freeSurface = computed(() =>
  freeNow.value && !forceBrowse.value && !displaySession.value,
)
const browseAnyway = () => { forceBrowse.value = true }
const statusToPrepay = () => { forceBrowse.value = true; activeTab.value = 'pay'; dismissStatus() }

// Guest sessions (no account), persisted on-device. Created only AFTER the user
// confirms they sent the SMS. Logged-in users keep the Supabase-backed session.
const guest = useGuestSession()
const displaySession   = computed<any>(() => (user.value ? activeSession.value : guest.active.value))
const displayRemaining = computed(() => (user.value ? remainingMs.value : guest.remainingMs.value))
const displayAtLimit   = computed(() => (user.value ? atZoneLimit.value : guest.atZoneLimit.value))
const displayCanExtend = computed(() => (user.value ? canExtend.value : guest.canExtend.value))

// Lock body scroll + close on Escape while the fullscreen map is open
watch(mapExpanded, (open) => {
  if (import.meta.server) return
  document.body.style.overflow = open ? 'hidden' : ''
  if (!open) {
    locateCar.value = false      // reset find-my-car when the map closes
    leadSignPoint.value = null   // and the lead-to-sign pointer
  }
})
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') mapExpanded.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  if (_visHandler) { document.removeEventListener('visibilitychange', _visHandler); _visHandler = null }
})

// Guest plate — saved on the device so anonymous users get one-tap SMS too,
// with no account. Synced into a real profile plate if they sign up later.
const GUEST_PLATE_KEY = 'kerb_guest_plate'
const guestPlate = ref('')
watch(guestPlate, (v) => {
  if (!import.meta.client) return
  const clean = v.trim().toUpperCase()
  if (clean) localStorage.setItem(GUEST_PLATE_KEY, clean)
  else localStorage.removeItem(GUEST_PLATE_KEY)
})

// Persisted "I self-check the sign" opt-out — swaps the per-pay slide for a fast tap.
const SKIP_CONFIRM_KEY = 'kerb_skip_sign_confirm'
const skipConfirm = ref(false)
watch(skipConfirm, (v) => {
  if (import.meta.client) localStorage.setItem(SKIP_CONFIRM_KEY, v ? '1' : '0')
})

const defaultPlate = computed(() => {
  const plates = userProfile.value?.plates ?? []
  const saved = (plates.find((p: any) => p.is_default) ?? plates[0])?.plate
  return saved ?? (guestPlate.value.trim() ? guestPlate.value.trim().toUpperCase() : null)
})

// Geometry-based detection: distance to the nearest paid-parking segment.
const { nearest } = useNearestParking(coords, zoneBoundaries)

// When a city's zone geometry is only coarsely traced (no official vector cadastre),
// the dashboard flags it: GPS proximity here is a hint, never a claim.
const { tier: dashTier } = useCityTier(() => detectedCity.value?.id)
const mapApprox = computed(() => dashTier.value === 'cadastre_approx')

// Self-healing map: confirmed signs recolour segments they disagree with (≥2 scans).
// The resolver + nearest stay on the raw geometry; only the map display heals.
const displayZones = computed(() => applySignOverrides(zoneBoundaries.value, signReports.value))

// on  = standing on a paid street · near = just off one · none = no paid parking
const parkingState = computed<'on' | 'near' | 'none' | null>(() => {
  const n = nearest.value
  if (!n) return null
  const acc = coords.value?.accuracy ?? 0
  const onT = Math.min(Math.max(25, acc), 60)   // widen when GPS is imprecise
  const nearT = Math.max(75, onT + 50)
  if (n.distanceM <= onT) return 'on'
  if (n.distanceM <= nearT) return 'near'
  return 'none'
})

const formatDist = (m: number) => {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.max(5, Math.round(m / 5) * 5)} m`
}

const zoneColor = (name: string) =>
  cityDetail.value?.zones?.find((z: any) => z.name === name)?.color ?? 'var(--text2)'

// Which zone to surface as the hero. Prefer geometry; fall back to the street-
// name match only when boundary geometry isn't loaded.
const activeSuggestedName = computed<string | null>(() => {
  if (nearest.value) {
    return parkingState.value === 'on' || parkingState.value === 'near'
      ? nearest.value.zoneName
      : null
  }
  return suggestedZoneName.value
})

// GPS gives a best guess — never a verdict. The user taps the zone on the sign.
const likelyZoneName = computed(() => activeSuggestedName.value)
const allZones = computed<any[]>(() => cityDetail.value?.zones ?? [])

// The one rule that actually gets people fined: the hard time cap. Pull it out of
// the prose so we can show "MAX 60 MIN" loud, and keep the fine print as a quiet
// second line instead of a wall of sentence.
const limitOf = (rules?: string | null) => {
  if (!rules) return null
  const cap = /^\s*max\s*(\d+)\s*min\.?\s*/i.exec(rules)
  if (cap) return { cap: true, label: `MAX ${cap[1]} MIN`, note: rules.slice(cap[0].length).trim() }
  const free = /^\s*no time limit\.?\s*/i.exec(rules)
  if (free) return { cap: false, label: 'No time limit', note: rules.slice(free[0].length).trim() }
  return { cap: false, label: '', note: rules }
}
// Short version for the zone chips while choosing.
const pickLimit = (rules?: string | null) => {
  const l = limitOf(rules)
  return l ? (l.cap ? l.label : 'No limit') : ''
}

// Likely zone floats to the top; the rest keep their original order.
const orderedZones = computed(() => {
  const likely = likelyZoneName.value
  if (!likely) return allZones.value
  return [...allZones.value].sort(
    (a, b) => (a.name === likely ? -1 : b.name === likely ? 1 : 0),
  )
})

// What the user is about to pay for. Seeded from the likely zone, but theirs to change.
const selectedZoneName = ref<string | null>(null)
const selectedZone = computed(
  () => allZones.value.find((z: any) => z.name === selectedZoneName.value) ?? null,
)
const selectedLimit = computed(() => limitOf(selectedZone.value?.rules))

// Seed/repair the selection without ever overriding an explicit, still-valid choice.
watch([likelyZoneName, allZones], () => {
  const valid = allZones.value.some((z: any) => z.name === selectedZoneName.value)
  if (!valid) selectedZoneName.value = likelyZoneName.value ?? allZones.value[0]?.name ?? null
}, { immediate: true })

// ── Nearest confirmed sign — lead the user to verified ground truth ────────────
const toRad = (d: number) => (d * Math.PI) / 180
const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
const bearingDeg = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Closest confirmed sign to the user right now (within 1 km), with distance + bearing.
const nearestSign = computed(() => {
  const c = coords.value
  if (!c || !signReports.value.length) return null
  let best: any = null
  let bestD = Infinity
  for (const s of signReports.value) {
    if (s.lat == null || s.lng == null) continue
    const d = haversineM(c, { lat: s.lat, lng: s.lng })
    if (d < bestD) { bestD = d; best = s }
  }
  if (!best || bestD > 1000) return null
  return { report: best, distanceM: bestD, bearing: bearingDeg(c, { lat: best.lat, lng: best.lng }) }
})

// Arrow rotation for the nearest-sign card: relative to where the user faces when
// the compass is available, otherwise an absolute (north-up) bearing.
const nearestSignArrow = computed(() => {
  const n = nearestSign.value
  if (!n) return null
  return heading.value != null ? n.bearing - heading.value : n.bearing
})

// "Find my car" point, a tapped lead-to-sign point, else the nearest paid segment.
const leadSignPoint = ref<{ lat: number; lng: number } | null>(null)
const highlightPoint = computed(() => {
  if (locateCar.value && displaySession.value?.lat != null && displaySession.value?.lng != null) {
    return { lat: displaySession.value.lat, lng: displaySession.value.lng }
  }
  if (leadSignPoint.value) return leadSignPoint.value
  return parkingState.value === 'near' || parkingState.value === 'none'
    ? nearest.value?.point ?? null
    : null
})

// Tap the nearest-sign card → draw a line to it and open the map.
const onLeadToSign = () => {
  const n = nearestSign.value
  if (!n) return
  leadSignPoint.value = { lat: n.report.lat, lng: n.report.lng }
  mapExpanded.value = true
}

// ── Session actions ───────────────────────────────────────────────────────────
const sessionPayload = (zone: any) => ({
  cityId: detectedCity.value!.id,
  zone: { name: zone.name, color: zone.color, price: zone.price, rules: zone.rules },
  street: nearest.value?.streetName ?? null,
  lat: coords.value?.lat ?? null,
  lng: coords.value?.lng ?? null,
  plate: defaultPlate.value,
})

// Logged-in users get the Supabase session logged on tap (existing behaviour).
const onPay = (zone: any) => { startOrExtend(sessionPayload(zone)) }

// The ms epoch a night pre-pay's paid window opens (city time ≈ the user's, in-city).
const nextStartMs = () => {
  const nw = nextWindow.value
  if (!nw) return Date.now()
  const [h, m] = nw.start.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0)
  if (nw.dayLabel === 'tomorrow' || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d.getTime()
}

const guestPayload = (zone: any, armed: boolean) => ({
  cityId: detectedCity.value!.id,
  zone: { name: zone.name, color: zone.color, price: zone.price, rules: zone.rules },
  street: nearest.value?.streetName ?? null,
  lat: coords.value?.lat ?? null,
  lng: coords.value?.lng ?? null,
  plate: defaultPlate.value,
  armed,
  startsAt: armed ? nextStartMs() : undefined,
})

// ── SMS handoff ────────────────────────────────────────────────────────────────
// The web can't verify an SMS was sent. So: open the composer, and when the user
// returns to the tab, ask. Only on "yes" do we record a (self-reported) session.
const pendingPay = ref<{ zone: any; armed: boolean } | null>(null)
const showSentPrompt = ref(false)
let _visHandler: (() => void) | null = null
const armSentPrompt = () => {
  if (!import.meta.client || _visHandler) return
  _visHandler = () => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', _visHandler!)
    _visHandler = null
    if (pendingPay.value) showSentPrompt.value = true
  }
  document.addEventListener('visibilitychange', _visHandler)
}

// Confirmed (slide/tap) → open the SMS composer + arm the "did you send it?" check.
const pay = (zone: any, opts: { armed?: boolean } = {}) => {
  if (user.value) {
    onPay(zone) // logged-in keeps its immediate Supabase log (unchanged)
  } else {
    pendingPay.value = { zone, armed: !!opts.armed } // guest: confirm the send first
    armSentPrompt()
  }
  if (import.meta.client && zone.sms_shortcode) window.location.href = smsLink(zone)
}

const onSentYes = () => {
  const p = pendingPay.value
  if (p && !user.value) guest.create(guestPayload(p.zone, p.armed), 'self_reported')
  showSentPrompt.value = false
  pendingPay.value = null
}
const onSentNo = () => { showSentPrompt.value = false; pendingPay.value = null }

const onExtend = () => {
  const name = displaySession.value?.zone_name
  const z = cityDetail.value?.zones?.find((x: any) => x.name === name)
  if (!z) return
  if (user.value) {
    startOrExtend(sessionPayload(z))
    if (import.meta.client && z.sms_shortcode) window.location.href = smsLink(z)
  } else {
    pay(z) // guest: re-open the SMS, confirm, log a fresh hour
  }
}

const onEndSession = () => {
  const s = displaySession.value
  if (!s) return
  user.value ? endSession(s.id) : guest.end(s.id)
}
const onLocateCar = () => { locateCar.value = true; mapExpanded.value = true }

// ── Ask AI — deterministic candidate-set zone resolver ─────────────────────────
// Resolve against the HEALED geometry so AI never contradicts the map the user sees
// (sign-first logic is independent; this just keeps the fallback boundary calc honest).
const { verdict: aiVerdict } = useZoneResolver(coords, displayZones, signReports)
const aiSourceName = computed(() => {
  const u = cityDetail.value?.official_url
  if (!u) return 'official city registry'
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return 'official city registry' }
})
const onAiPick = (zoneName: string) => {
  if (allZones.value.some((z: any) => z.name === zoneName)) selectedZoneName.value = zoneName
  showAi.value = false
  forceBrowse.value = true   // reveal the tabs…
  activeTab.value = 'pay'     // …and land on the zone, ready to pay
}
const onAiScan = () => { showAi.value = false; showScan.value = true }

const pastSessions = computed(() =>
  sessionHistory.value.filter((s: any) => s.id !== activeSession.value?.id).slice(0, 5),
)

const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

const clockOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''

const smsLink = (zone: any) => {
  const body = defaultPlate.value
    ? `?body=${encodeURIComponent(defaultPlate.value)}`
    : ''
  return `sms:${zone.sms_shortcode}${body}`
}

watch(detectedCity, async (city) => {
  if (!city) return
  loadingCityDetail.value = true
  try { cityDetail.value = await getCity(city.id) }
  finally { loadingCityDetail.value = false }

  // Load signs + geometry together, then set signs FIRST so the map's first paint
  // is already healed (no old→new flash). displayZones reads both refs.
  const [geo, reports] = await Promise.all([
    fetch(`/zones/${city.id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    loadSignReports(city.id),
  ])
  signReports.value = reports
  if (geo) zoneBoundaries.value = geo
})

// A new confirmed scan: pin it immediately and make it the selected pay zone.
const onSignSubmitted = (report: any) => {
  signReports.value = [report, ...signReports.value]
  if (allZones.value.some((z: any) => z.name === report.zone_name)) {
    selectedZoneName.value = report.zone_name
  }
}

// Pay straight from the scan result — reuse the normal pay path (logs + SMS).
const onScanPay = (zone: any) => {
  showScan.value = false
  pay(zone)
}

watch(
  () => !!user.value && !!cityDetail.value,
  async (active) => {
    if (active && !userProfile.value) {
      userProfile.value = await getProfile()
    }
  }
)


// Guest-first: the live dashboard is available to anyone once a city is detected.
// Login only adds memory (session tracking, reminders, fine alerts).
const gpsMode = computed(() => !!(detectedCity.value && cityDetail.value))

// Start live GPS tracking + compass when GPS mode activates
watch(gpsMode, (active) => {
  if (active) {
    forceBrowse.value = false   // a fresh open lands on the calm free surface
    startTracking()
    startOrientation()
  } else {
    stopTracking()
    stopOrientation()
  }
}, { immediate: true })

// Surface the "do I need to pay?" status moment once the dashboard + hours resolve.
watch([gpsMode, freeNow], () => maybeShowStatus(), { immediate: true })

const { data: cities, pending, error } = await useAsyncData('cities', getCities, { lazy: true })

const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searchFocused = ref(false)

let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  if (searchQuery.value.length < 2) { searchResults.value = []; return }
  searchTimeout = setTimeout(async () => {
    searchResults.value = await searchCities(searchQuery.value)
  }, 250)
}

const goToFirstResult = async () => {
  if (searchResults.value.length) {
    await navigateTo(`/${searchResults.value[0].id}`)
    searchResults.value = []
  }
}

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

// Honest stats only — derived from the cities we actually have, never invented.
const stats = computed(() => {
  const list = (cities.value ?? []) as any[]
  const countries = new Set(list.map((c) => c.country)).size
  const out = [{ val: String(list.length), label: list.length === 1 ? 'city' : 'cities' }]
  if (countries) out.push({ val: String(countries), label: countries === 1 ? 'country' : 'countries' })
  out.push({ val: 'Serbia', label: 'first' })
  return out
})

// Ticker shows only real cities that have a page — no ghost entries.
const stripItems = computed(() =>
  ((cities.value ?? []) as any[]).map((c) => ({
    city: `${c.flag} ${c.name}`,
    detail: c.country,
  })),
)

const steps = [
  {
    num: '01',
    title: 'Search your city',
    body: 'Type any city. Instantly see how parking works — zones, prices, hours, and payment methods.',
  },
  {
    num: '02',
    title: 'Read the rules',
    body: 'Clear, structured information. No legal jargon. Exactly what you need to park without stress.',
  },
  {
    num: '03',
    title: 'Pay the right way',
    body: 'Each city guide tells you exactly how to pay — SMS, app, meter, or card. Confirm with local signage.',
  },
]

onMounted(() => {
  // Guest-first: detect the city for everyone, logged in or not.
  if (import.meta.client) {
    guestPlate.value = localStorage.getItem(GUEST_PLATE_KEY) ?? ''
    skipConfirm.value = localStorage.getItem(SKIP_CONFIRM_KEY) === '1'
  }
  detectCity()

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) }
      })
    },
    { threshold: 0.08 }
  )
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
})

useSeoMeta({
  title: 'Kerbo — park · pay · zero fines',
  description: 'AI-assisted street parking for Serbia. Find your zone, pay by SMS, never learn what a zone is.',
  ogTitle: 'Kerbo — park · pay · zero fines',
  ogDescription: 'AI-assisted street parking for Serbia. Find your zone, pay by SMS, never learn what a zone is.',
  ogUrl: 'https://kerbo.netlify.app/',
  ogImage: 'https://kerbo.netlify.app/icon-512.png',
  ogType: 'website',
  twitterCard: 'summary',
})
</script>

<style scoped>
/* Hero */
.hero {
  padding: 120px 24px 72px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: clamp(36px, 5vw, 56px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.5px;
  color: var(--text);
  margin-bottom: 18px;
}
.hero-sub {
  font-size: 16px;
  color: var(--muted);
  max-width: 520px;
  line-height: 1.7;
  margin-bottom: 32px;
}

/* GPS */
.gps-result {
  font-size: 14px;
  color: var(--text2);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  max-width: 560px;
  margin-bottom: 14px;
  overflow: hidden;
}
.gps-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  flex-wrap: wrap;
}
.gps-icon { font-size: 16px; flex-shrink: 0; }
.gps-link {
  margin-left: auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--green);
  white-space: nowrap;
}
.gps-link:hover { text-decoration: underline; }
.gps-error {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
  max-width: 560px;
}

/* Search */
.search-outer {
  position: relative;
  max-width: 560px;
  margin-bottom: 24px;
}
.search-wrap {
  display: flex;
  align-items: center;
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-shadow: var(--shadow-sm);
}
.search-wrap.focused {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--blue-bg);
}
.search-icon {
  padding: 0 14px;
  display: flex;
  align-items: center;
  color: var(--muted2);
}
.search-input {
  flex: 1;
  background: none;
  border: none;
  padding: 14px 0;
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--text);
  outline: none;
}
.search-input::placeholder { color: var(--muted2); }
.search-btn {
  background: var(--blue);
  border: none;
  padding: 13px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--on-accent);
  white-space: nowrap;
  cursor: pointer;
  transition: background 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.search-btn:hover { background: var(--blue-hover); }
.search-btn:active { transform: scale(0.97); }
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  z-index: 50;
  box-shadow: var(--shadow-lg);
  transform-origin: top center;
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
}
.search-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.12s;
  cursor: pointer;
}
.search-result:last-child { border: none; }
.search-result:hover { background: var(--bg2); }
.sri-flag { font-size: 20px; }
.sri-name { font-size: 14px; font-weight: 500; }
.sri-country { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }
.sri-arrow { margin-left: auto; color: var(--muted2); font-size: 13px; }

/* Hero meta */
.hero-meta {
  font-size: 13px;
  color: var(--muted);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.hero-meta strong { color: var(--text2); font-weight: 600; }
.meta-sep { color: var(--border2); margin: 0 2px; }

/* Cities */
.section-cities {
  padding: 80px 0;
  border-bottom: 1px solid var(--border);
}
.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 36px;
}
h2 {
  font-size: clamp(26px, 4vw, 38px);
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.15;
  color: var(--text);
}
.view-all {
  font-size: 13px;
  color: var(--blue);
  font-weight: 500;
  transition: color 0.15s;
}
.view-all:hover { color: var(--blue-hover); }
.cities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.cities-grid .reveal:nth-child(2) { transition-delay: 50ms; }
.cities-grid .reveal:nth-child(3) { transition-delay: 100ms; }
.cities-grid .reveal:nth-child(4) { transition-delay: 150ms; }
.cities-grid .reveal:nth-child(5) { transition-delay: 200ms; }
.cities-grid .reveal:nth-child(6) { transition-delay: 250ms; }
.skeleton {
  height: 200px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
.error-msg { text-align: center; padding: 60px; color: var(--muted); }

/* How it works */
.section-how {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 80px 0;
}
.section-sub {
  font-size: 15px;
  color: var(--muted);
  max-width: 480px;
  line-height: 1.7;
  margin-top: 8px;
}
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-top: 48px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.step {
  background: var(--bg);
  padding: 28px 24px;
  border-right: 1px solid var(--border);
  transition: background 0.15s;
}
.step:last-child { border-right: none; }
.step:hover { background: var(--blue-bg); }
.step-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
  font-family: var(--font-mono);
  margin-bottom: 12px;
}
.step h3 {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
  margin-bottom: 8px;
}
.step p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

/* CTA */
.section-cta { padding: 80px 0; border-bottom: 1px solid var(--border); }
.cta-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  background: var(--blue-bg);
  border: 1px solid var(--blue-border);
  border-radius: var(--r-xl);
  padding: 48px;
}
.cta-sub {
  font-size: 15px;
  color: var(--muted);
  max-width: 440px;
  line-height: 1.7;
  margin-top: 8px;
}
.cta-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  align-items: stretch;
  min-width: 200px;
}

@media (max-width: 900px) {
  .cities-grid { grid-template-columns: 1fr 1fr; }
  .steps { grid-template-columns: 1fr; }
  .step { border-right: none; border-bottom: 1px solid var(--border); }
  .step:last-child { border-bottom: none; }
  .section-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .cta-inner { flex-direction: column; padding: 32px 24px; }
}
@media (max-width: 600px) {
  .cities-grid { grid-template-columns: 1fr; }
  .hero { padding: 100px 24px 48px; }
}

/* ── GPS DASHBOARD ── */
.gps-map-wrap {
  position: relative;
  border-radius: var(--r-lg);
  overflow: hidden;
  margin-bottom: 0;
}
.map-expand-btn {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 13px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text2);
  background: rgba(31, 34, 40, 0.88);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: background 150ms;
}
.map-expand-btn span { font-size: 15px; line-height: 1; }
.map-expand-btn:hover { background: #fff; }

/* ── Fullscreen interactive map ── */
.map-fs {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  background: var(--bg2);
}
.map-fs-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  padding-top: max(14px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
}
.map-fs-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
}
.map-fs-close {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--text2);
  background: var(--bg2, #f3f4f6);
  border: 1px solid var(--border);
  border-radius: 50%;
  cursor: pointer;
}
.map-fs-close:hover { color: var(--text); }
.map-fs-body {
  flex: 1 1 auto;
  min-height: 0;
}
.compass-btn {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(255,255,255,0.92);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
  backdrop-filter: blur(8px);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background 150ms;
}
.compass-btn:hover { background: #fff; }

.hero-gps {
  padding: 62px 0 40px;
  border-bottom: 1px solid var(--border);
}
.gps-hero-map {
  width: 100%;
  height: 260px;
  border-radius: var(--r-lg);
  overflow: hidden;
  margin-bottom: 0;
}
/* City bar below map */
.gps-detected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 14px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 20px;
}
.gps-detected-where {
  min-width: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gps-detected-where strong { color: var(--text); font-weight: 600; }
.gps-detected-pin { margin-right: 4px; }
.gps-detected-tag {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted2);
}
.gps-detected-guide {
  font-size: 12px;
  font-weight: 500;
  color: var(--blue);
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 150ms var(--ease-out);
}
.gps-detected-guide:hover { color: var(--blue-hover); }

/* ── Dashboard tabs — split the stack into do-it / find-it / look-it-up ── */
.gps-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 20px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  position: sticky;
  top: 53px;
  z-index: 40;
}
.gps-tab {
  flex: 1;
  padding: 9px 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  background: transparent;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: color 150ms var(--ease-out), background 150ms var(--ease-out);
}
.gps-tab:hover { color: var(--text2); }
.gps-tab.on {
  color: var(--text);
  background: var(--bg);
  box-shadow: var(--shadow-sm);
}
.gps-panel { animation: panel-in 180ms var(--ease-out); }
@keyframes panel-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
.panel-lead {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  margin-bottom: 14px;
}

/* ── Free-now surface — the calm "no payment needed" main screen ── */
.free-surface {
  padding: 30px 22px;
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-xl);
  text-align: center;
}
.free-now-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 14px;
}
.free-now-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: free-pulse 2s ease-out infinite;
}
@keyframes free-pulse {
  0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  70%  { box-shadow: 0 0 0 6px transparent; opacity: 0.8; }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
}
.free-now-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.2;
  color: var(--text);
  margin-bottom: 10px;
}
.free-now-sub {
  font-size: 14px;
  color: var(--text2);
  line-height: 1.6;
  max-width: 380px;
  margin: 0 auto 22px;
}
.free-now-sub strong { color: var(--text); font-weight: 700; }
.free-now-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 320px;
  margin: 0 auto;
}
.free-prepay-btn {
  padding: 13px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--blue);
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
}
.free-browse-btn {
  padding: 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  background: transparent;
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  cursor: pointer;
}
.free-prepay-btn:active, .free-browse-btn:active { transform: scale(0.98); }

/* "Not sure?" escape hatch from Pay → Find */
.zone-unsure {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 11px 14px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  text-align: center;
  background: var(--bg2);
  border: 1px dashed var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms var(--ease-out), color 150ms var(--ease-out);
}
.zone-unsure:hover { border-color: var(--blue); color: var(--blue); }

/* Zone pay cards */
.gps-hours { margin-bottom: 20px; }
.gps-zones { margin-bottom: 20px; }

/* Recent sessions */
.gps-history { margin-top: 24px; }
.hist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.hist-row:last-child { border-bottom: none; }
.hist-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.hist-main { flex: 1; min-width: 0; font-size: 13px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist-zone { font-weight: 600; }
.hist-street { color: var(--muted); }
.hist-when { font-size: 12px; color: var(--muted2); font-family: var(--font-mono); flex-shrink: 0; }

/* No paid parking at the user's spot */
.gps-noparking {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
}
.np-icon {
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
  filter: grayscale(0.3);
}
.np-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.np-sub { font-size: 13px; color: var(--muted); line-height: 1.5; }
.np-sub strong { color: var(--text); font-weight: 600; }

/* ── Zone picker (GPS narrows, the sign decides) ── */
.zone-pick-head { margin-bottom: 12px; }
.zone-pick-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
  margin-bottom: 4px;
}
.zone-pick-hint {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
.zone-pick-approx {
  margin-top: 8px;
  padding: 8px 11px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--amber);
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  border-radius: var(--r-md);
}
/* Scan-the-sign CTA */
.scan-cta {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
  padding: 13px 14px;
  background: var(--blue-bg);
  border: 1.5px solid var(--blue-border);
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.scan-cta:hover { border-color: var(--blue); }
.scan-cta:active { transform: scale(0.99); }
.scan-cta-icon { font-size: 22px; line-height: 1; flex-shrink: 0; }
.scan-cta-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.scan-cta-title { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
.scan-cta-sub { font-size: 12px; color: var(--muted); line-height: 1.4; }
.scan-cta-arrow { font-size: 16px; color: var(--blue); flex-shrink: 0; }

/* Ask-AI CTA */
.ai-cta {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
  padding: 13px 14px;
  background: var(--bg2);
  border: 1.5px dashed var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.ai-cta:hover { border-color: var(--blue); }
.ai-cta:active { transform: scale(0.99); }
.ai-cta-icon { font-size: 20px; line-height: 1; flex-shrink: 0; }
.ai-cta-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ai-cta-title { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
.ai-cta-sub { font-size: 12px; color: var(--muted); line-height: 1.4; }
.ai-cta-arrow { font-size: 16px; color: var(--muted2); flex-shrink: 0; }

/* Nearest confirmed sign — lead-me card */
.nsign {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
  padding: 11px 14px;
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.nsign:active { transform: scale(0.99); }
.nsign-arrow {
  flex-shrink: 0;
  font-size: 20px;
  line-height: 1;
  transition: transform 200ms var(--ease-out);
}
.nsign-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nsign-title { font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.1px; }
.nsign-sub { font-size: 12px; color: var(--muted); }
.nsign-go { font-size: 12px; font-weight: 600; color: var(--blue); flex-shrink: 0; white-space: nowrap; }

.zone-pick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* Free-now: calm the cards but keep them tappable */
.zone-pick-list--free { opacity: 0.62; filter: saturate(0.65); transition: opacity 150ms var(--ease-out); }
.zone-pick-list--free:hover { opacity: 1; filter: none; }
.free-badge {
  display: inline-block;
  margin-right: 8px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
  color: var(--green);
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  padding: 2px 7px;
  border-radius: 20px;
  vertical-align: middle;
}

/* Night pre-pay */
.prepay-note {
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.55;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  border-radius: var(--r-md);
}
.prepay-note strong { color: var(--text); font-weight: 700; }

/* Armed (scheduled pre-pay) card */
.armed-card {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 14px 16px;
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  border-radius: var(--r-lg);
}
.armed-main { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.armed-moon { font-size: 22px; line-height: 1; flex-shrink: 0; }
.armed-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.armed-sub { font-size: 12px; color: var(--muted); line-height: 1.5; }
.armed-cancel {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 7px 12px;
  cursor: pointer;
}
.armed-cancel:hover { color: var(--text); }

/* ── Open-the-app status sheet ── */
.status-scrim {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
.status-sheet {
  width: 100%;
  max-width: 440px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: 22px 20px;
  box-shadow: var(--shadow-lg);
}
.status-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--muted);
  margin-bottom: 10px;
}
.status-free-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  flex-shrink: 0;
}
.status-headline {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.2;
  color: var(--text);
  margin-bottom: 8px;
}
.status-body {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 20px;
}
.status-body strong { color: var(--text); font-weight: 700; }
.status-actions { display: flex; gap: 10px; }
.status-secondary {
  flex: 1;
  padding: 13px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--text2);
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  cursor: pointer;
}
.status-primary {
  flex: 1;
  padding: 13px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--blue);
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
}
.status-primary:active, .status-secondary:active { transform: scale(0.98); }
.status-sheet-enter-active, .status-sheet-leave-active { transition: opacity 200ms var(--ease-out); }
.status-sheet-enter-active .status-sheet, .status-sheet-leave-active .status-sheet {
  transition: transform 240ms var(--ease-out);
}
.status-sheet-enter-from, .status-sheet-leave-to { opacity: 0; }
.status-sheet-enter-from .status-sheet, .status-sheet-leave-to .status-sheet { transform: translateY(100%); }

/* SMS handoff sheet */
.sent {
  position: fixed;
  inset: 0;
  z-index: 3500;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
.sent-sheet {
  width: 100%;
  max-width: 440px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: 22px 20px;
  box-shadow: var(--shadow-lg);
}
.sent-title { font-size: 18px; font-weight: 700; letter-spacing: -0.2px; color: var(--text); margin-bottom: 8px; }
.sent-sub { font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 18px; }
.sent-sub strong { color: var(--text2); font-family: var(--font-mono); }
.sent-actions { display: flex; gap: 10px; }
.sent-no {
  flex: 1;
  padding: 13px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text2);
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  cursor: pointer;
}
.sent-yes {
  flex: 1;
  padding: 13px;
  font-size: 14px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--blue);
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
}
.sent-yes:active, .sent-no:active { transform: scale(0.98); }
.zone-pick {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 0;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out);
}
.zone-pick:hover { border-color: var(--border2); }
.zone-pick--active { box-shadow: var(--shadow-sm); }
.zone-pick-stripe { width: 5px; align-self: stretch; flex-shrink: 0; }
.zone-pick-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 13px 0;
}
.zone-pick-name { font-size: 14px; font-weight: 600; color: var(--text); }
.zone-pick-tag {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text2);
  background: var(--bg3);
  border: 1px solid var(--border);
  padding: 2px 7px;
  border-radius: 20px;
}
.zone-pick-limit {
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 0.3px;
  color: var(--text2);
}
.zone-pick-price {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
  flex-shrink: 0;
}
.zone-pick-radio {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-right: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--border2);
  border-radius: 50%;
  font-size: 12px;
  color: #fff;
  transition: background 150ms, border-color 150ms;
}
.zone-pick-radio.on { background: var(--text); border-color: var(--text); color: var(--bg); }

/* Selected zone — rules + honest pay */
.zone-act {
  margin-top: 12px;
  padding: 16px;
  border: 1.5px solid;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
}
/* Pay card header — restates the chosen zone so the card stands on its own */
.zone-act-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
}
.zone-act-stripe { width: 5px; height: 20px; border-radius: 3px; flex-shrink: 0; }
.zone-act-name { font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
.zone-act-likely {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text2);
  background: var(--bg3);
  border: 1px solid var(--border);
  padding: 2px 7px;
  border-radius: 20px;
}
.zone-act-price {
  margin-left: auto;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

/* The hard time cap, loud — replaces the buried prose sentence */
.zone-limit {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 11px 13px;
  margin-bottom: 14px;
  border-radius: var(--r-md);
  background: var(--bg2);
  border: 1px solid var(--border);
}
.zone-limit-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 7px 12px;
  border-radius: var(--r-md);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.4px;
  font-family: var(--font-mono);
  border: 1.5px solid var(--border2);
  color: #fff;
}
.zone-limit-icon { font-size: 13px; }
.zone-limit--free .zone-limit-badge {
  color: var(--green);
  border-color: var(--green-border);
  background: var(--green-bg);
}
.zone-limit-note {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text2);
  line-height: 1.45;
}
.zone-act-caution {
  font-size: 12px;
  color: var(--amber);
  line-height: 1.45;
  margin: -6px 0 14px;
}
.zone-act-caution strong { font-weight: 700; }
.zone-act-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 16px;
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  transition: filter 150ms var(--ease-out);
}
.zone-act-btn:hover { filter: brightness(0.9); }
.zone-act-arrow { margin-left: auto; opacity: 0.85; }
.zone-act-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}
.zone-act-link { font-size: 12px; color: var(--blue); font-weight: 500; }
.zone-act-link:hover { text-decoration: underline; }
.zone-act-src { font-size: 11px; color: var(--muted2); line-height: 1.45; }

/* Guest plate entry (no account) */
.zone-plate { margin: 0 0 12px; }
.zone-plate-input {
  width: 100%;
  padding: 11px 14px;
  font-family: var(--font-mono);
  font-size: 15px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text);
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color 150ms var(--ease-out), box-shadow 150ms var(--ease-out);
}
.zone-plate-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
.zone-plate-input::placeholder {
  font-family: var(--font-body);
  letter-spacing: 0;
  text-transform: none;
  color: var(--muted2);
}
.zone-plate-hint { display: block; margin-top: 6px; font-size: 11px; color: var(--muted2); line-height: 1.45; }
.zone-plate-hint a { color: var(--blue); }
.zone-plate-hint a:hover { text-decoration: underline; }

/* Guest → account nudge */
.guest-upsell {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px 14px;
  background: var(--blue-bg);
  border: 1px solid var(--blue-border);
  border-radius: var(--r-md);
}
.guest-upsell-icon { font-size: 16px; line-height: 1.4; flex-shrink: 0; }
.guest-upsell-text { font-size: 13px; color: var(--text2); line-height: 1.5; }
.guest-upsell-text a { color: var(--blue); font-weight: 500; }
.guest-upsell-text a:hover { text-decoration: underline; }

/* Responsibility opt-out under the pay control */
.zone-resp {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
  cursor: pointer;
}
.zone-resp-box { margin-top: 1px; flex-shrink: 0; cursor: pointer; }
.zone-resp--on { color: var(--amber); }

.gps-finecheck { margin-bottom: 20px; }

/* Fine warning */
.gps-fine {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  border-radius: var(--r-md);
  padding: 10px 14px;
}
.gps-fine-label {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.gps-fine-amount {
  font-size: 18px;
  font-weight: 700;
  color: var(--red);
  font-family: var(--font-mono);
}

/* Detecting state */
.gps-detecting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 14px;
}
</style>

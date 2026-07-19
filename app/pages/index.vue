<template>
  <div>
    <!-- ── GPS DASHBOARD (logged-in + city detected) ── -->
    <section v-if="gpsMode" class="hero-gps">
      <div class="container">
        <!-- Map — hidden while free: the "no need to pay" answer is the whole screen -->
        <ClientOnly>
          <div v-if="!freeSurface" class="gps-map-wrap">
            <LocationMap
              :lat="coords!.lat"
              :lng="coords!.lng"
              :accuracy="coords!.accuracy"
              :heading="heading"
              :height="130"
              :zones="displayZones"
              :highlight="highlightPoint"
              :signs="signReports"
              :compass-prompt="compassPrompt"
              labels
              @compass-tap="onMapTap"
              @enable-compass="onMapTap"
            />
            <button
              class="map-expand-btn"
              type="button"
              aria-label="Expand map"
              @click="mapExpanded = true"
            >
              <Icon name="expand" :size="14" /> {{ t("exploreZones") }}
            </button>
          </div>
        </ClientOnly>

        <!-- Fullscreen interactive map -->
        <ClientOnly>
          <Teleport to="body">
            <div
              v-if="mapExpanded"
              class="map-fs"
              role="dialog"
              aria-label="Zone map"
            >
              <div class="map-fs-bar">
                <span class="map-fs-title">
                  {{ detectedCity!.flag }} {{ detectedCity!.name }} ·
                  {{ t("parkingZones") }}
                </span>
                <button
                  class="map-fs-close"
                  type="button"
                  aria-label="Close map"
                  @click="mapExpanded = false"
                >
                  ✕
                </button>
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
            <span class="gps-detected-pin"><Icon name="pin" :size="13" /></span>
            <template v-if="detectedStreet"
              ><strong>{{ detectedStreet }}</strong> · </template
            >{{ detectedCity!.name }}
            <span class="gps-detected-tag">{{ t("detected") }}</span>
          </span>
          <NuxtLink :to="`/${detectedCity!.id}`" class="gps-detected-guide">{{
            t("fullGuide")
          }}</NuxtLink>
        </div>

        <!-- Armed night pre-pay — scheduled for the next paid window, not live yet -->
        <div
          v-if="displaySession && displaySession.type === 'armed'"
          class="armed-card"
        >
          <div class="armed-main">
            <span class="armed-moon"><Icon name="moon" :size="20" /></span>
            <div>
              <p class="armed-title">
                {{ t("armedTitle", { zone: displaySession.zone_name }) }}
              </p>
              <p class="armed-sub">
                {{
                  t("armedSub", {
                    start: clockOf(displaySession.started_at),
                    end: clockOf(displaySession.expires_at),
                  })
                }}
              </p>
            </div>
          </div>
          <button type="button" class="armed-cancel" @click="onEndSession">
            {{ t("cancel") }}
          </button>
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
          <span class="free-now-tag"
            ><span class="free-now-dot" />{{ t("freeNow") }}</span
          >
          <h2 class="free-now-title">{{ t("freeTitle") }}</h2>
          <p class="free-now-sub">
            {{ t("freeSub", { city: detectedCity!.name })
            }}<template v-if="nextWindow">
              {{ " " + t("chargingResumes") }}
              <strong
                >{{ dayWord(nextWindow.dayLabel) }}
                {{ nextWindow.start }}</strong
              >.</template
            ><template v-else-if="hoursStatus?.detail">
              {{ " " + hoursStatus.detail }}.</template
            >
          </p>
          <div class="free-now-actions">
            <button
              v-if="statusCanPrepay"
              type="button"
              class="free-prepay-btn"
              @click="statusToPrepay"
            >
              {{
                t("prepayBtn", {
                  start: nextWindow!.start,
                  end: nextWindow!.end,
                })
              }}
            </button>
            <button type="button" class="free-browse-btn" @click="browseAnyway">
              {{ t("browseZones") }}
            </button>
          </div>
          <!-- Why pre-pay exists: the honest observation, not manufactured urgency -->
          <p v-if="statusCanPrepay" class="free-prepay-why">
            {{ t("prepayWhy", { start: nextWindow!.start }) }}
          </p>
        </div>

        <!-- ═══ FULL DASHBOARD — paid now, or browsing while free ═══ -->
        <template v-else>
          <!-- Geometry still loading — hold the verdict inside the frame the real
             zone card + slider will fill; never guess a zone to unsay -->
          <template v-if="!geoResolved">
            <div class="pay-step" aria-busy="true">
              <div class="sk-card">
                <div class="sk sk-card-head" />
                <div class="sk-card-body">
                  <p class="sk-resolving">
                    <Icon name="pin" :size="13" /> {{ t("resolvingSpot") }}
                  </p>
                </div>
              </div>
            </div>
            <div class="pay-step" aria-busy="true">
              <div class="pay-summary">
                <span class="sk sk-line sk-w45" />
                <span v-if="defaultPlate" class="sk sk-chip" />
              </div>
              <div class="sk sk-slider" />
            </div>
          </template>

          <!-- ═══ No paid parking here — the answer IS the screen; no zones to render ═══ -->
          <div v-else-if="noZoneHere" class="gps-noparking">
            <div class="np-main">
              <div class="np-icon"><Icon name="parking" :size="24" /></div>
              <div class="np-text">
                <p class="np-title">{{ t("noParkingTitle") }}</p>
                <p class="np-sub">
                  {{ t("noParkingSub") }}
                  <strong>~{{ formatDist(nearest!.distanceM) }}</strong>
                  {{ t("awayOn") }}
                  <span :style="{ color: zoneColor(nearest!.zoneName) }">{{
                    nearest!.zoneName
                  }}</span>
                  · {{ nearest!.streetName }}.
                </p>
              </div>
            </div>
            <div class="np-actions">
              <button type="button" class="np-btn" @click="mapExpanded = true">
                <Icon name="expand" :size="14" /> {{ t("browseZones") }}
              </button>
              <button type="button" class="np-btn" @click="showScan = true">
                <Icon name="camera" :size="14" /> {{ t("scanContribute") }}
              </button>
            </div>
          </div>

          <!-- ═══ PAY SURFACE — one screen: zone → slide; plate is a chip once known ═══ -->
          <template v-else>
            <!-- First run only: no plate yet — the one moment it deserves the space -->
            <div v-if="!defaultPlate" class="pay-step">
              <div v-if="!user">
                <PlateInput v-model="guestPlate" />
                <span class="zone-plate-hint">
                  {{ t("plateHint") }} ·
                  <NuxtLink to="/login">{{ t("plateSync") }}</NuxtLink>
                </span>
              </div>
              <NuxtLink v-else to="/profile" class="veh-add"
                >{{ t("addPlate") }} →</NuxtLink
              >
            </div>

            <!-- ── Zone — GPS's best guess as the hero; the sign decides ── -->
            <div v-if="selectedZone" class="pay-step">
              <div
                class="zone-hero"
                :class="{ 'zone-hero--free': freeNow }"
                :style="{ borderColor: selectedZone.color }"
              >
                <div
                  class="zone-hero-head"
                  :style="{
                    background: selectedZone.color,
                    color: inkOn(selectedZone.color),
                  }"
                >
                  <span class="zone-hero-id">
                    <span class="zone-hero-name">{{ selectedZone.name }}</span>
                    <span
                      v-if="selectedZone.name === likelyZoneName"
                      class="zone-hero-tag"
                    >
                      <Icon name="pin" :size="10" /> {{ t("likelyYours") }}
                    </span>
                  </span>
                  <span class="zone-hero-meta">
                    <span class="zone-hero-price">{{
                      selectedZone.price
                    }}</span>
                    <span class="zone-hero-limit">
                      {{
                        zoneLimits[selectedZone.name]?.cap
                          ? zoneLimits[selectedZone.name]!.label
                          : t("noLimit")
                      }}
                    </span>
                  </span>
                </div>
                <div class="zone-hero-body">
                  <p class="zone-hero-check">
                    <Icon name="sign" :size="14" /> {{ t("heroCheckSign") }}
                  </p>
                  <p v-if="parkingState === 'near'" class="zone-act-caution">
                    <Icon name="alert" :size="13" /> {{ t("boundaryCaution") }}
                    <strong>{{ selectedZone.name }}</strong
                    >.
                  </p>
                  <p v-if="mapApprox" class="zone-pick-approx">
                    <Icon name="alert" :size="13" />
                    {{ t("approxWarn", { city: detectedCity!.name }) }}
                  </p>
                  <details
                    v-if="zoneLimits[selectedZone.name]?.note"
                    class="zone-pay-more"
                  >
                    <summary>{{ t("ruleDetails") }}</summary>
                    <p>{{ zoneLimits[selectedZone.name]!.note }}</p>
                  </details>
                </div>
              </div>
            </div>

            <!-- ── Pay — consequence first, then the gesture ── -->
            <div v-if="selectedZone?.sms_shortcode" class="pay-step">
              <!-- Covered-until + the plate this SMS pays for. At night the same line
               carries the carry-over rule: the SMS pays the next window, not now. -->
              <div class="pay-summary">
                <span v-if="!nightPrepay" class="pay-until">
                  <strong>{{
                    t("coveredUntil", { time: coveredUntil })
                  }}</strong>
                  · {{ selectedZone.price }}
                </span>
                <span v-else class="pay-until">
                  <Icon name="moon" :size="12" />
                  <strong>{{
                    t("coveredNext", {
                      day: dayWord(nextWindow!.dayLabel),
                      start: nextWindow!.start,
                      end: nextWindow!.end,
                    })
                  }}</strong>
                  · {{ selectedZone.price }}
                </span>
                <button
                  v-if="defaultPlate"
                  type="button"
                  class="plate-chip"
                  @click="plateOpen = !plateOpen"
                >
                  {{ defaultPlate }}
                  <span class="plate-chip-chev">{{
                    plateOpen ? "▴" : "▾"
                  }}</span>
                </button>
              </div>
              <!-- Chip open → saved plates (account) or edit the device plate (guest) -->
              <div v-if="plateOpen && defaultPlate" class="veh-list">
                <template v-if="user">
                  <button
                    v-for="p in profilePlates"
                    :key="p.id"
                    type="button"
                    class="veh-opt"
                    :class="{ on: p.plate === defaultPlate }"
                    @click="choosePlate(p.plate)"
                  >
                    <span class="veh-opt-plate">{{ p.plate }}</span>
                    <span v-if="p.label" class="veh-opt-label">{{
                      p.label
                    }}</span>
                    <span v-if="p.plate === defaultPlate" class="veh-opt-on"
                      ><Icon name="check" :size="13"
                    /></span>
                  </button>
                  <NuxtLink to="/profile" class="veh-manage">{{
                    t("managePlates")
                  }}</NuxtLink>
                </template>
                <div v-else class="veh-guest-edit">
                  <PlateInput v-model="guestPlate" />
                </div>
              </div>

              <!-- Night pre-pay: free now, the SMS carries over to the next window -->
              <div v-if="nightPrepay" class="prepay">
                <SlideToConfirm
                  :key="'pp-' + selectedZone.name"
                  :label="t('sendSms', { code: selectedZone.sms_shortcode })"
                  :done-label="t('openingSms')"
                  :color="selectedZone.color"
                  @confirm="pay(selectedZone, { armed: true })"
                />
                <p class="pay-note">
                  {{ t("slideConfirms") }} {{ t("smsToOperator") }}
                </p>
              </div>

              <!-- Paid hours: the slide IS the sign-confirmation -->
              <template v-else>
                <template v-if="!skipConfirm">
                  <SlideToConfirm
                    :key="selectedZone.name"
                    :label="t('sendSms', { code: selectedZone.sms_shortcode })"
                    :done-label="t('openingSms')"
                    :color="selectedZone.color"
                    @confirm="pay(selectedZone)"
                  />
                  <p class="pay-note">
                    {{ t("slideConfirms") }} {{ t("smsToOperator") }}
                  </p>
                </template>
                <!-- Responsibility mode: fast tap, no per-pay confirm -->
                <button
                  v-else
                  type="button"
                  class="zone-act-btn"
                  :style="{
                    background: selectedZone.color,
                    color: inkOn(selectedZone.color),
                  }"
                  @click="pay(selectedZone)"
                >
                  <span v-if="defaultPlate"
                    >{{ t("payZone", { zone: selectedZone.name }) }} ·
                    {{ defaultPlate }}</span
                  >
                  <span v-else>{{
                    t("payZone", { zone: selectedZone.name })
                  }}</span>
                  <span class="zone-act-arrow"
                    >→ {{ selectedZone.sms_shortcode }}</span
                  >
                </button>
              </template>
            </div>

            <!-- The one escape hatch, after the primary action: every other zone + tools -->
            <template v-if="selectedZone">
              <button
                type="button"
                class="zone-wrong"
                @click="wrongZone = !wrongZone"
              >
                <Icon name="sign" :size="15" /> {{ t("wrongZone") }}
                <span class="zone-wrong-chev">{{ wrongZone ? "▴" : "▾" }}</span>
              </button>
              <div v-if="wrongZone" class="zone-alt">
                <button
                  v-for="zone in altZones"
                  :key="zone.id"
                  type="button"
                  class="zone-alt-row"
                  @click="selectZone(zone.name)"
                >
                  <span
                    class="zone-alt-stripe"
                    :style="{ background: zone.color }"
                  />
                  <span class="zone-alt-name">{{ zone.name }}</span>
                  <span
                    v-if="zoneLimits[zone.name]?.cap"
                    class="zone-alt-limit"
                    :style="{ color: zone.color, borderColor: zone.color }"
                    >{{ zoneLimits[zone.name]!.label }}</span
                  >
                  <span class="zone-alt-price" :style="{ color: zone.color }">{{
                    zone.price
                  }}</span>
                </button>
                <div class="zone-alt-tools">
                  <button
                    type="button"
                    class="zone-alt-tool"
                    @click="showScan = true"
                  >
                    <Icon name="camera" :size="15" /> {{ t("scanTitle") }}
                  </button>
                  <button
                    type="button"
                    class="zone-alt-tool"
                    @click="showAi = true"
                  >
                    <Icon name="ai" :size="15" /> {{ t("askAiShort") }}
                  </button>
                </div>
              </div>
            </template> </template
          ><!-- /pay surface -->

          <!-- ═══ BELOW THE FOLD — the sign tools, one scroll past the pay job ═══ -->
          <div class="below-section">
            <p class="section-label">{{ t("findLabel") }}</p>

            <!-- Scan the sign — the sign is ground truth: read it, confirm, pin it, pay -->
            <button type="button" class="scan-cta" @click="showScan = true">
              <span class="scan-cta-icon"
                ><Icon name="camera" :size="22"
              /></span>
              <span class="scan-cta-text">
                <span class="scan-cta-title">{{ t("scanTitle") }}</span>
                <span class="scan-cta-sub">{{ t("scanSub") }}</span>
              </span>
              <span class="scan-cta-arrow">→</span>
            </button>

            <!-- Ask AI — geometry + registry decide, never a remembered guess -->
            <button type="button" class="ai-cta" @click="showAi = true">
              <span class="ai-cta-icon"><Icon name="ai" :size="20" /></span>
              <span class="ai-cta-text">
                <span class="ai-cta-title">{{ t("aiTitle") }}</span>
                <span class="ai-cta-sub">{{ t("aiSub") }}</span>
              </span>
              <span class="ai-cta-arrow">→</span>
            </button>

            <!-- Nearest confirmed sign — lead the user to verified ground truth -->
            <button
              v-if="nearestSign"
              type="button"
              class="nsign"
              :style="{
                borderColor:
                  (nearestSign.report.zone_color || 'var(--blue)') + '66',
              }"
              @click="onLeadToSign"
            >
              <span
                class="nsign-arrow"
                :style="{
                  transform: `rotate(${nearestSignArrow}deg)`,
                  color: nearestSign.report.zone_color || 'var(--blue)',
                }"
                ><Icon name="nav-arrow" :size="20"
              /></span>
              <span class="nsign-text">
                <span class="nsign-title">
                  {{
                    t("nearestSign", {
                      dist: formatDist(nearestSign.distanceM),
                    })
                  }}
                </span>
                <span class="nsign-sub">
                  <span
                    :style="{
                      color: nearestSign.report.zone_color || 'var(--text2)',
                    }"
                    >{{ nearestSign.report.zone_name }}</span
                  >
                  ·
                  {{
                    t("confirmedAgo", {
                      time: relTime(nearestSign.report.created_at),
                    })
                  }}
                </span>
              </span>
              <span class="nsign-go">{{ t("leadMe") }}</span>
            </button>
          </div>
          <!-- /sign tools -->

          <!-- ═══ CITY INFO — reference & reassurance, never urgent ═══ -->
          <div class="below-section">
            <!-- Full weekly charging schedule (reference) -->
            <ParkingHours :city-id="detectedCity!.id" class="gps-hours" />

            <!-- Guest → account nudge (memory + reminders + fine alerts) -->
            <div v-if="!user" class="guest-upsell">
              <span class="guest-upsell-icon"
                ><Icon name="bell" :size="16"
              /></span>
              <p class="guest-upsell-text">
                {{ t("guestPre") }}
                <NuxtLink to="/login">{{ t("createAccount") }}</NuxtLink>
                {{ t("guestPost") }}
              </p>
            </div>

            <!-- Personal fine check (manual) — works for guests too -->
            <FineCheck :initial-plate="defaultPlate" class="gps-finecheck" />

            <!-- Fine warning -->
            <div v-if="cityDetail.fine" class="gps-fine">
              <span class="gps-fine-label">{{ t("fineIfUnpaid") }}</span>
              <span class="gps-fine-amount">{{ cityDetail.fine }}</span>
            </div>

            <!-- Recent sessions -->
            <div v-if="pastSessions.length" class="gps-history">
              <p class="section-label">{{ t("recentSessions") }}</p>
              <div v-for="s in pastSessions" :key="s.id" class="hist-row">
                <span
                  class="hist-dot"
                  :style="{ background: s.zone_color || 'var(--text2)' }"
                />
                <span class="hist-main">
                  <span class="hist-zone">{{ s.zone_name }}</span>
                  <span v-if="s.street_name" class="hist-street">
                    · {{ s.street_name }}</span
                  >
                </span>
                <span class="hist-when">{{ relTime(s.started_at) }}</span>
              </div>
            </div>
          </div>
          <!-- /city info --> </template
        ><!-- /full dashboard -->
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

      <!-- SMS handoff — the web can't verify the send, so we ask -->
      <ClientOnly>
        <Teleport to="body">
          <div
            v-if="showSentPrompt"
            class="sent"
            role="dialog"
            aria-label="Confirm SMS sent"
          >
            <div ref="sentSheetEl" class="sent-sheet" tabindex="-1">
              <p class="sent-title">{{ t("sentTitle") }}</p>
              <p class="sent-sub">
                {{ t("sentBody1") }}
                <strong>{{ pendingPay?.zone.sms_shortcode }}</strong
                >.
                {{ t("sentBody2") }}
              </p>
              <div class="sent-actions">
                <button type="button" class="sent-no" @click="onSentNo">
                  {{ t("sentNo") }}
                </button>
                <button type="button" class="sent-yes" @click="onSentYes">
                  {{ t("sentYes") }}
                </button>
              </div>
            </div>
          </div>
        </Teleport>
      </ClientOnly>
    </section>

    <template v-else>
      <!-- ── GPS SKELETON — returning user: same frame as the dashboard, shimmer in
         the slots, populated in place once GPS + city data land. No layout swap.
         Both this and the hero are in the prerendered HTML; an inline head script
         (see useHead below) picks one before first paint, Vue takes over on mount. ── -->
      <section
        class="hero-gps gps-skel"
        :class="{ 'gps-skel--on': gpsSkeleton }"
        aria-busy="true"
      >
        <div class="container">
          <div v-if="!freeSurface" class="gps-map-wrap">
            <div class="sk sk-map" />
          </div>
          <div class="gps-detected">
            <span class="gps-detected-where">
              <span class="gps-detected-pin"
                ><Icon name="pin" :size="13"
              /></span>
              {{ t("detecting") }}
            </span>
            <span class="sk sk-line sk-guide" />
          </div>
          <!-- Free hours expected → the calm free card's footprint -->
          <div v-if="freeSurface" class="sk sk-free" />
          <!-- Paid hours expected → zone card + pay line + slider footprints -->
          <template v-else>
            <div class="pay-step">
              <div class="sk-card">
                <div class="sk sk-card-head" />
                <div class="sk-card-body">
                  <span class="sk sk-line sk-w60" />
                </div>
              </div>
            </div>
            <div class="pay-step">
              <div class="pay-summary">
                <span class="sk sk-line sk-w45" />
                <span v-if="defaultPlate" class="sk sk-chip" />
              </div>
              <div class="sk sk-slider" />
            </div>
          </template>
        </div>
      </section>

      <!-- ── HERO (default, non-GPS) ── -->
      <section class="hero" :class="{ 'hero-off': gpsSkeleton }">
        <div class="container">
          <p class="section-label fade-up">{{ t("heroLabel") }}</p>
          <h1 class="fade-up-2">
            {{ t("heroTitle1") }}<br />{{ t("heroTitle2") }}
          </h1>
          <p class="hero-sub fade-up-3">
            {{ t("heroSub") }}
          </p>

          <!-- GPS detecting state -->
          <div v-if="detecting" class="gps-detecting fade-up-3">
            <span class="gps-icon"><Icon name="pin" :size="15" /></span>
            <span>{{ t("detecting") }}</span>
          </div>
          <div v-else-if="gpsError" class="gps-error fade-up-3">
            <p class="gps-error-text">{{ gpsError }}</p>
            <!-- Unsupported city → AI orientation so the app is still useful here -->
            <button
              v-if="unsupportedCity"
              type="button"
              class="gps-ai-help"
              @click="showCityHelp = true"
            >
              <Icon name="ai" :size="15" /> Ask AI how parking works in
              {{ unsupportedCity }} →
            </button>
          </div>

          <ClientOnly>
            <CityHelp
              v-if="showCityHelp && unsupportedCity"
              :city="unsupportedCity"
              :lat="coords?.lat ?? null"
              :lng="coords?.lng ?? null"
              @close="showCityHelp = false"
            />
          </ClientOnly>

          <!-- Search -->
          <div class="search-outer fade-up-3">
            <div class="search-wrap" :class="{ focused: searchFocused }">
              <span class="search-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <input
                v-model="searchQuery"
                class="search-input"
                type="text"
                :placeholder="t('searchPlaceholder')"
                autocomplete="off"
                @focus="searchFocused = true"
                @blur="setTimeout(() => (searchFocused = false), 150)"
                @input="handleSearch"
                @keydown.enter="goToFirstResult"
                @keydown.escape="searchResults = []"
              />
              <button class="search-btn" @click="goToFirstResult">
                {{ t("findBtn") }}
              </button>
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
    </template>

    <!-- ── CITY STRIP + CITIES + HOW IT WORKS + CTA (hidden in GPS mode: the city is known) ── -->
    <div v-if="!gpsMode" class="mkt" :class="{ 'mkt-off': gpsSkeleton }">
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

      <!-- ── HOW IT WORKS ── -->
      <section id="how" class="section-how">
        <div class="container">
          <div class="reveal">
            <p class="section-label">How it works</p>
            <h2>Three steps, no guessing.</h2>
            <p class="section-sub">
              No account needed. No app to install. Just the rules for your
              city, when you need them.
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
                No more Reddit threads. No more guessing from a sign you can't
                fully read. No more fines from the wrong zone.
              </p>
            </div>
            <div class="cta-actions">
              <button class="btn-primary" @click="scrollToTop">
                Search your city →
              </button>
              <NuxtLink to="/contribute" class="btn-ghost"
                >Contribute info</NuxtLink
              >
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
const { getCities, searchCities, getCity } = useCity();
const { user, getProfile } = useAuth();
const { t, lang } = useLang();

// Day labels come from useParkingHours as canonical EN tokens; translate at render.
const DAY_SR: Record<string, string> = {
  Mon: "pon",
  Tue: "uto",
  Wed: "sre",
  Thu: "čet",
  Fri: "pet",
  Sat: "sub",
  Sun: "ned",
};
const dayWord = (label?: string | null) => {
  if (label === "today") return t("today");
  if (label === "tomorrow") return t("tomorrow");
  if (!label) return "";
  return lang.value === "sr" ? DAY_SR[label] ?? label : label;
};
const {
  detectCity,
  detectedCity,
  detectedStreet,
  coords,
  detecting,
  gpsError,
  gpsDenied,
  suggestedZoneName,
  unsupportedCity,
  startTracking,
  stopTracking,
} = useGPS();

// ── Dashboard skeleton — no layout swap while GPS resolves ────────────────────
// A returning user's homepage IS the dashboard; flashing the marketing hero for
// the seconds GPS + city data take, then tearing it out, reads as a glitch.
// Remember the last GPS city on-device and hold the dashboard's frame (shimmer
// placeholders in the exact slots) until the real data populates it in place.
const EXPECT_GPS_KEY = "kerb_expect_gps_city";
const expectCityId = ref<string | null>(null);
const showCityHelp = ref(false); // AI orientation panel for cities we don't cover yet
const {
  heading,
  attached: compassAttached,
  previouslyEnabled: compassWasEnabled,
  needsPermission: compassNeedsPerm,
  start: startOrientation,
  stop: stopOrientation,
  onMapTap,
} = useDeviceOrientation();

// First-time iOS only: offer a one-tap compass enable. Hidden once it's running,
// and never shown again to anyone who already opted in (persisted in localStorage).
const compassPrompt = computed(
  () =>
    import.meta.client &&
    compassNeedsPerm.value &&
    !compassAttached.value &&
    heading.value == null &&
    !compassWasEnabled.value
);

const cityDetail = ref<any>(null);
const loadingCityDetail = ref(false);
const userProfile = ref<any>(null);
const zoneBoundaries = ref<any>(null);
// Geometry + signs fetch has settled (either way). Until then the dashboard holds
// a "checking your spot" line instead of guessing a zone — the guess used to paint
// zones[0] (Extra) for a few seconds and then get overwritten by the real verdict.
const geoResolved = ref(false);
const mapExpanded = ref(false);
const showScan = ref(false); // scan-the-sign modal
const showAi = ref(false); // ask-AI resolver panel
const signReports = ref<any[]>([]); // confirmed sign scans → map pins
const { loadForCity: loadSignReports } = useSignScan();
const locateCar = ref(false); // "find my car" — point the map at the saved session

// Parking session tracking (logs each pay, geotagged)
const {
  active: activeSession,
  history: sessionHistory,
  remainingMs,
  atZoneLimit,
  canExtend,
  loadActive,
  loadHistory,
  startOrExtend,
  endSession,
} = useParkingSession();

watch(
  user,
  (u) => {
    if (u) {
      loadActive();
      loadHistory();
    }
  },
  { immediate: true }
);

// Time-aware hours — drives free-now desaturation + the night pre-pay path.
// Falls back to the remembered city so the pre-GPS skeleton already knows which
// shape is coming (free surface vs. pay dashboard); schedules are static data.
const {
  paidNow,
  nextWindow,
  status: hoursStatus,
} = useParkingHours(() => detectedCity.value?.id ?? expectCityId.value);
const freeNow = computed(() => paidNow.value === false);
const nightPrepay = computed(() => freeNow.value && !!nextWindow.value);

// Offer pre-pay on the free surface when the next paid window is near (later
// today / tomorrow morning). Further-off windows just inform.
const statusCanPrepay = computed(
  () =>
    freeNow.value &&
    ["today", "tomorrow"].includes(nextWindow.value?.dayLabel ?? "")
);

// ── Free-now main surface ────────────────────────────────────────────────────
// When no payment is needed, the whole dashboard collapses to one calm answer
// instead of the full Pay/Find/Info stack. The user can still open the dashboard
// (to pre-pay or browse zones) — that flips forceBrowse and reveals the tabs.
const forceBrowse = ref(false);
const freeSurface = computed(
  () => freeNow.value && !forceBrowse.value && !displaySession.value
);
const browseAnyway = () => {
  forceBrowse.value = true;
};
const statusToPrepay = () => {
  forceBrowse.value = true;
};

// Guest sessions (no account), persisted on-device. Created only AFTER the user
// confirms they sent the SMS. Logged-in users keep the Supabase-backed session.
const guest = useGuestSession();
const displaySession = computed<any>(() =>
  user.value ? activeSession.value : guest.active.value
);
const displayRemaining = computed(() =>
  user.value ? remainingMs.value : guest.remainingMs.value
);
const displayAtLimit = computed(() =>
  user.value ? atZoneLimit.value : guest.atZoneLimit.value
);
const displayCanExtend = computed(() =>
  user.value ? canExtend.value : guest.canExtend.value
);

// Lock body scroll + close on Escape while the fullscreen map is open
watch(mapExpanded, (open) => {
  if (import.meta.server) return;
  document.body.style.overflow = open ? "hidden" : "";
  if (!open) {
    locateCar.value = false; // reset find-my-car when the map closes
    leadSignPoint.value = null; // and the lead-to-sign pointer
  }
});
// Escape closes whatever is on top: SMS-sent sheet → map.
// (ScanSign / AskAi / CityHelp handle their own Escape via useDialogBehavior.)
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;
  if (showSentPrompt.value) {
    onSentNo();
    return;
  }
  mapExpanded.value = false;
};

// Move focus into the SMS-sent sheet when it opens so keyboard/SR users land there.
const sentSheetEl = ref<HTMLElement | null>(null);
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
  if (_visHandler) {
    document.removeEventListener("visibilitychange", _visHandler);
    _visHandler = null;
  }
});

// Guest plate — saved on the device so anonymous users get one-tap SMS too,
// with no account. Synced into a real profile plate if they sign up later.
const GUEST_PLATE_KEY = "kerb_guest_plate";
const guestPlate = ref("");
watch(guestPlate, (v) => {
  if (!import.meta.client) return;
  const clean = v.trim().toUpperCase();
  if (clean) localStorage.setItem(GUEST_PLATE_KEY, clean);
  else localStorage.removeItem(GUEST_PLATE_KEY);
});

// "I self-check the sign" opt-out — swaps the per-pay slide for a fast tap.
// Read-only here; the toggle lives in the profile's Paying section.
const SKIP_CONFIRM_KEY = "kerb_skip_sign_confirm";
const skipConfirm = ref(false);

// "Covered until" — one SMS buys one hour; show the consequence before the slide.
// Ticks every 30s so a dashboard left open doesn't promise a stale time.
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tickTimer = setInterval(() => (nowTick.value = Date.now()), 30_000);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
const coveredUntil = computed(() =>
  new Date(nowTick.value + 3_600_000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
);

// ── Plate chip picker — all saved plates, switchable without leaving the flow ──
const profilePlates = computed<any[]>(() => userProfile.value?.plates ?? []);
const plateOpen = ref(false);
const chosenPlate = ref<string | null>(null); // per-visit override of the default plate
const choosePlate = (p: string) => {
  chosenPlate.value = p;
  plateOpen.value = false;
};

const defaultPlate = computed(() => {
  if (chosenPlate.value) return chosenPlate.value;
  const saved = (
    profilePlates.value.find((p: any) => p.is_default) ?? profilePlates.value[0]
  )?.plate;
  return (
    saved ??
    (guestPlate.value.trim() ? guestPlate.value.trim().toUpperCase() : null)
  );
});

// Geometry-based detection: distance to the nearest paid-parking segment.
const { nearest } = useNearestParking(coords, zoneBoundaries);

// When a city's zone geometry is only coarsely traced (no official vector cadastre),
// the dashboard flags it: GPS proximity here is a hint, never a claim.
const { tier: dashTier } = useCityTier(() => detectedCity.value?.id);
const mapApprox = computed(() => dashTier.value === "cadastre_approx");

// Self-healing map: confirmed signs recolour segments they disagree with (≥2 scans).
// The resolver + nearest stay on the raw geometry; only the map display heals.
const displayZones = computed(() =>
  applySignOverrides(zoneBoundaries.value, signReports.value)
);

// on  = standing on a paid street · near = just off one · none = no paid parking
const parkingState = computed<"on" | "near" | "none" | null>(() => {
  const n = nearest.value;
  if (!n) return null;
  const acc = coords.value?.accuracy ?? 0;
  const onT = Math.min(Math.max(25, acc), 60); // widen when GPS is imprecise
  const nearT = Math.max(75, onT + 50);
  if (n.distanceM <= onT) return "on";
  if (n.distanceM <= nearT) return "near";
  return "none";
});

// No paid parking where the user stands (with geometry to back it) — the wizard
// yields to a calm "you're fine here" card; zones would only contradict it.
const noZoneHere = computed(
  () => parkingState.value === "none" && !!nearest.value
);

const formatDist = (m: number) => {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(5, Math.round(m / 5) * 5)} m`;
};

const zoneColor = (name: string) =>
  cityDetail.value?.zones?.find((z: any) => z.name === name)?.color ??
  "var(--text2)";

// Which zone to surface as the hero. Prefer geometry; fall back to the street-
// name match only when boundary geometry isn't loaded.
const activeSuggestedName = computed<string | null>(() => {
  if (nearest.value) {
    return parkingState.value === "on" || parkingState.value === "near"
      ? nearest.value.zoneName
      : null;
  }
  return suggestedZoneName.value;
});

// GPS gives a best guess — never a verdict. The user taps the zone on the sign.
const likelyZoneName = computed(() => activeSuggestedName.value);
const allZones = computed<any[]>(() => cityDetail.value?.zones ?? []);

// The one rule that actually gets people fined: the hard time cap. Pull it out of
// the prose so we can show "MAX 60 MIN" loud, and keep the fine print as a quiet
// second line instead of a wall of sentence.
const limitOf = (rules?: string | null) => {
  if (!rules) return null;
  const cap = /^\s*max\s*(\d+)\s*min\.?\s*/i.exec(rules);
  if (cap)
    return {
      cap: true,
      label: `MAX ${cap[1]} MIN`,
      note: rules.slice(cap[0].length).trim(),
    };
  const free = /^\s*no time limit\.?\s*/i.exec(rules);
  if (free)
    return {
      cap: false,
      label: "No time limit",
      note: rules.slice(free[0].length).trim(),
    };
  return { cap: false, label: "", note: rules };
};
// Parsed limit per zone, keyed by name — drives the inline chip + the fine print.
const zoneLimits = computed<Record<string, ReturnType<typeof limitOf>>>(() => {
  const m: Record<string, ReturnType<typeof limitOf>> = {};
  for (const z of allZones.value) m[z.name] = limitOf(z.rules);
  return m;
});

// "Wrong zone?" escape hatch — every zone except the hero, plus scan/AI tools.
const wrongZone = ref(false);
const altZones = computed(() =>
  allZones.value.filter((z: any) => z.name !== selectedZoneName.value)
);

// What the user is about to pay for. Seeded from the likely zone, but theirs to change.
const selectedZoneName = ref<string | null>(null);
const selectedZone = computed(
  () =>
    allZones.value.find((z: any) => z.name === selectedZoneName.value) ?? null
);
// Once the user explicitly taps/scans/AI-picks a zone, stop auto-following the
// likely guess. Before that, the selection must track likelyZoneName — otherwise
// the early fallback (first zone, while GPS is still resolving) sticks and the
// open card disagrees with the "likely yours" tag.
const userPickedZone = ref(false);
const selectZone = (name: string) => {
  selectedZoneName.value = name;
  userPickedZone.value = true;
  wrongZone.value = false; // picking from the escape hatch promotes it to the hero
};

// Follow the likely zone until the user picks; afterwards only repair invalid picks.
// The zones[0] fallback is only honest AFTER geometry has settled — before that it
// painted a confident wrong hero that the real verdict then swapped out from under
// the user. While unresolved, null keeps the wizard on its "checking" line instead.
watch(
  [likelyZoneName, allZones, geoResolved],
  () => {
    const valid = allZones.value.some(
      (z: any) => z.name === selectedZoneName.value
    );
    if (!userPickedZone.value || !valid) {
      selectedZoneName.value =
        likelyZoneName.value ??
        (geoResolved.value ? allZones.value[0]?.name ?? null : null);
    }
  },
  { immediate: true }
);

// ── Nearest confirmed sign — lead the user to verified ground truth ────────────
const toRad = (d: number) => (d * Math.PI) / 180;
const haversineM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const bearingDeg = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

// Closest confirmed sign to the user right now (within 1 km), with distance + bearing.
const nearestSign = computed(() => {
  const c = coords.value;
  if (!c || !signReports.value.length) return null;
  let best: any = null;
  let bestD = Infinity;
  for (const s of signReports.value) {
    if (s.lat == null || s.lng == null) continue;
    const d = haversineM(c, { lat: s.lat, lng: s.lng });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best || bestD > 1000) return null;
  return {
    report: best,
    distanceM: bestD,
    bearing: bearingDeg(c, { lat: best.lat, lng: best.lng }),
  };
});

// Arrow rotation for the nearest-sign card: relative to where the user faces when
// the compass is available, otherwise an absolute (north-up) bearing.
const nearestSignArrow = computed(() => {
  const n = nearestSign.value;
  if (!n) return null;
  return heading.value != null ? n.bearing - heading.value : n.bearing;
});

// "Find my car" point, a tapped lead-to-sign point, else the nearest paid segment.
const leadSignPoint = ref<{ lat: number; lng: number } | null>(null);
const highlightPoint = computed(() => {
  if (
    locateCar.value &&
    displaySession.value?.lat != null &&
    displaySession.value?.lng != null
  ) {
    return { lat: displaySession.value.lat, lng: displaySession.value.lng };
  }
  if (leadSignPoint.value) return leadSignPoint.value;
  return parkingState.value === "near" || parkingState.value === "none"
    ? nearest.value?.point ?? null
    : null;
});

// Tap the nearest-sign card → draw a line to it and open the map.
const onLeadToSign = () => {
  const n = nearestSign.value;
  if (!n) return;
  leadSignPoint.value = { lat: n.report.lat, lng: n.report.lng };
  mapExpanded.value = true;
};

// ── Session actions ───────────────────────────────────────────────────────────
const sessionPayload = (zone: any) => ({
  cityId: detectedCity.value!.id,
  zone: {
    name: zone.name,
    color: zone.color,
    price: zone.price,
    rules: zone.rules,
  },
  street: nearest.value?.streetName ?? null,
  lat: coords.value?.lat ?? null,
  lng: coords.value?.lng ?? null,
  plate: defaultPlate.value,
});

// Logged-in users get the Supabase session logged on tap (existing behaviour).
const onPay = (zone: any) => {
  startOrExtend(sessionPayload(zone));
};

// The ms epoch a night pre-pay's paid window opens (city time ≈ the user's, in-city).
const nextStartMs = () => {
  const nw = nextWindow.value;
  if (!nw) return Date.now();
  const [h, m] = nw.start.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (nw.dayLabel === "tomorrow" || d.getTime() <= Date.now())
    d.setDate(d.getDate() + 1);
  return d.getTime();
};

const guestPayload = (zone: any, armed: boolean) => ({
  cityId: detectedCity.value!.id,
  zone: {
    name: zone.name,
    color: zone.color,
    price: zone.price,
    rules: zone.rules,
  },
  street: nearest.value?.streetName ?? null,
  lat: coords.value?.lat ?? null,
  lng: coords.value?.lng ?? null,
  plate: defaultPlate.value,
  armed,
  startsAt: armed ? nextStartMs() : undefined,
});

// ── SMS handoff ────────────────────────────────────────────────────────────────
// The web can't verify an SMS was sent. So: open the composer, and when the user
// returns to the tab, ask. Only on "yes" do we record a (self-reported) session.
const pendingPay = ref<{ zone: any; armed: boolean } | null>(null);
const showSentPrompt = ref(false);
watch(showSentPrompt, (open) => {
  if (open) nextTick(() => sentSheetEl.value?.focus());
});
let _visHandler: (() => void) | null = null;
const armSentPrompt = () => {
  if (!import.meta.client || _visHandler) return;
  _visHandler = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", _visHandler!);
    _visHandler = null;
    if (pendingPay.value) showSentPrompt.value = true;
  };
  document.addEventListener("visibilitychange", _visHandler);
};

// Confirmed (slide/tap) → open the SMS composer + arm the "did you send it?" check.
const pay = (zone: any, opts: { armed?: boolean } = {}) => {
  if (user.value) {
    onPay(zone); // logged-in keeps its immediate Supabase log (unchanged)
  } else {
    pendingPay.value = { zone, armed: !!opts.armed }; // guest: confirm the send first
    armSentPrompt();
  }
  if (import.meta.client && zone.sms_shortcode) openSms(smsLink(zone));
};

const onSentYes = () => {
  const p = pendingPay.value;
  if (p && !user.value)
    guest.create(guestPayload(p.zone, p.armed), "self_reported");
  showSentPrompt.value = false;
  pendingPay.value = null;
};
const onSentNo = () => {
  showSentPrompt.value = false;
  pendingPay.value = null;
};

const onExtend = () => {
  const name = displaySession.value?.zone_name;
  const z = cityDetail.value?.zones?.find((x: any) => x.name === name);
  if (!z) return;
  if (user.value) {
    startOrExtend(sessionPayload(z));
    if (import.meta.client && z.sms_shortcode) openSms(smsLink(z));
  } else {
    pay(z); // guest: re-open the SMS, confirm, log a fresh hour
  }
};

const onEndSession = () => {
  const s = displaySession.value;
  if (!s) return;
  user.value ? endSession(s.id) : guest.end(s.id);
};
const onLocateCar = () => {
  locateCar.value = true;
  mapExpanded.value = true;
};

// ── Ask AI — deterministic candidate-set zone resolver ─────────────────────────
// Resolve against the HEALED geometry so AI never contradicts the map the user sees
// (sign-first logic is independent; this just keeps the fallback boundary calc honest).
const { verdict: aiVerdict } = useZoneResolver(
  coords,
  displayZones,
  signReports
);
const aiSourceName = computed(() => {
  const u = cityDetail.value?.official_url;
  if (!u) return "official city registry";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "official city registry";
  }
});
const onAiPick = (zoneName: string) => {
  if (allZones.value.some((z: any) => z.name === zoneName))
    selectZone(zoneName);
  showAi.value = false;
  forceBrowse.value = true; // reveal the pay wizard with the zone ready to pay
};
const onAiScan = () => {
  showAi.value = false;
  showScan.value = true;
};

const pastSessions = computed(() =>
  sessionHistory.value
    .filter((s: any) => s.id !== activeSession.value?.id)
    .slice(0, 5)
);

const relTime = (iso: string) => {
  const sr = lang.value === "sr";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return sr ? "upravo sada" : "just now";
  if (min < 60) return sr ? `pre ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return sr ? `pre ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return sr ? "juče" : "yesterday";
  return sr ? `pre ${d} dana` : `${d} days ago`;
};

const clockOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const smsLink = (zone: any) => smsHref(zone.sms_shortcode, defaultPlate.value);

watch(detectedCity, async (city) => {
  if (!city) return;
  geoResolved.value = false;
  loadingCityDetail.value = true;
  try {
    cityDetail.value = await getCity(city.id);
  } finally {
    loadingCityDetail.value = false;
  }

  // Load signs + geometry together, then set signs FIRST so the map's first paint
  // is already healed (no old→new flash). displayZones reads both refs.
  try {
    const [geo, reports] = await Promise.all([
      fetch(`/zones/${city.id}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      loadSignReports(city.id),
    ]);
    signReports.value = reports;
    if (geo) zoneBoundaries.value = geo;
  } finally {
    geoResolved.value = true; // a failed fetch must still release the verdict UI
  }
});

// A new confirmed scan: pin it immediately and make it the selected pay zone.
const onSignSubmitted = (report: any) => {
  signReports.value = [report, ...signReports.value];
  if (allZones.value.some((z: any) => z.name === report.zone_name)) {
    selectZone(report.zone_name);
  }
};

// Pay straight from the scan result — reuse the normal pay path (logs + SMS).
const onScanPay = (zone: any) => {
  showScan.value = false;
  pay(zone);
};

watch(
  () => !!user.value && !!cityDetail.value,
  async (active) => {
    if (active && !userProfile.value) {
      userProfile.value = await getProfile();
    }
  }
);

// Guest-first: the live dashboard is available to anyone once a city is detected.
// Login only adds memory (session tracking, reminders, fine alerts).
const gpsMode = computed(() => !!(detectedCity.value && cityDetail.value));

// Hold the dashboard frame for returning users while GPS + city data resolve.
// Off the moment anything says the dashboard isn't coming: a GPS error (the
// hero shows it), or a detected city whose detail fetch settled empty.
const gpsSkeleton = computed(() => {
  if (!expectCityId.value || gpsMode.value || gpsError.value) return false;
  if (detectedCity.value && !loadingCityDetail.value && !cityDetail.value)
    return false;
  return true;
});

// A denial or an uncovered city means the dashboard won't come back next open —
// land on the search hero directly. Transient failures (timeout, no fix) keep
// the memory: the user is likely still in their city.
watch([gpsDenied, unsupportedCity], ([denied, unsup]) => {
  if (!denied && !unsup) return;
  expectCityId.value = null;
  if (import.meta.client) localStorage.removeItem(EXPECT_GPS_KEY);
});

// The inline head script (below) shows the skeleton before Vue loads via a class
// on <html>. Once the reactive verdict says the skeleton is over — dashboard in,
// or detection failed — drop the class so the CSS override can't pin stale UI.
watch(gpsSkeleton, (on) => {
  if (import.meta.client && !on)
    document.documentElement.classList.remove("gps-expected");
});

// Start live GPS tracking + compass when GPS mode activates
watch(
  gpsMode,
  (active) => {
    if (active) {
      expectCityId.value = detectedCity.value!.id;
      if (import.meta.client)
        localStorage.setItem(EXPECT_GPS_KEY, detectedCity.value!.id);
      forceBrowse.value = false; // a fresh open lands on the calm free surface
      startTracking();
      startOrientation();
    } else {
      stopTracking();
      stopOrientation();
    }
  },
  { immediate: true }
);

const {
  data: cities,
  pending,
  error,
} = await useAsyncData("cities", getCities, { lazy: true });

const searchQuery = ref("");
const searchResults = ref<any[]>([]);
const searchFocused = ref(false);

let searchTimeout: ReturnType<typeof setTimeout>;
const handleSearch = () => {
  clearTimeout(searchTimeout);
  if (searchQuery.value.length < 2) {
    searchResults.value = [];
    return;
  }
  searchTimeout = setTimeout(async () => {
    searchResults.value = await searchCities(searchQuery.value);
  }, 250);
};

const goToFirstResult = async () => {
  if (searchResults.value.length) {
    await navigateTo(`/${searchResults.value[0].id}`);
    searchResults.value = [];
  }
};

const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

// Honest stats only — derived from the cities we actually have, never invented.
const stats = computed(() => {
  const list = (cities.value ?? []) as any[];
  const countries = new Set(list.map((c) => c.country)).size;
  const out = [
    { val: String(list.length), label: list.length === 1 ? "city" : "cities" },
  ];
  if (countries)
    out.push({
      val: String(countries),
      label: countries === 1 ? "country" : "countries",
    });
  out.push({ val: "Serbia", label: "first" });
  return out;
});

// Ticker shows only real cities that have a page — no ghost entries.
const stripItems = computed(() =>
  ((cities.value ?? []) as any[]).map((c) => ({
    city: `${c.flag} ${c.name}`,
    detail: c.country,
  }))
);

const steps = [
  {
    num: "01",
    title: "Search your city",
    body: "Type any city. Instantly see how parking works — zones, prices, hours, and payment methods.",
  },
  {
    num: "02",
    title: "Read the rules",
    body: "Clear, structured information. No legal jargon. Exactly what you need to park without stress.",
  },
  {
    num: "03",
    title: "Pay the right way",
    body: "Each city guide tells you exactly how to pay — SMS, app, meter, or card. Confirm with local signage.",
  },
];

onMounted(() => {
  // Guest-first: detect the city for everyone, logged in or not.
  if (import.meta.client) {
    guestPlate.value = localStorage.getItem(GUEST_PLATE_KEY) ?? "";
    skipConfirm.value = localStorage.getItem(SKIP_CONFIRM_KEY) === "1";
    expectCityId.value = localStorage.getItem(EXPECT_GPS_KEY);
    // No expectation → the gpsSkeleton watcher will never fire; drop the
    // pre-paint marker here or the head script's class pins the skeleton.
    if (!expectCityId.value)
      document.documentElement.classList.remove("gps-expected");
  }
  detectCity();

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
});

// Pre-hydration switch: the homepage is prerendered as the marketing hero, but a
// returning GPS user's first paint should be the dashboard skeleton. This runs
// synchronously in <head>, before first paint, and flips the CSS between the two
// (both are in the static HTML). Vue reconciles on mount via gpsSkeleton.
useHead({
  script: [
    {
      innerHTML: `try{if(localStorage.getItem('${EXPECT_GPS_KEY}'))document.documentElement.classList.add('gps-expected')}catch(e){}`,
      tagPosition: "head",
    },
  ],
});

useSeoMeta({
  title: "Kerb — park · pay · zero fines",
  description:
    "AI-assisted street parking for Serbia. Find your zone, pay by SMS, never learn what a zone is.",
  ogTitle: "Kerb — park · pay · zero fines",
  ogDescription:
    "AI-assisted street parking for Serbia. Find your zone, pay by SMS, never learn what a zone is.",
  ogUrl: "https://kerbo.netlify.app/",
  ogImage: "https://kerbo.netlify.app/icon-512.png",
  ogType: "website",
  twitterCard: "summary",
});
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
.gps-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.gps-link {
  margin-left: auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--green);
  white-space: nowrap;
}
.gps-link:hover {
  text-decoration: underline;
}
.gps-error {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 16px;
  max-width: 560px;
}
.gps-error-text {
  margin-bottom: 10px;
}
.gps-ai-help {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 16px;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms var(--ease-out),
    background 150ms var(--ease-out);
}
.gps-ai-help:hover {
  border-color: var(--blue);
  color: var(--blue);
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
.search-input::placeholder {
  color: var(--muted2);
}
.search-btn {
  background: var(--accent);
  border: none;
  padding: 13px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--on-accent);
  white-space: nowrap;
  cursor: pointer;
  transition: background 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.search-btn:hover {
  background: var(--accent-hover);
}
.search-btn:active {
  transform: scale(0.97);
}
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
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
.search-result:last-child {
  border: none;
}
.search-result:hover {
  background: var(--bg2);
}
.sri-flag {
  font-size: 20px;
}
.sri-name {
  font-size: 14px;
  font-weight: 500;
}
.sri-country {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}
.sri-arrow {
  margin-left: auto;
  color: var(--muted2);
  font-size: 13px;
}

/* Hero meta */
.hero-meta {
  font-size: 13px;
  color: var(--muted);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.hero-meta strong {
  color: var(--text2);
  font-weight: 600;
}
.meta-sep {
  color: var(--border2);
  margin: 0 2px;
}

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
.view-all:hover {
  color: var(--blue-hover);
}
.cities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.cities-grid .reveal:nth-child(2) {
  transition-delay: 50ms;
}
.cities-grid .reveal:nth-child(3) {
  transition-delay: 100ms;
}
.cities-grid .reveal:nth-child(4) {
  transition-delay: 150ms;
}
.cities-grid .reveal:nth-child(5) {
  transition-delay: 200ms;
}
.cities-grid .reveal:nth-child(6) {
  transition-delay: 250ms;
}
.skeleton {
  height: 200px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
.error-msg {
  text-align: center;
  padding: 60px;
  color: var(--muted);
}

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
.step:last-child {
  border-right: none;
}
.step:hover {
  background: var(--blue-bg);
}
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
.section-cta {
  padding: 80px 0;
  border-bottom: 1px solid var(--border);
}
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
  .cities-grid {
    grid-template-columns: 1fr 1fr;
  }
  .steps {
    grid-template-columns: 1fr;
  }
  .step {
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .step:last-child {
    border-bottom: none;
  }
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .cta-inner {
    flex-direction: column;
    padding: 32px 24px;
  }
}
@media (max-width: 600px) {
  .cities-grid {
    grid-template-columns: 1fr;
  }
  .hero {
    padding: 100px 24px 48px;
  }
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
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: background 150ms;
}
.map-expand-btn span {
  font-size: 15px;
  line-height: 1;
}
.map-expand-btn:hover {
  background: var(--bg3);
  color: var(--text);
}

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
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 50%;
  cursor: pointer;
}
.map-fs-close:hover {
  color: var(--text);
}
.map-fs-body {
  flex: 1 1 auto;
  min-height: 0;
}
.hero-gps {
  padding: 20px 0 40px;
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
  padding: 7px 0 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
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
.gps-detected-where strong {
  color: var(--text);
  font-weight: 600;
}
.gps-detected-pin {
  margin-right: 4px;
}
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
.gps-detected-guide:hover {
  color: var(--blue-hover);
}

/* ── Below-the-fold sections — sign tools + city info, one scroll past pay ── */
.below-section {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.below-section > .section-label {
  margin-bottom: 12px;
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
  0% {
    box-shadow: 0 0 0 0 currentColor;
    opacity: 1;
  }
  70% {
    box-shadow: 0 0 0 6px transparent;
    opacity: 0.8;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    opacity: 1;
  }
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
.free-now-sub strong {
  color: var(--text);
  font-weight: 700;
}
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
  background: var(--accent);
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
.free-prepay-why {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.55;
  max-width: 340px;
  margin-inline: auto;
  text-wrap: pretty;
}
.free-prepay-btn:active,
.free-browse-btn:active {
  transform: scale(0.98);
}

/* ── Pay surface: zone card → covered-until summary → slide ── */
.gps-hours {
  margin-bottom: 20px;
}
.pay-step {
  margin-bottom: 16px;
}

/* Consequence line + the plate the SMS pays for */
.pay-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 30px;
  margin-bottom: 8px;
}
.pay-until {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted);
}
.pay-until strong {
  color: var(--text);
  font-weight: 700;
}
.plate-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 5px 11px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text2);
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 150ms var(--ease-out), color 150ms var(--ease-out);
}
.plate-chip:hover {
  border-color: var(--blue);
  color: var(--text);
}
.plate-chip-chev {
  font-size: 10px;
  color: var(--muted);
}
.veh-guest-edit {
  padding: 8px;
}
.veh-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  padding: 6px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.veh-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  font-family: inherit;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--r-sm, 6px);
  cursor: pointer;
  transition: background 150ms var(--ease-out);
}
.veh-opt:hover {
  background: var(--bg3);
}
.veh-opt.on {
  background: var(--bg);
  box-shadow: var(--shadow-sm);
}
.veh-opt-plate {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--text);
}
.veh-opt-label {
  font-size: 12px;
  color: var(--muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.veh-opt-on {
  margin-left: auto;
  color: var(--green);
  line-height: 1;
  flex-shrink: 0;
}
.veh-manage {
  display: block;
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
  border-top: 1px solid var(--border);
  margin-top: 2px;
}
.veh-manage:hover {
  text-decoration: underline;
}
.veh-add {
  display: block;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
  background: var(--bg2);
  border: 1px dashed var(--border2);
  border-radius: var(--r-md);
  transition: border-color 150ms var(--ease-out);
}
.veh-add:hover {
  border-color: var(--blue);
}

/* Step 2 — the hero zone card: identity loud, honesty attached */
.zone-hero {
  border: 1.5px solid;
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--bg);
  box-shadow: var(--shadow-sm);
}
/* Free-now: calm the card but keep it tappable/readable */
.zone-hero--free {
  opacity: 0.62;
  filter: saturate(0.65);
  transition: opacity 150ms var(--ease-out);
}
.zone-hero--free:hover {
  opacity: 1;
  filter: none;
}
.zone-hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 16px;
}
.zone-hero-id {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
}
.zone-hero-name {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.3px;
  line-height: 1.1;
}
.zone-hero-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 20px;
  /* Road-paint badge: the GPS guess is a caution-colored hint, not a verdict */
  background: var(--accent);
  color: var(--on-accent);
}
.zone-hero-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
  text-align: right;
}
.zone-hero-price {
  font-size: 17px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
}
.zone-hero-limit {
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.85;
}
.zone-hero-body {
  padding: 12px 14px;
}
.zone-hero-check {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.5;
}
.zone-hero-check + .zone-act-caution,
.zone-hero-body .zone-pick-approx {
  margin-top: 10px;
}
.zone-hero-body .zone-act-caution {
  margin: 10px 0 0;
}

/* The one escape hatch — wrong zone opens every alternative + the tools */
.zone-wrong {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  margin-top: 10px;
  padding: 13px 14px;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--amber);
  text-align: left;
  background: var(--amber-bg);
  border: 1.5px solid var(--amber-border);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms var(--ease-out);
}
.zone-wrong:hover {
  border-color: var(--amber);
}
.zone-wrong-chev {
  margin-left: auto;
  font-size: 11px;
}
.zone-alt {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.zone-alt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 0 14px 0 0;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms var(--ease-out);
}
.zone-alt-row:hover {
  border-color: var(--border2);
}
.zone-alt-stripe {
  width: 5px;
  align-self: stretch;
  flex-shrink: 0;
  min-height: 46px;
}
.zone-alt-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  min-width: 0;
  padding: 12px 0;
}
.zone-alt-limit {
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border: 1px solid;
  border-radius: 20px;
  flex-shrink: 0;
}
.zone-alt-price {
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.5px;
  flex-shrink: 0;
}
.zone-alt-tools {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.zone-alt-tool {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 11px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  background: var(--bg2);
  border: 1px dashed var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms var(--ease-out), color 150ms var(--ease-out);
}
.zone-alt-tool:hover {
  border-color: var(--blue);
  color: var(--blue);
}

/* Recent sessions */
.gps-history {
  margin-top: 24px;
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.hist-row:last-child {
  border-bottom: none;
}
.hist-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.hist-main {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hist-zone {
  font-weight: 600;
}
.hist-street {
  color: var(--muted);
}
.hist-when {
  font-size: 12px;
  color: var(--muted2);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

/* No paid parking at the user's spot — the calm answer + what to do instead */
.gps-noparking {
  padding: 16px;
  margin-bottom: 20px;
  background: var(--green-bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-lg);
}
.np-main {
  display: flex;
  align-items: center;
  gap: 14px;
}
.np-icon {
  line-height: 1;
  flex-shrink: 0;
  color: var(--green);
}
.np-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}
.np-sub {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
.np-sub strong {
  color: var(--text);
  font-weight: 600;
}
.np-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.np-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 11px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  background: var(--bg);
  border: 1px solid var(--green-border);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms var(--ease-out), color 150ms var(--ease-out);
}
.np-btn:hover {
  border-color: var(--green);
  color: var(--text);
}
.np-btn:active {
  transform: scale(0.98);
}

/* Approximate-geometry honesty note (hero card body) */
.zone-pick-approx {
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
  transition: border-color 150ms var(--ease-out),
    background 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.scan-cta:hover {
  border-color: var(--blue);
}
.scan-cta:active {
  transform: scale(0.99);
}
.scan-cta-icon {
  line-height: 1;
  flex-shrink: 0;
  color: var(--blue);
}
.scan-cta-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.scan-cta-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.2px;
}
.scan-cta-sub {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.scan-cta-arrow {
  font-size: 16px;
  color: var(--blue);
  flex-shrink: 0;
}

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
  transition: border-color 150ms var(--ease-out),
    transform 150ms var(--ease-out);
}
.ai-cta:hover {
  border-color: var(--blue);
}
.ai-cta:active {
  transform: scale(0.99);
}
.ai-cta-icon {
  line-height: 1;
  flex-shrink: 0;
  color: var(--text2);
}
.ai-cta-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-cta-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.2px;
}
.ai-cta-sub {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.ai-cta-arrow {
  font-size: 16px;
  color: var(--muted2);
  flex-shrink: 0;
}

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
  transition: border-color 150ms var(--ease-out),
    transform 150ms var(--ease-out);
}
.nsign:active {
  transform: scale(0.99);
}
.nsign-arrow {
  flex-shrink: 0;
  font-size: 20px;
  line-height: 1;
  transition: transform 200ms var(--ease-out);
}
.nsign-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nsign-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.1px;
}
.nsign-sub {
  font-size: 12px;
  color: var(--muted);
}
.nsign-go {
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
  flex-shrink: 0;
  white-space: nowrap;
}

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
.armed-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.armed-moon {
  line-height: 1;
  flex-shrink: 0;
  color: var(--amber);
}
.armed-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}
.armed-sub {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
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
.armed-cancel:hover {
  color: var(--text);
}

/* SMS handoff sheet */
.sent-sheet:focus {
  outline: none;
} /* container focus, not interactive */
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
.sent-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text);
  margin-bottom: 8px;
}
.sent-sub {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 18px;
}
.sent-sub strong {
  color: var(--text2);
  font-family: var(--font-mono);
}
.sent-actions {
  display: flex;
  gap: 10px;
}
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
  background: var(--accent);
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
}
.sent-yes:active,
.sent-no:active {
  transform: scale(0.98);
}
/* Rule fine print — collapsed by default, one tap away */
.zone-pay-more {
  margin-top: 12px;
}
.zone-pay-more summary {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}
.zone-pay-more summary:hover {
  color: var(--text2);
}
.zone-pay-more p {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
}
/* Tiny sign-check reassurance under the slide — keeps the track itself terse */
.pay-note {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--muted);
  text-align: center;
  line-height: 1.4;
}
.zone-act-caution {
  font-size: 12px;
  color: var(--amber);
  line-height: 1.45;
  margin: 0 0 13px;
}
.zone-act-caution strong {
  font-weight: 700;
}
.zone-act-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 13px 16px;
  border-radius: var(--r-md);
  border: none;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: filter 150ms var(--ease-out);
}
.zone-act-btn:hover {
  filter: brightness(0.9);
}
.zone-act-arrow {
  margin-left: auto;
  opacity: 0.85;
}

/* Guest plate hint (under the plate field, step 1) */
.zone-plate-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}
.zone-plate-hint a {
  color: var(--blue);
}
.zone-plate-hint a:hover {
  text-decoration: underline;
}

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
.guest-upsell-icon {
  line-height: 1.4;
  flex-shrink: 0;
  color: var(--blue);
}
.guest-upsell-text {
  font-size: 13px;
  color: var(--text2);
  line-height: 1.5;
}
.guest-upsell-text a {
  color: var(--blue);
  font-weight: 500;
}
.guest-upsell-text a:hover {
  text-decoration: underline;
}

.gps-finecheck {
  margin-bottom: 20px;
}

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

/* ── Dashboard skeleton — shimmer placeholders in the real slots ──
   Sized to the components they stand in for, so data populates in place.
   Visibility pre-hydration is CSS-only: the inline head script marks <html>
   with .gps-expected when the last visit ended on the dashboard, which swaps
   the prerendered hero for the skeleton before first paint. After mount the
   reactive gpsSkeleton classes take over and the marker class is removed. */
.gps-skel {
  display: none;
}
.gps-skel--on,
html.gps-expected .gps-skel {
  display: block;
}
html.gps-expected .hero,
html.gps-expected .mkt,
.hero-off,
.mkt-off {
  display: none;
}

.sk {
  background: var(--bg4);
  border-radius: var(--r-md);
  animation: shimmer 1.4s ease-in-out infinite;
}
.sk-map {
  height: 118px;
  border-radius: var(--r-lg);
} /* LocationMap */
.sk-line {
  display: inline-block;
  height: 12px;
  border-radius: 6px;
}
.sk-w45 {
  width: 45%;
}
.sk-w60 {
  width: 60%;
}
.sk-guide {
  width: 64px;
  flex-shrink: 0;
} /* full-guide link */
.sk-chip {
  width: 84px;
  height: 26px;
  border-radius: 7px;
  flex-shrink: 0;
} /* plate chip */
.sk-card {
  /* zone hero card */
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.sk-card-head {
  height: 64px;
  border-radius: 0;
}
.sk-card-body {
  padding: 12px 14px;
}
.sk-resolving {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  animation: resolving-pulse 1.6s ease-in-out infinite;
}
.sk-slider {
  height: 54px;
  border-radius: 999px;
} /* SlideToConfirm */
.sk-free {
  height: 208px;
  border-radius: var(--r-xl);
} /* free-now surface */
@keyframes resolving-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sk,
  .sk-resolving,
  .skeleton {
    animation: none;
  }
}
</style>

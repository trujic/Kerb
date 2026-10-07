<template>
  <div>
    <!-- ── GPS DASHBOARD (logged-in + city detected) ── -->
    <section v-if="gpsMode" class="hero-gps">
      <div class="container" :class="{ 'gps-split': !freeSurface }">
        <!-- Map — hidden while free: the "no need to pay" answer is the whole screen.
             Phone: a locked thumbnail above the pay flow. Desktop: the other half of
             the screen, pan/zoom and tap-a-zone-to-pay, beside the panel. -->
        <ClientOnly>
          <div v-if="!freeSurface" class="gps-map-wrap">
            <LocationMap
              :key="wideLayout ? (hideDeskDot ? 'wide-city' : 'wide') : 'narrow'"
              :lat="mapCenter.lat"
              :lng="mapCenter.lng"
              :accuracy="mapCenter.accuracy"
              :heading="heading"
              :height="wideLayout ? undefined : 130"
              :fill="wideLayout"
              :interactive="wideLayout"
              :hide-user="hideDeskDot"
              :zones="wideLayout ? (searchZones ?? displayZones) : displayZones"
              :highlight="wideLayout && searchPin ? null : highlightPoint"
              :pin="mapPin"
              :signs="asking ? [] : signReports"
              :zone-meta="allZones"
              :city-id="detectedCity?.id ?? expectCityId"
              :payable="wideLayout"
              :pay-label="t('carHereBtn')"
              :compass-prompt="compassPrompt"
              labels
              @pay-zone="onPayZone"
              @compass-tap="onMapTap"
              @enable-compass="onMapTap"
            />
            <!-- The map is the second way to answer the panel's question; say so on
                 the map itself, where the eye already is. -->
            <p v-if="asking && wideLayout" class="map-ask">
              <Icon name="pin" :size="14" /> {{ t("carMapChip") }}
            </p>
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
                <!-- Naming the detected city over a searched address in another
                     one is a small lie with a real cost: it reads as though these
                     are the zones where you are standing. -->
                <span class="map-fs-title">
                  <template v-if="searchPin">
                    {{ searchPin.label }}
                    <template v-if="searchCityName"> · {{ searchCityName }}</template>
                  </template>
                  <template v-else>
                    {{ detectedCity!.flag }} {{ detectedCity!.name }} ·
                    {{ t("parkingZones") }}
                  </template>
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
              <!-- Payment density. Off by default: it is the weakest claim on the
                   map, so it never greets anyone unasked. -->
              <div v-if="showHeatTool" class="map-fs-tools">
                <button
                  class="heat-toggle"
                  type="button"
                  :aria-pressed="showHeat"
                  @click="toggleHeat"
                >
                  <span class="heat-swatch" aria-hidden="true"></span>
                  Gde se plaća
                </button>
                <span v-if="showHeat && payHeatDemo" class="heat-demo">
                  simulirano — još nema pravih uplata
                </span>
              </div>
              <div class="map-fs-body">
                <LocationMap
                  :lat="mapCenter.lat"
                  :lng="mapCenter.lng"
                  :accuracy="mapCenter.accuracy"
                  :heading="heading"
                  :zones="searchZones ?? displayZones"
                  :highlight="searchPin ? null : highlightPoint"
                  :pin="searchPin ?? pickedZonePin"
                  :signs="signReports"
                  :heat="showHeat ? payCells : undefined"
                  :zone-meta="allZones"
                  :city-id="detectedCity?.id ?? expectCityId"
                  payable
                  :pay-label="t('carHereBtn')"
                  @pay-zone="onPayZone"
                  :compass-prompt="compassPrompt"
                  fill
                  interactive
                  @enable-compass="onMapTap"
                />
              </div>
            </div>
          </Teleport>
        </ClientOnly>

        <!-- Everything but the map. One column on a phone; the left half on desktop. -->
        <div class="gps-panel">
        <!-- Detected-location line — minimal: where you are, not a city banner -->
        <div class="gps-detected">
          <span class="gps-detected-where">
            <span class="gps-detected-pin"><Icon name="pin" :size="13" /></span>
            <!-- On desktop the street is the laptop's, so only the city is said. -->
            <template v-if="detectedStreet && !deskMode"
              ><strong>{{ detectedStreet }}</strong> · </template
            >{{ detectedCity!.name }}
          </span>
        </div>

        <!-- Working from a stored copy. The date is the whole point: zones do get
             corrected, and someone looking at last week's map must know it is
             last week's — otherwise offline quietly turns into wrong. -->
        <div v-if="zonesFromCache" class="stale">
          <Icon name="alert" :size="15" />
          <div>
            <p class="stale-title">
              {{ online ? t("staleTitleOnline") : t("staleTitleOffline") }}
            </p>
            <p class="stale-sub">
              {{ zonesAsOf ? t("staleAge", { age: relTime(new Date(zonesAsOf).toISOString()) })
                           : t("staleAgeUnknown") }}
              {{ t("staleCheckSign") }}
            </p>
          </div>
        </div>

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
            <!-- Why pre-pay exists: the honest observation, framed as a tip
                 right under the button it explains — not manufactured urgency -->
            <p v-if="statusCanPrepay" class="free-prepay-tip">
              <Icon name="clock" :size="14" />
              <span
                ><strong>{{ t("tipLabel") }}:</strong>
                {{ t("prepayWhy", { start: nextWindow!.start }) }}</span
              >
            </p>
            <button type="button" class="free-browse-btn" @click="browseAnyway">
              {{ t("browseZones") }}
            </button>
          </div>
        </div>

        <!-- ═══ FULL DASHBOARD — paid now, or browsing while free ═══ -->
        <template v-else>
          <!-- Where is the car? Asked when the device cannot say: always on a
               laptop, and on a phone whose location failed or was refused. Above
               every answer, including "no paid parking there", so the place can
               always be changed. -->
          <template v-if="placeAsked">
            <!-- Until something is named: one question, the ways to answer it, and
                 nothing else asking to be read. -->
            <div v-if="asking" class="car-ask">
              <h2 class="car-step-title">{{ t("carWhereTitle") }}</h2>
              <p class="car-step-sub">{{ askSub }}</p>
            </div>
            <!-- Desktop: the street first, pinned under the nav for the whole panel,
                 since someone at a laptop knows the address. -->
            <div v-if="deskMode" ref="carSearchEl" class="car-search">
              <AddressZoneSearch
                class="car-step-search"
                pick-only
                :city-id="detectedCity?.id ?? expectCityId"
                :lock-city="detectedCity"
                :zones="allZones"
                :geojson="zoneBoundaries"
                @locate="onCarAddress"
              />
            </div>
            <template v-if="asking">
              <p v-if="deskMode" class="car-step-or"><span>{{ t("or") }}</span></p>
              <!-- The zones themselves, as the sign names them. Someone who does
                   not know the city cannot name the street, but can read the sign
                   next to the car. Picking one skips the map and the address. -->
              <div class="pay-step">
                <p class="car-zones-title">{{ t("zonesOnSign") }}</p>
                <div class="zone-alt car-zones">
                  <button
                    v-for="zone in payableZones"
                    :key="zone.id"
                    type="button"
                    class="zone-alt-row"
                    @click="selectZone(zone.name)"
                  >
                    <span class="zone-alt-stripe" :style="{ background: zone.color }" />
                    <span class="zone-alt-name">{{ zoneLabel(zone.name) }}</span>
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
                </div>
              </div>
              <p v-if="deskMode" class="car-step-map">
                {{ t("carWhereMap") }}
                <span class="car-step-arrow" aria-hidden="true">→</span>
              </p>
              <!-- Phone: the street second (a visitor rarely knows it), then the
                   map, then one more try at the location if it only timed out. -->
              <template v-else>
                <p class="car-step-or"><span>{{ t("or") }}</span></p>
                <div ref="carSearchEl" class="pay-step">
                  <AddressZoneSearch
                    class="car-step-search"
                    pick-only
                    :city-id="detectedCity?.id ?? expectCityId"
                    :lock-city="detectedCity"
                    :zones="allZones"
                    :geojson="zoneBoundaries"
                    @locate="onCarAddress"
                  />
                </div>
                <div class="car-ask-more">
                  <button type="button" class="np-btn" @click="openMap">
                    <Icon name="expand" :size="14" /> {{ t("carMapPick") }}
                  </button>
                  <button
                    v-if="fixFailure !== 'denied'"
                    type="button"
                    class="np-btn"
                    :disabled="detecting"
                    @click="retryLocation"
                  >
                    <Icon name="pin" :size="14" />
                    {{ detecting ? t("detecting") : t("retryLocation") }}
                  </button>
                </div>
              </template>
            </template>
          </template>
          <!-- Once named: what the answer below is about, and the way back. -->
          <div v-if="placeLine" class="pay-step car-step-set">
            <span class="car-step-pin"><Icon name="pin" :size="15" /></span>
            <span class="car-step-what">
              <span class="car-step-kicker">{{ placeLine.kicker }}</span>
              <strong class="car-step-label">{{ placeLine.label }}</strong>
            </span>
            <button type="button" class="car-step-change" @click="changePlace">
              {{ placeLine.action }}
            </button>
          </div>
          <!-- Geometry still loading — hold the verdict inside the frame the real
             zone card + slider will fill; never guess a zone to unsay -->
          <template v-if="!geoResolved && !asking">
            <div v-if="!user" class="pay-step" aria-busy="true">
              <div class="sk sk-plate" />
            </div>
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
                <span v-if="user && defaultPlate" class="sk sk-chip" />
              </div>
              <div class="sk sk-slider" />
            </div>
          </template>

          <!-- ═══ No paid parking here — the answer IS the screen; no zones to render ═══ -->
          <div v-else-if="noZoneHere" class="gps-noparking">
            <div class="np-main">
              <div class="np-icon"><Icon name="parking" :size="24" /></div>
              <div class="np-text">
                <p class="np-title">
                  {{ carPoint ? t("carNoParkingTitle") : t("noParkingTitle") }}
                </p>
                <p class="np-sub">
                  {{ carPoint ? t("carNoParkingSub") : t("noParkingSub") }}
                  <strong>~{{ formatDist(nearest!.distanceM) }}</strong>
                  {{ carPoint ? t("carAwayOn") : t("awayOn") }}
                  <span :style="{ color: zoneColor(nearest!.zoneName) }">{{
                    nearest!.zoneName
                  }}</span>
                  · {{ nearest!.streetName }}.
                </p>
              </div>
            </div>
            <!-- Desktop: the map is already beside this card, and nobody walks
                 to a sign with a laptop, so neither button has a job there. -->
            <div v-if="!deskMode" class="np-actions">
              <button type="button" class="np-btn np-btn-map" @click="openMap">
                <Icon name="expand" :size="14" /> {{ t("browseZones") }}
              </button>
              <button type="button" class="np-btn" @click="showScan = true">
                <Icon name="camera" :size="14" /> {{ t("scanContribute") }}
              </button>
            </div>
          </div>

          <!-- ═══ PAY SURFACE — one screen: zone → slide; plate is a chip once known ═══ -->
          <template v-else-if="!asking">
            <!-- First run only: no plate yet — the one moment it deserves the space -->
            <!-- Guests always type the plate in the open — exactly as on the
                 vehicle, capitals and diacritics included; no chip to unfold -->
            <div v-if="!user" class="pay-step">
              <PlateInput v-model="guestPlate" :camera="!deskMode" />
            </div>
            <div v-else-if="user && !defaultPlate" class="pay-step">
              <NuxtLink to="/profile" class="veh-add"
                >{{ t("addPlate") }} →</NuxtLink
              >
            </div>

            <!-- ── Zone — GPS's best guess as the hero; the sign decides ── -->
            <!-- ── On a boundary: no recommendation, just the candidates ── -->
            <!-- The app knows it is one of these and knows it cannot say which.
                 Both facts are shown: the shortlist is kept (it is real
                 information — it is not every zone in the city), and the choice
                 is handed to the only party standing at the sign. Each candidate
                 keeps its own slide, so refusing to guess never costs the driver
                 the ability to pay. -->
            <div v-if="atBoundary" class="pay-step">
              <div class="bnd">
                <div class="bnd-head">
                  <Icon name="alert" :size="18" />
                  <div>
                    <p class="bnd-title">{{ t("boundaryHere") }}</p>
                    <p class="bnd-why">{{ t("boundaryCheckSign") }}</p>
                  </div>
                </div>


                <div v-for="z in tiedZones" :key="z.name" class="bnd-zone">
                  <div class="bnd-zone-head" :style="{ borderColor: z.color }">
                    <span class="bnd-zone-dot" :style="{ background: z.color }" />
                    <span class="bnd-zone-name">{{ zoneLabel(z.name) }}</span>
                    <span class="bnd-zone-price">{{ z.price }}</span>
                    <span v-if="zoneLimits[z.name]?.label" class="bnd-zone-limit">
                      {{ zoneLimits[z.name]!.label }}
                    </span>
                  </div>
                  <SlideToConfirm
                    :key="'bnd-' + z.name"
                    :label="defaultPlate ? t('sendSms', { code: z.sms_shortcode }) : t('needPlateSlide')"
                    :done-label="t('openingSms')"
                    :color="z.color"
                    :disabled="!defaultPlate"
                    @confirm="pay(z)"
                    @blocked="goToPlate"
                  />
                </div>
              </div>
            </div>

            <div v-else-if="selectedZone" class="pay-step">
              <div
                class="zone-hero"
                :class="{
                  'zone-hero--free': freeNow,
                  'zone-hero--unsure': showUnsureBox,
                }"
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
                    <span class="zone-hero-name">{{ zoneLabel(selectedZone.name) }}</span>
                    <!-- Off the edge it is not "likely yours" — the badge would
                         be arguing with the warning right underneath it. -->
                    <span
                      v-if="
                        selectedZone.name === likelyZoneName &&
                        !unsure
                      "
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
                  <!-- Standing off the mapped edge, the guess is weak enough that
                       it leads rather than trails: a line under the price was too
                       easy to scroll past on the way to the slider. -->
                  <div v-if="showUnsureBox" class="zone-unsure">
                    <Icon name="alert" :size="17" />
                    <div>
                      <p class="zone-unsure-title">
                        {{
                          parkingState === 'edge'
                            ? t("edgeTitle")
                            : t("boundaryTitle", { dist: formatDist(nearest!.distanceM) })
                        }}
                      </p>
                      <!-- Where we can name the neighbouring zone and the distance
                           to it, say that instead of the generic line. "Plati ovu
                           zonu samo ako na tabli piše Blue Zone" is true but
                           vague; "Red Zone počinje 34 m odavde" tells the driver
                           which way to look. -->
                      <p v-if="claimNeighbourLine" class="zone-unsure-sub">
                        {{ claimNeighbourLine }}
                      </p>
                      <p v-else class="zone-unsure-sub">
                        {{ parkingState === 'edge' ? t("edgeSub") : t("boundarySub") }}
                        <strong>{{ zoneLabel(selectedZone.name) }}</strong
                        >.
                      </p>
                    </div>
                  </div>
                  <!-- The caveat is no longer permanent. It appears only when a
                       DIFFERENT zone is close enough to the GPS error to actually
                       be in play — about 30% of fixes in Novi Sad — and when it
                       appears it names that zone and the distance, so it is
                       information rather than wallpaper. A warning that shows on
                       every screen is one nobody reads on the screen that matters. -->
                  <p
                    v-if="claimNeighbourLine && !showUnsureBox"
                    class="zone-hero-check"
                  >
                    <Icon name="sign" :size="14" />
                    {{ claimNeighbourLine }}
                  </p>
                  <p v-else-if="spotNote" class="zone-hero-evidence">
                    {{ spotNote }}
                  </p>
                  <p v-else-if="claimEvidence" class="zone-hero-evidence">
                    {{ claimEvidence }}
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
                  <!-- The answer's last line: what not paying costs, and where
                       every number above was read and when. The source is the
                       only visible difference between a checked answer and a
                       confident one, so it sits on the card, not a scroll away. -->
                  <p v-if="ifUnpaidText || sourceInfo" class="zone-hero-foot">
                    <span v-if="ifUnpaidText">{{
                      t("ifUnpaidLine", { what: ifUnpaidText })
                    }}</span>
                    <a
                      v-if="sourceInfo"
                      :href="sourceInfo.url"
                      target="_blank"
                      rel="noopener"
                      >{{ sourceInfo.text }}</a
                    >
                  </p>
                </div>
              </div>
            </div>

            <!-- ── Pay — consequence first, then the gesture ── -->
            <!-- Suppressed on a boundary: the candidates above carry their own
                 slides, and a third one underneath would be the recommendation
                 we just refused to make. -->
            <div v-if="!atBoundary && payAction?.actionable" class="pay-step">
              <!-- Covered-until + the plate chip (accounts only — guests type the
               plate in the open above). At night the free-surface tip already
               explained the carry-over, so no consequence line repeats it here. -->
              <div
                v-if="(!nightPrepay && !dailyOffer) || (user && defaultPlate)"
                class="pay-summary"
              >
                <!-- With two ways to pay, each option card carries its own line. -->
                <span v-if="!nightPrepay && !dailyOffer" class="pay-until">
                  <strong>{{
                    t("coveredUntil", { time: coveredUntil })
                  }}</strong>
                  · {{ selectedZone.price }}
                </span>
                <button
                  v-if="user && defaultPlate"
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
              <!-- Chip open → the account's saved plates -->
              <div v-if="plateOpen && user && defaultPlate" class="veh-list">
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
              </div>

              <!-- Where the zone sells a daily ticket, the two ways to pay sit
                   side by side. Which is cheaper depends on how long the driver
                   stays, and only they know that; under the hourly slide it read
                   as fine print. One slide below sends whichever is chosen. -->
              <div
                v-if="dailyOffer"
                class="pay-choice"
                role="radiogroup"
                :aria-label="t('payChoiceLabel')"
                :style="{ '--opt-color': selectedZone.color }"
              >
                <button
                  v-for="opt in payOptions"
                  :key="opt.id"
                  type="button"
                  role="radio"
                  class="pay-opt"
                  :class="{ on: (opt.id === 'daily' ? payingDaily : !payingDaily) }"
                  :aria-checked="opt.id === 'daily' ? payingDaily : !payingDaily"
                  :disabled="opt.disabled"
                  @click="payProduct = opt.id"
                >
                  <span class="pay-opt-name">
                    <span class="pay-opt-radio" aria-hidden="true" />
                    {{ opt.name }}
                  </span>
                  <span class="pay-opt-price">{{ opt.price }}</span>
                  <span class="pay-opt-note">{{ opt.note }}</span>
                </button>
              </div>
              <!-- Night pre-pay: free now, the SMS carries over to the next window -->
              <div v-if="nightPrepay" class="prepay">
                <SlideToConfirm
                  :key="'pp-' + selectedZone.name"
                  :label="defaultPlate ? payLabel : t('needPlateSlide')"
                  :done-label="payDoneLabel"
                  :color="selectedZone.color"
                  :disabled="!defaultPlate"
                  @confirm="pay(selectedZone)"
                  @blocked="goToPlate"
                />
                <p v-if="defaultPlate" class="pay-note">
                  {{ t("slideConfirms") }} {{ payNote }}
                </p>
              </div>

              <!-- Paid hours: the slide IS the sign-confirmation -->
              <template v-else>
                <template v-if="!skipConfirm">
                  <SlideToConfirm
                    :key="selectedZone.name + '-' + payProduct"
                    :label="!defaultPlate ? t('needPlateSlide') : payingDaily ? dailyLabel : payLabel"
                    :done-label="payDoneLabel"
                    :color="selectedZone.color"
                    :disabled="!defaultPlate"
                    @confirm="payingDaily ? payDaily() : pay(selectedZone)"
                    @blocked="goToPlate"
                  />
                  <p v-if="defaultPlate" class="pay-note">
                    {{ t("slideConfirms") }} {{ payNote }}
                  </p>
                </template>
                <!-- Responsibility mode: fast tap, no per-pay confirm -->
                <button
                  v-else
                  type="button"
                  class="zone-act-btn"
                  :disabled="!defaultPlate"
                  :style="{
                    background: selectedZone.color,
                    color: inkOn(selectedZone.color),
                  }"
                  @click="payingDaily ? payDaily() : pay(selectedZone)"
                >
                  <span v-if="defaultPlate"
                    >{{
                      payingDaily
                        ? t("payDailyBtn")
                        : t("payZone", { zone: zoneLabel(selectedZone.name) })
                    }}
                    · {{ defaultPlate }}</span
                  >
                  <span v-else>{{
                    payingDaily
                      ? t("payDailyBtn")
                      : t("payZone", { zone: zoneLabel(selectedZone.name) })
                  }}</span>
                  <span
                    v-if="payingDaily ? dailyOffer : payAction?.label"
                    class="zone-act-arrow"
                    >→ {{ payingDaily ? dailyOffer!.target : payAction!.label }}</span
                  >
                </button>

                <p v-if="skipConfirm && !defaultPlate" class="pay-need-plate">
                  {{ t("needPlate") }}
                </p>
              </template>
            </div>

            <!-- Zone identified, but nothing here can take the payment. Say which
                 it is — a machine at the kerb is a different answer from a gap in
                 our data, and a driver can act on the first. -->
            <div
              v-else-if="selectedZone && payAction && !payAction.actionable"
              class="pay-step"
            >
              <div class="nopay">
                <Icon name="alert" :size="16" />
                <div>
                  <p class="nopay-title">
                    {{ payAction.reason === "kiosk" ? t("payKioskTitle") : t("payUnknownTitle") }}
                  </p>
                  <p class="nopay-sub">
                    {{ payAction.reason === "kiosk" ? t("payKioskSub") : t("payUnknownSub") }}
                  </p>
                </div>
              </div>
            </div>

            <!-- The SMS above only works from a domestic number. Said here, under the
                 slide, with the operator's own way to pay a foreign SIM can use —
                 the visitor it fails for has no other way of knowing. -->
            <a
              v-if="selectedZone && foreignSim && (atBoundary || payAction?.kind === 'sms')"
              :href="foreignSimHref"
              target="_blank"
              rel="noopener"
              class="foreign-sim"
            >
              <Icon name="phone" :size="16" />
              <span class="foreign-sim-text">{{ foreignSim.text[lang] }}</span>
              <span class="foreign-sim-go">{{ foreignSim.app }} →</span>
            </a>

            <!-- The one escape hatch, after the primary action: every other zone + tools -->
            <template v-if="selectedZone">
              <!-- Scan leads the row: the sign is the one answer better than
                   ours, and it used to sit a scroll below the fold. -->
              <div class="zone-next">
                <!-- Not on desktop: a laptop does not go to the sign. -->
                <button
                  v-if="!deskMode"
                  type="button"
                  class="zone-scan"
                  @click="showScan = true"
                >
                  <Icon name="camera" :size="16" /> {{ t("scanShort") }}
                </button>
                <button
                  type="button"
                  class="zone-wrong"
                  :aria-expanded="wrongZone"
                  @click="wrongZone = !wrongZone"
                >
                  <Icon name="sign" :size="15" /> {{ t("otherZones") }}
                  <span class="zone-wrong-chev">{{ wrongZone ? "▴" : "▾" }}</span>
                </button>
              </div>
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
                  <span class="zone-alt-name">{{ zoneLabel(zone.name) }}</span>
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
                    @click="showAi = true"
                  >
                    <Icon name="ai" :size="15" /> {{ t("askAiShort") }}
                  </button>
                </div>
              </div>
            </template> </template
          ><!-- /pay surface -->

          <!-- ═══ BELOW THE FOLD — the sign tools, one scroll past the pay job ═══ -->
          <!-- Where the place is asked, the same search already sits at the top,
               as "where is the car". -->
          <div v-if="!placeAsked" class="below-section">
            <p class="section-label">{{ t("addressTitle") }}</p>
            <p class="addr-sub">{{ t("addressSub") }}</p>
            <AddressZoneSearch
              :city-id="detectedCity?.id ?? expectCityId"
              :lock-city="detectedCity"
              :zones="allZones"
              :geojson="zoneBoundaries"
              @locate="onLocateAddress"
            />
          </div>

          <!-- The first-time explainer and the "nearest confirmed sign" card used
               to sit here. The explainer stays reachable from "Druga zona?" → Pitaj
               AI; the sign card could point a kilometre away, at a different street. -->
          <div v-if="relayPublic && !asking" class="below-section">
            <!-- Pay for me — the one case the pay surface above cannot serve:
                 a driver whose phone physically cannot send the message. Last
                 of the tools, because for most people here it is not the job. -->
            <NuxtLink v-if="relayPublic" to="/pay-for-me" class="ai-cta pfm-cta">
              <span class="ai-cta-icon"><Icon name="car" :size="20" /></span>
              <span class="ai-cta-text">
                <span class="ai-cta-title">{{ t("payForMeTitle") }}</span>
                <span class="ai-cta-sub">{{ t("payForMeSub") }}</span>
              </span>
              <span class="ai-cta-arrow">→</span>
            </NuxtLink>
          </div>
          <!-- /sign tools -->

          <!-- ═══ CITY INFO — reference & reassurance, never urgent ═══ -->
          <div v-if="!asking" class="below-section">
            <!-- Full weekly charging schedule (reference) -->
            <ParkingHours :city-id="detectedCity!.id" class="gps-hours" />

            <!-- Fine warning -->
            <!-- The answer card already says what not paying costs; this is the
                 longer version, so it opens on request instead of repeating the
                 card in a second red box. -->
            <details v-if="copy" class="gps-fine">
              <summary class="gps-fine-row">
                <span class="gps-fine-label">{{ t("fineIfUnpaid") }}</span>
                <span class="gps-fine-amount">{{ capFirst(copy.ifUnpaid[lang]) }}</span>
              </summary>
              <p class="gps-fine-more">{{ copy.ifUnpaidMore[lang] }}</p>
            </details>
            <div v-else-if="cityDetail.fine" class="gps-fine">
              <div class="gps-fine-row">
                <span class="gps-fine-label">{{ t("fineIfUnpaid") }}</span>
                <span class="gps-fine-amount">{{ cityDetail.fine }}</span>
              </div>
            </div>

            <!-- The full city guide: one quiet link at the end, rather than a link
                 competing with the street name at the top of the answer. -->
            <NuxtLink :to="`/${detectedCity!.id}`" class="city-guide-link">
              {{ t("fullGuideCity", { city: cityName(detectedCity!.id, detectedCity!.name) }) }} →
            </NuxtLink>
          </div>
          <!-- /city info --> </template
        ><!-- /full dashboard -->
        </div><!-- /gps-panel -->
      </div>

      <!-- Scan the sign — capture → read → confirm → pin + prefill pay -->
      <ClientOnly>
        <ScanSign
          v-if="showScan"
          :city-id="detectedCity!.id"
          :zones="allZones"
          :coords="deskMode ? carPoint : coords ?? carPoint"
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
          :can-scan="!deskMode"
          @scan="onAiScan"
          @close="showAi = false"
        />
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
        <div class="container" :class="{ 'gps-split': !freeSurface }">
          <div v-if="!freeSurface" class="gps-map-wrap">
            <div class="sk sk-map" />
          </div>
          <div class="gps-panel">
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
          <!-- Paid hours expected → plate + zone card + pay line + slider footprints -->
          <template v-else>
            <div v-if="!user" class="pay-step">
              <div class="sk sk-plate" />
            </div>
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
                <span v-if="user && defaultPlate" class="sk sk-chip" />
              </div>
              <div class="sk sk-slider" />
            </div>
          </template>
          </div><!-- /gps-panel -->
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
            <!-- A city we do not cover: say so, show no numbers, and hand over
                 the operator's own site when we know it. An AI-written summary
                 used to stand here; unverified prices are exactly what Kerb
                 exists not to show. -->
            <template v-if="unsupportedCity">
              <p class="gps-error-sub">{{ t("uncoveredSub") }}</p>
              <a
                v-if="unsupportedUrl"
                :href="unsupportedUrl"
                target="_blank"
                rel="noopener"
                class="gps-ai-help"
                >{{ t("uncoveredOfficial") }}</a
              >
            </template>
          </div>

          <!-- First visit: the browser's location prompt is earned by a button that
               says what the location is for, instead of firing cold on page load.
               Also the retry after a timeout — a denied permission or an
               uncovered city gets nothing from asking again. -->
          <div
            v-if="!detecting && (askLocation || (gpsError && !gpsDenied && !unsupportedCity))"
            class="find-zone fade-up-3"
          >
            <button type="button" class="find-zone-btn" @click="startDetect">
              <Icon name="pin" :size="17" /> {{ t("findMyZone") }}
            </button>
            <p class="find-zone-why">{{ t("findMyZoneWhy") }}</p>
          </div>

          <!-- Search -->
          <!-- Quiet while "Nađi moju zonu" is on screen: one yellow action, not two
               near-identical ones side by side. -->
          <div
            class="search-outer fade-up-3"
            :class="{ 'search-outer--quiet': askLocation }"
          >
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
            <span v-for="(s, i) in stats" :key="i">
              <span v-if="i > 0" class="meta-sep">·</span>
              <strong v-if="s.val">{{ s.val }}</strong> {{ s.label }}
            </span>
          </div>
        </div>
      </section>
    </template>

    <!-- ── CITY STRIP + CITIES + HOW IT WORKS + CTA (hidden in GPS mode: the city is known) ── -->
    <div v-if="!gpsMode" class="mkt" :class="{ 'mkt-off': gpsSkeleton }">
      <!-- ── CITY STRIP ── -->
      <div v-if="stripItems.length >= 3" class="city-strip">
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
              <p class="section-label">{{ t("citiesLabel") }}</p>
              <h2>{{ t("citiesTitle") }}</h2>
            </div>
            <NuxtLink to="/cities" class="view-all">{{ t("citiesAll") }}</NuxtLink>
          </div>

          <div v-if="pending" class="cities-grid">
            <div v-for="i in 2" :key="i" class="skeleton" />
          </div>
          <div v-else-if="error" class="error-msg">
            {{ t("citiesFail") }}
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
            <p class="section-label">{{ t("howLabel") }}</p>
            <h2>{{ t("howTitle") }}</h2>
            <p class="section-sub">{{ t("howSub") }}</p>
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
              <p class="section-label">{{ t("ctaLabel") }}</p>
              <h2>{{ t("ctaTitle") }}</h2>
              <p class="cta-sub">{{ t("ctaSub") }}</p>
            </div>
            <div class="cta-actions">
              <button class="btn-primary" @click="scrollToTop">
                {{ t("ctaSearch") }}
              </button>
              <NuxtLink to="/contribute" class="btn-ghost">{{
                t("ctaContribute")
              }}</NuxtLink>
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
const { t, lang, zoneLabel, cityName } = useLang();
const { public: pub } = useRuntimeConfig();
// Pay-for-me needs a person on call and holds guests' money; off until both are
// settled (runtimeConfig.public.relayPublic).
const relayPublic = !!pub.relayPublic;
// Payment density is synthesised until real pings are stored; a simulated layer
// has no place in front of the public, labelled or not.
const showHeatTool = false;
const capFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

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
  setCityWithoutFix,
  detectedCity,
  detectedStreet,
  coords,
  detecting,
  gpsError,
  gpsDenied,
  suggestedZoneName,
  unsupportedCity,
  unsupportedUrl,
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
// Desktop split: the map sits beside the panel instead of above it. Read in JS
// rather than only CSS because the map's mode (locked thumbnail vs. pan/zoom
// with tap-to-pay) is a prop. Set on mount: the dashboard never prerenders.
const wideLayout = ref(false);
const finePointer = ref(false);
let wideQuery: MediaQueryList | null = null;
let fineQuery: MediaQueryList | null = null;
const syncWide = () => {
  wideLayout.value = !!wideQuery?.matches;
  finePointer.value = !!fineQuery?.matches;
};
onMounted(() => {
  wideQuery = window.matchMedia("(min-width: 1024px)");
  fineQuery = window.matchMedia("(pointer: fine)");
  syncWide();
  wideQuery.addEventListener("change", syncWide);
  fineQuery.addEventListener("change", syncWide);
});
onUnmounted(() => {
  wideQuery?.removeEventListener("change", syncWide);
  fineQuery?.removeEventListener("change", syncWide);
});

// ── Desktop: where is the car? ────────────────────────────────────────────────
// A laptop has no GPS: it places itself from nearby Wi-Fi (20–100 m in a city) or
// from its IP address (a district, or the whole city). And even a perfect fix
// would answer the wrong question, because the laptop is where someone is
// sitting, not where they left the car. So on a wide screen with a mouse the
// device position only settles the city, and the pay panel starts from a place
// the driver names: a street they search, or a zone they tap on the map.
//
// That place stands in for the GPS fix everywhere a zone is worked out — nearest
// segment, boundary ties, the edge warning — so an address on a zone line still
// gets the two-zone answer rather than a confident pick.
//
// A phone asks the same question when its location failed or was refused: the
// dashboard opens on the city anyway, with every zone to pick from. And a spot
// tapped on the map ("Kola su ovde") outranks the phone's own fix, which is where
// the driver is standing, not necessarily where the car is.
const deskMode = computed(() => wideLayout.value && finePointer.value);
const placeAsked = computed(() => deskMode.value || !coords.value);
const carPoint = ref<{ lat: number; lng: number; accuracy: number; label: string } | null>(null);
const zoneCoords = computed(
  () => carPoint.value ?? (deskMode.value ? null : coords.value),
);
// The blue dot is only drawn when it means something. On a laptop it is usually
// tens of metres out, and it reads as "your car is here".
const LAPTOP_DOT_MAX_M = 50;
const hideDeskDot = computed(
  () =>
    !coords.value ||
    (deskMode.value && (coords.value.accuracy ?? Infinity) > LAPTOP_DOT_MAX_M),
);
// Where the map starts. Without a position (desktop that could not place itself)
// it starts on the city; the dot is hidden then, so nothing is drawn there.
const mapCenter = computed(() => {
  const c = coords.value;
  if (c) return c;
  const mid = cityCenter(detectedCity.value?.id) ?? { lat: 45.2551, lng: 19.8452 };
  return { ...mid, accuracy: Infinity };
});
// On a wide screen the map is already on screen; opening the fullscreen copy
// would only cover the panel it is meant to sit beside.
const openMap = () => {
  if (!wideLayout.value) mapExpanded.value = true;
};
// ── When to ask for the location ─────────────────────────────────────────────
// A cold browser prompt on page load, before the page has said what it is, is
// the prompt people refuse — and a refusal can only be undone in the browser's
// settings. So a first visit asks with a button that says what the location is
// for. Anyone who already allowed it, or has used Kerb here before, goes straight
// through. Where the Permissions API is missing, the old behaviour stands.
const askLocation = ref(false);
const startDetect = () => {
  askLocation.value = false;
  detectCity().then(openCityWithoutFix);
};
const decideLocation = async () => {
  let state: PermissionState | null = null;
  try {
    state = (await navigator.permissions?.query({ name: "geolocation" }))?.state ?? null;
  } catch {}
  // Desktop does not need a position to work, so it never prompts: it opens the
  // city at once (see openCityWithoutFix) and uses a fix only if one is allowed.
  if (deskMode.value) {
    openCityWithoutFix(null);
    if (state === "granted") detectCity();
    return;
  }
  let returning = false;
  try {
    returning = !!localStorage.getItem(EXPECT_GPS_KEY);
  } catch {}
  if (state === "prompt" && !returning) {
    askLocation.value = true;
    return;
  }
  startDetect();
};

// A device that could not place itself — timed out, denied, no Wi-Fi positioning.
// On desktop its position would only have chosen the city anyway. On a phone it
// would have chosen the zone too, and without it the old answer was an error on
// the marketing page. Either way: open the city it last used, or the only one we
// publish, and let the panel ask where the car is, with every zone to pick from.
// A city we do not cover keeps its honest "not covered" answer, and a phone that
// has a position but no city (somewhere we cannot name) is not moved to ours.
const fixFailure = ref<"denied" | "failed" | null>(null);
const openCityWithoutFix = async (found: unknown) => {
  if (found || unsupportedCity.value) return;
  if (!deskMode.value) {
    if (coords.value) return;
    fixFailure.value = gpsDenied.value ? "denied" : "failed";
  }
  let id: string | null = null;
  try {
    id = localStorage.getItem(EXPECT_GPS_KEY);
  } catch {}
  if (!id) {
    const live = String(useRuntimeConfig().public.liveCities ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && x !== "*");
    if (live.length === 1) id = live[0]!;
  }
  if (id) await setCityWithoutFix(id);
};
// The phone's second chance, from inside the dashboard: a timeout is often just a
// cold GPS. A refusal is not retried; only the browser's settings can undo it.
const retryLocation = () => {
  fixFailure.value = null;
  startDetect();
};
const showScan = ref(false); // scan-the-sign modal
const showAi = ref(false); // ask-AI resolver panel
const signReports = ref<any[]>([]); // confirmed sign scans → map pins

// ── Payment density ──────────────────────────────────────────────────────────
// Loaded on first toggle, never on mount: it is an optional secondary layer, and
// the fullscreen map already has enough to do when it opens. `payHeatDemo` is true
// while the cells are synthesised — the UI says so, because an invented layer that
// doesn't announce itself is exactly the thing this app refuses to ship.
const { cells: payCells, demo: payHeatDemo, load: loadPayHeat } = usePayHeat();
const showHeat = ref(false);
const heatLoaded = ref(false);

const toggleHeat = async () => {
  showHeat.value = !showHeat.value;
  if (!showHeat.value || heatLoaded.value) return;
  heatLoaded.value = true;
  const city = detectedCity.value?.id ?? expectCityId.value;
  if (!city) return;
  // 10k users' worth of simulated pings, so the layer is visible before any of it
  // is real. Drop the third argument once pings are actually persisted.
  await loadPayHeat(city, zoneBoundaries.value, 10000);
};
const { loadForCity: loadSignReports } = useSignScan();

// Time-aware hours — drives free-now desaturation + the night pre-pay path.
// Falls back to the remembered city so the pre-GPS skeleton already knows which
// shape is coming (free surface vs. pay dashboard); schedules are static data.
const {
  paidNow,
  nextWindow,
  status: hoursStatus,
} = useParkingHours(
  () => detectedCity.value?.id ?? expectCityId.value,
  () => selectedZone.value?.name
);
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
  () => freeNow.value && !forceBrowse.value
);
const browseAnyway = () => {
  forceBrowse.value = true;
};
const statusToPrepay = () => {
  forceBrowse.value = true;
};

// Lock body scroll + close on Escape while the fullscreen map is open
watch(mapExpanded, (open) => {
  if (import.meta.server) return;
  document.body.style.overflow = open ? "hidden" : "";
  if (!open) {
    leadSignPoint.value = null; // and the lead-to-sign pointer
    searchPin.value = null; // and any searched address
    searchZones.value = null;
    searchCityName.value = null;
  }
});
// Escape closes the fullscreen map.
// (ScanSign / AskAi / CityHelp handle their own Escape via useDialogBehavior.)
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;
  mapExpanded.value = false;
};
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
// What this SMS actually buys. 60 minutes OF CHARGING — so paying at 20:47 covers
// you to 07:47 tomorrow, not 21:47 tonight. When that lands on another day the
// clock alone would be ambiguous, so the day is spelled out.
const coveredUntil = computed(() => {
  const sched = getSchedule(detectedCity.value?.id, selectedZone.value?.name);
  const limit = parseLimitMin(selectedZone.value?.rules);
  const until = paidExpiry(nowTick.value, limit ? Math.min(60, limit) : 60, sched);
  const tz = sched?.timezone;
  const clock = new Date(until).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const dayOf = (ms: number) =>
    new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
  if (dayOf(until) === dayOf(nowTick.value)) return clock;
  if (dayOf(until) === dayOf(nowTick.value + 86_400_000))
    return `${clock} ${t("tomorrow")}`;
  // Further out (Sat afternoon banks into Monday) — name the day, in city time.
  const wd = new Date(until).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: tz,
  });
  return `${clock} ${dayWord(wd)}`;
});

// ── Plate chip picker — all saved plates, switchable without leaving the flow ──
const profilePlates = computed<any[]>(() => userProfile.value?.plates ?? []);
const plateOpen = ref(false);
const chosenPlate = ref<string | null>(null); // per-visit override of the default plate
const choosePlate = (p: string) => {
  chosenPlate.value = p;
  plateOpen.value = false;
};

// What pays is what the screen shows. A guest sees the plate field, so a guest
// pays with the plate field and nothing else — reaching past it into a profile
// is how a signed-out driver ended up paying for a car they no longer own.
const defaultPlate = computed(() => {
  if (!user.value) {
    return guestPlate.value.trim() ? guestPlate.value.trim().toUpperCase() : null;
  }
  if (chosenPlate.value) return chosenPlate.value;
  return (
    (profilePlates.value.find((p: any) => p.is_default) ?? profilePlates.value[0])
      ?.plate ?? null
  );
});

// Geometry-based detection: distance to the nearest paid-parking segment.
const { nearest, zoneDistances } = useNearestParking(zoneCoords, zoneBoundaries);

// ── Fix trail ────────────────────────────────────────────────────────────────
// Every position update is kept for the session so that when someone pays we can
// use the fix from when they OPENED the app rather than the one from the moment
// they swiped — by then they have usually walked away from the car, in a
// direction, which is an error no amount of data averages out. See useParkFix.
const { record: recordFix, carFix } = useParkFix();
watch(
  coords,
  (c) => recordFix(c),
  { immediate: true },
);

// ── The two claims ───────────────────────────────────────────────────────────
// "This block is the Blue zone" and "you are standing in it" are different
// statements with different futures: the first gets stronger as scans and
// payments accumulate, the second never improves, because GPS never improves.
// Hedging them together meant one caveat that read the same at one source and at
// four — so drivers learned to skip it. See app/utils/zoneClaim.js.
//
// Measured over 200 random points in Novi Sad: ~70% of fixes have no neighbouring
// zone anywhere near the error circle. At those the honest UI is SILENCE, not
// reassurance — which is why this drives whether the caveat renders at all.
const zoneClaimNow = computed(() => {
  const c = zoneCoords.value;
  if (!c || !zoneBoundaries.value) return null;
  return zoneClaim({
    point: [c.lng, c.lat],
    accuracy: c.accuracy ?? 25,
    geo: zoneBoundaries.value,
    signs: signReports.value,
    pays: payCells.value,
  });
});
const claimLevel = computed(() => zoneClaimNow.value?.you.level ?? "none");
// The one sentence worth showing: which OTHER zone is in play and how far away.
// Null at `quiet`, which is ~70% of fixes — there the honest UI is silence, not
// reassurance. Null at `loud` too: that fix never reaches this card, because the
// boundary surface takes over and offers both zones with their own slides, which
// is a better answer than any sentence.
const claimNeighbourLine = computed(() => {
  const c = zoneClaimNow.value;
  if (!c || c.you.level !== "normal" || !c.you.nearestOther) return null;
  return claimLines(c, zoneLabel, t, { car: !!carPoint.value }).you;
});
// Evidence folded into the provenance line rather than given a row of its own —
// more sources must not cost more screen.
const claimEvidence = computed(() => {
  const e = zoneClaimNow.value?.place?.evidence;
  if (!e) return null;
  const bits: string[] = [];
  if (e.scans)
    bits.push(e.scans === 1 ? t("claimEvidenceScan1") : t("claimEvidenceScans", { n: e.scans }));
  if (e.payers >= 5) bits.push(t("claimEvidencePays"));
  return bits.length ? bits.join(" · ") : null;
});

// ── On the boundary ───────────────────────────────────────────────────────────
// At a corner two zones meet, and the nearest segment of each can be metres — or
// centimetres — apart. At Trg neznanog junaka they are 22.4 m and 22.3 m away:
// the app used to pick the first, badge it "likely yours", and offer a slide, on
// a margin no phone on earth can measure. It was confidently right half the time.
//
// So the margin is measured against the accuracy of the fix that produced it,
// floored at 15 m — even a clean urban fix is worth about that, and the geometry
// is not sharper. Anything inside that margin is a tie, and a tie is not a guess
// to be dressed up: it is an answer the app does not have.
// Ten metres is about two parking spaces, and it is the floor our own drawing
// supports: the polygons are traced off the official cadastre sheet and are not
// themselves accurate to better than a car length. Twenty was four to eight
// spaces — wide enough that standing squarely inside a zone would read as doubt.
// There is no ceiling: a phone reporting ±35 m gets a 35 m margin, because then
// we really do not know.
const BOUNDARY_FLOOR_M = 10;
const tiedZones = computed(() => {
  const ds = zoneDistances.value;
  if (ds.length < 2 || parkingState.value === "none") return [];
  const margin = Math.max(zoneCoords.value?.accuracy ?? 0, BOUNDARY_FLOOR_M);
  // One disc, radius r, centred on the driver: every zone it touches is a zone
  // they might be standing in. Distance to the ZONE, which is zero inside it —
  // so three metres inside the Blue line with Red beginning there puts Red at
  // three metres and Blue at zero, and both are candidates. Three metres outside
  // gives the same pair. The symmetry falls out of the disc; it does not need a
  // rule of its own.
  //
  // An earlier version compared the two nearest distances instead. That called a
  // point 22 m from Blue and 22 m from Red a boundary, when the honest answer is
  // that it is on neither — a tie between two things that are both far away is
  // not a close call.
  // Two ways to be unsure, and they catch different mistakes:
  //
  //   near   — the zone is inside the disc, so the driver could be standing in it
  //   level  — the two nearest zones are the same distance away, so whichever
  //            side of the line they are on, we cannot say which
  //
  // The first alone let a point 22 m from Blue and 22 m from Red fall through to
  // a confident "Blue, likely yours": neither was inside a 20 m disc, so nothing
  // was flagged, and being equidistant between them counted for nothing.
  const level = ds[0]!.distanceM;
  const tied = ds.filter(
    (d) => d.distanceM <= margin || d.distanceM - level <= BOUNDARY_FLOOR_M,
  );
  if (tied.length < 2) return [];
  // Ordered the way the city orders its own zones, never by distance — distance
  // is precisely the thing we have just declared unreliable here.
  const order = allZones.value.map((z: any) => z.name);
  return tied
    .map((d) => allZones.value.find((z: any) => z.name === d.zoneName))
    .filter(Boolean)
    .sort((a: any, b: any) => order.indexOf(a.name) - order.indexOf(b.name));
});

// Once the driver picks a zone themselves, the tie is settled — by the only
// party standing at the sign.
const atBoundary = computed(() => !userPickedZone.value && tiedZones.value.length > 1);


// When a city's zone geometry is only coarsely traced (no official vector cadastre),
// the dashboard flags it: GPS proximity here is a hint, never a claim.
const { tier: dashTier } = useCityTier(() => detectedCity.value?.id);
const mapApprox = computed(() => dashTier.value === "cadastre_approx");

// The map draws the geometry as published, full stop. Confirmed scans used to
// recolour segments they disagreed with; that is gone, because it repainted the
// wrong street every time it mattered. A scan at a corner sat within the 25 m
// radius of BOTH streets meeting there, and the vote counted scans without ever
// weighing distance — so two reds at a kerb outvoted the blue sign standing on
// the perpendicular street, and the segment was then labelled "✓ sign-confirmed".
// Corners are where zones change, so it failed exactly where it was needed.
//
// The scans are still on the map as pins, which is the honest form of that
// evidence: someone stood here and saw this sign. Turning a pin into a verdict
// about a street needs rules this had none of — nearest segment only, street
// name agreement, a clear margin over the nearest segment of another zone, and
// votes weighted by distance rather than counted.
const displayZones = computed(() => zoneBoundaries.value);

// on  = standing on a paid street · near = just off one · none = no paid parking
// "on" used to mean within 25 m of a zone, which let the app claim a zone while
// the blue dot sat visibly outside its polygon — a driver on Modene was told
// "Extra Zone, likely yours" from a good ten metres beyond the orange.
//
// Being confident now takes being INSIDE, with room to spare. The polygons are
// already drawn a little wider than the bays they cover, so five metres of margin
// is not much to ask, and it is roughly one parking space: closer to the line
// than that and a phone can put you on the other side of it.
//
// Everything between that and the far threshold is "near" — which the hero card
// already knows how to show: no "likely yours" badge, and the edge warning leads
// instead of trailing the price.
// Three answers, and a fourth for "there is no paid parking around here at all":
//
//   on    — inside the zone with more than 5 m to its line. It is yours.
//   edge  — within 5 m of the line, inside OR outside. The band is symmetric
//           because a phone off by ten metres puts you on either side of it.
//   near  — more than 5 m outside, but a zone is still close. Probably not in it;
//           the sign decides.
//   none  — nothing within reach; the calm "parking here is likely free" card.
const INSIDE_MARGIN_M = 5;

const parkingState = computed<"on" | "edge" | "near" | "none" | null>(() => {
  const n = nearest.value;
  if (!n) return null;
  const acc = zoneCoords.value?.accuracy ?? 0;
  const onT = Math.min(Math.max(25, acc), 60);
  const nearT = Math.max(75, onT + 50);
  // Line geometry is a street centreline with no inside, and the kerb is half a
  // road width off it by construction — so those keep the distance rule.
  const here = zoneDistances.value.find((d) => d.zoneName === n.zoneName);
  if (here?.line) {
    // A centreline has no inside, and the kerb is half a road width off it by
    // construction — so those keep the distance rule they were built for.
    if (n.distanceM <= onT) return "on";
    return n.distanceM <= nearT ? "near" : "none";
  }
  if (here && here.edgeM <= INSIDE_MARGIN_M) return "edge";
  if (here?.inside) return "on";
  if (n.distanceM <= nearT) return "near";
  return "none";
});

// Inside the zone but close to its line. Different from standing off the zone
// entirely, and it has to say so: "you are not on the zone" is simply false when
// you are, and a driver who reads that while parked correctly stops believing
// the next warning too.
const unsure = computed(
  () => parkingState.value === "edge" || parkingState.value === "near",
);

// `unsure` measures the wrong risk to raise an alarm about. It is true whenever
// the driver is near the edge of ANY lot — which in Novi Sad is most of the time,
// because the lots are narrow strips. Measured over 20 random points: the amber
// box fired at 13 of them, and at 11 there was no other zone within 100 m. A
// warning that common is one nobody reads.
//
// What it measures — "you may not be on a paid bay" — is real, but its cost is an
// unnecessary payment, never a fine. So it keeps the wording and loses the alarm.
// The alarm belongs to the only risk that costs money: a DIFFERENT zone close
// enough to the GPS error to be in play. That is what claimLevel tracks.
const showUnsureBox = computed(
  () => unsure.value && claimLevel.value !== "quiet",
);
// The quiet version: same information, no amber, no icon, no box.
const spotNote = computed(() => {
  const c = zoneClaimNow.value;
  if (!c || !unsure.value || claimLevel.value !== "quiet") return null;
  return claimLines(c, zoneLabel, t, { car: !!carPoint.value }).spot ?? null;
});

// No paid parking where the user stands (with geometry to back it) — the wizard
// yields to a calm "you're fine here" card; zones would only contradict it.
// Once the user explicitly taps/scans/AI-picks a zone, stop auto-following the
// likely guess. Before that, the selection must track likelyZoneName — otherwise
// the early fallback (first zone, while GPS is still resolving) sticks and the
// open card disagrees with the "likely yours" tag.
const userPickedZone = ref(false);

// GPS says you are standing outside every zone — the answer IS the screen, and
// the pay wizard is replaced wholesale.
//
// Unless the user has said otherwise. Tapping a zone on the map and choosing to
// pay it is exactly the case GPS gets wrong: parked inside the zone, placed 145 m
// out of it. An explicit pick outranks the guess here for the same reason a
// scanned sign does. The watch below hands control back to GPS the moment it has
// something new to say, so this cannot strand someone on a pay card in a street
// where parking is free.
const noZoneHere = computed(
  () => parkingState.value === "none" && !!nearest.value && !userPickedZone.value
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
    return parkingState.value !== "none"
      ? nearest.value.zoneName
      : null;
  }
  // The street-name match comes from the device's own reverse-geocode, which on a
  // desktop is the laptop's street, and once a car is placed is not the car's.
  return deskMode.value || carPoint.value ? null : suggestedZoneName.value;
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
      // The number as well as the label: the boundary card needs to compare caps
      // across zones, and comparing "MAX 120 MIN" as a string is not comparing.
      maxMin: Number(cap[1]),
      label: `MAX ${cap[1]} MIN`,
      note: rules.slice(cap[0].length).trim(),
    };
  const free = /^\s*no time limit\.?\s*/i.exec(rules);
  if (free)
    return {
      cap: false,
      maxMin: null,
      label: t("noLimit"),
      note: rules.slice(free[0].length).trim(),
    };
  return { cap: false, maxMin: null, label: "", note: rules };
};
// Parsed limit per zone, keyed by name — drives the inline chip + the fine print.
const zoneLimits = computed<Record<string, ReturnType<typeof limitOf>>>(() => {
  const m: Record<string, ReturnType<typeof limitOf>> = {};
  for (const z of allZones.value) {
    const l = limitOf(z.rules);
    // The checked copy, in the reader's language, replaces the registry's
    // English prose; the cap itself still comes from the registry row.
    const note = copy.value?.zoneNotes[z.name]?.[lang.value];
    m[z.name] = l && note ? { ...l, note: fillFromZone(note, z) } : l;
  }
  return m;
});

// The checked, bilingual copy for this city (app/utils/cityCopy.ts), if any.
const copy = computed(() => cityCopy(cityDetail.value?.id));
const ifUnpaidText = computed(() => copy.value?.ifUnpaid[lang.value] ?? null);
const foreignSim = computed(() => copy.value?.foreignSim ?? null);
// The store the phone in hand uses; the operator's page for anything else.
const foreignSimHref = computed(() => {
  const f = foreignSim.value;
  if (!f) return undefined;
  if (!import.meta.client) return f.info;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return f.ios;
  if (/Android/i.test(ua)) return f.android;
  return f.info;
});
const sourceInfo = computed(() => {
  const c = copy.value;
  if (c)
    return {
      url: c.source.url,
      text: t("sourceLine", {
        source: c.source.name,
        date: fmtCheckedOn(c.checkedOn, lang.value),
      }),
    };
  const url: string | undefined = cityDetail.value?.official_url;
  if (!url) return null;
  return {
    url,
    text: t("sourceLine", {
      source: url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
      date: cityDetail.value?.last_updated ?? "",
    }),
  };
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
// Counted once per visit: the moment the driver was first shown an answer, and
// which kind — a zone, or the refusal to pick one at a boundary.
let zoneCounted = false;
watch(selectedZone, (z) => {
  if (!z || zoneCounted) return;
  zoneCounted = true;
  track("Zone shown", {
    city: detectedCity.value?.id ?? "unknown",
    answer: atBoundary.value ? "boundary" : parkingState.value ?? "unknown",
  });
});

// A session already running in the zone on screen. Paying again here is not a
// new parking — it is the same "one more hour" the session card's Extend sends,
// only mislabelled as a fresh payment. With skip-confirm on it is a single tap,
// and Kerb cannot see whether the SMS landed, so the only thing standing between
// the user and a second billed message is not offering the button twice.
const selectZone = (name: string) => {
  selectedZoneName.value = name;
  userPickedZone.value = true;
  wrongZone.value = false; // picking from the escape hatch promotes it to the hero
};

// Tapping a zone on the map and hitting Pay is the same act as picking one from
// the "Wrong zone?" list — a spatial version of the escape hatch. It selects and
// closes the map; the plate and the slide are still ahead, so nothing is billed
// on the strength of where a finger landed on a polygon.
// Where the driver tapped, kept after the map closes. Unlike searchPin — which is
// an address they looked up and is cleared on close — this is the subject of the
// pay card now on screen, so the small map has to travel to it. Leaving it on the
// GPS fix put "pay Red Zone" directly under a picture of the driver standing in
// Blue, and a card that argues with the map above it is not one anybody trusts.
const pickedZonePin = ref<{ lat: number; lng: number; label?: string } | null>(null);

const onPayZone = async (pick: { zone: string; lat: number; lng: number }) => {
  // The tapped spot becomes where the car is, on a phone as on a laptop: the
  // button says "Kola su ovde". Let the zone watch settle on the new place first,
  // so the explicit pick below is the last word, not undone.
  carPoint.value = { lat: pick.lat, lng: pick.lng, accuracy: BOUNDARY_FLOOR_M, label: "" };
  await nextTick();
  selectZone(pick.zone);
  pickedZonePin.value = { lat: pick.lat, lng: pick.lng, label: pick.zone };
  mapExpanded.value = false;
};

// A searched street on desktop: that is where the car is. Accuracy is the
// geocoder's — a house number lands on the building, not the kerb in front of it.
const onCarAddress = (hit: any) => {
  carPoint.value = { lat: hit.lat, lng: hit.lng, accuracy: 15, label: hit.label };
};
// The search is already on screen; "change" just puts the cursor in it.
const carSearchEl = ref<HTMLElement | null>(null);
const focusCarSearch = () => {
  carSearchEl.value?.querySelector<HTMLInputElement>("input")?.focus();
};
// What to call the place: the searched address, else the street the tap landed on.
const carLabel = computed(
  () => carPoint.value?.label || nearest.value?.streetName || t("carOnMap"),
);
const mapPin = computed(() => {
  const c = carPoint.value;
  if (c) return { lat: c.lat, lng: c.lng, label: carLabel.value };
  return deskMode.value ? null : searchPin.value ?? pickedZonePin.value;
});

// Nothing named yet: the device cannot say where the car is, and the driver has
// not said either (no street, no spot on the map, no zone off the sign). Until
// then the panel shows the question and nothing that would put a price on it.
const asking = computed(
  () => placeAsked.value && !carPoint.value && !userPickedZone.value,
);
// Every zone a payment can be made in: the list a driver standing at the car
// picks from, by the colour and name on the sign.
const payableZones = computed(() =>
  allZones.value.filter((z: any) => payActionFor(z).kind !== "none"),
);
const askSub = computed(() => {
  if (deskMode.value) return t("carWhereSub");
  return fixFailure.value === "denied" ? t("carWhereSubDenied") : t("carWhereSubFailed");
});
// Once named, one quiet line says what the answer below is about, with the way
// back. A phone that has its own fix goes back to it; otherwise back to asking.
const placeLine = computed(() => {
  if (carPoint.value)
    return {
      kicker: t("carIsAt"),
      label: carLabel.value,
      action: placeAsked.value ? t("carChange") : t("useMyLocation"),
    };
  if (placeAsked.value && userPickedZone.value && selectedZone.value)
    return {
      kicker: t("zonePickedKicker"),
      label: zoneLabel(selectedZone.value.name),
      action: t("carChange"),
    };
  return null;
});
const changePlace = async () => {
  carPoint.value = null;
  userPickedZone.value = false;
  pickedZonePin.value = null;
  if (placeAsked.value) selectedZoneName.value = null;
  if (deskMode.value) {
    await nextTick();
    focusCarSearch();
  }
};

// Follow the likely zone until the user picks; afterwards only repair invalid picks.
// The zones[0] fallback is only honest AFTER geometry has settled — before that it
// painted a confident wrong hero that the real verdict then swapped out from under
// the user. While unresolved, null keeps the wizard on its "checking" line instead.
watch(
  [likelyZoneName, allZones, geoResolved, placeAsked, carPoint],
  (cur, prev) => {
    // Driving into a different zone — or out of one — is new information, and it
    // retires whatever the user picked earlier. Without this, one tap on the map
    // would pin the wizard to that zone for the rest of the session, still
    // offering to charge for it in a street that turns out to be free.
    // `prev` is undefined on the immediate run, which is not a change.
    if (prev && cur[0] !== prev[0]) {
      userPickedZone.value = false;
      pickedZonePin.value = null;
    }

    const valid = allZones.value.some(
      (z: any) => z.name === selectedZoneName.value
    );
    if (!userPickedZone.value || !valid) {
      // With no place named yet (a laptop, or a phone without a fix) there is no
      // zone to show at all; the first-zone fallback would put a price on a place
      // nobody has named.
      selectedZoneName.value =
        likelyZoneName.value ??
        (geoResolved.value && !placeAsked.value ? allZones.value[0]?.name ?? null : null);
    }
  },
  { immediate: true }
);

// A tapped lead-to-sign point, else the nearest paid segment.
const leadSignPoint = ref<{ lat: number; lng: number } | null>(null);
const highlightPoint = computed(() => {
  // The pointer is a line from the blue dot. On desktop the dot is the laptop, and
  // once the car is placed the dot is not the car.
  if (deskMode.value || carPoint.value) return null;
  if (leadSignPoint.value) return leadSignPoint.value;
  return parkingState.value !== "on"
    ? nearest.value?.point ?? null
    : null;
});

// A slide pressed with no plate: take the driver to the one thing missing.
const goToPlate = () => {
  const el = document.querySelector<HTMLElement>(".plate-input, .veh-add");
  if (!el) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  // After the press has finished: the tap on the track would otherwise move
  // focus straight back off the field.
  setTimeout(() => el.focus({ preventScroll: true }), 0);
};

// ── SMS handoff ────────────────────────────────────────────────────────────────
// Open the composer, and stop. Kerb never learns whether the message was sent,
// what it cost, or when the hour really began — the operator's reply is the
// receipt and its own warning before expiry is the reminder. Recording a session
// here would be recording a guess, and dressing a guess as a record is the one
// thing this app does not do.
const pay = (zone: any) => {
  // No plate, no payment. The SMS is nothing but the plate — sending it without
  // one buys the driver an unpaid hour they believe is paid, which is the exact
  // fine this app exists to prevent. The surfaces above disable themselves, but
  // the scan flow reaches this function by another route.
  if (!defaultPlate.value || !import.meta.client) return;

  // Where the car is, not where the phone is. This is the position that will be
  // aggregated into the payment-density layer once pings are persisted — and the
  // one worth offering as the parked-car pin, since it is the only moment the app
  // knows a car was just left somewhere.
  const at = carFix();
  if (at && import.meta.dev)
    console.info(
      `[Kerb] pay fix: ${at.source} · walked ${Math.round(at.walkM)} m since opening · ±${Math.round(at.accuracy)} m`,
    );

  const a = payActionFor(zone, { plate: defaultPlate.value });
  if (a.actionable) {
    track("SMS opened", {
      city: detectedCity.value?.id ?? "unknown",
      zone: zone?.name ?? "unknown",
      boundary: atBoundary.value,
    });
    openPayAction(a);
  }
};

// A searched address drops a pin on the expanded map, the same way a scanned
// sign or a parked car does — nothing about the pay flow changes, since the
// driver is not standing there.
const searchPin = ref<{ lat: number; lng: number; label?: string } | null>(null);
// The searched city's own map, so flying to Belgrade does not land on Novi Sad's
// geometry — which would show a pin over blank ground and quietly imply there is
// no paid parking there.
const searchZones = ref<any>(null);
const searchCityName = ref<string | null>(null);
const onLocateAddress = (hit: any) => {
  // A searched address is not "nearest parking from here" — it can be in another
  // city entirely, so it gets its own pin and the map travels to it, rather than
  // a dashed connector back to a blue dot 80 km away.
  searchPin.value = { lat: hit.lat, lng: hit.lng, label: hit.label };
  searchZones.value = hit.geojson?.features?.length ? hit.geojson : null;
  searchCityName.value = hit.detail?.split(' · ').pop() || null;
  leadSignPoint.value = null;
  openMap();
};

// ── Ask AI — deterministic candidate-set zone resolver ─────────────────────────
// Resolves against the same geometry the map draws, so the AI never contradicts
// what the user is looking at (sign-first logic is independent of this).
const { verdict: aiVerdict } = useZoneResolver(
  zoneCoords,
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

// ── how this zone is paid ─────────────────────────────────────────────────────
// Asked, not assumed. The surface used to key off sms_shortcode, which quietly
// meant "Serbia only" — and left Belgrade, which has zones and prices but no
// shortcode, with a screen that identified the zone and then offered nothing.
// ── Daily ticket ──────────────────────────────────────────────────────────────
// The zone defines the product (Blue and White: 95 RSD → 8215); the geometry says
// which lots our map lists as selling it — nine of Novi Sad's 262 segments.
//
// Offered only on a lot that sells it — the whole White zone, a handful of Blue
// lots — and there as an equal second way to pay, not a footnote: a driver staying
// three hours on a daily lot was paying 150 RSD for something that costs 95. The
// rest of the Blue zone does not sell it, so there is no daily option there at
// all; offering it "if the extra sign says so" put a choice on screen that, on
// nearly every Blue street, is not one.
const zoneDaily = computed(() => {
  const z: any = selectedZone.value;
  return z?.daily_amount && z?.daily_target
    ? {
        amount: Number(z.daily_amount),
        target: String(z.daily_target),
        currency: z.price_currency || "RSD",
      }
    : null;
});
// A zone whose every lot sells it (White, in Novi Sad) offers it wherever the car
// is, including when the zone was picked off the sign with no position at all.
// Blue sells it only on marked lots, so there it still takes the lot.
const dailyEverywhere = computed(() => {
  const name = selectedZone.value?.name;
  const lots = (zoneBoundaries.value?.features ?? []).filter(
    (f: any) => f.properties?.zone === name,
  );
  return lots.length > 0 && lots.every((f: any) => f.properties?.daily === true);
});
// Edge counts as on the lot: within five metres of its line is still that lot.
const dailyListed = computed(
  () =>
    !!(
      zoneDaily.value &&
      (dailyEverywhere.value ||
        (nearest.value?.daily &&
          (parkingState.value === "on" || parkingState.value === "edge") &&
          selectedZone.value?.name === nearest.value.zoneName))
    ),
);
// Not at a boundary: those candidates carry their own slides, and a daily choice
// inside a refusal to pick the zone would be a pick by another name.
const dailyOffer = computed(() =>
  zoneDaily.value && dailyListed.value && !atBoundary.value && payAction.value?.kind === "sms"
    ? zoneDaily.value
    : null,
);
const payProduct = ref<"hourly" | "daily">("hourly");
// Outside charging hours only the hourly carries over to the next window — what a
// daily bought tonight covers is not something we know — so the daily is shown,
// with when it can be bought, but not offered.
const payingDaily = computed(
  () => payProduct.value === "daily" && !!dailyOffer.value && !nightPrepay.value,
);
// A different zone is a different product line; start again from the hourly.
watch(
  () => selectedZone.value?.name,
  () => {
    payProduct.value = "hourly";
  },
);
const dailyLabel = computed(() => {
  const d = dailyOffer.value;
  return d
    ? t("dailySend", { amount: `${d.amount} ${d.currency}`, code: d.target })
    : "";
});
const payOptions = computed(() => {
  const z: any = selectedZone.value;
  const d = dailyOffer.value;
  if (!z || !d) return [];
  const later = nightPrepay.value && nextWindow.value;
  return [
    {
      id: "hourly" as const,
      name: t("payHourly"),
      price: z.price,
      note: t("coveredUntil", { time: coveredUntil.value }),
      disabled: false,
    },
    {
      id: "daily" as const,
      name: t("payDailyOpt"),
      price: `${d.amount} ${d.currency}`,
      note: later
        ? t("dailyFrom", {
            when: `${dayWord(nextWindow.value!.dayLabel)} ${nextWindow.value!.start}`,
          })
        : dailyFromHours.value
          ? t("dailyFromShort", { hours: dailyFromHours.value })
          : t("dailyOnePay"),
      disabled: !!later,
    },
  ];
});

// From which hour the daily is the cheaper answer. Rounded up, because the hour
// you are part-way through is an hour you have paid for.
const dailyFromHours = computed(() => {
  const z: any = selectedZone.value;
  const perHour = z?.price_amount;
  if (!perHour || !z?.daily_amount) return null;
  return Math.ceil(z.daily_amount / perHour);
});

// Paying the daily is the same SMS to a different shortcode.
const payDaily = () => {
  const z: any = selectedZone.value;
  if (!z?.daily_target) return;
  pay({ ...z, sms_shortcode: z.daily_target });
};

const payAction = computed(() =>
  selectedZone.value
    ? payActionFor(selectedZone.value, { plate: defaultPlate.value })
    : null
);
const payLabel = computed(() => {
  const a = payAction.value;
  if (!a) return "";
  return a.kind === "app"
    ? t("openApp", { app: a.label ?? t("theApp") })
    : t("sendSms", { code: a.label ?? "" });
});
const payDoneLabel = computed(() =>
  payAction.value?.kind === "app" ? t("openingApp") : t("openingSms")
);
const payNote = computed(() =>
  payAction.value?.kind === "app" ? t("appToOperator") : t("smsToOperator")
);

watch(detectedCity, async (city) => {
  if (!city) return;
  geoResolved.value = false;
  loadingCityDetail.value = true;
  try {
    cityDetail.value = await getCity(city.id);
  } catch {
    // Offline this throws after Supabase exhausts its retries. Without a catch the
    // whole handler aborted here and the geometry below never loaded — so the app
    // knew the city from cache and still showed its marketing page. The cached
    // zones are picked up by loadZoneGeometry instead.
    cityDetail.value = null;
  } finally {
    loadingCityDetail.value = false;
  }

  // Load signs + geometry together so the pins and the streets land in the same
  // paint rather than one after the other.
  try {
    const [geo, reports] = await Promise.all([
      loadZoneGeometry(city.id),
      loadSignReports(city.id),
    ]);
    signReports.value = reports;
    if (geo) zoneBoundaries.value = geo;
  } finally {
    geoResolved.value = true; // a failed fetch must still release the verdict UI
  }
  watchLiveZones(city.id);
});

// ── zone geometry: live row first, committed file second ──────────────────────
const db = useSupabaseClient<any>();
// A corrected boundary has to reach drivers without waiting for a deploy, so the
// database holds the live copy. The file stays the fallback: an empty table, an
// unreachable database or a bad write must never leave someone with no map.
// Offline state, so a stale answer is dated rather than passed off as current.
const { online } = useOnlineState();
const zonesFromCache = ref(false);
const zonesAsOf = ref<number | null>(null);

const loadZoneGeometry = async (cityId: string) => {
  let geojson: any = null;
  let updatedAt: string | null = null;
  try {
    const { data } = await db
      .from("city_zones")
      .select("geojson, updated_at")
      .eq("city_id", cityId)
      .maybeSingle();
    if (data?.geojson?.features?.length) {
      geojson = data.geojson;
      updatedAt = data.updated_at ?? null;
    }
  } catch {
    // not migrated yet, or offline — fall through
  }
  if (!geojson) {
    // The service worker answers this from its own copy when the network is
    // down, so a successful fetch is NOT proof of being online.
    geojson = await fetch(`/zones/${cityId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }

  const reallyOnline = !import.meta.client || navigator.onLine;
  if (geojson?.features?.length && reallyOnline) {
    zonesFromCache.value = false;
    zonesAsOf.value = Date.now();
    saveCity({
      cityId, geojson, zones: cityDetail.value?.zones ?? [],
      city: detectedCity.value, fetchedAt: Date.now(), updatedAt,
    });
    return geojson;
  }

  // Offline: use what we kept, and remember when we took it.
  const cached = await loadCity(cityId);
  if (cached?.geojson?.features?.length) {
    zonesFromCache.value = true;
    zonesAsOf.value = cached.fetchedAt;
    // Prices and shortcodes come from Supabase too, so they are cached with it —
    // a zone name with no price is a worse answer than a dated one.
    if (!cityDetail.value?.zones?.length && cached.zones?.length) {
      // Prices, rules and shortcodes live in Supabase, so they are cached beside
      // the geometry — a zone name with no price is a worse answer than a dated one.
      cityDetail.value = {
        ...(cached.city ?? {}), ...(cityDetail.value ?? {}), zones: cached.zones,
      } as any;
    }
    return cached.geojson;
  }
  if (geojson?.features?.length) {
    zonesFromCache.value = true;
    zonesAsOf.value = null; // came from the SW copy, which we never dated
  }
  return geojson;
};

// An open tab swaps geometry the moment the row changes, so a fix lands on the
// screen of someone already standing at the kerb.
let liveZones: any = null;
const watchLiveZones = (cityId: string) => {
  if (!import.meta.client) return;
  liveZones?.unsubscribe();
  liveZones = db
    .channel(`city_zones:${cityId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "city_zones", filter: `city_id=eq.${cityId}` },
      (payload: any) => {
        const fc = payload.new?.geojson;
        if (fc?.features?.length) zoneBoundaries.value = fc;
      }
    )
    .subscribe();
};
onUnmounted(() => liveZones?.unsubscribe());

// Dev extra: the editor also broadcasts on save, which lands instantly in a
// local tab without waiting on the realtime round trip.
if (import.meta.dev && import.meta.client && "BroadcastChannel" in window) {
  const bc = new BroadcastChannel("kerb-zones");
  bc.onmessage = (e) => {
    const { city, fc } = e.data ?? {};
    if (!city || city !== detectedCity.value?.id || !fc?.features) return;
    zoneBoundaries.value = fc;
    geoResolved.value = true;
  };
  onUnmounted(() => bc.close());
}

// A new confirmed scan: pin it immediately and make it the selected pay zone.
const onSignSubmitted = (report: any) => {
  signReports.value = [report, ...signReports.value];
  track("Sign scanned", { city: report?.city_id ?? "unknown" });
  // Let the server compare the sign with the registry and wake whoever keeps the
  // map if they disagree. Fire-and-forget: the driver's answer never waits on it.
  if (report?.id)
    $fetch("/api/sign-alert", { method: "POST", body: { id: report.id } }).catch(
      () => {}
    );
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

// Signing out has to empty the profile too. Left behind, it kept feeding the pay
// path a plate from an account nobody is signed into — the field showed its
// placeholder while the SMS carried the old plate, which is the one mismatch this
// screen must never have.
watch(user, (u) => {
  if (!u) {
    userProfile.value = null;
    chosenPlate.value = null;
  }
});

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

// Honest stats only — the cities we publish and the date their rules were last
// checked. A count ("1 city · 1 country") says less than the name and the date.
const stats = computed(() => {
  const list = (cities.value ?? []) as any[];
  const out: { val: string; label: string }[] = list.map((c) => ({
    val: c.name,
    label: "",
  }));
  const checked = list
    .map((c) => cityCopy(c.id)?.checkedOn)
    .filter(Boolean)
    .sort()[0];
  if (checked)
    out.push({
      val: "",
      label: t("statVerified", { date: fmtCheckedOn(checked, lang.value) }),
    });
  return out;
});

// Ticker shows only real cities that have a page — no ghost entries.
const stripItems = computed(() =>
  ((cities.value ?? []) as any[]).map((c) => ({
    city: `${c.flag} ${c.name}`,
    detail: c.country,
  }))
);

// A real sequence, so the numbers carry information.
const steps = computed(() => [
  { num: "01", title: t("how1Title"), body: t("how1Body") },
  { num: "02", title: t("how2Title"), body: t("how2Body") },
  { num: "03", title: t("how3Title"), body: t("how3Body") },
]);

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
  // Offline needs the shell cached, which needs the worker registered for
  // everyone — not only for people who turned notifications on.
  ensureServiceWorker();
  decideLocation();

  // Reveal only what is still below the fold. Content used to be hidden until an
  // observer fired, so link previews, crawlers and any screenshot that did not
  // scroll got a blank page; now it is visible by default and only an element
  // the reader has not reached yet is armed to fade in.
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
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
  document.querySelectorAll(".reveal").forEach((el) => {
    if (reduceMotion || el.getBoundingClientRect().top < window.innerHeight)
      return;
    el.classList.add("reveal-armed");
    obs.observe(el);
  });
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

const siteUrl = String(pub.siteUrl || "").replace(/\/$/, "");
useSeoMeta({
  title: "Kerb — ulično parkiranje, konačno jasno",
  description:
    "Zona, cena, do kad si pokriven i kako se plaća u Novom Sadu — iz zvaničnih izvora, sa datumom provere. Tabla pored auta ima poslednju reč.",
  ogTitle: "Kerb — ulično parkiranje, konačno jasno",
  ogDescription:
    "Zona, cena, do kad si pokriven i kako se plaća u Novom Sadu — iz zvaničnih izvora, sa datumom provere.",
  ogUrl: `${siteUrl}/`,
  ogImage: `${siteUrl}/icon-512.png`,
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
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.gps-error-sub {
  margin: 0 0 12px;
  line-height: 1.5;
}
.gps-ai-help {
  text-decoration: none;
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
.search-outer--quiet .search-btn {
  color: var(--text);
  background: var(--bg3);
}
.search-outer--quiet .search-btn:hover {
  background: var(--bg4);
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

/* Desktop split. The panel keeps the phone-width column it was designed in, on
   the left where reading starts; the map takes the rest and stays put while the
   panel scrolls. 57px is the fixed nav; 1300px matches its .container-wide, so
   the panel lines up under the logo. */
@media (min-width: 1024px) {
  .hero-gps .container.gps-split {
    max-width: 1300px;
    display: grid;
    grid-template-columns: minmax(380px, 440px) minmax(0, 1fr);
    column-gap: 28px;
    align-items: start;
  }
  .gps-split .gps-panel {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }
  .gps-split .gps-map-wrap {
    grid-column: 2;
    grid-row: 1;
    position: sticky;
    top: calc(57px + 16px);
    height: calc(100vh - 57px - 32px);
    height: calc(100dvh - 57px - 32px);
    min-height: 480px;
    border: 1px solid var(--border);
  }
  .gps-split .gps-map-wrap .sk-map {
    height: 100%;
    border-radius: 0;
  }
  /* The map is already big and interactive here; these only opened a copy of it. */
  .gps-split .map-expand-btn,
  .gps-split .np-btn-map {
    display: none;
  }
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
/* Layer tools. The payment layer is opt-in and says when it is simulated — a
   density field that doesn't announce its source is indistinguishable from one
   we invented. */
.map-fs-tools {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 9px 16px 10px;
  border-bottom: 1px solid var(--border);
}
.heat-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1.5px solid var(--border2);
  background: var(--bg2);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.heat-toggle[aria-pressed="true"] {
  border-color: #8f66c2;
  color: var(--text);
}
.heat-swatch {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle, #6b3ba3 0%, #b79ad9 65%, rgba(183, 154, 217, 0) 100%);
}
.heat-demo {
  font-size: 11.5px;
  color: var(--amber);
  line-height: 1.35;
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
  /* An option, not the answer: the answer on this screen is "no need to pay",
     so nothing here gets the brand's loudest fill. */
  padding: 13px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  background: var(--bg2);
  border: 1.5px solid var(--text2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms;
}
.free-prepay-btn:hover {
  border-color: var(--text);
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
.free-prepay-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
  text-align: left;
  text-wrap: pretty;
}
.free-prepay-tip svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--muted);
}
.free-prepay-tip strong {
  color: var(--text);
  font-weight: 700;
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
/* Under the slide: only for the visitor the SMS fails for, so it stays quiet —
   a neutral row, the way out named on the right. */
.foreign-sim {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: -4px 0 14px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text2);
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  text-decoration: none;
  transition: border-color 150ms;
}
.foreign-sim:hover {
  border-color: var(--blue-border);
}
.foreign-sim:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.foreign-sim :deep(svg) {
  flex-shrink: 0;
  color: var(--muted);
}
.foreign-sim-text {
  flex: 1;
  min-width: 0;
}
.foreign-sim-go {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--blue);
}

/* Desktop "where is your car?" — the first question, then a quiet line once answered */
/* The first question is the loudest thing in the panel, and its search field the
   heaviest control: everything else on desktop waits until it is answered. */
.car-ask {
  margin-top: 8px;
}
/* Pinned under the nav for the length of the panel; the page shows through
   nowhere, so the strip carries the page background. */
.car-search {
  position: sticky;
  top: 57px;
  z-index: 20;
  margin: 0 -4px 12px;
  padding: 8px 4px 6px;
  background: var(--bg);
}
.car-step-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--text);
  text-wrap: balance;
}
.car-step-sub {
  margin: 4px 0 14px;
  font-size: 14px;
  color: var(--muted);
}
.car-step-search :deep(.azs-field) {
  border: 2px solid var(--text);
  box-shadow: var(--shadow-sm);
}
.car-step-search :deep(.azs-field:focus-within) {
  border-color: var(--blue);
}
.car-step-search :deep(.azs-input) {
  padding: 14px 0;
  font-size: 16px;
}
.car-step-or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 12px;
  font-size: 12px;
  color: var(--muted);
}
.car-step-or::before,
.car-step-or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border2);
}
/* An instruction, not a control: it points at the map, where the clicking happens. */
.car-step-map {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  border: 1px dashed var(--border2);
  border-radius: var(--r-md);
}
.car-step-arrow {
  font-size: 18px;
  line-height: 1;
  color: var(--blue);
}
/* The zones as the sign names them: the first answer on a phone without a fix. */
.car-zones-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.car-zones {
  margin-top: 10px;
}
/* The map and the location retry: secondary to the list and the street, side by
   side, in the panel's neutral border rather than the free card's green. */
.car-ask-more {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.car-ask-more .np-btn {
  border-color: var(--border);
}
.car-ask-more .np-btn:hover {
  border-color: var(--border2);
}
.car-ask-more .np-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* On the map: the same question, where the eye lands. Not clickable itself. */
.map-ask {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 500;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 15px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--on-accent);
  background: var(--accent);
  border-radius: 999px;
  box-shadow: var(--shadow-md);
  pointer-events: none;
  transform: translateX(-50%);
  animation: map-ask-in 220ms var(--ease-out) both;
}
@keyframes map-ask-in {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .map-ask { animation: none; }
}
.car-step-set {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.car-step-pin {
  flex-shrink: 0;
  display: flex;
  color: var(--red);
}
.car-step-what {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.car-step-kicker {
  font-size: 12px;
  color: var(--muted);
}
.car-step-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.car-step-change {
  flex-shrink: 0;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  transition: background 150ms, border-color 150ms;
}
.car-step-change:hover {
  background: var(--blue-bg);
  border-color: var(--blue-border);
}
.car-step-change:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
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
/* Evidence rides quietly under the price when there is no warning to give. */
.zone-hero-evidence {
  font-size: 11.5px;
  color: var(--muted);
  letter-spacing: 0.1px;
}
.zone-hero-body .zone-pick-approx {
  margin-top: 10px;
}
/* Consequence + provenance: two short facts on one quiet line, wrapping on
   narrow phones. 13px with --text2 keeps AA in sunlight; the link is the source. */
.zone-hero-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text2);
}
.zone-hero-foot a {
  color: var(--text2);
  text-decoration: underline;
  text-decoration-color: var(--border2);
  text-underline-offset: 3px;
}
.zone-hero-foot a:hover {
  color: var(--blue);
}

/* Off the mapped edge: calm the card so its confidence matches the evidence,
   and let the warning lead the body instead of trailing the price. */
.zone-hero--unsure {
  filter: saturate(0.72);
}
.zone-unsure {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  padding: 11px 12px;
  background: var(--amber-bg);
  border: 1.5px solid var(--amber-border);
  border-radius: var(--r-md);
  color: var(--amber);
}
.zone-unsure svg {
  flex-shrink: 0;
  margin-top: 1px;
}
.zone-unsure-title {
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 3px;
}
.zone-unsure-sub {
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
}
.zone-unsure-sub strong {
  color: var(--text);
  font-weight: 700;
}

/* Scan the sign + the other zones, side by side under the slide */
.zone-next {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.zone-next > * {
  flex: 1 1 0;
  min-width: 0;
}
.zone-scan {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 12px 14px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  background: var(--bg2);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color 150ms var(--ease-out);
}
.zone-scan:hover {
  border-color: var(--text2);
}
.zone-scan:focus-visible,
.zone-wrong:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
/* The one escape hatch — wrong zone opens every alternative + the tools */
.zone-wrong {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 48px;
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
.addr-sub {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
  margin: -4px 0 10px;
}

/* Offline / stale-data banner — sits above everything the data feeds */
.stale {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  padding: 11px 13px;
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  border-radius: var(--r-md);
  color: var(--amber);
}
.stale svg { flex-shrink: 0; margin-top: 1px; }
.stale-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.stale-sub { font-size: 12px; color: var(--muted); line-height: 1.5; }

/* Expiry reminder switch — sits under the running hour. Deliberately quiet:
   it is a convenience, not the job, and it must never outshout the countdown. */
.remind {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: -8px 0 20px;
  padding: 11px 13px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.remind-icon {
  display: flex;
  flex-shrink: 0;
  color: var(--muted2);
}
.remind-text { flex: 1; min-width: 0; }
.remind-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
.remind-sub { font-size: 12px; color: var(--muted); line-height: 1.45; }
.remind-btn {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text2);
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 150ms, color 150ms, border-color 150ms;
}
.remind-btn:hover { color: var(--text); border-color: var(--text2); }
.remind-btn.on {
  color: var(--green);
  background: var(--green-bg);
  border-color: var(--green-border);
}
.remind-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }

/* No payment route from here — an honest dead end, not a broken button */
.nopay {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  border-radius: var(--r-md);
  color: var(--amber);
}
.nopay svg { flex-shrink: 0; margin-top: 1px; }
.nopay-title { font-size: 13.5px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
.nopay-sub { font-size: 12.5px; color: var(--muted); line-height: 1.5; }

/* Already-running notice — states the fact and stays out of the way. Deliberately
   not a button: the session card above owns every action for this zone. */
.covered {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--green);
}
.covered svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.covered-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 3px;
}
.covered-sub {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
}
.covered-resend {
  margin-top: 7px;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}
.covered-resend:hover {
  color: var(--blue-hover);
}

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
.pfm-cta {
  text-decoration: none;
  color: inherit;
}

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
/* Why the slide won't move, said where the eye already is. */
/* On a boundary — the shortlist, not a verdict. Deliberately not styled like the
   hero card: it must not read as "here is your zone, in a different colour". */
.bnd {
  padding: 14px;
  background: #FEF6E7;
  border: 1px solid #F0D9A8;
  border-radius: var(--r-md);
}
.bnd-head { display: flex; gap: 10px; align-items: flex-start; color: #8A5A00; }
.bnd-title { font-size: 15px; font-weight: 700; color: var(--text); line-height: 1.35; }
.bnd-why { margin-top: 3px; font-size: 13px; color: #8A5A00; line-height: 1.5; }
.bnd-zone { margin-top: 8px; }
.bnd-zone-head {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  padding: 0 2px 7px;
}
.bnd-zone-dot { width: 10px; height: 10px; border-radius: 50%; align-self: center; }
.bnd-zone-name { font-size: 14px; font-weight: 700; color: var(--text); }
.bnd-zone-price { font-size: 13px; font-weight: 600; color: var(--text2); font-family: var(--font-mono, monospace); }
.bnd-zone-limit {
  margin-left: auto; font-size: 11px; letter-spacing: 0.04em;
  color: var(--muted); font-family: var(--font-mono, monospace);
}
/* The daily ticket — an alternative, not an upgrade. Kept visually quieter than
   the hourly slide above it, because under two hours it is the worse buy. */
/* Hourly or daily: two equal options above one slide. The chosen one takes the
   zone's colour, and its radio fills, so the state is never colour alone. */
.pay-choice {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.pay-opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  text-align: left;
  background: var(--bg2);
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
  transition: border-color 150ms, background-color 150ms;
}
.pay-opt:hover:not(:disabled) {
  border-color: var(--border2);
}
/* Shown so the option is known to exist, with when it opens; not selectable yet. */
.pay-opt:disabled {
  cursor: not-allowed;
  background: var(--bg);
  border-style: dashed;
}
.pay-opt:disabled .pay-opt-name,
.pay-opt:disabled .pay-opt-price {
  color: var(--muted);
}
.pay-opt.on {
  border-color: var(--opt-color);
  background: color-mix(in srgb, var(--opt-color) 9%, var(--bg2));
}
.pay-opt:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.pay-opt-name {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.pay-opt-radio {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: 2px solid var(--border2);
  border-radius: 50%;
  transition: border-color 150ms, box-shadow 150ms;
}
.pay-opt.on .pay-opt-radio {
  border-color: var(--text);
  box-shadow: inset 0 0 0 2.5px var(--bg2), inset 0 0 0 7px var(--text);
}
.pay-opt-price {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
}
.pay-opt-note {
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
}
@media (prefers-reduced-motion: reduce) {
  .pay-opt,
  .pay-opt-radio {
    transition: none;
  }
}
.pay-need-plate {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text2);
  text-align: center;
  line-height: 1.4;
  font-weight: 500;
}
.zone-act-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.city-guide-link {
  display: inline-block;
  margin-top: 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--blue);
}
.city-guide-link:hover {
  color: var(--blue-hover);
}

/* Fine warning */
.gps-fine {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 14px;
}
details.gps-fine > summary {
  cursor: pointer;
  list-style: none;
}
details.gps-fine > summary::-webkit-details-marker {
  display: none;
}
details.gps-fine > summary::after {
  content: "▾";
  margin-left: 6px;
  color: var(--muted);
}
details.gps-fine[open] > summary::after {
  content: "▴";
}
details.gps-fine > summary:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.gps-fine-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.gps-fine-more {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text2);
}
.gps-fine-label {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.gps-fine-amount {
  font-size: 16px;
  font-weight: 700;
  color: var(--red);
  text-align: right;
}

/* Detecting state */
/* First-visit location ask: the hero's one action, with its reason under it */
.find-zone {
  max-width: 560px;
  margin-bottom: 20px;
}
.find-zone-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 24px;
  font-size: 16px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--accent);
  border: none;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
  transition: background 150ms;
}
.find-zone-btn:hover {
  background: var(--accent-hover);
}
.find-zone-btn:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.find-zone-why {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
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
.sk-plate {
  height: 92px;
  border-radius: var(--r-md);
} /* PlateInput + hint */
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

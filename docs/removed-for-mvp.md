# What the MVP trim removed, and how to get it back

Everything below worked when it was removed. None of it was cut because it was
broken — it was cut because the first MVP answers one question (*does anyone open
Kerb to find out where they may park?*) and every extra surface makes that answer
harder to read.

**Restore point: tag `pre-mvp-trim`** (commit `7a695c4`). The whole app as it stood
with all of this present:

```bash
git show pre-mvp-trim:app/components/FineCheck.vue > app/components/FineCheck.vue
git diff pre-mvp-trim -- app/pages/index.vue     # everything the dashboard lost
git checkout pre-mvp-trim -- <path>              # bring a whole file back
```

---

## Deleted files

| File | What it did | Why it went |
|---|---|---|
| `netlify/functions/parking-reminders.mts` | Scheduled every minute; found sessions ~10 min from expiry and sent web push | The operator already warns 5 minutes before expiry, on both SMS and its own app. Also had an unbounded-growth bug: sessions with no zone limit never got `limit_reminder_sent_at`, so they matched the query forever and were re-processed every 60 seconds. Fix if restored: add a `started_at > now - 24h` cutoff. |
| `server/api/fine-check.get.ts` | Proxied `portal.parkingns.rs/portal/auth/checkPPK` — public plate → outstanding fines | Pulled until it is clear whether querying that endpoint from a server is within JKP's terms. **If restored, remove the `Origin: https://portal.parkingns.rs` header first** — it claims the request came from their own site, and it sits badly next to the honest `KerbBot/1.0` user agent right above it. |
| `app/components/FineCheck.vue` | The plate-check UI on the dashboard | Orphaned by the above |
| `app/composables/useFineCheck.ts` | Its state/fetch layer | Orphaned by the above |

## Removed from `app/pages/index.vue` (~350 lines)

- **Session card** (`SessionCard`) — the running hour, countdown, extend, find-my-car
- **Armed night pre-pay card** — a session scheduled for the next paid window
- **Expiry reminder switch** — the device-local alarm toggle, offered to guests too
- **"Did you send the SMS?" sheet** — the prompt that turned a tap into a recorded
  guest session (`pendingPay`, `showSentPrompt`, `armSentPrompt`, `onSentYes/No`)
- **"Already running here"** card and its *resend the SMS* button (`coveredHere`)
- **Recent sessions** history list
- **Guest → account nudge** — it promised session tracking, an expiry reminder and
  fine alerts, and all three had just been removed
- **Session wiring** — `useParkingSession` / `useGuestSession` instances,
  `displaySession`, `displayRemaining`, `displayAtLimit`, `displayCanExtend`,
  `sessionPayload`, `guestPayload`, `onPay`, `onExtend`, `onEndSession`,
  `onLocateCar`, `locateCar`, `pastSessions`

`pay()` now does one thing: open the SMS composer with the plate filled in. It
records nothing, because there is nothing it can honestly record — the web cannot
see whether the message was sent, what it cost, or when the hour really began.

## Changed rather than removed

- `hasParked` (which gates the add-to-home-screen offer) used to mean *has a
  session*; it now means *has a saved plate* — the furthest anyone gets into the
  pay flow before Kerb hands them to the operator.
- Links to `/sessions` removed from `TheNav` and `profile.vue`. **The page itself
  still exists** and still compiles; nothing writes sessions any more, so it would
  always be empty. Restore the links, not the page, if sessions come back.
- `useAspCalendar` now checks a small allow-list before fetching, so Serbian city
  pages stop logging a 404 for a calendar that was never going to exist.

## Kept in the tree, deliberately unused

Not deleted, because removing working code is work and risk, and none of it costs
anything while nothing calls it:

- `app/composables/useLocalReminders.ts` — offline alarms in IndexedDB, fired by
  whichever of page or service worker is awake
- the alarm half of `public/sw.js` — `drainAlarms`, the `sync`/`periodicsync`/
  `message` listeners, and the throttled drain on every `fetch`
- `app/composables/useParkingSession.ts`, `app/pages/sessions.vue`,
  `app/components/SessionCard.vue`
- `app/composables/useGuestSession.ts` — **this one must stay regardless**: it
  exports `GUEST_PLATE_KEY`, which `useAuth.signOut()` uses to carry the account's
  plate down to the guest field

## If any of this comes back

The reason each was removed is more useful than the code:

- **Reminders** only earn their place if the operator's own 5-minute warning turns
  out not to reach people — worth asking a real user before rebuilding.
- **Fine check** is the one feature people would plausibly pay for, which is
  exactly why the terms question has to be settled before it returns, not after.
- **Sessions** were the "memory" moat in the June strategy. If they return, they
  should return as what they honestly are — *you told us you paid at 14:20* — and
  not as a receipt for something Kerb never witnessed.

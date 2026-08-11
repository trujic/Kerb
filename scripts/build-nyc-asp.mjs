// ── NEW YORK ALTERNATE SIDE PARKING CALENDAR ──────────────────────────────────
// Turns the city's own published .ics into the small JSON the app reads.
//
//   Source: NYC DOT — Alternate Side Parking Suspensions
//           https://www.nyc.gov/html/dot/html/motorist/alternate-side-parking.shtml
//           calendar: /html/dot/downloads/misc/2026-alternate-side.ics
//
// Two kinds of suspension day, and confusing them is what gets people ticketed:
//
//   * a MAJOR LEGAL HOLIDAY suspends street cleaning AND the meters
//   * every other suspension day suspends street cleaning ONLY — the city writes
//     "Parking meters will be in effect" into the day's own description
//
// So the flag is not inferred from a list of holiday names we curate; it is read
// from the sentence the city wrote for that date.
//
// DISPUTED DATES: the HTML table on the same page lists six suspension days that
// are absent from the .ics — including 4 July, which the table marks as a major
// legal holiday (meters suspended) and the machine-readable file does not mention
// at all. A developer taking the obvious path — parse the .ics — gets the opposite
// answer from the city's own web page. We ship both readings and mark the day, so
// the app can say "sources disagree" instead of picking a side and being confident.
//
// Run: node scripts/build-nyc-asp.mjs

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ICS = 'https://www.nyc.gov/html/dot/downloads/misc/2026-alternate-side.ics'
const PAGE = 'https://www.nyc.gov/html/dot/html/motorist/alternate-side-parking.shtml'
const OUT_DIR = resolve(__dir, '../public/calendars')
const OUT = resolve(OUT_DIR, 'new-york-city-asp-2026.json')

// Read from the HTML table on the page above, which lists these as suspension
// days while the .ics omits them entirely. Names as the table gives them.
const DISPUTED = {
  '2026-03-21': { holiday: 'Idul-Fitr (Eid Al-Fitr)', table_major: false },
  '2026-05-23': { holiday: 'Shavuoth (2nd Day)', table_major: false },
  '2026-05-28': { holiday: 'Idul-Adha (Eid Al-Adha)', table_major: false },
  '2026-07-04': { holiday: 'Independence Day', table_major: true },
  '2026-09-13': { holiday: 'Rosh Hashanah', table_major: false },
  '2026-09-27': { holiday: 'Succoth (2nd Day)', table_major: false },
}

/** RFC 5545 line unfolding — a continuation is CRLF followed by space or tab. */
const unfold = (s) => s.replace(/\r?\n[ \t]/g, '').replace(/\r\n/g, '\n')

const build = async () => {
  console.log('Fetching the official ASP calendar…')
  const res = await fetch(ICS, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Calendar returned ${res.status}`)
  const raw = unfold(await res.text())

  const days = {}
  for (const block of raw.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []) {
    const d = block.match(/DTSTART[^:\n]*:(\d{4})(\d{2})(\d{2})/)
    if (!d) continue
    const date = `${d[1]}-${d[2]}-${d[3]}`
    const desc = (block.match(/DESCRIPTION[^:\n]*:(.*)/)?.[1] ?? '').replace(/\\,/g, ',').trim()
    // The city's own sentence decides it. "will not be in effect" = meters off.
    const metersSuspended = /meters will not be in effect/i.test(desc)
    days[date] = {
      date,
      holiday: desc.match(/suspended for ([^.]+)\./i)?.[1]?.trim() ?? null,
      meters_suspended: metersSuspended,
      source: 'ics',
      note: desc.slice(0, 240) || null,
    }
  }
  const fromIcs = Object.keys(days).length
  console.log(`✓ ${fromIcs} suspension days from the .ics`)

  let added = 0
  for (const [date, info] of Object.entries(DISPUTED)) {
    if (days[date]) {
      console.warn(`  note: ${date} is in the .ics after all — drop it from DISPUTED`)
      continue
    }
    days[date] = {
      date,
      holiday: info.holiday,
      // Unknown, not false. On a disputed day the app must not claim meters are off.
      meters_suspended: null,
      source: 'html-table-only',
      disputed: true,
      note:
        'The calendar table on nyc.gov lists this as a suspension day; the city\'s own ' +
        '.ics file does not contain it. ' +
        (info.table_major
          ? 'The table marks it a major legal holiday, which would also suspend the meters — the .ics implies the opposite. Assume the meters are running.'
          : 'Street cleaning is likely suspended; the meters are unaffected either way.'),
    }
    added++
  }
  console.log(`✓ ${added} disputed days carried from the HTML table`)

  const out = {
    city_id: 'new-york-city',
    year: 2026,
    timezone: 'America/New_York',
    built_on: new Date().toISOString().slice(0, 10),
    sources: { calendar: ICS, page: PAGE },
    disputed_count: added,
    days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
  }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT, JSON.stringify(out, null, 1))

  const major = out.days.filter((d) => d.meters_suspended === true)
  console.log(`✓ Wrote ${out.days.length} days → public/calendars/new-york-city-asp-2026.json`)
  console.log(`   ${major.length} major legal holidays (meters also suspended): ${major.map((d) => d.date).join(', ')}`)
  console.log(`   ${added} disputed: ${Object.keys(DISPUTED).join(', ')}`)
}

build().catch((e) => { console.error('Build failed:', e.message); process.exit(1) })

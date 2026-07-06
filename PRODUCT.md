# Product

## Register

product

## Users

Drivers in Serbian cities (Novi Sad and Niš today, more later), including
first-timers and travelers who have never parked there before. Their context is
high-friction: standing at the car or just parked, often one-handed, phone in
bright daylight, wanting a single answer in seconds — *do I pay here, in which
zone, and how?* They are not power users and will not read fine print. Many are
guests with no account. Success is the driver paying the correct zone (or
learning they don't need to pay) without mistakes, fines, or confusion.

## Product Purpose

Kerb is an honest parking-transparency layer for Serbian cities. It turns
scattered, bureaucratic official parking data into one fast, plain answer:
whether parking is free right now, which colored zone you're in, the price, and
exactly how to pay (the SMS shortcode with your plate prefilled). The physical
zone sign at the curb is treated as the source of truth — the app reads it,
confirms it, and pins it for everyone; GPS and the registry only assist.
Success looks like a 10-second job done right, and trust earned by being correct
and never manipulative.

## Brand Personality

Precise, official, no-nonsense — but spoken in plain words. The tone is a
trustworthy public utility, not a chatty consumer app: it states the exact fact
and stops. Simplicity is a feature, not a softening: basic instructions read
like they're for a six-year-old, with optional "more if you want it" detail
tucked behind expandable sections. Calm and reassuring, including when the
answer is "do nothing, it's free." Confidence comes from accuracy and cited
sources, never from hype.

## Anti-references

- **Clunky official city parking portals** — dense, bureaucratic, fine-print
  walls of text. Kerb exists because these fail drivers.
- **Dark-pattern parking apps** — hidden fees, forced upsells, deliberately
  confusing flows, manufactured urgency.
- **Aggressive fintech** — loud gradients, hype copy, growth-hacky pressure.
- **Generic AI-template SaaS** — cream backgrounds, tracked-uppercase eyebrows
  on every section, identical icon-cards, buzzword copy.

## Design Principles

- **The sign is the source of truth.** Never override physical ground truth.
  When GPS, registry, and sign disagree, the app defers to the sign and says so.
- **Plain words, precise meaning.** Say the exact thing in the simplest language.
  Lead with the one basic answer; put nuance behind opt-in detail, never in front
  of the driver who just needs to pay.
- **Honest by default.** Show "you don't need to pay" as readily as a pay action.
  No hidden costs, no fake urgency, no manipulation — transparency is the product.
- **Designed for the curb.** Legible in direct sunlight, operable one-handed, fast
  enough for a glance. The viewport is a phone held next to a car, not a desk.
- **Earn trust like a utility.** Calm, reliable, source-cited. Reassurance over
  excitement; correctness over cleverness.

## Accessibility & Inclusion

Target WCAG 2.1 AA, with field realities raised above baseline: high contrast for
bright outdoor sunlight, large one-handed tap targets, and live status that never
relies on color alone (text + icon + state). Honor `prefers-reduced-motion` with
non-animated equivalents. Zone colors must stay distinguishable for common color
blindness — always pair the colored chip with its zone name.

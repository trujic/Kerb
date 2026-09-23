-- ── CORRECTED SIGN POSITIONS ──────────────────────────────────────────────────
-- A scan carries the GPS fix of the phone that took it, which in a street of tall
-- buildings is routinely twenty or thirty metres off — enough to put a sign on the
-- wrong side of a road, or in the wrong zone entirely. The zone editor can now drag
-- a pin onto the pole it belongs to.
--
-- The correction goes in NEW columns; lat/lng are never touched. That capture point
-- is the contributor's observation — where the phone actually was — and overwriting
-- it would destroy the evidence behind the pin while keeping the claim. OSM keeps
-- every version of every object for exactly this reason; this is the cheap version
-- of the same rule.
--
-- Readers take fixed_lat/fixed_lng when present and fall back to the capture point.

alter table public.sign_reports
  add column if not exists fixed_lat double precision,
  add column if not exists fixed_lng double precision,
  add column if not exists fixed_at  timestamptz;

comment on column public.sign_reports.fixed_lat is
  'Hand-corrected latitude from the zone editor. Null = trust the capture point.';
comment on column public.sign_reports.fixed_lng is
  'Hand-corrected longitude from the zone editor. Null = trust the capture point.';
comment on column public.sign_reports.fixed_at is
  'When the position was corrected. Null = never moved.';

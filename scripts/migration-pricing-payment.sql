-- Run this in Supabase Dashboard → SQL Editor

-- ── Structured price + pluggable payment ──────────────────────────────────────
-- `price` is a display string ("60 RSD/h", "120 RSD / 30 min", "70→210 RSD/h",
-- "Pay per hour via app/SMS"). Nothing can be computed from it: not what three
-- hours cost, not a currency conversion, not a comparison between two zones. And
-- `sms_shortcode` assumes every city pays by SMS, which stops being true at the
-- border — Thessaloniki charges by the minute through an app, Belgrade has no
-- shortcode at all.
--
-- So: the amount becomes a number with a currency and an interval, and paying
-- becomes a method plus a target. The display string stays as a fallback and as
-- the human record of anything the numbers cannot hold (progressive tariffs,
-- "first hour free" and so on) — it is never derived away.

alter table public.zones
  add column if not exists price_amount   numeric(10,2),  -- 60, 0.50
  add column if not exists price_currency text,           -- 'RSD', 'EUR'
  add column if not exists price_minutes  int,            -- what the amount buys: 60 = per hour, 30, 1 = per minute
  -- How this zone is actually paid. 'sms' → target is a shortcode; 'app' →
  -- target is a deep link (may contain {plate} / {zone} / {sector}); 'kiosk' →
  -- no in-app action, the driver walks to a machine; 'none' → we don't know yet,
  -- which must render as "we can't take you there" rather than a dead button.
  add column if not exists pay_method     text
    check (pay_method in ('sms','app','kiosk','none')),
  add column if not exists pay_target     text,
  add column if not exists pay_label      text,           -- 'ParkPal', 'JKP Parking servis'
  -- Some cities sell a whole day beside the hourly rate (Novi Sad 95 RSD → 8215,
  -- Zrenjanin 490/420/350). Same shape as above so the UI treats it identically.
  add column if not exists daily_amount   numeric(10,2),
  add column if not exists daily_target   text;

-- Backfill from what is already known, so nothing regresses on deploy: every
-- Serbian zone with a shortcode is an SMS zone charging per hour.
update public.zones
   set pay_method = 'sms',
       pay_target = sms_shortcode
 where sms_shortcode is not null
   and pay_method is null;

update public.zones
   set pay_method = 'none'
 where sms_shortcode is null
   and pay_method is null;

-- Parse the leading number out of the display string for the common
-- "<n> RSD/h" case. Anything shaped differently is left null on purpose rather
-- than guessed at — a wrong price is worse than a missing one.
update public.zones
   set price_amount   = (regexp_match(price, '^(\d+(?:[.,]\d+)?)'))[1]::numeric,
       price_currency = 'RSD',
       price_minutes  = 60
 where price ~ '^\d+(\.\d+)?\s*RSD\s*/\s*h$'
   and price_amount is null;

comment on column public.zones.price is
  'Human display string. Authoritative for anything the structured fields cannot express (progressive tariffs, conditions). Keep in sync when editing amounts.';

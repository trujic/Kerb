-- Run this in Supabase Dashboard → SQL Editor
-- (or: DB_PASSWORD=... node scripts/run-migration.mjs migration-event-counts.sql)

-- ── EVENT COUNTS ─────────────────────────────────────────────────────────────
-- Kerb's own daily totals: how many times a zone was shown, an SMS prepared, a
-- sign scanned, a location failed. One row per day, event, city and a short
-- label, and a number. Nothing here can name a person: no plate, no coordinate,
-- no street, no address of any kind. The day is Belgrade's, so "today" on the
-- page matches the driver's today.
--
-- No RLS policies: only the server routes, holding the service key, read or
-- write it. The function that adds one is closed to the public keys too, so the
-- anonymous key in the browser cannot call it around the server's checks.

create table if not exists public.event_counts (
  day    date    not null,
  event  text    not null,
  city   text    not null default 'unknown',
  kind   text    not null default '',
  count  integer not null default 0,
  primary key (day, event, city, kind)
);

alter table public.event_counts enable row level security;

create or replace function public.bump_event(p_event text, p_city text, p_kind text)
returns void
language sql
as $$
  insert into public.event_counts (day, event, city, kind, count)
  values ((now() at time zone 'Europe/Belgrade')::date, p_event, p_city, p_kind, 1)
  on conflict (day, event, city, kind)
  do update set count = public.event_counts.count + 1;
$$;

revoke all on function public.bump_event(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_event(text, text, text) to service_role;

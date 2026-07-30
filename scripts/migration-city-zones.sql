-- Run this in Supabase Dashboard → SQL Editor
-- (or: DB_PASSWORD=... node scripts/run-migration.mjs scripts/migration-city-zones.sql)

-- ── Live zone geometry ────────────────────────────────────────────────────────
-- Traced zones used to ship as static files under public/zones/, which meant a
-- correction only reached drivers on the next deploy — and could not be written
-- at all from a running app, since Netlify's filesystem is read-only.
--
-- Geometry lives here instead. The editor writes a row; the app reads it and
-- subscribes for changes, so a fix to a mis-traced boundary reaches everyone
-- without a build.
--
-- The files stay in the repo as the committed baseline and the fallback: if this
-- table is empty, or a write goes wrong, the app still has a map, and git still
-- has the history that a jsonb column does not.

create table if not exists public.city_zones (
  city_id     text primary key references public.cities(id) on delete cascade,
  geojson     jsonb not null,
  feature_count int generated always as (jsonb_array_length(geojson -> 'features')) stored,
  note        text,                      -- what this revision changed, for the log below
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- Every write keeps its predecessor. This is the safety net that leaving git
-- costs us: a bad trace can be read back and restored.
create table if not exists public.city_zones_history (
  id          bigserial primary key,
  city_id     text not null,
  geojson     jsonb not null,
  feature_count int,
  note        text,
  replaced_at timestamptz not null default now()
);

create index if not exists city_zones_history_city_idx
  on public.city_zones_history (city_id, replaced_at desc);

create or replace function public.city_zones_keep_history()
returns trigger language plpgsql as $$
begin
  insert into public.city_zones_history (city_id, geojson, feature_count, note)
  values (old.city_id, old.geojson, old.feature_count, old.note);
  return new;
end;
$$;

drop trigger if exists city_zones_history_trg on public.city_zones;
create trigger city_zones_history_trg
  before update on public.city_zones
  for each row execute procedure public.city_zones_keep_history();

-- The map is public information — anyone may read it, including anonymous
-- visitors, exactly as the static files were. Nobody may write it from a
-- browser: edits go through a server route holding the service key, so a
-- stranger who finds the endpoint cannot rewrite what a city pays.
alter table public.city_zones enable row level security;
alter table public.city_zones_history enable row level security;

drop policy if exists "zones are public" on public.city_zones;
create policy "zones are public" on public.city_zones for select using (true);

drop policy if exists "history is public" on public.city_zones_history;
create policy "history is public" on public.city_zones_history for select using (true);

-- Let clients subscribe, so an open tab can swap geometry the moment it changes.
alter publication supabase_realtime add table public.city_zones;

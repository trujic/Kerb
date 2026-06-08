-- Run this in Supabase Dashboard → SQL Editor
-- (or: DB_PASSWORD=... node scripts/run-migration.mjs after pointing it at this file)

-- Parking sessions — one row per paid parking session, geotagged.
-- Powers the "active session" tracker (countdown, find-my-car) and is the
-- geotagged dataset the community data layer is built from.
create table if not exists public.parking_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  city_id       text references public.cities(id) on delete set null,
  zone_name     text not null,
  zone_color    text,
  price         text,
  street_name   text,
  lat           double precision,
  lng           double precision,
  plate         text,
  started_at    timestamptz not null default now(),
  expires_at    timestamptz,             -- paid-until; null = open-ended
  max_limit_min integer,                 -- zone hard cap in minutes; null = unlimited
  ended_at      timestamptz,             -- set when the user ends / leaves
  created_at    timestamptz not null default now()
);

create index if not exists idx_parking_sessions_user
  on public.parking_sessions (user_id, started_at desc);

-- Fast lookup of a user's single active session
create index if not exists idx_parking_sessions_active
  on public.parking_sessions (user_id)
  where ended_at is null;

alter table public.parking_sessions enable row level security;
create policy "own sessions select" on public.parking_sessions for select using (auth.uid() = user_id);
create policy "own sessions insert" on public.parking_sessions for insert with check (auth.uid() = user_id);
create policy "own sessions update" on public.parking_sessions for update using (auth.uid() = user_id);
create policy "own sessions delete" on public.parking_sessions for delete using (auth.uid() = user_id);

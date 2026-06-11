-- Run this in Supabase Dashboard → SQL Editor
-- (or: DB_PASSWORD=... node scripts/run-migration.mjs after pointing it at this file)

-- ── Sign reports ──────────────────────────────────────────────────────────────
-- Ground-truth scans of the physical parking sign. The sign is authoritative: a
-- contributor photographs it where they're standing, we OCR the zone/price off the
-- image, they confirm, and we keep it geotagged. This is the "confirmed sign"
-- dataset that drops verified pins on the map and prefills the right pay action.
--
-- Guest-first: anyone can submit (anon), matching the rest of the app. user_id is
-- set when a logged-in user scans, null for guests.
create table if not exists public.sign_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,  -- null = guest
  city_id       text references public.cities(id) on delete set null,
  zone_name     text not null,            -- confirmed zone ("Blue Zone")
  zone_color    text,
  price         text,
  sms_shortcode text,
  street_name   text,
  lat           double precision not null,
  lng           double precision not null,
  accuracy      double precision,         -- GPS accuracy (m) at capture
  heading       double precision,         -- compass heading at capture, if available
  photo_path    text,                     -- object path in the sign-photos bucket
  raw_text      text,                     -- raw OCR output, kept to improve parsing
  source        text not null default 'ocr',   -- ocr | claude | manual (read engine)
  confidence    numeric,                  -- read confidence 0..1, if the engine gives one
  created_at    timestamptz not null default now()
);

create index if not exists idx_sign_reports_city
  on public.sign_reports (city_id, created_at desc);

alter table public.sign_reports enable row level security;

-- Public read: confirmed signs are community data shown on the map to everyone.
drop policy if exists "sign_reports public read" on public.sign_reports;
create policy "sign_reports public read"
  on public.sign_reports for select using (true);

-- Guest-first insert: anyone (anon or authenticated) may contribute a scan.
-- A logged-in user must stamp their own user_id; guests insert with user_id null.
drop policy if exists "sign_reports contribute" on public.sign_reports;
create policy "sign_reports contribute"
  on public.sign_reports for insert
  with check (user_id is null or auth.uid() = user_id);

-- ── Photo storage ─────────────────────────────────────────────────────────────
-- Public bucket holding the sign photo behind each pin (proof the scan is real).
insert into storage.buckets (id, name, public)
values ('sign-photos', 'sign-photos', true)
on conflict (id) do nothing;

-- Anyone can upload a sign photo (guest-first); anyone can read them (public proof).
drop policy if exists "sign-photos public read" on storage.objects;
create policy "sign-photos public read"
  on storage.objects for select
  using (bucket_id = 'sign-photos');

drop policy if exists "sign-photos public upload" on storage.objects;
create policy "sign-photos public upload"
  on storage.objects for insert
  with check (bucket_id = 'sign-photos');

-- Run this in Supabase Dashboard → SQL Editor
-- (or: DB_PASSWORD=... node scripts/run-migration.mjs migration-push.sql)

-- Web Push subscriptions (one per device/browser the user enables reminders on)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "own push subs select" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own push subs insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "own push subs delete" on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Reminder bookkeeping on sessions so the scheduler never double-notifies
alter table public.parking_sessions
  add column if not exists reminder_sent_at       timestamptz, -- 10-min-before-expiry ping
  add column if not exists limit_reminder_sent_at timestamptz; -- zone hard-limit ping

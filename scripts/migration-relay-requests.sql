-- Run this in Supabase Dashboard → SQL Editor
-- (or: DB_PASSWORD=... node scripts/run-migration.mjs migration-relay-requests.sql)

-- ── RELAY REQUESTS ───────────────────────────────────────────────────────────
-- A visitor with no local SIM asks somebody who has one to pay for their plate.
-- The row is the whole conversation: what was asked, who took it, and what the
-- operator actually answered.
--
-- `state` is deliberately five-valued. `unknown` is not a failure to tidy away
-- later — it is the honest outcome when a message went out and nothing came
-- back, and the guest must see that rather than a green tick.
--
--   pending   nobody has picked it up yet
--   working   a relay opened it and is paying
--   confirmed the operator replied, and the reply is stored in operator_reply
--   failed    it could not be paid, and outcome_note says why
--   unknown   sent, but no reply arrived — treat as unpaid until proven
--
-- No RLS policies for the public: every read and write goes through the server
-- routes, which hold the service key. The guest is anonymous and addresses their
-- own row by `guest_token`, which is why that column is unique and random.

create table if not exists public.relay_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- what the guest asked for
  city           text not null default 'novi-sad',
  plate          text not null,
  zone           text not null,
  shortcode      text,                -- SMS target for that zone, as the app knows it
  minutes        integer,             -- how long they want to stay
  price_text     text,                -- what we told them it would cost
  lat            double precision,
  lng            double precision,
  note           text,

  -- lifecycle
  state          text not null default 'pending',
  claimed_by     uuid references auth.users(id) on delete set null,
  claimed_at     timestamptz,
  answered_at    timestamptz,
  operator_reply text,                -- the operator's own SMS: the only real receipt
  outcome_note   text,

  guest_token    text not null unique
);

create index if not exists idx_relay_state   on public.relay_requests (state, created_at desc);
create index if not exists idx_relay_token   on public.relay_requests (guest_token);

alter table public.relay_requests enable row level security;
-- Intentionally no policies: the anon key can reach nothing here.

-- Run this in Supabase Dashboard → SQL Editor

-- ── GUEST WALLET ─────────────────────────────────────────────────────────────
-- A visitor pays before we pay, never after. Somebody who leaves the country
-- tomorrow cannot be invoiced, so a balance goes in first and every assisted
-- payment comes out of it.
--
-- The wallet hangs off the same opaque token the guest already holds. No
-- account, no email, no name: it is a balance and a list of what happened to it.
--
-- `wallet_entries` is the truth and the balance is derived from it. A cached
-- total that drifts from its own history is worse than a slow query, and this
-- history is the guest's receipt as much as it is our bookkeeping.

create table if not exists public.guest_wallets (
  id          uuid primary key default gen_random_uuid(),
  guest_token text not null unique,
  -- What the visitor shows a host so cash lands in the right balance. Derived
  -- from the token and stored, because a host types four characters and the
  -- server must not have to scan every wallet to find out whose they are.
  code        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_wallets_code on public.guest_wallets (code);

create table if not exists public.wallet_entries (
  id         uuid primary key default gen_random_uuid(),
  wallet_id  uuid references public.guest_wallets(id) on delete cascade not null,
  -- topup: money in, recorded by whoever received it
  -- parking: what the operator charged
  -- fee: what Kerb charged for doing it
  -- refund: money back out
  kind       text not null check (kind in ('topup','parking','fee','refund')),
  -- Minor units are pointless in RSD, which has no coins below the dinar.
  -- Positive credits, negative debits, so a balance is one sum.
  amount_rsd integer not null,
  request_id uuid references public.relay_requests(id) on delete set null,
  note       text,
  taken_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_token   on public.guest_wallets (guest_token);
create index if not exists idx_entries_wallet on public.wallet_entries (wallet_id, created_at desc);
-- One debit pair per request, ever: a retried close must not charge twice.
create unique index if not exists idx_entries_once
  on public.wallet_entries (request_id, kind)
  where request_id is not null and kind in ('parking','fee');

alter table public.guest_wallets enable row level security;
alter table public.wallet_entries enable row level security;
-- No policies: everything goes through the server routes, as with relay_requests.

-- The wallet outlives the request. `guest_token` addresses one payment and is
-- unique per request; `wallet_token` is the visitor's balance across their whole
-- stay, and the same value appears on every request they make.
alter table public.relay_requests
  add column if not exists wallet_token text;
create index if not exists idx_relay_wallet on public.relay_requests (wallet_token);

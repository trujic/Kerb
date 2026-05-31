-- Run this in Supabase Dashboard → SQL Editor

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  display_name  text,
  default_city_id text references public.cities(id) on delete set null,
  created_at    timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- User license plates
create table if not exists public.user_plates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  plate      text not null,
  label      text,
  is_default boolean default false,
  created_at timestamptz default now()
);
alter table public.user_plates enable row level security;
create policy "own plates select" on public.user_plates for select using (auth.uid() = user_id);
create policy "own plates insert" on public.user_plates for insert with check (auth.uid() = user_id);
create policy "own plates update" on public.user_plates for update using (auth.uid() = user_id);
create policy "own plates delete" on public.user_plates for delete using (auth.uid() = user_id);

-- Auto-create empty profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

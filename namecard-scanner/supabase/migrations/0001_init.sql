-- Handshake — initial schema.
--
-- Two tables, both owned by the signed-in user and both locked down by row
-- level security. The app is a personal sales tool: a BDE must never be able
-- to read another BDE's contacts, and contact data belonging to third parties
-- (the people whose cards were scanned) is exactly the kind of data that
-- should never be reachable with an anon key.

-- ---------------------------------------------------------------- profiles
-- The sender: who the WhatsApp message introduces.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  company text not null default '',
  role text not null default '',
  -- Home market used to resolve local numbers to E.164.
  default_country text not null default 'SG',
  default_tone text not null default 'warm',
  default_cta text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Sender profile for the signed-in BDE.';

-- -------------------------------------------------------------- follow_ups
-- One row per card handed off to WhatsApp. This is the BDE's own record of
-- who they followed up with, and it backs the daily tally.
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_name text not null default '',
  greeting text not null default '',
  contact_title text not null default '',
  contact_company text not null default '',
  contact_email text not null default '',
  phone_e164 text not null,
  met_context text not null default '',
  tone text not null default 'warm',
  message text not null default '',
  sent_at timestamptz not null default now()
);

comment on table public.follow_ups is 'Cards scanned and handed off to WhatsApp.';

-- The only query the app makes: this user's follow-ups, newest first.
create index if not exists follow_ups_user_sent_at_idx
  on public.follow_ups (user_id, sent_at desc);

-- ------------------------------------------------------------ row security
alter table public.profiles enable row level security;
alter table public.follow_ups enable row level security;

-- Policies are written per-command rather than as a single `for all` so that
-- the insert path is checked with `with check` and reads with `using`.
drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "profiles are insertable by their owner" on public.profiles;
create policy "profiles are insertable by their owner"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "profiles are updatable by their owner" on public.profiles;
create policy "profiles are updatable by their owner"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles are deletable by their owner" on public.profiles;
create policy "profiles are deletable by their owner"
  on public.profiles for delete
  using ((select auth.uid()) = id);

drop policy if exists "follow-ups are readable by their owner" on public.follow_ups;
create policy "follow-ups are readable by their owner"
  on public.follow_ups for select
  using ((select auth.uid()) = user_id);

drop policy if exists "follow-ups are insertable by their owner" on public.follow_ups;
create policy "follow-ups are insertable by their owner"
  on public.follow_ups for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "follow-ups are updatable by their owner" on public.follow_ups;
create policy "follow-ups are updatable by their owner"
  on public.follow_ups for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "follow-ups are deletable by their owner" on public.follow_ups;
create policy "follow-ups are deletable by their owner"
  on public.follow_ups for delete
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------ upkeep
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A profile row is created the moment someone verifies their email, so the
-- app never has to special-case "signed in but no row yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

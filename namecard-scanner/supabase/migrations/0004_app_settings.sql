-- Runtime configuration, editable from /admin.
--
-- Settings used to be build-time environment variables, which meant changing
-- one required a redeploy. Moving them here lets an operator flip them from
-- the admin panel and have every device pick the change up on next load.
--
-- The split between the two tables below is the important part:
--
--   app_settings — read by every visitor before sign-in, so it may contain
--                  nothing sensitive. Anon can SELECT; nobody can write.
--   app_secrets  — RLS on with NO policies at all, so the anon key cannot
--                  read it under any circumstances. Only service_role, used
--                  inside edge functions, can touch it. This is where the
--                  OpenRouter key lives; a provider key readable by the
--                  browser is a key anyone can drain.
--
-- Both are written exclusively by the admin-settings edge function, which
-- checks the admin password before doing anything.

-- --------------------------------------------------------------- settings
create table if not exists public.app_settings (
  -- Single-row table: the check constraint makes a second row impossible.
  id boolean primary key default true check (id),
  require_email_verification boolean not null default true,
  ai_ocr_enabled boolean not null default false,
  ai_ocr_model text not null default 'google/gemini-2.5-flash',
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is 'Runtime app configuration. Public-readable: must never hold secrets.';

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- The app reads this before anyone has signed in, so the read is open. There
-- is deliberately no insert/update/delete policy: writes go through the
-- password-gated edge function running as service_role.
drop policy if exists "settings are world readable" on public.app_settings;
create policy "settings are world readable"
  on public.app_settings for select
  using (true);

-- ---------------------------------------------------------------- secrets
create table if not exists public.app_secrets (
  id boolean primary key default true check (id),
  openrouter_api_key text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.app_secrets is
  'Provider credentials. RLS is on with no policies, so only service_role can read this.';

insert into public.app_secrets (id) values (true) on conflict (id) do nothing;

-- RLS on, zero policies: anon and authenticated get nothing at all.
alter table public.app_secrets enable row level security;

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists app_secrets_touch_updated_at on public.app_secrets;
create trigger app_secrets_touch_updated_at
  before update on public.app_secrets
  for each row execute function public.touch_updated_at();

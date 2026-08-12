-- Rate limiting for the AI card reader.
--
-- The read endpoint spends the operator's OpenRouter credit on every call, so
-- an unmetered public endpoint is a way for a stranger to run up their bill.
-- Sign-in cannot be relied on to prevent it: verification is currently off for
-- this deployment, so most callers have no session at all.
--
-- One counter row per caller per day. Coarse, but it bounds the damage, which
-- is the whole job.

create table if not exists public.ai_read_usage (
  -- 'ip:203.0.113.4:2026-08-12' or 'user:<uuid>:2026-08-12'
  bucket text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies at all: the anon key must never reach this table,
-- and only service_role, inside the edge function, has business here.
alter table public.ai_read_usage enable row level security;

/**
 * Increments a bucket and returns its new value, atomically.
 *
 * Read-then-write from the edge function would let two concurrent requests
 * both see the old count and both pass a limit check. Doing it in one
 * statement makes the counter exact under concurrency.
 */
create or replace function public.bump_ai_read_usage(p_bucket text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  -- Opportunistic cleanup; the table would otherwise grow one row per caller
  -- per day forever.
  delete from public.ai_read_usage where updated_at < now() - interval '7 days';

  insert into public.ai_read_usage as u (bucket, count)
  values (p_bucket, 1)
  on conflict (bucket) do update
    set count = u.count + 1, updated_at = now()
  returning u.count into new_count;

  return new_count;
end;
$$;

-- A security definer function is callable by anyone who can reach PostgREST
-- unless execute is taken away. Only service_role needs it.
revoke all on function public.bump_ai_read_usage(text) from public;
revoke all on function public.bump_ai_read_usage(text) from anon;
revoke all on function public.bump_ai_read_usage(text) from authenticated;

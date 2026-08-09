-- Trigger functions are invoked by the trigger, never by a client. Left as
-- created they are reachable at /rest/v1/rpc/<name> by anyone holding the anon
-- key — two SECURITY DEFINER functions exposed for no reason, which is what
-- Supabase's database linter flags after the initial migration.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

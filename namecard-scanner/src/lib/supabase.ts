import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export interface RuntimeEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_REQUIRE_EMAIL_VERIFICATION?: string;
}

/**
 * Whether the app puts email verification in front of the scanner.
 *
 * Set `VITE_REQUIRE_EMAIL_VERIFICATION=false` to walk straight into the
 * scanner — useful for demoing the flow, and for working on it before email
 * delivery is configured. Exported as a pure function so the parsing is
 * covered by tests rather than only discovered at deploy time.
 *
 * Only an explicit "false" disables it: a typo, an empty value or an unset
 * variable all leave verification ON, because the failure that matters is
 * accidentally shipping an open app, not accidentally shipping a closed one.
 */
export function authRequired(env: RuntimeEnv): boolean {
  const configured = Boolean((env.VITE_SUPABASE_URL ?? '').trim() && (env.VITE_SUPABASE_ANON_KEY ?? '').trim());
  if (!configured) return false;
  return (env.VITE_REQUIRE_EMAIL_VERIFICATION ?? '').trim().toLowerCase() !== 'false';
}

/**
 * Whether this build talks to Supabase at all.
 *
 * With no credentials configured the app runs local-only: no sign-in, profile
 * and history in localStorage. That keeps `npm run dev` usable the moment you
 * clone the repo, and means a misconfigured deploy degrades to a working
 * offline tool rather than a white screen.
 */
export const cloudEnabled = Boolean(url && anonKey);

/** False when VITE_REQUIRE_EMAIL_VERIFICATION=false: the gate steps aside. */
export const emailVerificationRequired = authRequired(import.meta.env);

let cached: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  if (!cached) {
    cached = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Magic-link sign-in comes back with the session in the URL fragment;
        // this is what picks it up and then cleans the address bar.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return cached;
}

/** Shown in settings so a misconfigured deploy is obvious rather than mysterious. */
export const supabaseHost = url ? url.replace(/^https?:\/\//, '') : '';

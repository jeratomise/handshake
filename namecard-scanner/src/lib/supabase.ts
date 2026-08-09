import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/**
 * Whether this build talks to Supabase at all.
 *
 * With no credentials configured the app runs local-only: no sign-in, profile
 * and history in localStorage. That keeps `npm run dev` usable the moment you
 * clone the repo, and means a misconfigured deploy degrades to a working
 * offline tool rather than a white screen.
 */
export const cloudEnabled = Boolean(url && anonKey);

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

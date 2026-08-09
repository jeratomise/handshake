import { describe, expect, it } from 'vitest';
import { authRequired } from '../src/lib/supabase';

const configured = {
  VITE_SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
};

describe('authRequired', () => {
  it('requires verification when Supabase is configured and the flag is unset', () => {
    expect(authRequired(configured)).toBe(true);
  });

  it('is off when Supabase is not configured at all', () => {
    expect(authRequired({})).toBe(false);
    expect(authRequired({ VITE_SUPABASE_URL: 'https://project.supabase.co' })).toBe(false);
    expect(authRequired({ VITE_SUPABASE_ANON_KEY: 'anon-key' })).toBe(false);
  });

  it('is switched off by an explicit false, in any casing or padding', () => {
    for (const value of ['false', 'FALSE', ' False ', 'fAlSe']) {
      expect(authRequired({ ...configured, VITE_REQUIRE_EMAIL_VERIFICATION: value })).toBe(false);
    }
  });

  it('stays ON for anything that is not exactly false', () => {
    // A typo must never silently open the app up — that is the failure that
    // costs something. '0' and 'no' are deliberately NOT accepted.
    for (const value of ['true', '', 'off', '0', 'no', 'flase', 'yes', 'disabled']) {
      expect(authRequired({ ...configured, VITE_REQUIRE_EMAIL_VERIFICATION: value })).toBe(true);
    }
  });
});

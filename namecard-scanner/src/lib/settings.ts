import { cloudEnabled, supabase } from './supabase';

/**
 * Runtime configuration, read from Supabase at boot.
 *
 * These used to be build-time environment variables, which meant an operator
 * had to redeploy to change one. They now live in `app_settings` so /admin can
 * change them and every device picks it up on next load.
 *
 * Two rules keep a settings read from becoming a way to break the app, both
 * learned by watching it happen:
 *
 *  - **It always finishes.** A request that hangs is not an error, so a plain
 *    try/catch never fires and the app sits on its loading screen forever. A
 *    network that stalls rather than fails is the normal case on conference
 *    wifi, which is exactly where this app gets opened.
 *  - **The last known answer is remembered.** Failing closed to "verification
 *    required" is the right instinct on a first-ever load, but for a returning
 *    user on a dead network it means being shown a sign-in screen they cannot
 *    possibly complete. The cache lets them keep scanning.
 */
export interface AppSettings {
  requireEmailVerification: boolean;
  aiOcrEnabled: boolean;
  aiOcrModel: string;
}

export const FALLBACK_SETTINGS: AppSettings = {
  requireEmailVerification: true,
  aiOcrEnabled: false,
  aiOcrModel: 'google/gemini-2.5-flash',
};

/** Long enough for a slow connection, short enough not to feel broken. */
export const SETTINGS_TIMEOUT_MS = 4000;

const CACHE_KEY = 'handshake.settings.v1';

interface SettingsRow {
  require_email_verification: boolean | null;
  ai_ocr_enabled: boolean | null;
  ai_ocr_model: string | null;
}

export function rowToSettings(row: SettingsRow | null, fallback: AppSettings = FALLBACK_SETTINGS): AppSettings {
  if (!row) return fallback;
  return {
    requireEmailVerification: row.require_email_verification ?? fallback.requireEmailVerification,
    aiOcrEnabled: row.ai_ocr_enabled ?? fallback.aiOcrEnabled,
    aiOcrModel: row.ai_ocr_model?.trim() || fallback.aiOcrModel,
  };
}

export function loadCachedSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    if (typeof parsed.requireEmailVerification !== 'boolean') return null;
    return { ...FALLBACK_SETTINGS, ...parsed } as AppSettings;
  } catch {
    return null;
  }
}

export function cacheSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* Private browsing or full storage: the cache is an optimisation. */
  }
}

/**
 * Resolves `fallback` if `promise` has not settled in time.
 *
 * Exported for tests: the timeout is the whole point of this module, so it
 * should be provable rather than assumed.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

/**
 * Fetches settings, never blocking and never throwing.
 *
 * Order of preference: what the server says, then what it last said on this
 * device, then the safe default.
 */
export async function fetchSettings(timeoutMs = SETTINGS_TIMEOUT_MS): Promise<AppSettings> {
  const cached = loadCachedSettings();
  const fallback = cached ?? FALLBACK_SETTINGS;

  const client = supabase();
  // No project configured means local-only, where there is nobody to sign in to.
  if (!cloudEnabled || !client) return { ...fallback, requireEmailVerification: false };

  const query = client
    .from('app_settings')
    .select('require_email_verification, ai_ocr_enabled, ai_ocr_model')
    .eq('id', true)
    .maybeSingle()
    .then(({ data, error }) => (error ? fallback : rowToSettings(data as SettingsRow | null, fallback)));

  const settings = await withTimeout(Promise.resolve(query), timeoutMs, fallback);
  cacheSettings(settings);
  return settings;
}

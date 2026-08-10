import { cloudEnabled, supabase } from './supabase';

/**
 * Runtime configuration, read from Supabase at boot.
 *
 * These used to be build-time environment variables, which meant an operator
 * had to redeploy to change one. They now live in `app_settings` so /admin can
 * change them and every device picks it up on next load.
 *
 * The build-time env var is still honoured as a floor: if the database says
 * verification is on but the deployment was explicitly built with it off, off
 * wins, so a demo build cannot be locked by a remote setting.
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

/**
 * Fetches settings, falling back rather than blocking.
 *
 * A settings read that fails must not stop someone scanning a card, so any
 * error resolves to the fallback. Erring towards "verification required" is the
 * safe direction: the cost of a wrong guess is asking someone to sign in, not
 * leaving the app open.
 */
export async function fetchSettings(fallback: AppSettings = FALLBACK_SETTINGS): Promise<AppSettings> {
  const client = supabase();
  if (!cloudEnabled || !client) return { ...fallback, requireEmailVerification: false };

  try {
    const { data, error } = await client
      .from('app_settings')
      .select('require_email_verification, ai_ocr_enabled, ai_ocr_model')
      .eq('id', true)
      .maybeSingle();
    if (error) return fallback;
    return rowToSettings(data as SettingsRow | null, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Admin API behind /admin.
 *
 * Runtime settings live in the database rather than in build-time environment
 * variables, so an operator can change them without a redeploy. Two rules shape
 * this function:
 *
 *  1. The password is checked *here*, not in the browser. A client-side gate is
 *     decoration — anyone can skip it, and the data it "protects" would be
 *     readable anyway. Every read and write of admin state goes through this
 *     endpoint.
 *  2. The OpenRouter key is written but never returned. `app_secrets` has RLS
 *     on with no policies, so only service_role reaches it, and responses carry
 *     a masked hint ("sk-or…7f3a") — enough to confirm which key is installed,
 *     useless to anyone who intercepts it.
 *
 * Required secret (Supabase dashboard -> Edge Functions -> Secrets):
 *   ADMIN_PASSWORD - the password for /admin
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/**
 * Compares by hash so the loop always runs over 32 bytes: comparing the raw
 * strings would leak the password's length and prefix through timing.
 */
async function passwordMatches(supplied: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 'sk-or-v1-abcd…wxyz' — enough to recognise, useless to reuse. */
function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••';
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

interface RequestBody {
  password?: string;
  action?: 'load' | 'save';
  settings?: {
    requireEmailVerification?: boolean;
    aiOcrEnabled?: boolean;
    aiOcrModel?: string;
  };
  /** Empty string leaves the stored key untouched; 'CLEAR' removes it. */
  openrouterApiKey?: string;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const adminPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
  if (!adminPassword) {
    return json(
      { error: 'No admin password is set. Add ADMIN_PASSWORD under Edge Functions → Secrets in Supabase.' },
      503,
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  if (!body.password || !(await passwordMatches(body.password, adminPassword))) {
    // A deliberate pause: this endpoint is public, and an unthrottled password
    // check is a free brute-force oracle.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return json({ error: 'Wrong password.' }, 401);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // service_role bypasses RLS, which is the only way to reach app_secrets.
    // It exists solely inside this function and is never sent to the browser.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    if (body.action === 'save') {
      const patch: Record<string, unknown> = {};
      if (typeof body.settings?.requireEmailVerification === 'boolean') {
        patch.require_email_verification = body.settings.requireEmailVerification;
      }
      if (typeof body.settings?.aiOcrEnabled === 'boolean') {
        patch.ai_ocr_enabled = body.settings.aiOcrEnabled;
      }
      if (typeof body.settings?.aiOcrModel === 'string' && body.settings.aiOcrModel.trim()) {
        patch.ai_ocr_model = body.settings.aiOcrModel.trim();
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from('app_settings').update(patch).eq('id', true);
        if (error) return json({ error: error.message }, 500);
      }

      const supplied = (body.openrouterApiKey ?? '').trim();
      if (supplied) {
        const { error } = await admin
          .from('app_secrets')
          .update({ openrouter_api_key: supplied === 'CLEAR' ? '' : supplied })
          .eq('id', true);
        if (error) return json({ error: error.message }, 500);
      }
    }

    const [{ data: settings, error: settingsError }, { data: secrets }] = await Promise.all([
      admin.from('app_settings').select('*').eq('id', true).maybeSingle(),
      admin.from('app_secrets').select('openrouter_api_key').eq('id', true).maybeSingle(),
    ]);

    if (settingsError) return json({ error: settingsError.message }, 500);

    const key = (secrets?.openrouter_api_key as string | undefined) ?? '';
    return json({
      ok: true,
      settings: {
        requireEmailVerification: settings?.require_email_verification ?? true,
        aiOcrEnabled: settings?.ai_ocr_enabled ?? false,
        aiOcrModel: settings?.ai_ocr_model ?? 'google/gemini-2.5-flash',
        updatedAt: settings?.updated_at ?? null,
      },
      openrouter: { configured: key.length > 0, hint: maskKey(key) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error('admin-settings failed:', message);
    return json({ error: message }, 500);
  }
});

import { supabaseHost } from './supabase';

/**
 * Client for the admin edge function.
 *
 * The password is sent on every call rather than exchanged for a session
 * token. That keeps the surface small — there is no token to leak, expire or
 * revoke — and the function is the only thing that ever validates it. Nothing
 * here decides whether the user is an admin; the server does, every time.
 */

export interface AdminSettings {
  requireEmailVerification: boolean;
  aiOcrEnabled: boolean;
  aiOcrModel: string;
  updatedAt: string | null;
}

export interface AdminState {
  settings: AdminSettings;
  openrouter: { configured: boolean; hint: string };
}

export interface AdminResult {
  ok: boolean;
  state?: AdminState;
  error?: string;
}

function endpoint(): string | null {
  if (!supabaseHost) return null;
  return `https://${supabaseHost}/functions/v1/admin-settings`;
}

async function call(body: Record<string, unknown>): Promise<AdminResult> {
  const url = endpoint();
  if (!url) {
    return { ok: false, error: 'This deployment has no Supabase project configured, so there is nothing to administer.' };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }

  let payload: { ok?: boolean; error?: string; settings?: AdminSettings; openrouter?: AdminState['openrouter'] };
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: `Server returned an unexpected response (${response.status}).` };
  }

  if (!response.ok || !payload.ok) {
    return { ok: false, error: payload.error ?? `Request failed (${response.status}).` };
  }

  return {
    ok: true,
    state: {
      settings: payload.settings as AdminSettings,
      openrouter: payload.openrouter ?? { configured: false, hint: '' },
    },
  };
}

export function loadAdminState(password: string): Promise<AdminResult> {
  return call({ password, action: 'load' });
}

export function saveAdminState(
  password: string,
  settings: Partial<AdminSettings>,
  openrouterApiKey?: string,
): Promise<AdminResult> {
  return call({
    password,
    action: 'save',
    settings,
    // An empty string means "leave the stored key alone" — the field is blank
    // on screen because we never send the real one back down.
    ...(openrouterApiKey ? { openrouterApiKey } : {}),
  });
}

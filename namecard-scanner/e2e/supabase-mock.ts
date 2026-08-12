import type { Page, Route } from '@playwright/test';

/**
 * Stands in for a Supabase project during end-to-end runs.
 *
 * The suite builds the app with Supabase credentials configured so it is
 * shaped exactly like production — auth gate and all — and then intercepts the
 * project's HTTP surface. That exercises our own sign-in, sync and
 * error-handling code without depending on a live project, a real mailbox, or
 * an OTP nobody can read.
 */

export const STUB_HOST = 'https://stub-project.supabase.co';
export const TEST_EMAIL = 'jerome@northwind.test';
export const TEST_CODE = '123456';
const USER_ID = '00000000-0000-4000-8000-000000000001';

export interface MockState {
  /** Codes we "sent", so a wrong code can be rejected the way the real API would. */
  otpSent: string[];
  profile: Record<string, unknown> | null;
  followUps: Record<string, unknown>[];
  /** Runtime settings the app reads at boot. Null means "no row", the default. */
  settings: Record<string, unknown> | null;
  /** What the ai-read-card edge function should answer, and how many times it was asked. */
  aiRead: { status: number; body: unknown } | null;
  aiReadCalls: { imageBytes: number }[];
}

function session() {
  return {
    access_token: 'stub-access-token',
    token_type: 'bearer',
    // Long enough that supabase-js never tries to refresh mid-test.
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'stub-refresh-token',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: TEST_EMAIL,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

export async function mockSupabase(page: Page): Promise<MockState> {
  const state: MockState = { otpSent: [], profile: null, followUps: [], settings: null, aiRead: null, aiReadCalls: [] };

  await page.route(`${STUB_HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    }

    // ---------------------------------------------------------- auth
    if (path === '/auth/v1/otp' && method === 'POST') {
      state.otpSent.push(TEST_CODE);
      return json(route, {});
    }

    if (path === '/auth/v1/verify' && method === 'POST') {
      const body = request.postDataJSON() as { token?: string };
      if (body?.token !== TEST_CODE) {
        return json(route, { error: 'invalid_grant', error_description: 'Token has expired or is invalid' }, 403);
      }
      return json(route, session());
    }

    if (path === '/auth/v1/token' && method === 'POST') {
      return json(route, session());
    }

    if (path === '/auth/v1/user') {
      return json(route, session().user);
    }

    if (path === '/auth/v1/logout' && method === 'POST') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    // ---------------------------------------------------------- data
    if (path === '/rest/v1/profiles') {
      if (method === 'GET') {
        // maybeSingle() asks for at most one object back.
        return json(route, state.profile ? [state.profile] : []);
      }
      if (method === 'POST' || method === 'PATCH') {
        const body = request.postDataJSON();
        state.profile = { ...(state.profile ?? {}), ...(Array.isArray(body) ? body[0] : body) };
        return json(route, [state.profile], 201);
      }
    }

    if (path === '/rest/v1/app_settings') {
      return json(route, state.settings ? [state.settings] : []);
    }

    // The AI re-read proxy. Kept a stub on purpose: the suite must never reach
    // a real provider, and what is being tested is the app's behaviour around
    // the answer, not the model's ability to read a card.
    if (path === '/functions/v1/ai-read-card') {
      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      const body = request.postDataJSON() as { image?: string };
      state.aiReadCalls.push({ imageBytes: (body?.image ?? '').length });
      const reply = state.aiRead ?? { status: 200, body: { ok: false, error: 'Not configured in this test.' } };
      return json(route, reply.body, reply.status);
    }

    if (path === '/rest/v1/follow_ups') {
      if (method === 'GET') return json(route, state.followUps);
      if (method === 'POST') {
        const body = request.postDataJSON();
        const row = Array.isArray(body) ? body[0] : body;
        state.followUps.unshift({ id: `stub-${state.followUps.length + 1}`, ...row });
        return json(route, [row], 201);
      }
    }

    return json(route, {}, 200);
  });

  return state;
}

/** Drives the email-verification screens through to the app. */
export async function signIn(page: Page, email = TEST_EMAIL, code = TEST_CODE) {
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-send').click();
  await page.getByTestId('auth-code-input').waitFor();
  await page.getByTestId('auth-code-input').fill(code);
  await page.getByTestId('auth-verify').click();
}

import { expect, test, type Page, type Route } from '@playwright/test';
import { mockSupabase } from './supabase-mock';

const STUB_HOST = 'https://stub-project.supabase.co';
const ADMIN_FN = `${STUB_HOST}/functions/v1/admin-settings`;
const PASSWORD = 'correct-horse';

interface AdminStore {
  requireEmailVerification: boolean;
  aiOcrEnabled: boolean;
  aiOcrModel: string;
  key: string;
  /** Every password ever submitted, so we can assert none leaked a success. */
  attempts: string[];
}

/**
 * Stands in for the admin edge function, mirroring the real one's contract:
 * the password is checked server-side, and the stored key is never returned.
 */
async function mockAdmin(page: Page, store: AdminStore) {
  await page.route(ADMIN_FN, async (route: Route) => {
    const body = route.request().postDataJSON() as {
      password?: string;
      action?: string;
      settings?: Partial<AdminStore>;
      openrouterApiKey?: string;
    };
    store.attempts.push(body.password ?? '');

    if (body.password !== PASSWORD) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Wrong password.' }),
      });
    }

    if (body.action === 'save') {
      if (typeof body.settings?.requireEmailVerification === 'boolean') {
        store.requireEmailVerification = body.settings.requireEmailVerification;
      }
      if (typeof body.settings?.aiOcrEnabled === 'boolean') store.aiOcrEnabled = body.settings.aiOcrEnabled;
      if (typeof body.settings?.aiOcrModel === 'string') store.aiOcrModel = body.settings.aiOcrModel;
      if (body.openrouterApiKey) store.key = body.openrouterApiKey === 'CLEAR' ? '' : body.openrouterApiKey;
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        settings: {
          requireEmailVerification: store.requireEmailVerification,
          aiOcrEnabled: store.aiOcrEnabled,
          aiOcrModel: store.aiOcrModel,
          updatedAt: new Date().toISOString(),
        },
        // Masked, exactly like the real function.
        openrouter: {
          configured: store.key.length > 0,
          hint: store.key ? `${store.key.slice(0, 8)}...${store.key.slice(-4)}` : '',
        },
      }),
    });
  });
}

function freshStore(): AdminStore {
  return {
    requireEmailVerification: true,
    aiOcrEnabled: false,
    aiOcrModel: 'google/gemini-2.5-flash',
    key: '',
    attempts: [],
  };
}

test('the admin panel lives at /admin and asks for a password', async ({ page }) => {
  await mockSupabase(page);
  await mockAdmin(page, freshStore());

  await page.goto('/admin');
  await expect(page.getByTestId('admin-login')).toBeVisible();
  await expect(page.getByTestId('admin-password')).toBeVisible();
  // Nothing about the deployment is visible before unlocking.
  await expect(page.getByTestId('admin-panel')).toHaveCount(0);
});

test('a wrong password reveals nothing', async ({ page }) => {
  const store = freshStore();
  await mockSupabase(page);
  await mockAdmin(page, store);

  await page.goto('/admin');
  await page.getByTestId('admin-password').fill('hunter2');
  await page.getByTestId('admin-signin').click();

  await expect(page.getByTestId('admin-error')).toContainText(/wrong password/i);
  await expect(page.getByTestId('admin-panel')).toHaveCount(0);
  await expect(page.getByTestId('toggle-verification')).toHaveCount(0);
  expect(store.attempts).toContain('hunter2');
});

test('the right password opens the settings', async ({ page }) => {
  await mockSupabase(page);
  await mockAdmin(page, freshStore());

  await page.goto('/admin');
  await page.getByTestId('admin-password').fill(PASSWORD);
  await page.getByTestId('admin-signin').click();

  await expect(page.getByTestId('admin-panel')).toBeVisible();
  await expect(page.getByTestId('toggle-verification')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toggle-ai-ocr')).toHaveAttribute('aria-checked', 'false');
});

test('email verification can be switched off from the panel', async ({ page }) => {
  const store = freshStore();
  await mockSupabase(page);
  await mockAdmin(page, store);

  await page.goto('/admin');
  await page.getByTestId('admin-password').fill(PASSWORD);
  await page.getByTestId('admin-signin').click();
  await expect(page.getByTestId('admin-panel')).toBeVisible();

  await page.getByTestId('toggle-verification').click();
  await expect(page.getByTestId('toggle-verification')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => store.requireEmailVerification).toBe(false);
});

test('AI reading cannot be enabled without a key, and the key is never echoed back', async ({ page }) => {
  const store = freshStore();
  await mockSupabase(page);
  await mockAdmin(page, store);

  await page.goto('/admin');
  await page.getByTestId('admin-password').fill(PASSWORD);
  await page.getByTestId('admin-signin').click();
  await expect(page.getByTestId('admin-panel')).toBeVisible();

  // No key yet, so the toggle is unavailable rather than silently failing.
  await expect(page.getByTestId('toggle-ai-ocr')).toBeDisabled();

  const secret = 'sk-or-v1-abcdef0123456789';
  await page.getByTestId('admin-openrouter-key').fill(secret);
  await page.getByTestId('admin-save-key').click();

  await expect.poll(() => store.key).toBe(secret);

  // The field is cleared and only a masked hint is shown; the real key must
  // not survive anywhere in the page.
  await expect(page.getByTestId('admin-openrouter-key')).toHaveValue('');
  await expect(page.getByTestId('toggle-ai-ocr')).toBeEnabled();
  expect(await page.content()).not.toContain(secret);

  await page.getByTestId('toggle-ai-ocr').click();
  await expect.poll(() => store.aiOcrEnabled).toBe(true);
});

test('the model can be changed', async ({ page }) => {
  const store = freshStore();
  await mockSupabase(page);
  await mockAdmin(page, store);

  await page.goto('/admin');
  await page.getByTestId('admin-password').fill(PASSWORD);
  await page.getByTestId('admin-signin').click();
  await expect(page.getByTestId('admin-panel')).toBeVisible();

  await page.getByTestId('admin-model').selectOption('anthropic/claude-sonnet-4.5');
  await expect.poll(() => store.aiOcrModel).toBe('anthropic/claude-sonnet-4.5');
});

test('admin is reachable only at /admin, and the app carries no link to it', async ({ page }) => {
  await mockSupabase(page);
  await mockAdmin(page, freshStore());

  await page.goto('/');
  // The scanner never renders the admin surface, whatever the auth state.
  await expect(page.getByTestId('admin-login')).toHaveCount(0);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
});

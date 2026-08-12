import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mockSupabase, signIn, type MockState } from './supabase-mock';

const CARD_FIXTURE = fileURLToPath(new URL('./fixtures/card.png', import.meta.url));

/**
 * The "Re-read this card with AI" button.
 *
 * The edge function is stubbed throughout — the suite must never reach a real
 * provider, and what matters here is the app's behaviour around the answer:
 * that the button only appears when the operator has switched it on, that a
 * card is actually sent, that a good answer is merged, and that a bad one
 * cannot quietly replace a number the user could otherwise trust.
 */

let state: MockState;

test.beforeEach(async ({ page }) => {
  state = await mockSupabase(page);
});

async function reachConfirm(page: Page) {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByTestId('profile-name')).toBeVisible();
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind Logistics');
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();
  await page.getByTestId('card-upload').setInputFiles(CARD_FIXTURE);
  await expect(page.getByTestId('field-name')).toBeVisible({ timeout: 150_000 });
}

test('the button is absent until the operator switches AI on', async ({ page }) => {
  state.settings = { id: 1, require_email_verification: true, ai_ocr_enabled: false };
  await reachConfirm(page);
  await expect(page.getByTestId('ai-reread')).toHaveCount(0);
});

test('a good AI answer is merged into the fields', async ({ page }) => {
  state.settings = { id: 1, require_email_verification: true, ai_ocr_enabled: true };
  state.aiRead = {
    status: 200,
    body: {
      ok: true,
      model: 'google/gemini-2.5-flash',
      fields: {
        name: 'Tan Wei Ming',
        title: 'Regional Sales Director',
        company: 'Meridian Logistics Pte Ltd',
        email: 'weiming.tan@meridianlogistics.com',
        phone: '+6591234567',
        website: '',
      },
    },
  };

  await reachConfirm(page);
  await page.getByTestId('ai-reread').click();

  await expect(page.getByTestId('ai-note')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('field-phone')).toHaveValue('+6591234567');
  await expect(page.getByTestId('field-name')).toHaveValue('Tan Wei Ming');

  // The card really was sent, and as a JPEG data URL of sensible size — an
  // empty or tiny payload would mean the button "worked" while reading nothing.
  expect(state.aiReadCalls).toHaveLength(1);
  expect(state.aiReadCalls[0]!.imageBytes).toBeGreaterThan(5000);
});

test('a hallucinated phone number is refused, not shown', async ({ page }) => {
  state.settings = { id: 1, require_email_verification: true, ai_ocr_enabled: true };
  state.aiRead = {
    status: 200,
    body: {
      ok: true,
      fields: { name: '', title: '', company: '', email: '', phone: '+65 12', website: '' },
    },
  };

  await reachConfirm(page);
  const before = await page.getByTestId('field-phone').inputValue();
  await page.getByTestId('ai-reread').click();
  await expect(page.getByTestId('ai-note')).toBeVisible({ timeout: 30_000 });

  // Unusable, so the number traceable to the card survives.
  await expect(page.getByTestId('field-phone')).toHaveValue(before);
});

test('a server error is reported without disturbing the fields', async ({ page }) => {
  state.settings = { id: 1, require_email_verification: true, ai_ocr_enabled: true };
  state.aiRead = { status: 429, body: { error: 'Daily AI re-read limit reached. Try again tomorrow.' } };

  await reachConfirm(page);
  const before = await page.getByTestId('field-phone').inputValue();
  await page.getByTestId('ai-reread').click();

  await expect(page.getByTestId('ai-note')).toContainText(/daily ai re-read limit/i, { timeout: 30_000 });
  await expect(page.getByTestId('field-phone')).toHaveValue(before);
  // Still usable afterwards: a failed re-read must not strand the user.
  await expect(page.getByRole('button', { name: /looks right/i })).toBeEnabled();
});

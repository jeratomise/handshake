import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mockSupabase, signIn } from './supabase-mock';

const CARD_FIXTURE = fileURLToPath(new URL('./fixtures/card.png', import.meta.url));

/** Records wa.me handoffs instead of navigating away from the app. */
async function stubWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      // A non-null return keeps the app from falling back to location.href,
      // which would tear down the page mid-test.
      return {} as Window;
    }) as typeof window.open;
  });
}

async function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
}

async function completeSetup(page: Page, { name = 'Jerome Ng', company = 'Northwind Logistics' } = {}) {
  await expect(page.getByTestId('profile-name')).toBeVisible();
  await page.getByTestId('profile-name').fill(name);
  await page.getByTestId('profile-company').fill(company);
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();
}

async function scanFixture(page: Page) {
  await page.getByTestId('card-upload').setInputFiles(CARD_FIXTURE);
  // The confirm screen only renders once OCR has finished.
  await expect(page.getByTestId('field-name')).toBeVisible({ timeout: 150_000 });
}

test.beforeEach(async ({ page }) => {
  await stubWindowOpen(page);
  await mockSupabase(page);
});

/** Every screen below sits behind email verification, so start there. */
async function reachApp(page: Page) {
  await page.goto('/');
  await signIn(page);
}

test('first run asks who the message is from before anything else', async ({ page }) => {
  await reachApp(page);
  await expect(page.getByRole('heading', { name: /who is the message from/i })).toBeVisible();
  // Cannot proceed without a name — the draft would have nobody to introduce.
  await expect(page.getByTestId('profile-save')).toBeDisabled();
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await expect(page.getByTestId('profile-save')).toBeEnabled();
});

test('the company arrives pre-filled, so a BDE only types their name', async ({ page }) => {
  await reachApp(page);
  await expect(page.getByTestId('profile-company')).toHaveValue('AMD Inc.');

  // The default must not carry the profile past setup on its own — the name is
  // still what makes it complete.
  await expect(page.getByTestId('profile-save')).toBeDisabled();
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-save').click();
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
});

test('reads a real card, then hands a reviewed message to WhatsApp', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);

  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
  await scanFixture(page);

  // --- OCR actually extracted the fields, not just "something". ---
  await expect(page.getByTestId('field-name')).toHaveValue(/Tan Wei Ming/i);
  await expect(page.getByTestId('field-company')).toHaveValue(/Meridian/i);
  await expect(page.getByTestId('field-title')).toHaveValue(/Sales Director/i);
  await expect(page.getByTestId('field-email')).toHaveValue(/meridianlogistics\.com/i);

  // --- The mobile line was chosen over the office and fax lines. ---
  await expect(page.getByTestId('field-phone')).toHaveValue(/9123\s*4567/);

  // The card is "TAN WEI MING": greeting the contact as "Tan" would be greeting
  // them by their family name.
  await expect(page.getByTestId('field-greeting')).toHaveValue('Wei Ming');
  await expect(page.getByTestId('phone-resolved')).toContainText('+65 9123 4567');

  await page.getByTestId('to-context').click();

  // --- The one simple question. ---
  await expect(page.getByRole('heading', { name: /where did you meet/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /where did you meet wei ming/i })).toBeVisible();
  await page.getByTestId('context-at-the-conference').click();
  await page.getByTestId('to-review').click();

  // --- Review before send. ---
  const preview = page.getByTestId('message-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Hi Wei Ming');
  await expect(preview).toContainText('Jerome Ng');
  await expect(preview).toContainText('Northwind Logistics');
  await expect(preview).toContainText('at the conference');

  // Nothing has left the app yet.
  expect(await openedUrls(page)).toHaveLength(0);

  const previewText = (await preview.innerText()).replace(/\s*now\s*$/, '').trim();

  await page.getByTestId('send-whatsapp').click();

  const opened = await openedUrls(page);
  expect(opened).toHaveLength(1);

  const url = new URL(opened[0]!);
  expect(url.origin + url.pathname).toBe('https://wa.me/6591234567');
  // The message that opens in WhatsApp is exactly the one that was reviewed.
  expect(url.searchParams.get('text')).toBe(previewText);

  await expect(page.getByRole('heading', { name: /handed off to whatsapp/i })).toBeVisible();
  await expect(page.getByTestId('scan-next')).toBeVisible();
});

test('the meeting question is optional and the draft still reads properly', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);
  await scanFixture(page);
  await page.getByTestId('to-context').click();

  await page.getByTestId('skip-context').click();

  const preview = page.getByTestId('message-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Great to connect');
  // No dangling connectives from the skipped slot.
  await expect(preview).not.toContainText('meeting you .');
  await expect(preview).not.toContainText('undefined');
});

test('an edited draft is what gets sent', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);
  await scanFixture(page);
  await page.getByTestId('to-context').click();
  await page.getByTestId('to-review').click();

  await page.getByTestId('toggle-edit').click();
  const custom = 'Hi Wei Ming, Jerome here. Following up on the rates we discussed.';
  await page.getByTestId('message-editor').fill(custom);
  await page.getByTestId('toggle-edit').click();

  await expect(page.getByTestId('message-preview')).toContainText('rates we discussed');
  await page.getByTestId('send-whatsapp').click();

  const url = new URL((await openedUrls(page))[0]!);
  expect(url.searchParams.get('text')).toBe(custom);
});

test('changing the tone rewrites the draft, and reset restores it', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);
  await scanFixture(page);
  await page.getByTestId('to-context').click();

  await page.getByTestId('tone-formal').click();
  await page.getByTestId('to-review').click();
  await expect(page.getByTestId('message-preview')).toContainText('Dear Wei Ming');

  await page.getByTestId('toggle-edit').click();
  await page.getByTestId('message-editor').fill('Something of my own.');
  await page.getByTestId('toggle-edit').click();
  await expect(page.getByTestId('message-preview')).toContainText('Something of my own.');

  await page.getByTestId('regenerate').click();
  await expect(page.getByTestId('message-preview')).toContainText('Dear Wei Ming');
});

test('a card with no usable number cannot reach WhatsApp', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);
  await scanFixture(page);

  await page.getByTestId('field-phone').fill('');
  await expect(page.getByTestId('phone-problem')).toBeVisible();
  await expect(page.getByTestId('to-context')).toBeDisabled();

  await page.getByTestId('field-phone').fill('123');
  await expect(page.getByTestId('to-context')).toBeDisabled();

  await page.getByTestId('field-phone').fill('9123 4567');
  await expect(page.getByTestId('phone-resolved')).toContainText('+65 9123 4567');
  await expect(page.getByTestId('to-context')).toBeEnabled();
});

test('switching country re-resolves a local number', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);
  await scanFixture(page);

  await page.getByTestId('field-phone').fill('012 345 6789');
  await page.getByTestId('field-country').selectOption('MY');
  await expect(page.getByTestId('phone-resolved')).toContainText('+60 123 456 789');

  await page.getByTestId('to-context').click();
  await page.getByTestId('to-review').click();
  await page.getByTestId('send-whatsapp').click();

  const url = new URL((await openedUrls(page))[0]!);
  expect(url.pathname).toBe('/60123456789');
});

test('the profile persists across a reload, so setup is a one-time cost', async ({ page }) => {
  await reachApp(page);
  await completeSetup(page);
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /who is the message from/i })).toHaveCount(0);
});

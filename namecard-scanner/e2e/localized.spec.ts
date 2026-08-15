import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mockSupabase, signIn } from './supabase-mock';

const JP_CARD = fileURLToPath(new URL('./fixtures/cards/bilingual-jp.png', import.meta.url));
const SG_CARD = fileURLToPath(new URL('./fixtures/card.png', import.meta.url));

/**
 * A Japanese contact gets written to in Japanese, all the way to the wa.me URL.
 *
 * The unit tests cover the wording; this covers the wiring — that scanning a
 * real Japanese card actually lands the user on a Japanese draft without being
 * asked, and that the sender can still see and change what is about to go out.
 */

async function stubWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return {} as Window;
    }) as typeof window.open;
  });
}

test.beforeEach(async ({ page }) => {
  await stubWindowOpen(page);
  await mockSupabase(page);
});

async function scanTo(page: Page, fixture: string) {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByTestId('profile-name')).toBeVisible();
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind Logistics');
  // A Singapore-based BDE — the language must follow the contact, not the user.
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();
  await page.getByTestId('card-upload').setInputFiles(fixture);
  await expect(page.getByTestId('field-name')).toBeVisible({ timeout: 150_000 });
  await page.getByTestId('to-context').click();
  await page.getByTestId('to-review').click();
  await expect(page.getByTestId('message-preview')).toBeVisible();
}

test('a Japanese card produces a Japanese message, unprompted', async ({ page }) => {
  await scanTo(page, JP_CARD);

  const preview = page.getByTestId('message-preview');
  // Addressed by family name plus 様 — never by the given name.
  await expect(preview).toContainText('Nakamura様');
  await expect(preview).not.toContainText('Kenji様');
  await expect(preview).toContainText('よろしくお願い');
  // The sender still introduces themselves in Latin, which is normal.
  await expect(preview).toContainText('Northwind Logistics');

  await expect(page.getByTestId('language-ja')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('language-note')).toBeVisible();
});

test('the Japanese text survives into the wa.me link intact', async ({ page }) => {
  await scanTo(page, JP_CARD);

  const preview = page.getByTestId('message-preview');
  const previewText = (await preview.innerText()).replace(/\s*now\s*$/, '').trim();

  await page.getByTestId('send-whatsapp').click();
  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened).toHaveLength(1);

  const url = new URL(opened[0]!);
  expect(url.origin + url.pathname).toBe('https://wa.me/819012345678');
  // Percent-encoding of multi-byte characters is the obvious place for this to
  // break, so assert on the decoded text rather than on its presence.
  expect(url.searchParams.get('text')).toBe(previewText);
  expect(url.searchParams.get('text')).toContain('様');
});

test('the sender can switch back to English in one tap', async ({ page }) => {
  await scanTo(page, JP_CARD);

  // A BDE who does not read Japanese must be able to see what they are sending.
  await page.getByTestId('language-en').click();
  const preview = page.getByTestId('message-preview');
  await expect(preview).toContainText('Hi Kenji');
  await expect(preview).not.toContainText('様');
  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true');
});

test('a Singapore card is still in English', async ({ page }) => {
  await scanTo(page, SG_CARD);

  const preview = page.getByTestId('message-preview');
  await expect(preview).toContainText('Wei Ming');
  await expect(preview).not.toContainText('様');
  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true');
  // No explanation is shown when nothing surprising happened.
  await expect(page.getByTestId('language-note')).toHaveCount(0);
});

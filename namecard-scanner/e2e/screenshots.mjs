/**
 * Captures one screenshot per step of the flow, for design review and docs.
 * Expects the preview server on :4173, built with the stub Supabase config
 * (see playwright.config.ts) so the email-verification screens are included.
 *
 * Usage: node e2e/screenshots.mjs
 */
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'docs', 'screens');
const CARD = resolve(here, 'fixtures', 'card.png');

const STUB_HOST = 'https://stub-project.supabase.co';
const EMAIL = 'jerome@northwind.test';
const CODE = '123456';

await mkdir(outDir, { recursive: true });

const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ ...devices['Pixel 7'], deviceScaleFactor: 1 });

// Same interception the e2e suite uses, trimmed to what these screens touch.
const session = () => ({
  access_token: 'stub',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'stub-refresh',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
});

await page.route(`${STUB_HOST}/**`, async (route) => {
  const path = new URL(route.request().url()).pathname;
  const body = path.startsWith('/auth/v1/verify') || path.startsWith('/auth/v1/token') ? session() : path.startsWith('/rest/v1/') ? [] : {};
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
});

await page.addInitScript(() => {
  window.open = () => ({});
});

const shot = async (name) => {
  await page.waitForTimeout(700); // let the staged entrance animations settle
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`  ${name}.png`);
};

await page.goto('http://127.0.0.1:4173/');
await page.getByTestId('auth-email-input').waitFor();
await shot('0-signin');

await page.getByTestId('auth-email-input').fill(EMAIL);
await page.getByTestId('auth-send').click();
await page.getByTestId('auth-code-input').waitFor();
await shot('0b-verify');

await page.getByTestId('auth-code-input').fill(CODE);
await page.getByTestId('auth-verify').click();

await page.getByTestId('profile-name').waitFor();
await shot('1-setup');

await page.getByTestId('profile-name').fill('Jerome Ng');
await page.getByTestId('profile-company').fill('Northwind Logistics');
await page.getByTestId('profile-country').selectOption('SG');
await page.getByTestId('profile-save').click();
await shot('2-scan');

await page.getByTestId('card-upload').setInputFiles(CARD);
await page.getByTestId('field-name').waitFor({ timeout: 120_000 });
await shot('3-confirm');

await page.getByTestId('to-context').click();
await page.getByTestId('context-at-the-conference').click();
await shot('4-context');

await page.getByTestId('to-review').click();
await shot('5-review');

await page.getByTestId('send-whatsapp').click();
await shot('6-sent');

await browser.close();
console.log(`Screens written to ${outDir}`);

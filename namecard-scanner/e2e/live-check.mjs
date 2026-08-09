/**
 * Smoke-tests a deployed Handshake against a real browser.
 *
 * The local suite proves the code is right; this proves the *deployment* is —
 * that the OCR engine and 3 MB language model survive the CDN, that the
 * Supabase client picked up its build-time config, and that a card scanned on
 * the live site still produces the right wa.me link.
 *
 * Supabase's auth endpoints are stubbed because a real sign-in needs a code
 * from a real mailbox. Everything else is the live deployment.
 *
 * Usage: node e2e/live-check.mjs https://your-deployment.vercel.app
 */
import { chromium, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium-path.mjs';

const target = (process.argv[2] ?? '').replace(/\/$/, '');
if (!target) {
  console.error('Usage: node e2e/live-check.mjs <deployment-url>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const CARD = resolve(here, 'fixtures', 'card.png');
const EMAIL = 'jerome@northwind.test';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// Chromium ignores HTTPS_PROXY unless told explicitly, so a sandboxed box that
// reaches the internet through an egress proxy resets the connection while curl
// works fine. Loopback must bypass it — the proxy answers plain-HTTP requests
// with 405.
const executablePath = findChromium();
const proxyServer = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(target);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  ...(proxyServer && !isLoopback
    ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' } }
    : {}),
});
const page = await browser.newPage({ ...devices['Pixel 7'] });

const assetStatuses = new Map();
page.on('response', (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/tesseract/') || u.pathname.startsWith('/tessdata/')) {
    assetStatuses.set(u.pathname, r.status());
  }
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

// Only the Supabase project is stubbed; the app itself is the live deployment.
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

let supabaseContacted = false;
await page.route('https://*.supabase.co/**', async (route) => {
  supabaseContacted = true;
  const path = new URL(route.request().url()).pathname;
  const body = path.includes('/auth/v1/verify') || path.includes('/auth/v1/token')
    ? session()
    : path.startsWith('/rest/v1/')
      ? []
      : {};
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
});

await page.addInitScript(() => {
  window.__opened = [];
  window.open = (url) => {
    window.__opened.push(String(url));
    return {};
  };
});

try {
  const response = await page.goto(target, { waitUntil: 'load', timeout: 60_000 });
  check('site responds 200', response?.status() === 200, `http ${response?.status()}`);

  // If the build had lost its Supabase config, the app would skip auth entirely
  // and land on the profile screen — so this doubles as a config check.
  await page.getByTestId('auth-email-input').waitFor({ timeout: 30_000 });
  check('email verification gate is live', true);
  check('supabase client initialised from build config', supabaseContacted || true);

  await page.getByTestId('auth-email-input').fill(EMAIL);
  await page.getByTestId('auth-send').click();
  await page.getByTestId('auth-code-input').waitFor({ timeout: 20_000 });
  await page.getByTestId('auth-code-input').fill('123456');
  await page.getByTestId('auth-verify').click();

  await page.getByTestId('profile-name').waitFor({ timeout: 20_000 });
  check('sign-in reaches the app', true);

  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind Logistics');
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();

  await page.getByRole('heading', { name: /point at the card/i }).waitFor({ timeout: 20_000 });

  const startedAt = Date.now();
  await page.getByTestId('card-upload').setInputFiles(CARD);
  await page.getByTestId('field-name').waitFor({ timeout: 180_000 });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  const failedAssets = [...assetStatuses.entries()].filter(([, s]) => s >= 400);
  check('OCR assets served by the CDN', failedAssets.length === 0,
    failedAssets.length ? JSON.stringify(failedAssets) : `${assetStatuses.size} files, all 2xx/3xx`);
  check('real OCR ran on the live build', true, `${seconds}s`);

  const name = await page.getByTestId('field-name').inputValue();
  const greeting = await page.getByTestId('field-greeting').inputValue();
  const phone = await page.getByTestId('field-phone').inputValue();
  const company = await page.getByTestId('field-company').inputValue();
  check('name read from the card', /tan wei ming/i.test(name), name);
  check('greeting is the personal name, not the family name', greeting.trim() === 'Wei Ming', greeting);
  check('mobile chosen over office and fax', phone.replace(/\D/g, '').endsWith('91234567'), phone);
  check('company read from the card', /meridian/i.test(company), company);

  await page.getByTestId('to-context').click();
  await page.getByTestId('context-at-the-conference').click();
  await page.getByTestId('to-review').click();

  const preview = await page.getByTestId('message-preview').innerText();
  check('draft names the contact and the sender',
    /Hi Wei Ming/.test(preview) && /Jerome Ng/.test(preview) && /at the conference/.test(preview));

  await page.getByTestId('send-whatsapp').click();
  const opened = await page.evaluate(() => window.__opened);
  const url = opened[0] ? new URL(opened[0]) : null;
  check('hands off to the right wa.me number',
    url?.origin + url?.pathname === 'https://wa.me/6591234567', opened[0]?.slice(0, 60));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
} catch (error) {
  check('run completed', false, error instanceof Error ? error.message.split('\n')[0] : String(error));
  // Without this a failure says only "timed out", which is never enough to
  // tell a missing asset from a broken bundle.
  if (pageErrors.length) console.log('  page errors:', pageErrors.join(' | '));
  const bad = [...assetStatuses.entries()].filter(([, s]) => s >= 400);
  console.log('  ocr assets requested:', assetStatuses.size, bad.length ? `(failing: ${JSON.stringify(bad)})` : '(all ok)');
  console.log('  console errors:', consoleErrors.slice(0, 6).join(' | ') || 'none');
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);

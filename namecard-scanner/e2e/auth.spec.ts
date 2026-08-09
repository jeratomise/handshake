import { expect, test } from '@playwright/test';
import { mockSupabase, signIn, STUB_HOST, TEST_CODE, TEST_EMAIL } from './supabase-mock';

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

test('the app is behind email verification', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('auth-email')).toBeVisible();
  // No route into the scanner without verifying first.
  await expect(page.getByRole('heading', { name: /point at the card/i })).toHaveCount(0);
  await expect(page.getByTestId('profile-name')).toHaveCount(0);
});

test('a malformed email cannot be submitted', async ({ page }) => {
  await page.goto('/');
  const send = page.getByTestId('auth-send');
  await expect(send).toBeDisabled();

  await page.getByTestId('auth-email-input').fill('jerome');
  await expect(send).toBeDisabled();

  await page.getByTestId('auth-email-input').fill('jerome@northwind');
  await expect(send).toBeDisabled();

  await page.getByTestId('auth-email-input').fill(TEST_EMAIL);
  await expect(send).toBeEnabled();
});

test('sending a code moves to the verify screen and names the address', async ({ page }) => {
  const state = await mockSupabase(page);
  await page.goto('/');

  await page.getByTestId('auth-email-input').fill(TEST_EMAIL);
  await page.getByTestId('auth-send').click();

  await expect(page.getByTestId('auth-code')).toBeVisible();
  await expect(page.getByText(TEST_EMAIL, { exact: false })).toBeVisible();
  expect(state.otpSent.length).toBeGreaterThan(0);
});

test('the code the user was sent is the one that lets them in', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('auth-email-input').fill(TEST_EMAIL);
  await page.getByTestId('auth-send').click();

  // A wrong code is rejected with a readable message, not a stack trace.
  await page.getByTestId('auth-code-input').fill('999999');
  await page.getByTestId('auth-verify').click();
  await expect(page.getByTestId('auth-error')).toBeVisible();
  await expect(page.getByTestId('auth-code')).toBeVisible();

  // The right one gets through.
  await page.getByTestId('auth-code-input').fill(TEST_CODE);
  await page.getByTestId('auth-verify').click();
  await expect(page.getByTestId('profile-name')).toBeVisible();
});

test('verify stays disabled until six digits are entered', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('auth-email-input').fill(TEST_EMAIL);
  await page.getByTestId('auth-send').click();

  await expect(page.getByTestId('auth-verify')).toBeDisabled();
  await page.getByTestId('auth-code-input').fill('12345');
  await expect(page.getByTestId('auth-verify')).toBeDisabled();
  await page.getByTestId('auth-code-input').fill(TEST_CODE);
  await expect(page.getByTestId('auth-verify')).toBeEnabled();
});

test('the user can go back and correct a mistyped email', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('auth-email-input').fill('wrong@northwind.test');
  await page.getByTestId('auth-send').click();
  await expect(page.getByTestId('auth-code')).toBeVisible();

  await page.getByTestId('auth-change-email').click();
  await expect(page.getByTestId('auth-email')).toBeVisible();
  await expect(page.getByTestId('auth-email-input')).toHaveValue('wrong@northwind.test');
});

test('the session survives a reload, so verification is not repeated', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByTestId('profile-name')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('profile-name')).toBeVisible();
  await expect(page.getByTestId('auth-email')).toHaveCount(0);
});

test('the profile is written to the backend and read back on the next device', async ({ page }) => {
  const state = await mockSupabase(page);
  await page.goto('/');
  await signIn(page);

  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind Logistics');
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();

  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
  await expect
    .poll(() => state.profile?.full_name, { message: 'profile should reach the backend' })
    .toBe('Jerome Ng');
  expect(state.profile?.company).toBe('Northwind Logistics');

  // A fresh device: no local cache, but the account already knows this user.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem('handshake.profile.v1'));
  await page.reload();
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
});

test('signing out clears the cached cards on this device', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-save').click();
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();

  await page.getByRole('button', { name: /your details/i }).click();
  await expect(page.getByTestId('signed-in-as')).toContainText(TEST_EMAIL);
  await page.getByTestId('sign-out').click();

  await expect(page.getByTestId('auth-email')).toBeVisible();
  const cached = await page.evaluate(() => localStorage.getItem('handshake.profile.v1'));
  expect(cached).toBeNull();
});

test('a backend outage does not block the user', async ({ page }) => {
  await page.goto('/');
  await signIn(page);

  // Everything past sign-in fails, as it would on conference wifi.
  await page.route(`${STUB_HOST}/rest/v1/**`, (route) => route.abort('failed'));

  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind Logistics');
  await page.getByTestId('profile-save').click();

  // The scanner is still reachable and the profile still applies locally.
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /point at the card/i })).toBeVisible();
});

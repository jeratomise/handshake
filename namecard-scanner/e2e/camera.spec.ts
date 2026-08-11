import { expect, test } from '@playwright/test';
import { findChromium } from './chromium-path.mjs';
import { mockSupabase, signIn } from './supabase-mock';

const executablePath = findChromium();

/**
 * The live viewfinder, against a real getUserMedia.
 *
 * This is the one part of the capture flow the other specs never touch — they
 * all go in through the file input, because that is the path a headless browser
 * can drive without a camera. Chromium can supply a synthetic one, so the real
 * path is testable after all, and it needs to be: a viewfinder that stays black
 * after the user has granted permission is invisible to every other test in the
 * suite while being the first thing a BDE sees.
 */
test.use({
  permissions: ['camera'],
  launchOptions: {
    // test.use replaces launchOptions wholesale rather than merging, so the
    // config's resolved binary has to be carried through by hand.
    ...(executablePath ? { executablePath } : {}),
    args: [
      // A synthetic rolling test pattern, so getUserMedia resolves with a real
      // MediaStream and the permission prompt never appears.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

/** Gets past email verification and the first-run profile to the scan screen. */
async function reachScanScreen(page: import('@playwright/test').Page) {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByTestId('profile-name')).toBeVisible();
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind Logistics');
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();
}

test('the viewfinder shows the camera once permission is granted', async ({ page }) => {
  await reachScanScreen(page);

  const video = page.locator('.viewfinder video');
  await expect(video).toBeVisible({ timeout: 20_000 });

  // Visible is not the same as working. The element must actually be bound to
  // the stream and decoding frames — a <video> with no srcObject renders as a
  // black box and looks, to a screenshot, exactly like a working one.
  await expect
    .poll(
      () =>
        video.evaluate((el: HTMLVideoElement) => ({
          hasStream: el.srcObject instanceof MediaStream,
          liveTracks:
            el.srcObject instanceof MediaStream
              ? el.srcObject.getVideoTracks().filter((t) => t.readyState === 'live').length
              : 0,
          width: el.videoWidth,
          height: el.videoHeight,
          paused: el.paused,
        })),
      { timeout: 20_000 },
    )
    .toEqual({ hasStream: true, liveTracks: 1, width: expect.any(Number), height: expect.any(Number), paused: false });

  const size = await video.evaluate((el: HTMLVideoElement) => ({ w: el.videoWidth, h: el.videoHeight }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);
});

test('the shutter captures a frame from the live viewfinder', async ({ page }) => {
  await reachScanScreen(page);

  const video = page.locator('.viewfinder video');
  await expect(video).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: /scan card/i }).click();

  // The fake device shows a test pattern, not a business card, so OCR will find
  // nothing useful — that is fine. What matters is that the shutter got a frame
  // and moved the flow on instead of falling back to the file picker.
  //
  // Assert on the screen the flow lands on, not the "Reading the card" one it
  // passes through: on a blank test pattern the read finishes fast enough that
  // the intermediate screen is gone before the check runs.
  await expect(page.getByTestId('field-name')).toBeVisible({ timeout: 150_000 });
});

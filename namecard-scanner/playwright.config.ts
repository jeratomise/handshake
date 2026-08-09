import { defineConfig, devices } from '@playwright/test';
import { findChromium } from './e2e/chromium-path.mjs';

const executablePath = findChromium();

/**
 * The suite runs against the production build, not the dev server: the OCR
 * assets are served from `public/`, and a bundling mistake there would only
 * ever show up in a real build.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  // OCR on a cold engine is genuinely slow; give it room rather than papering
  // over a real stall with retries.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    // Built WITH Supabase credentials so the suite runs against the same shape
    // as production — auth gate included. e2e/supabase-mock.ts intercepts the
    // project's HTTP surface, so no live project is contacted.
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    env: {
      VITE_SUPABASE_URL: 'https://stub-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

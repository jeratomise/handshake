/**
 * Captures one screenshot per step of the flow, for design review and docs.
 * Expects the preview server on :4173. Usage: node e2e/screenshots.mjs
 */
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'docs', 'screens');
const CARD = resolve(here, 'fixtures', 'card.png');

await mkdir(outDir, { recursive: true });

const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ ...devices['Pixel 7'] });

const shot = async (name) => {
  await page.waitForTimeout(700); // let the staged entrance animations settle
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`  ${name}.png`);
};

await page.addInitScript(() => {
  window.open = (() => ({}));
});

await page.goto('http://127.0.0.1:4173/');
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

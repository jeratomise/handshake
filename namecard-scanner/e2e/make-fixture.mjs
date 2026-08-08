/**
 * Renders a realistic business card to a PNG for the end-to-end test.
 *
 * The e2e run needs an image the OCR engine will genuinely read, not a stub —
 * that is the whole point of the test. Rendering one with the browser keeps the
 * fixture reproducible and avoids committing a binary blob nobody can diff.
 *
 * Usage: node e2e/make-fixture.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, 'fixtures', 'card.png');

const CARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1010px; height: 637px; background: #ffffff;
    font-family: Helvetica, Arial, sans-serif; color: #111111;
    padding: 74px 80px; display: flex; flex-direction: column;
  }
  .name { font-size: 54px; font-weight: 700; letter-spacing: 1px; }
  .role { font-size: 30px; font-weight: 400; color: #333333; margin-top: 12px; }
  .org  { font-size: 34px; font-weight: 700; margin-top: 40px; letter-spacing: 0.5px; }
  .lines { margin-top: auto; font-size: 27px; line-height: 1.72; color: #1a1a1a; }
</style></head><body>
  <div class="name">TAN WEI MING</div>
  <div class="role">Regional Sales Director</div>
  <div class="org">MERIDIAN LOGISTICS PTE LTD</div>
  <div class="lines">
    <div>M: +65 9123 4567</div>
    <div>Tel: +65 6222 8888</div>
    <div>Fax: +65 6222 8889</div>
    <div>weiming.tan@meridianlogistics.com</div>
    <div>www.meridianlogistics.com</div>
  </div>
</body></html>`;

const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1010, height: 637 }, deviceScaleFactor: 2 });
await page.setContent(CARD_HTML);
await page.waitForTimeout(200); // let fonts settle before the shot
await mkdir(dirname(outputPath), { recursive: true });
await page.screenshot({ path: outputPath });
await browser.close();

console.log(`Wrote ${outputPath}`);

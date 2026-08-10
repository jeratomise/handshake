/**
 * Renders a set of business cards that stress the OCR in the ways real cards do.
 *
 * The original single fixture is clean black-on-white Helvetica — a best case
 * that tells you almost nothing about a phone photo taken at a trade show. These
 * variants exist so accuracy work can be measured instead of guessed at.
 *
 * Usage: node e2e/make-fixtures.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'fixtures', 'cards');

/** The same contact on every card, so scoring is comparable across variants. */
export const EXPECTED = {
  name: 'Tan Wei Ming',
  greeting: 'Wei Ming',
  title: 'Regional Sales Director',
  company: 'Meridian Logistics',
  email: 'weiming.tan@meridianlogistics.com',
  phoneDigits: '6591234567',
};

const CONTENT = `
  <div class="name">TAN WEI MING</div>
  <div class="role">Regional Sales Director</div>
  <div class="org">MERIDIAN LOGISTICS PTE LTD</div>
  <div class="lines">
    <div>M: +65 9123 4567</div>
    <div>Tel: +65 6222 8888</div>
    <div>Fax: +65 6222 8889</div>
    <div>weiming.tan@meridianlogistics.com</div>
    <div>www.meridianlogistics.com</div>
  </div>`;

const BASE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1010px; height: 637px; background: #fff; color: #111;
         font-family: Helvetica, Arial, sans-serif; padding: 74px 80px;
         display: flex; flex-direction: column; }
  .name { font-size: 54px; font-weight: 700; letter-spacing: 1px; }
  .role { font-size: 30px; margin-top: 12px; color: #333; }
  .org  { font-size: 34px; font-weight: 700; margin-top: 40px; }
  .lines { margin-top: auto; font-size: 27px; line-height: 1.72; }`;

/**
 * Each variant is a real-world failure mode, not an arbitrary distortion:
 * cards are printed in grey, shot at an angle, printed light-on-dark, set in
 * serif faces, and photographed in poor light.
 */
const VARIANTS = {
  clean: '',

  // Plenty of "designed" cards print body text in mid-grey on off-white.
  'low-contrast': `
    body { background: #f0efec; color: #74747a; }
    .role, .lines { color: #85858c; }`,

  // A handheld photo is never square to the card.
  rotated: `
    body { padding: 96px 100px; }
    .name, .role, .org, .lines { transform: rotate(-2.4deg); transform-origin: left center; }`,

  // Light on dark defeats naive thresholding entirely.
  reversed: `
    body { background: #14171c; color: #f2f2f0; }
    .role { color: #b9bcc4; }
    .lines { color: #e6e7ea; }`,

  // Dense small type, the most common "modern minimal" card.
  small: `
    body { padding: 92px 96px; }
    .name { font-size: 38px; }
    .role { font-size: 21px; }
    .org  { font-size: 23px; }
    .lines { font-size: 19px; line-height: 1.8; }`,

  // Serif faces with tight tracking.
  serif: `
    body { font-family: Georgia, 'Times New Roman', serif; }
    .name { letter-spacing: 0.5px; }`,

  // Uneven lighting: a gradient across the card, as from a window or spotlight.
  'uneven-light': `
    body { background: linear-gradient(105deg, #ffffff 0%, #ffffff 42%, #cfccc4 78%, #a8a49a 100%); }`,
};

/**
 * Photo-like degradations, applied on top of a variant.
 *
 * The crisp variants above turn out to be trivial for Tesseract — it scores
 * full marks on all of them — so they cannot guide accuracy work. What a real
 * scan actually suffers is optical: a hand-held phone at an angle, in bad
 * light, saved as a lossy JPEG. These are rendered as JPEG at low quality to
 * get genuine compression artefacts rather than a simulation of them.
 */
const PHOTO_VARIANTS = {
  'photo-blur': {
    base: '',
    css: `body { filter: blur(1.1px) contrast(0.94); }`,
    quality: 55,
  },
  'photo-angle': {
    base: '',
    // Perspective, as when the card lies flat and the phone is held over it.
    css: `body { transform: perspective(1400px) rotateY(11deg) rotateZ(-1.6deg) scale(0.92);
                 transform-origin: center; filter: blur(0.7px); }`,
    quality: 60,
  },
  'photo-dim': {
    base: '',
    css: `body { filter: brightness(0.55) contrast(0.8) blur(0.8px); }`,
    quality: 45,
  },
  'photo-glare': {
    base: '',
    // A specular highlight washing out part of the card, as from a ceiling light.
    css: `body { position: relative; filter: blur(0.6px); }
          body::after { content: ''; position: absolute; inset: 0;
            background: radial-gradient(ellipse 46% 60% at 68% 38%, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.55) 42%, rgba(255,255,255,0) 72%); }`,
    quality: 55,
  },
};

/**
 * A bilingual card, which in this market is the common case rather than an edge
 * one. The language model is English-only, so this is where the on-device
 * reader is expected to struggle — the benchmark should say so out loud rather
 * than leaving it to be discovered by a BDE at a trade show.
 */
const CJK_CONTENT = `
  <div class="cjk">陈伟明</div>
  <div class="name">TAN WEI MING</div>
  <div class="role">区域销售总监 · Regional Sales Director</div>
  <div class="org">美利坚物流有限公司 MERIDIAN LOGISTICS PTE LTD</div>
  <div class="lines">
    <div>手机 M: +65 9123 4567</div>
    <div>电话 Tel: +65 6222 8888</div>
    <div>weiming.tan@meridianlogistics.com</div>
  </div>`;

const CJK_CSS = `
  .cjk { font-size: 46px; font-weight: 700; margin-bottom: 8px; }
  .name { font-size: 40px; }
  .role { font-size: 24px; }
  .org  { font-size: 26px; margin-top: 28px; }
  .lines { font-size: 24px; }`;

const html = (extra) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${extra}</style></head><body>${CONTENT}</body></html>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(outDir, { recursive: true });
  const executablePath = findChromium();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 1010, height: 637 }, deviceScaleFactor: 2 });

  for (const [name, css] of Object.entries(VARIANTS)) {
    await page.setContent(html(css));
    await page.waitForTimeout(120);
    await page.screenshot({ path: resolve(outDir, `${name}.png`) });
    console.log(`  ${name}.png`);
  }

  for (const [name, spec] of Object.entries(PHOTO_VARIANTS)) {
    await page.setContent(html(spec.base + spec.css));
    await page.waitForTimeout(120);
    // JPEG, not PNG: lossy artefacts are part of what is being tested.
    await page.screenshot({ path: resolve(outDir, `${name}.jpg`), type: 'jpeg', quality: spec.quality });
    console.log(`  ${name}.jpg`);
  }

  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${CJK_CSS}</style></head><body>${CJK_CONTENT}</body></html>`,
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, 'bilingual-cjk.png') });
  console.log('  bilingual-cjk.png');

  await browser.close();
  const count = Object.keys(VARIANTS).length + Object.keys(PHOTO_VARIANTS).length + 1;
  console.log(`${count} cards written to ${outDir}`);
}

export const VARIANT_NAMES = Object.keys(VARIANTS);

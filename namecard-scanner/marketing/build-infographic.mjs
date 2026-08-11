/**
 * Composes the sales infographic and proves the QR code in it still scans.
 *
 * The split of labour here is deliberate. Everything a reader has to *act on* —
 * the words and the QR code — is produced deterministically, in HTML and by a
 * QR library, so it is crisp and exact. The generative model only supplies the
 * photograph behind the band, where being approximately right is the whole job.
 *
 * The verification at the end decodes the QR out of the *finished poster*,
 * after scaling, compositing and PNG encoding, rather than out of the source
 * file. That is the artefact that gets printed and shared, so that is the one
 * worth proving.
 *
 * Usage: node marketing/build-infographic.mjs [url]
 */
import { chromium } from '@playwright/test';
import { findChromium } from '../e2e/chromium-path.mjs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, 'assets');
mkdirSync(assets, { recursive: true });

const TARGET_URL = process.argv[2] ?? 'https://handshake-olive.vercel.app';
/** The URL as printed. The QR carries the real one; this is only for reading. */
const URL_DISPLAY = TARGET_URL.replace(/^https?:\/\//, '');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2' };

function dataUri(path) {
  const type = MIME[extname(path).toLowerCase()];
  if (!type) throw new Error(`no mime type known for ${path}`);
  return `data:${type};base64,${readFileSync(path).toString('base64')}`;
}

// ---------------------------------------------------------------- compose ---
const html = readFileSync(resolve(here, 'infographic.template.html'), 'utf8')
  .replace('__FONT__', dataUri(resolve(here, '..', 'node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2')))
  .replace('__HERO__', dataUri(resolve(assets, 'hero.png')))
  .replace('__QR__', dataUri(resolve(assets, 'qr.png')))
  .replace('__URL_DISPLAY__', URL_DISPLAY);

// Self-contained: every asset is inlined, so this single file renders the same
// on any machine and can be opened or emailed on its own.
const htmlPath = resolve(assets, 'handshake-infographic.html');
writeFileSync(htmlPath, html);

// ------------------------------------------------------------------ render ---
const WIDTH = 1200;
const HEIGHT = 1800;
const SCALE = 2; // 2400x3600 — enough to print A3 without softening

// Same resolver the e2e suite uses: this image pins a Chromium revision that
// does not match the one @playwright/test would go looking for.
const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});
await page.goto(`file://${htmlPath}`);
await page.evaluate(() => document.fonts.ready);

// Blocks are set flex:none, so content that does not fit runs off the bottom
// edge instead of quietly compressing the photo band. Catch that here — an
// overflowing poster is a silent, easy-to-miss design bug otherwise.
const fit = await page.evaluate(() => {
  const poster = document.querySelector('.poster');
  const last = poster.lastElementChild;
  const pad = parseFloat(getComputedStyle(poster).paddingBottom);
  return { used: Math.ceil(last.getBoundingClientRect().bottom + pad), height: poster.clientHeight };
});
if (fit.used > fit.height) {
  console.error(`FAIL  content overflows the poster by ${fit.used - fit.height}px (needs ${fit.used}, has ${fit.height})`);
  await browser.close();
  process.exit(1);
}

const pngPath = resolve(assets, 'handshake-infographic.png');
await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });

// A second, lighter cut for messaging apps. The print version is ~5 MB, which
// WhatsApp and Slack will re-compress on the way through — and the QR is the
// part that suffers when they do.
const sharePath = resolve(assets, 'handshake-infographic-share.png');
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
const sharePage = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await sharePage.goto(`file://${htmlPath}`);
await sharePage.evaluate(() => document.fonts.ready);
await sharePage.screenshot({ path: sharePath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });

// The realistic worst case: forwarded through a messaging app, which re-encodes
// to a middling-quality JPEG. Ringing artefacts around the module edges are what
// actually kills a QR code in the field, so put one through that and read it
// back. The error-correction level is chosen to survive this; verify it does.
const jpegPath = resolve(assets, 'qr-jpeg-probe.jpg');
await sharePage.screenshot({ path: jpegPath, type: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
const qrBox = await sharePage.evaluate(() => {
  const { x, y, width, height } = document.querySelector('.qr').getBoundingClientRect();
  return { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(width), height: Math.ceil(height) };
});

// Chromium is the only JPEG decoder to hand, so read the pixels back through it.
// The image goes in as a data URI: a file:// image taints the canvas and blocks
// getImageData.
const probePage = await browser.newPage();
const jpegPixels = await probePage.evaluate(async ({ path, box }) => {
  const img = new Image();
  img.src = path;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return Array.from(ctx.getImageData(0, 0, box.width, box.height).data);
}, { path: dataUri(jpegPath), box: qrBox });

await browser.close();

// ------------------------------------------------------------------ verify ---
// Decode out of the *finished* files rather than the source QR: scaling and
// re-encoding is exactly where a code stops being scannable, so proving the
// intermediate proves the wrong thing.
let failed = false;
for (const path of [pngPath, sharePath]) {
  const png = PNG.sync.read(readFileSync(path));
  const decoded = jsQR(Uint8ClampedArray.from(png.data), png.width, png.height);

  if (!decoded) {
    console.error(`FAIL  no QR code could be found in ${path} (${png.width}x${png.height})`);
    failed = true;
  } else if (decoded.data !== TARGET_URL) {
    console.error(`FAIL  ${path} QR decodes to "${decoded.data}", expected "${TARGET_URL}"`);
    failed = true;
  } else {
    console.log(`PASS  ${png.width}x${png.height} QR decodes to ${decoded.data}  ->  ${path}`);
  }
}
const jpegDecoded = jsQR(Uint8ClampedArray.from(jpegPixels), qrBox.width, qrBox.height);
if (jpegDecoded?.data !== TARGET_URL) {
  console.error(`FAIL  the QR stops scanning after a quality-55 JPEG re-encode (got ${JSON.stringify(jpegDecoded?.data ?? null)})`);
  failed = true;
} else {
  console.log(`PASS  still decodes after a quality-55 JPEG re-encode (${qrBox.width}x${qrBox.height} crop)`);
}

rmSync(jpegPath, { force: true }); // a probe, not a deliverable

if (failed) process.exit(1);

console.log(`      self-contained HTML at ${htmlPath}`);

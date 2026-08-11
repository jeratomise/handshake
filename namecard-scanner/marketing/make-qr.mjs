/**
 * Generates the QR code for the infographic — and proves it scans.
 *
 * A QR code is the one element of a marketing asset that is either bit-exact or
 * worthless: an image model will happily draw a convincing-looking grid that
 * decodes to nothing, and nobody notices until it is printed on a stand. So it
 * is generated deterministically here and then decoded back with an independent
 * reader. If the decode does not return the exact URL, this exits non-zero and
 * no asset gets built on top of it.
 *
 * Usage: node marketing/make-qr.mjs [url]
 */
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TARGET_URL = process.argv[2] ?? 'https://handshake-olive.vercel.app';

const outPath = resolve(here, 'assets', 'qr.png');
mkdirSync(dirname(outPath), { recursive: true });

await QRCode.toFile(outPath, TARGET_URL, {
  errorCorrectionLevel: 'H', // survives a logo overlay, a crease, or a bad print
  margin: 2,
  width: 1200,
  color: { dark: '#08090bff', light: '#ffffffff' },
});

// Decode with a different library than the one that wrote it, so a shared bug
// cannot make a broken code look fine.
const png = PNG.sync.read(readFileSync(outPath));
const decoded = jsQR(Uint8ClampedArray.from(png.data), png.width, png.height);

if (!decoded) {
  console.error('FAIL  the generated QR code could not be decoded at all');
  process.exit(1);
}
if (decoded.data !== TARGET_URL) {
  console.error(`FAIL  QR decodes to "${decoded.data}", expected "${TARGET_URL}"`);
  process.exit(1);
}

console.log(`PASS  QR decodes to ${decoded.data}`);
console.log(`      ${png.width}x${png.height}, error correction H, written to ${outPath}`);

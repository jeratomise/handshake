/**
 * Vendors every OCR asset into public/ so the app never touches a CDN at runtime.
 *
 * Two things this protects against:
 *
 *  1. Runtime CDN dependency. tesseract.js otherwise fetches its worker, wasm
 *     core and ~3 MB language model from unpkg on first scan, which fails behind
 *     a strict CSP, on a locked-down corporate network, and on bad conference
 *     wifi — exactly where a BDE opens this app.
 *
 *  2. Missing core variants. tesseract.js picks its wasm build from what the
 *     browser supports: plain, SIMD, or relaxed-SIMD. Vendoring only the variant
 *     your dev machine happens to request produces an app that works for you and
 *     404s for everyone else. Every variant is copied, and only the one the
 *     browser asks for is ever downloaded.
 *
 * Runs automatically via `postinstall` and `prebuild`.
 */
import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SRC = join(root, 'node_modules', 'tesseract.js-core');
const WORKER_SRC = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const CORE_DEST = join(root, 'public', 'tesseract');
const DATA_DEST = join(root, 'public', 'tessdata');

// Pinned to the model tesseract.js v7 expects. 'best_int' is the integerised
// best-quality model: noticeably more accurate than 'fast' on the small,
// tightly-tracked type used on business cards, at ~3 MB gzipped.
const TRAINEDDATA_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz';
const TRAINEDDATA_DEST = join(DATA_DEST, 'eng.traineddata.gz');
const MIN_TRAINEDDATA_BYTES = 1_000_000;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyCore() {
  await mkdir(CORE_DEST, { recursive: true });
  const entries = await readdir(CORE_SRC);
  // The worker is created with OEM 1 (LSTM_ONLY), so only the '-lstm' builds
  // are ever requested — but all three of those are, because the browser
  // chooses between plain, SIMD and relaxed-SIMD at runtime. Shipping the
  // legacy cores as well would add ~27 MB to every deploy for nothing.
  const wanted = entries.filter(
    (name) => name.startsWith('tesseract-core') && name.includes('-lstm') && !name.endsWith('.map'),
  );
  if (wanted.length === 0) {
    throw new Error('No LSTM core builds found in tesseract.js-core — the package layout may have changed.');
  }
  await Promise.all(wanted.map((name) => copyFile(join(CORE_SRC, name), join(CORE_DEST, name))));
  await copyFile(WORKER_SRC, join(CORE_DEST, 'worker.min.js'));
  return wanted.length + 1;
}

async function fetchTraineddata() {
  if (await exists(TRAINEDDATA_DEST)) {
    const { size } = await stat(TRAINEDDATA_DEST);
    // A truncated download is worse than none: it fails at scan time with an
    // opaque gzip error rather than here, where the fix is obvious.
    if (size >= MIN_TRAINEDDATA_BYTES) return false;
    console.warn(`  language model is only ${size} bytes — re-downloading`);
  }

  await mkdir(DATA_DEST, { recursive: true });
  const response = await fetch(TRAINEDDATA_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the language model (HTTP ${response.status}) from ${TRAINEDDATA_URL}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(TRAINEDDATA_DEST));

  const { size } = await stat(TRAINEDDATA_DEST);
  if (size < MIN_TRAINEDDATA_BYTES) {
    throw new Error(`Language model download looks truncated (${size} bytes).`);
  }
  return true;
}

if (!(await exists(CORE_SRC))) {
  console.error('tesseract.js-core is not installed — run npm install first.');
  process.exit(1);
}

const copied = await copyCore();
const downloaded = await fetchTraineddata();
console.log(
  `OCR assets ready: ${copied} engine files in public/tesseract, language model ${downloaded ? 'downloaded' : 'already present'}.`,
);

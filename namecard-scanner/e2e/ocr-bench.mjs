/**
 * Scores the real OCR pipeline against a set of deliberately awkward cards.
 *
 * Runs the production build in a browser and feeds each fixture through the
 * actual capture -> preprocess -> Tesseract -> parse path, then checks the
 * fields the app would put in front of the user. Accuracy work without this is
 * guesswork: preprocessing changes routinely help one kind of card and wreck
 * another, and only a scoreboard shows it.
 *
 * Usage:
 *   node e2e/make-fixtures.mjs        # once, to render the cards
 *   node e2e/ocr-bench.mjs [url]      # defaults to http://127.0.0.1:4173
 */
import { chromium, devices } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium-path.mjs';
import { EXPECTED } from './make-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cardsDir = resolve(here, 'fixtures', 'cards');
const target = (process.argv[2] ?? 'http://127.0.0.1:4173').replace(/\/$/, '');

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const digits = (s) => s.replace(/\D/g, '');

/** Field-level scoring, weighted by what actually breaks a follow-up. */
const FIELDS = [
  { key: 'phone', weight: 3, get: (f) => digits(f.phone), ok: (v) => v.endsWith(EXPECTED.phoneDigits.slice(-8)) },
  { key: 'name', weight: 2, get: (f) => norm(f.name), ok: (v) => v === norm(EXPECTED.name) },
  { key: 'greeting', weight: 2, get: (f) => norm(f.greeting), ok: (v) => v === norm(EXPECTED.greeting) },
  { key: 'company', weight: 1, get: (f) => norm(f.company), ok: (v) => v.includes('meridian') },
  { key: 'title', weight: 1, get: (f) => norm(f.title), ok: (v) => v.includes('sales director') },
  { key: 'email', weight: 1, get: (f) => norm(f.email), ok: (v) => v === norm(EXPECTED.email) },
];
const MAX = FIELDS.reduce((sum, f) => sum + f.weight, 0);

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ ...devices['Pixel 7'] });

// Local-only mode: no sign-in, no network needed beyond the app itself.
await page.route('https://*.supabase.co/**', (route) => route.abort('failed'));

const cards = readdirSync(cardsDir).filter((f) => /\.(png|jpg)$/.test(f)).sort();
const rows = [];

for (const card of cards) {
  await page.goto(target, { waitUntil: 'load' });

  // Fresh device each time so a previous run's profile does not leak in, but
  // with the settings cache pre-seeded: the benchmark is about OCR, not about
  // signing in, and the network is deliberately dead here.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'handshake.settings.v1',
      JSON.stringify({ requireEmailVerification: false, aiOcrEnabled: false, aiOcrModel: 'google/gemini-2.5-flash' }),
    );
  });
  await page.reload({ waitUntil: 'load' });

  await page.getByTestId('profile-name').waitFor({ timeout: 30_000 });
  await page.getByTestId('profile-name').fill('Jerome Ng');
  await page.getByTestId('profile-company').fill('Northwind');
  await page.getByTestId('profile-country').selectOption('SG');
  await page.getByTestId('profile-save').click();
  await page.getByRole('heading', { name: /point at the card/i }).waitFor({ timeout: 20_000 });

  const started = Date.now();
  await page.getByTestId('card-upload').setInputFiles(resolve(cardsDir, card));

  let fields = null;
  try {
    await page.getByTestId('field-name').waitFor({ timeout: 120_000 });
    fields = {
      name: await page.getByTestId('field-name').inputValue(),
      greeting: await page.getByTestId('field-greeting').inputValue(),
      title: await page.getByTestId('field-title').inputValue(),
      company: await page.getByTestId('field-company').inputValue(),
      email: await page.getByTestId('field-email').inputValue(),
      phone: await page.getByTestId('field-phone').inputValue(),
    };
  } catch {
    /* leave fields null: the card scored zero */
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const got = [];
  let score = 0;
  for (const field of FIELDS) {
    const value = fields ? field.get(fields) : '';
    const ok = Boolean(value) && field.ok(value);
    if (ok) score += field.weight;
    else got.push(`${field.key}="${value}"`);
  }

  rows.push({ card: card.replace(/\.(png|jpg)$/, ''), score, seconds, missed: got });
}

await browser.close();

console.log('\ncard              score        time   missed');
console.log('─'.repeat(78));
let total = 0;
for (const row of rows) {
  total += row.score;
  const bar = '█'.repeat(row.score) + '░'.repeat(MAX - row.score);
  console.log(
    `${row.card.padEnd(16)}  ${bar} ${String(row.score).padStart(2)}/${MAX}  ${row.seconds.padStart(5)}s  ${row.missed.join(' ') || '—'}`,
  );
}
const possible = rows.length * MAX;
console.log('─'.repeat(78));
console.log(`TOTAL ${total}/${possible}  (${((total / possible) * 100).toFixed(1)}%)\n`);

/**
 * The GitHub social preview card — docs/social-preview.png, 1280×640.
 *
 * This is the image every link to the repo renders as: on X, LinkedIn, Slack,
 * Discord, Hacker News mobile, and the GitHub repo page itself. A repo without
 * one shows a grey avatar-and-name placeholder, which on a feed full of cards
 * is close to invisible. It is the single highest-leverage promotional asset in
 * the project, so it is generated here rather than left to chance.
 *
 * 1280×640 is GitHub's stated size (2:1). The safe area is generous because
 * Slack and LinkedIn crop the edges differently.
 *
 *   node marketing/build-social-card.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'social-preview.png');
const HERO = join(HERE, 'assets', 'hero.png');

const hero = `data:image/png;base64,${readFileSync(HERO).toString('base64')}`;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px; height: 640px; overflow: hidden;
        background: #08090b;
        font-family: ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #f4f2ec;
      }
      .card { position: relative; width: 1280px; height: 640px; }
      /* The photograph carries the right-hand third; the copy sits on flat ink
         so it stays legible when a platform darkens or crops the image. */
      .shot {
        position: absolute; inset: 0 0 0 46%;
        background: url('${hero}') center/cover no-repeat;
      }
      .fade {
        position: absolute; inset: 0 0 0 30%;
        background: linear-gradient(90deg, #08090b 0%, #08090b 42%, rgba(8,9,11,0) 100%);
      }
      .glow {
        position: absolute; inset: 0;
        background: radial-gradient(70% 90% at 8% 0%, rgba(204,255,63,0.10), transparent 60%);
      }
      .copy { position: absolute; left: 72px; top: 74px; width: 660px; }
      .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 34px; }
      .dot { width: 15px; height: 15px; border-radius: 50%; background: #ccff3f; box-shadow: 0 0 22px rgba(204,255,63,0.65); }
      .name { font-size: 33px; font-weight: 700; letter-spacing: -0.01em; }
      .kicker {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 15px; letter-spacing: 0.24em; text-transform: uppercase; color: #6f757f;
      }
      h1 { font-size: 55px; line-height: 1.08; letter-spacing: -0.022em; font-weight: 700; }
      h1 em { font-style: normal; color: #ccff3f; }
      p { margin-top: 22px; font-size: 21px; line-height: 1.5; color: #a8adb6; width: 600px; }
      .chips { position: absolute; left: 72px; bottom: 66px; display: flex; gap: 10px; }
      .chip {
        border: 1px solid #2b3038; border-radius: 999px; padding: 9px 17px;
        font-size: 16px; color: #a8adb6; background: rgba(20,22,25,0.85);
      }
      .chip b { color: #ccff3f; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="shot"></div>
      <div class="fade"></div>
      <div class="glow"></div>
      <div class="copy">
        <div class="brand"><span class="dot"></span><span class="name">Handshake</span><span class="kicker">card → chat</span></div>
        <h1>Scan a business card,<br>WhatsApp the lead in<br><em>twenty seconds</em>.</h1>
        <p>Open source. The OCR runs on the phone, so scanning costs nothing and the card is never uploaded.</p>
      </div>
      <div class="chips">
        <span class="chip"><b>$0</b> per scan</span>
        <span class="chip">Runs <b>on device</b></span>
        <span class="chip">Deploy your own in <b>15 min</b></span>
      </div>
    </div>
  </body>
</html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
const png = await page.screenshot({ type: 'png' });
await browser.close();

writeFileSync(OUT, png);
console.log(`social-preview.png  ${(png.length / 1024).toFixed(0)} kB`);

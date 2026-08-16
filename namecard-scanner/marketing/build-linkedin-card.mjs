/**
 * The LinkedIn launch infographic — docs/linkedin-announcement.png.
 *
 * 1200×1500 (4:5). LinkedIn crops anything taller and gives anything wider less
 * vertical space in the feed, and 4:5 is the tallest portrait it renders
 * uncropped — which on a phone means the post occupies most of the screen.
 *
 * Structured for a feed rather than for a wall: someone sees this at thumb
 * speed, so it reads top to bottom as five bands — what it is, the problem as
 * one number, how it works, why it is free, where to get it. Every band is
 * legible at a third of full size.
 *
 *   node marketing/build-linkedin-card.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'linkedin-announcement.png');
const hero = `data:image/png;base64,${readFileSync(join(HERE, 'assets', 'hero.png')).toString('base64')}`;

const STEPS = [
  ['01', 'Point', 'at the card'],
  ['02', 'It reads', 'name + right number'],
  ['03', 'Check', 'every field editable'],
  ['04', 'Answer', 'where did you meet?'],
  ['05', 'Review', 'the drafted message'],
  ['06', 'Send', 'WhatsApp opens ready'],
];

const PROOF = [
  ['$0', 'per scan, forever', 'The OCR runs on the phone. No vision API to bill you, however many reps you have.'],
  ['0', 'images uploaded', 'The card is read on the device and never leaves it. No account needed to use it.'],
  ['MIT', 'open source', 'The whole app, not a demo. Fork it, rebrand it, run it on your own infrastructure.'],
];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1200px; height:1500px; overflow:hidden; background:#08090b; color:#f4f2ec;
    font-family: ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display:flex; flex-direction:column;
  }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  /* ---- band 1: what it is, over the photograph -------------------------- */
  .hero { position:relative; height:430px; flex:none; overflow:hidden; }
  .hero .shot {
    position:absolute; inset:0; background:url('${hero}') 58% 46%/cover no-repeat;
  }
  .hero .veil {
    position:absolute; inset:0;
    background:linear-gradient(180deg, rgba(8,9,11,0.86) 0%, rgba(8,9,11,0.72) 30%, rgba(8,9,11,0.86) 62%, #08090b 100%);
  }
  .hero .inner { position:relative; padding:52px 64px; height:100%; display:flex; flex-direction:column; }
  .brand { display:flex; align-items:center; gap:14px; }
  .dot { width:16px; height:16px; border-radius:50%; background:#ccff3f; box-shadow:0 0 24px rgba(204,255,63,.7); }
  .brand .name { font-size:34px; font-weight:700; letter-spacing:-.01em; }
  .brand .kick { font-size:15px; letter-spacing:.26em; text-transform:uppercase; color:#8b919b; }
  .tag {
    margin-left:auto; border:1px solid rgba(204,255,63,.45); color:#ccff3f;
    border-radius:999px; padding:8px 18px; font-size:15px; font-weight:600; letter-spacing:.08em;
  }
  .hero h1 { margin-top:auto; font-size:70px; line-height:1.04; letter-spacing:-.028em; font-weight:700; }
  .hero h1 em { font-style:normal; color:#ccff3f; }
  .hero p { margin-top:20px; font-size:23px; color:#a8adb6; }

  /* ---- band 2: the problem, as one number ------------------------------- */
  .stat { flex:none; display:flex; align-items:center; gap:34px; padding:34px 64px; border-top:1px solid #1e2228; }
  .stat .num { text-align:center; flex:none; }
  .stat .big { font-size:78px; font-weight:700; line-height:1; letter-spacing:-.03em; }
  .stat .big.dim { color:#4a5058; }
  .stat .cap { font-size:15px; letter-spacing:.14em; text-transform:uppercase; color:#6f757f; margin-top:8px; }
  .stat .arrow { font-size:38px; color:#3a4048; margin-bottom:26px; }
  .stat .say { font-size:23px; line-height:1.42; color:#a8adb6; border-left:3px solid #ccff3f; padding-left:24px; }
  .stat .say b { color:#f4f2ec; font-weight:600; }

  /* ---- band 3: the flow -------------------------------------------------- */
  .flow { flex:1; padding:36px 64px 32px; border-top:1px solid #1e2228; display:flex; flex-direction:column; }
  .label { font-size:14px; letter-spacing:.24em; text-transform:uppercase; color:#6f757f; margin-bottom:24px; }
  .grid { flex:1; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:1fr 1fr; gap:18px; }
  .step { background:#131518; border:1px solid #23272e; border-radius:16px; padding:24px 22px; display:flex; flex-direction:column; justify-content:center; }
  .step .n { font-size:15px; font-weight:700; color:#ccff3f; letter-spacing:.1em; }
  .step .t { font-size:28px; font-weight:700; margin-top:12px; letter-spacing:-.01em; }
  .step .s { font-size:17px; color:#8b919b; margin-top:6px; line-height:1.35; }
  .step.last { border-color:rgba(37,211,102,.55); }
  .step.last .n { color:#25d366; }
  .after { margin-top:24px; font-size:19px; color:#8b919b; flex:none; }
  .after b { color:#f4f2ec; font-weight:600; }

  /* ---- band 4: why it is free ------------------------------------------- */
  .proof { flex:none; display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid #1e2228; }
  .cell { padding:32px 30px 34px; border-right:1px solid #1e2228; }
  .cell:last-child { border-right:0; }
  .cell .k { font-size:52px; font-weight:700; color:#ccff3f; line-height:1; letter-spacing:-.03em; }
  .cell .u { font-size:18px; font-weight:600; margin-top:8px; }
  .cell .d { font-size:15.5px; color:#8b919b; margin-top:12px; line-height:1.45; }

  /* ---- band 5: where to get it ------------------------------------------ */
  .cta { flex:none; background:#ccff3f; color:#08090b; padding:34px 64px; display:flex; align-items:center; gap:28px; }
  .cta .what { font-size:17px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; opacity:.62; }
  .cta .url { font-size:34px; font-weight:700; letter-spacing:-.015em; margin-top:4px; }
  .cta .demo { margin-left:auto; text-align:right; font-size:17px; line-height:1.5; opacity:.75; font-weight:500; }
</style></head><body>

  <div class="hero">
    <div class="shot"></div><div class="veil"></div>
    <div class="inner">
      <div class="brand">
        <span class="dot"></span><span class="name">Handshake</span><span class="kick">card → chat</span>
        <span class="tag">NOW OPEN SOURCE</span>
      </div>
      <h1>Scan a business card.<br>WhatsApp the lead in <em>20 seconds</em>.</h1>
      <p>Built for sales teams who lose leads to admin, not to competitors.</p>
    </div>
  </div>

  <div class="stat">
    <div class="num"><div class="big">40</div><div class="cap">cards collected</div></div>
    <div class="arrow">→</div>
    <div class="num"><div class="big dim">6</div><div class="cap">followed up</div></div>
    <div class="say">
      One three-day trade show.<br>
      <b>The other 34 were never bad leads. They were four minutes of typing each.</b>
    </div>
  </div>

  <div class="flow">
    <div class="label">What a rep actually does</div>
    <div class="grid">
      ${STEPS.map(
        ([n, t, s], i) =>
          `<div class="step${i === STEPS.length - 1 ? ' last' : ''}"><div class="n mono">${n}</div><div class="t">${t}</div><div class="s">${s}</div></div>`,
      ).join('')}
    </div>
    <p class="after"><b>Nothing sends automatically.</b> The rep reads every message and taps send themselves.</p>
  </div>

  <div class="proof">
    ${PROOF.map(([k, u, d]) => `<div class="cell"><div class="k">${k}</div><div class="u">${u}</div><div class="d">${d}</div></div>`).join('')}
  </div>

  <div class="cta">
    <div>
      <div class="what">Take it — MIT licensed</div>
      <div class="url mono">github.com/jeratomise/handshake</div>
    </div>
    <div class="demo">Live demo:<br>handshake-olive.vercel.app</div>
  </div>

</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });

// A band that overflows silently would ship a cropped infographic, so fail loud.
const overflow = await page.evaluate(() => document.body.scrollHeight - 1500);
if (overflow > 1) throw new Error(`content overflows by ${overflow}px — tighten a band`);

const png = await page.screenshot({ type: 'png' });
await browser.close();

writeFileSync(OUT, png);
console.log(`linkedin-announcement.png  1200x1500  ${(png.length / 1024).toFixed(0)} kB`);

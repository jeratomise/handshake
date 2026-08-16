/**
 * The three README diagrams.
 *
 * Hand-laid-out SVG rather than generated images, for one reason: every label
 * here is a factual claim about the code — model names, file names, the order
 * country evidence is ranked in — and an image model cannot be trusted to
 * letter those correctly. It fabricates plausible-looking text, which in a
 * README is worse than no diagram. SVG also stays sharp on a phone, weighs a
 * few KB, and can be diffed when the facts change.
 *
 * Authored at 1000px wide because GitHub renders README images at roughly
 * 850px: any wider and the body text scales down past readable.
 *
 *   node marketing/build-diagrams.mjs
 *
 * Writes ../docs/*.svg (repo root), which the landing README references.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');

/** The app's own palette, so the docs and the product look like one thing. */
const C = {
  bg: '#0d0f12',
  panel: '#141619',
  panelSoft: '#111316',
  line: '#2b3038',
  lineSoft: '#22262c',
  paper: '#f4f2ec',
  dim: '#a8adb6',
  faint: '#6f757f',
  signal: '#ccff3f',
  ember: '#ff7a45',
  wa: '#25d366',
};

const FONT = "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (x, y, content, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.mono ? MONO : FONT}" font-size="${o.size ?? 15}" font-weight="${
    o.weight ?? 400
  }" fill="${o.fill ?? C.dim}" letter-spacing="${o.tracking ?? 0}"${
    o.anchor ? ` text-anchor="${o.anchor}"` : ''
  }>${esc(content)}</text>`;

const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 14}" fill="${o.fill ?? C.panel}" stroke="${
    o.stroke ?? C.line
  }" stroke-width="${o.sw ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;

/** Every diagram is one dark card, so it reads the same in either GitHub theme. */
function frame(w, h, title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(
    title,
  )}">
<rect width="${w}" height="${h}" rx="22" fill="${C.bg}"/>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="21.5" fill="none" stroke="${C.line}"/>
${text(40, 56, title, { size: 25, weight: 700, fill: C.paper })}
${subtitle ? text(40, 82, subtitle, { size: 15, fill: C.faint }) : ''}
${body}
</svg>
`;
}

/** A full-width strip at the foot of a diagram, for the one thing to remember. */
function footnote(w, y, label, copy, accent) {
  return [
    rect(40, y, w - 80, 54, { fill: C.panelSoft, stroke: C.lineSoft, r: 12 }),
    `<rect x="40" y="${y}" width="4" height="54" rx="2" fill="${accent}"/>`,
    text(62, y + 23, label, { size: 13, weight: 700, fill: accent, tracking: 0.6 }),
    text(62, y + 43, copy, { size: 14.5, fill: C.dim }),
  ].join('\n');
}

/* ------------------------------------------------------------------ flow --*/

const STEPS = [
  ['Capture', 'Live viewfinder, or a photo you already took. The shutter grabs a frame.', 'camera or photo'],
  ['Read', 'Tesseract runs in the browser tab. A couple of seconds. Nothing is uploaded.', 'on device'],
  ['Confirm', 'Name, title, company, phone, email — every field editable before you move on.', 'you can edit'],
  ['Context', 'One question: where did you meet? Ten quick answers, or skip it entirely.', 'skippable'],
  ['Review', 'The whole draft. Switch the tone, edit the words, or reset to the original.', 'you can edit'],
  ['WhatsApp', 'A wa.me deep link opens the chat with the message already typed out.', 'one tap'],
];

function flowDiagram() {
  const W = 900;
  const top = 118;
  const row = 74;
  const H = top + STEPS.length * row + 90;
  const cx = 68;

  const spine = `<line x1="${cx}" y1="${top + 18}" x2="${cx}" y2="${top + (STEPS.length - 1) * row + 18}" stroke="${
    C.line
  }" stroke-width="2"/>`;

  const rows = STEPS.map(([label, copy, tag], i) => {
    const y = top + i * row;
    const last = i === STEPS.length - 1;
    const accent = last ? C.wa : C.signal;
    return [
      `<circle cx="${cx}" cy="${y + 18}" r="17" fill="${C.bg}" stroke="${accent}" stroke-width="${last ? 2 : 1.5}"/>`,
      text(cx, y + 24, String(i + 1), { size: 15, weight: 700, fill: accent, anchor: 'middle', mono: true }),
      text(cx + 38, y + 15, label, { size: 19, weight: 700, fill: C.paper }),
      text(cx + 38, y + 39, copy, { size: 14.5, fill: C.faint }),
      text(W - 40, y + 24, tag, { size: 12.5, fill: C.faint, anchor: 'end', mono: true, tracking: 0.3 }),
    ].join('\n');
  }).join('\n');

  return frame(
    W,
    H,
    'Card to conversation, in six steps',
    'One of them is optional. None of them send anything.',
    [
      spine,
      rows,
      footnote(
        W,
        H - 74,
        'YOU SEND IT, NOT THE APP',
        'The draft is always shown first, and WhatsApp still asks for the final tap. Nothing goes out on your behalf.',
        C.wa,
      ),
    ].join('\n'),
  );
}

/* ------------------------------------------------------------- tesseract --*/

const STAGES = [
  {
    n: '01',
    title: 'Prepare the frame',
    lines: [
      'Downscale to ~1600px, greyscale, lift contrast.',
      'Big enough for small print, small enough to stay fast.',
    ],
  },
  {
    n: '02',
    title: 'Recognise',
    lines: [
      'tesseract.js 7 compiled to WebAssembly, LSTM only.',
      'Engine and eng.traineddata are served from this origin,',
      'not a CDN — so an offline phone still reads a card.',
    ],
  },
  {
    n: '03',
    title: 'Sort the lines out',
    lines: [
      'Noise dropped, then each line scored as a name, title,',
      'company, email, phone, website or address.',
      'Tax and registration numbers are thrown away outright.',
    ],
  },
  {
    n: '04',
    title: 'Resolve the number',
    lines: [
      'A mobile beats an office line. A fax is never chosen.',
      'Country evidence is ranked, strongest first — see below.',
    ],
  },
];

const EVIDENCE = [
  ['exact', '+65 printed on the card', C.signal],
  ['exact', 'a code in brackets: (6019)', C.signal],
  ['inferred', 'a trunk prefix, or a length that parses one way', '#c9d16a'],
  ['inferred', 'the country TLD on their email', '#c9d16a'],
  ['guess', 'your own home market — the last resort', C.ember],
];

function tesseractDiagram() {
  const W = 1000;
  const top = 112;
  const cardW = 452;
  const cardH = 132;
  const gapX = 32;
  const gapY = 22;

  const cards = STAGES.map((s, i) => {
    const x = 40 + (i % 2) * (cardW + gapX);
    const y = top + Math.floor(i / 2) * (cardH + gapY);
    return [
      rect(x, y, cardW, cardH),
      text(x + 22, y + 32, s.n, { size: 13, weight: 700, fill: C.signal, mono: true, tracking: 1 }),
      text(x + 56, y + 33, s.title, { size: 17.5, weight: 700, fill: C.paper }),
      ...s.lines.map((line, j) => text(x + 22, y + 62 + j * 21, line, { size: 13.5, fill: C.faint })),
    ].join('\n');
  }).join('\n');

  const rankTop = top + 2 * cardH + gapY + 30;
  const rankH = 42 + EVIDENCE.length * 26;
  const splitX = 540;
  const rank = [
    rect(40, rankTop, W - 80, rankH, { fill: C.panelSoft, stroke: C.lineSoft }),
    text(62, rankTop + 28, 'HOW SURE ARE WE OF THE COUNTRY CODE?', {
      size: 12.5,
      weight: 700,
      fill: C.dim,
      tracking: 0.8,
    }),
    ...EVIDENCE.map(([tag, copy, colour], i) => {
      const y = rankTop + 54 + i * 26;
      return [
        `<rect x="62" y="${y - 12}" width="72" height="19" rx="9.5" fill="none" stroke="${colour}" stroke-width="1"/>`,
        text(98, y + 2, tag, { size: 11.5, weight: 700, fill: colour, anchor: 'middle', mono: true }),
        text(150, y + 2, copy, { size: 14, fill: C.dim }),
      ].join('\n');
    }),
    // The example is the Malaysian card a beta tester actually sent in.
    `<line x1="${splitX - 24}" y1="${rankTop + 18}" x2="${splitX - 24}" y2="${rankTop + rankH - 18}" stroke="${
      C.lineSoft
    }"/>`,
    text(splitX, rankTop + 28, 'ON A REAL CARD', { size: 12.5, weight: 700, fill: C.dim, tracking: 0.8 }),
    text(splitX, rankTop + 56, '(6019) 7314 959', { size: 14, fill: C.paper, mono: true }),
    text(W - 62, rankTop + 56, '→  +60 19 7314 959', { size: 14, fill: C.signal, mono: true, anchor: 'end' }),
    text(splitX, rankTop + 78, 'the code was inside the brackets', { size: 12.5, fill: C.faint }),
    text(splitX, rankTop + 108, 'TIN No. C 854327050', { size: 14, fill: C.paper, mono: true }),
    text(W - 62, rankTop + 108, '→  dropped', { size: 14, fill: C.ember, mono: true, anchor: 'end' }),
    text(splitX, rankTop + 130, 'a tax number, not a phone', { size: 12.5, fill: C.faint }),
  ].join('\n');

  const H = rankTop + rankH + 88;

  return frame(
    W,
    H,
    'What happens in the seconds after the shutter',
    'All of it inside the browser tab. No server sees the card.',
    [
      cards,
      rank,
      footnote(
        W,
        H - 74,
        'WHY THE RANKING MATTERS',
        'A guess never outranks a stated code. Without that, one card’s tax number won the WhatsApp link.',
        C.ember,
      ),
    ].join('\n'),
  );
}

/* ------------------------------------------------------------ local-first -*/

const STAYS = [
  ['The card image', 'Never uploaded, never stored. It lives in a canvas and is gone when you leave.'],
  ['The OCR', 'Tesseract runs on your device. No OCR API, no key, no per-scan cost.'],
  ['The parsing and the draft', 'Names, numbers, tone, wording — all worked out in the tab.'],
  ['Your profile and history', 'localStorage first, so the app works with no account at all.'],
];

const LEAVES = [
  [
    'Your own rows, if you sign in',
    'Profile and follow-up log sync to Supabase so a new phone picks up where you left off. Row level security means you can only ever read your own.',
    C.dim,
  ],
  [
    'One card image, only if you ask',
    'The optional "re-read with AI" button. Off unless an operator turns it on, and then it is one tap per card. It goes through a server function — the provider key is never in the browser.',
    C.dim,
  ],
];

const NEVER = ['No analytics or trackers', 'No third-party CDN or fonts', 'No API keys in the bundle'];

function localFirstDiagram() {
  const W = 1000;
  const top = 116;
  const leftW = 468;
  const rightX = 40 + leftW + 24;
  const rightW = W - 40 - rightX;
  const panelH = 320;

  const heading = (x, y, w, label, copy, colour) =>
    [
      text(x + 22, y + 32, label, { size: 16, weight: 700, fill: colour, tracking: 0.4 }),
      text(x + 22, y + 54, copy, { size: 13.5, fill: C.faint }),
      `<line x1="${x + 22}" y1="${y + 70}" x2="${x + w - 22}" y2="${y + 70}" stroke="${C.lineSoft}"/>`,
    ].join('\n');

  const left = [
    rect(40, top, leftW, panelH, { stroke: C.line }),
    `<rect x="${40 + 18}" y="${top - 1}" width="${leftW - 36}" height="3" rx="1.5" fill="${C.signal}"/>`,
    heading(40, top, leftW, 'STAYS ON THE PHONE', 'The default path, with no account and no network.', C.signal),
    ...STAYS.map(([label, copy], i) => {
      const y = top + 96 + i * 52;
      return [
        `<circle cx="52" cy="${y - 4}" r="3" fill="${C.signal}"/>`,
        text(64, y, label, { size: 15, weight: 700, fill: C.paper }),
        text(64, y + 19, copy, { size: 12.5, fill: C.faint }),
      ].join('\n');
    }),
  ].join('\n');

  const right = [
    rect(rightX, top, rightW, panelH, { stroke: C.line }),
    `<rect x="${rightX + 18}" y="${top - 1}" width="${rightW - 36}" height="3" rx="1.5" fill="${C.ember}"/>`,
    heading(rightX, top, rightW, 'LEAVES THE PHONE', 'Only these two, and both are your call.', C.ember),
    ...LEAVES.map(([label, copy], i) => {
      const y = top + 100 + i * 100;
      const wrapped = wrap(copy, 44);
      return [
        `<circle cx="${rightX + 12}" cy="${y - 4}" r="3" fill="${C.ember}"/>`,
        text(rightX + 24, y, label, { size: 15, weight: 700, fill: C.paper }),
        ...wrapped.map((line, j) => text(rightX + 24, y + 20 + j * 17, line, { size: 12.5, fill: C.faint })),
      ].join('\n');
    }),
  ].join('\n');

  const neverY = top + panelH + 26;
  const never = [
    rect(40, neverY, W - 80, 52, { fill: C.panelSoft, stroke: C.lineSoft, r: 12 }),
    ...NEVER.map((item, i) => {
      const x = 66 + i * 312;
      return [
        `<path d="M${x} ${neverY + 27} l7 7 l12 -14" fill="none" stroke="${C.signal}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        text(x + 30, neverY + 32, item, { size: 14, fill: C.dim }),
      ].join('\n');
    }),
  ].join('\n');

  const H = neverY + 52 + 26;

  return frame(
    W,
    H,
    'Local first, and specific about it',
    'Business cards are other people’s contact details. They should not tour the internet.',
    [left, right, never].join('\n'),
  );
}

/** Greedy wrap on a character budget — good enough for a fixed, known string. */
function wrap(copy, budget) {
  const out = [];
  let line = '';
  for (const word of copy.split(' ')) {
    if (line && (line + ' ' + word).length > budget) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

/* ---------------------------------------------------------------- write ---*/

mkdirSync(OUT, { recursive: true });
const files = [
  ['flow.svg', flowDiagram()],
  ['tesseract.svg', tesseractDiagram()],
  ['local-first.svg', localFirstDiagram()],
];

for (const [name, svg] of files) {
  writeFileSync(join(OUT, name), svg);
  console.log(`${name}  ${(svg.length / 1024).toFixed(1)} kB`);
}

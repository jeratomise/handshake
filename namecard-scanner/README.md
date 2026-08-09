# Handshake — name card → WhatsApp

A mobile-first web app for sales BDEs. Scan a business card, answer one optional
question about where you met, review the draft, and hand it to WhatsApp.

Everything runs in the browser. No backend, no API keys, no card image or
contact detail ever leaves the phone.

---

## The flow

```
Capture  ──▶  Read  ──▶  Confirm  ──▶  Context  ──▶  Review  ──▶  WhatsApp
 camera        OCR       editable      "where did     draft you      wa.me
 or photo               fields         you meet?"     can edit       deep link
                                        (skippable)
```

The user always sees the message before anything is sent, and WhatsApp itself
still requires the final send tap. There is no path in the app that transmits a
message on the user's behalf.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
```

With no Supabase credentials configured the app runs **local-only**: no sign-in,
profile and history in `localStorage`. Everything except cross-device sync works
that way, so a fresh clone is usable immediately.

## Backend (Supabase)

Live project: `handshake` — `https://oltrwsrzhmhmofwvyeju.supabase.co` (ap-southeast-1).

Two tables, both with row level security so a BDE can only ever reach their own
rows. This matters more than usual here: `follow_ups` holds contact details
belonging to *third parties* — the people whose cards were scanned — and that is
not data an anon key should be able to enumerate.

| Table | Holds |
| --- | --- |
| `profiles` | The sender: name, company, home market, default tone |
| `follow_ups` | One row per card handed to WhatsApp, plus the message sent |

Verified against the live project:

```
anon SELECT follow_ups  ->  []                          (no leak)
anon INSERT follow_ups  ->  401, RLS policy violation   (no writes)
rpc/handle_new_user     ->  404                         (trigger fns not exposed)
supabase advisors       ->  0 findings
```

Apply the schema to a different project with `supabase/migrations/*.sql`, in order.

### Two dashboard steps the API cannot do

Supabase exposes no management API for auth settings, so these are manual — and
sign-in will not work end to end until they are done:

1. **Authentication → Email Templates → Magic Link.** Add `{{ .Token }}` to the
   template. The stock template only contains a link, so without this the
   six-digit code never reaches the user. The app accepts either the code or the
   link, so adding the token makes both paths work.
2. **Authentication → URL Configuration.** Set Site URL and add a Redirect URL
   for the deployed domain, so tapping the link in the email returns to the app
   rather than to localhost.

### Email sending

Supabase's built-in SMTP is rate limited (a handful of messages per hour) and
intended for development. Before real BDEs use this, set a custom SMTP provider
under **Authentication → Emails** — otherwise the second and third person to sign
up will silently not receive anything.

## Deploying (Vercel)

`vercel.json` is committed and the build is verified from a clean tree. From
`namecard-scanner/`:

```bash
npx vercel --prod
```

Set these in the Vercel project (or leave `.env.production`, which is committed
and carries the same values):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://oltrwsrzhmhmofwvyeju.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's publishable key |

Both are public by design and ship in the client bundle — row level security is
what protects the data, not the secrecy of the key. The `service_role` key must
never appear in this repo.

The build downloads the OCR language model, so the build container needs network
access (Vercel's does).

The camera viewfinder needs a secure context. `localhost` counts as one; to test
from a phone on your LAN, serve the preview build over HTTPS or use a tunnel.
Without camera access the app falls back to the native photo picker, which works
everywhere.

```bash
npm run build          # typecheck + production build
npm run preview        # serve the built app on :4173
```

## Verification

```bash
npm test               # 76 unit tests — parsing, phone normalisation, drafting
npm run typecheck      # strict TypeScript, no implicit any, no unused symbols
npm run e2e            # 18 browser tests against the real production build
```

The end-to-end suite is not mocked. It renders a business card to a PNG, feeds it
to the running app, waits for the real OCR engine to read it, and asserts on the
`wa.me` URL that comes out the other end. Regenerate the card fixture with:

```bash
node e2e/make-fixture.mjs
```

## How it is put together

| Path | Responsibility |
| --- | --- |
| `src/lib/preprocess.ts` | EXIF-correct decode, resize, greyscale, contrast stretch |
| `src/lib/ocr.ts` | Tesseract worker, all assets self-hosted |
| `src/lib/parseCard.ts` | OCR text → name, title, company, email, phones |
| `src/lib/phone.ts` | Phone normalisation to E.164 and the `wa.me` link |
| `src/lib/draft.ts` | Tone/CTA-aware message composition, vCard export |
| `src/lib/storage.ts` | Sender profile and daily tally in `localStorage` |
| `src/components/` | One component per step of the flow |

### Three decisions worth knowing about

**OCR assets are vendored, not fetched from a CDN.** `tesseract.js` defaults to
pulling its worker, wasm core and ~3 MB language model from a public CDN on first
scan. That fails behind a strict CSP, on a locked-down corporate network, and in
a conference basement with one bar of signal — which is exactly where this app
gets opened. `public/tesseract/` and `public/tessdata/` are served from our own
origin instead.

**Phone normalisation gets a disproportionate amount of the code.** WhatsApp
silently opens an empty chat when the country code is wrong, so a bad number
looks like a working app right up until the message goes nowhere. `phone.ts`
handles trunk prefixes, missing `+`, country codes printed without one, and the
genuinely ambiguous cases (an 11-digit Indonesian number is both a valid national
number and a valid `62` + 9-digit one — mobile prefixes break the tie). Anything
inferred is surfaced as a warning on the confirm screen.

**Mobile beats office, and fax is never chosen.** A card typically lists two or
three numbers. `pickBestPhone` prefers an explicitly labelled mobile, then an
unlabelled number whose prefix marks it as mobile, then the office line — and
refuses a fax number outright.

## Design

Custom throughout — no component library, no template. Near-black ink, warm
paper-white text, and a single acid-lime signal colour reserved for the next
action, so on any screen the eye lands on the one thing to tap. WhatsApp green
appears exactly once, on the button that leaves the app.

Built for one hand at a trade show: 54px primary buttons pinned to the bottom of
the viewport, safe-area aware, 16px inputs so iOS never zooms on focus, and a
`prefers-reduced-motion` path that drops every animation.

## Limits

- OCR is English-only (`eng.traineddata`). Adding a language means dropping
  another model into `public/tessdata/` and passing it to `createWorker`.
- Heavily stylised cards — reversed-out text, script faces, dark backgrounds,
  vertical CJK layouts — read poorly. The confirm screen exists because of this.
- `wa.me` opens a chat with a number; it cannot verify that number is on
  WhatsApp. An unregistered number lands on WhatsApp's own "not on WhatsApp"
  screen.
